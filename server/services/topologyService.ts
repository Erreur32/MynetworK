/**
 * Topology service
 *
 * Aggregates network topology data from active plugins (Freebox + UniFi +
 * scan-reseau) into a single normalized graph, deduplicated by MAC.
 *
 * The graph is persisted in SQLite and recomputed:
 *  - on demand via POST /api/topology/refresh
 *  - automatically once a day at 04:00 (topologyScheduler)
 *  - once at boot if no snapshot exists yet
 *
 * Real-time polling is intentionally avoided: a network topology rarely
 * changes within minutes, and we already had memory leak issues with
 * frequent intervals (cf. v0.7.81 / v0.7.82).
 */

import { logger } from '../utils/logger.js';
import { pluginManager } from './pluginManager.js';
import { TopologySnapshotRepository } from '../database/models/TopologySnapshot.js';
import { NetworkScanRepository } from '../database/models/NetworkScan.js';
import { freeboxApi } from './freeboxApi.js';
import type { UniFiPlugin } from '../plugins/unifi/UniFiPlugin.js';
import type {
    TopologyGraph,
    TopologyNode,
    TopologyEdge,
    NodeKind,
    EdgeMedium,
    SourcePlugin
} from '../types/topology.js';

const FREEBOX_BOX_ID = 'freebox:box';
// Bump when the snapshot shape or layout convention changes so stale rows
// in SQLite are auto-invalidated and a fresh build is triggered.
// 2 — edge direction switched to parent → child (dagre TB).
// 3 — switch nodes now embed UniFi port_table (front-panel view).
// 4 — Freebox → UniFi WAN cascade re-introduced for DMZ setups.
// 5 — Freebox-sourced edges to UniFi infra are pruned so the lime ethernet
//     edges no longer point at Freebox; UCG keeps the uplinks via UniFi.
// 6 — Also prune Freebox-sourced edges to clients already attached to a
//     UniFi switch / AP, so wired clients don't show double connections.
// 7 — Drop any non-uplink edge connecting two infra nodes (switch/AP/box).
// 8 — Gateway port_table (fibre + RJ45) now embedded just like switches.
// 9 — Switch / gateway ports flagged as uplink based on child uplink_remote_port.
const SCHEMA_VERSION = 9;

interface SwitchPort {
    idx: number;
    name?: string;
    up: boolean;
    speed?: number; // Mbps
    poe?: boolean;
    media?: string; // 'GE', 'SFP+', 'XG', '10G', etc.
    uplink?: boolean; // true if this port carries an uplink to a child device
}

function extractSwitchPorts(
    dev: Record<string, any>,
    uplinkPortIdx?: Set<number>
): SwitchPort[] | undefined {
    const table = dev.port_table;
    if (!Array.isArray(table) || table.length === 0) return undefined;
    const ports: SwitchPort[] = [];
    for (const p of table) {
        const idx = typeof p?.port_idx === 'number' ? p.port_idx : null;
        if (idx === null || idx <= 0) continue;
        const speedRaw = p.speed;
        const speed = typeof speedRaw === 'number' && speedRaw > 0 ? speedRaw : undefined;
        const poeActive = Boolean(p.poe_enable) && typeof p.poe_power === 'number' && p.poe_power > 0;
        const mediaRaw = p.media ?? p.if_type;
        ports.push({
            idx,
            name: typeof p.name === 'string' ? p.name : undefined,
            up: Boolean(p.up),
            speed,
            poe: poeActive,
            media: typeof mediaRaw === 'string' ? mediaRaw : undefined,
            uplink: uplinkPortIdx?.has(idx) === true
        });
    }
    if (ports.length === 0) return undefined;
    ports.sort((a, b) => a.idx - b.idx);
    return ports;
}

function buildUplinkPortMap(devices: Array<Record<string, any>>): Map<string, Set<number>> {
    // For each device with an uplink, register the remote port index on the
    // parent (so the parent's port_table can mark that port as an uplink).
    const map = new Map<string, Set<number>>();
    for (const dev of devices) {
        const parentMac = normalizeMac(
            dev.uplink?.uplink_mac ??
            dev.uplink?.mac ??
            dev.uplink?.parent_mac ??
            dev.uplink_mac ??
            dev.last_uplink_mac ??
            dev.parent_mac
        );
        const remotePort = dev.uplink?.uplink_remote_port ?? dev.uplink?.remote_port;
        if (!parentMac) continue;
        if (typeof remotePort !== 'number' || remotePort <= 0) continue;
        const set = map.get(parentMac) ?? new Set<number>();
        set.add(remotePort);
        map.set(parentMac, set);
    }
    return map;
}

interface FreeboxL3Connectivity {
    addr?: string;
    af?: string;
    active?: boolean;
}

interface FreeboxAccessPoint {
    mac?: string;
    type?: string;
    connectivity_type?: string;
    ethernet_information?: { speed?: number | string };
    wifi_information?: { ssid?: string; band?: string; signal?: number };
}

interface FreeboxHost {
    l2ident?: { id?: string };
    l3connectivities?: FreeboxL3Connectivity[];
    primary_name?: string;
    vendor_name?: string;
    host_type?: string;
    active?: boolean;
    last_activity?: number;
    access_point?: FreeboxAccessPoint;
}

interface UniFiClient {
    mac?: string;
    name?: string;
    hostname?: string;
    ip?: string;
    oui?: string;
    is_wired?: boolean;
    sw_mac?: string;
    ap_mac?: string;
    sw_port?: number;
    sw_port_speed?: number;
    tx_rate?: number;
    essid?: string;
    radio?: string;
    signal?: number;
    last_seen?: number;
}

function normalizeMac(mac: unknown): string | null {
    if (typeof mac !== 'string') return null;
    const cleaned = mac.toLowerCase().replace(/[^0-9a-f]/g, '');
    if (cleaned.length !== 12) return null;
    const parts = cleaned.match(/.{2}/g);
    return parts ? parts.join(':') : null;
}

function macNodeId(mac: string): string {
    return `mac:${mac}`;
}

function addSource(node: TopologyNode, src: SourcePlugin): void {
    if (!node.sources.includes(src)) node.sources.push(src);
}

function safeLowerString(value: unknown): string {
    return typeof value === 'string' ? value.toLowerCase() : '';
}

function parseLinkSpeed(raw: unknown): number | undefined {
    if (typeof raw === 'number' && raw > 0) return raw;
    if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw);
    return undefined;
}

function mapUniFiDeviceKind(type: unknown, model: unknown): NodeKind {
    const t = safeLowerString(type);
    const m = safeLowerString(model);
    if (t === 'uap' || (m.startsWith('u') && m.includes('ap'))) return 'ap';
    if (t === 'usw' || m.startsWith('us')) return 'switch';
    if (t === 'ugw' || t === 'udm' || m.includes('udm') || m.includes('gateway')) return 'gateway';
    return 'unknown';
}

function ensureFreeboxBox(nodes: Map<string, TopologyNode>): void {
    const existing = nodes.get(FREEBOX_BOX_ID);
    if (existing) {
        addSource(existing, 'freebox');
        return;
    }
    nodes.set(FREEBOX_BOX_ID, {
        id: FREEBOX_BOX_ID,
        kind: 'gateway',
        label: 'Freebox',
        sources: ['freebox'],
        metadata: {}
    });
}

function pickFreeboxIPv4(host: FreeboxHost): string | undefined {
    return (host.l3connectivities ?? []).find(l => l?.af === 'ipv4' && l?.active)?.addr;
}

function buildFreeboxClientNode(
    host: FreeboxHost,
    id: string,
    mac: string,
    ipv4: string | undefined,
    ap: FreeboxAccessPoint | undefined,
    existing: TopologyNode | undefined
): TopologyNode {
    const wifi = ap?.wifi_information;
    const node: TopologyNode = {
        id,
        kind: existing?.kind ?? 'client',
        label: host.primary_name || host.vendor_name || mac,
        ip: existing?.ip ?? ipv4,
        mac,
        vendor: existing?.vendor ?? host.vendor_name,
        sources: existing ? [...existing.sources] : [],
        metadata: {
            ...existing?.metadata,
            host_type: host.host_type,
            active: host.active === true,
            last_seen: host.last_activity
        }
    };
    if (wifi) {
        node.metadata = {
            ...node.metadata,
            ssid: wifi.ssid,
            band: wifi.band,
            signal: wifi.signal
        };
    }
    addSource(node, 'freebox');
    return node;
}

function ensureFreeboxAp(
    apMac: string,
    ap: FreeboxAccessPoint,
    nodes: Map<string, TopologyNode>,
    edges: Map<string, TopologyEdge>
): string {
    const apId = macNodeId(apMac);
    if (!nodes.has(apId)) {
        const isRepeater = ap.type === 'repeater';
        nodes.set(apId, {
            id: apId,
            kind: isRepeater ? 'repeater' : 'gateway',
            label: isRepeater ? 'Freebox repeater' : 'Freebox',
            mac: apMac,
            sources: ['freebox'],
            metadata: { active: true }
        });
    }
    if (apId !== FREEBOX_BOX_ID) {
        const upId = `freebox:uplink:${apMac}`;
        if (!edges.has(upId)) {
            edges.set(upId, {
                id: upId,
                source: FREEBOX_BOX_ID,
                target: apId,
                medium: 'uplink',
                source_plugin: 'freebox'
            });
        }
    }
    return apId;
}

function processFreeboxHost(
    host: FreeboxHost,
    nodes: Map<string, TopologyNode>,
    edges: Map<string, TopologyEdge>
): void {
    const mac = normalizeMac(host?.l2ident?.id);
    if (!mac) return;
    const id = macNodeId(mac);
    const ipv4 = pickFreeboxIPv4(host);
    const ap = host.access_point;
    const existing = nodes.get(id);

    nodes.set(id, buildFreeboxClientNode(host, id, mac, ipv4, ap, existing));

    let parentId = FREEBOX_BOX_ID;
    const apMac = normalizeMac(ap?.mac);
    if (apMac && apMac !== mac && ap) {
        parentId = ensureFreeboxAp(apMac, ap, nodes, edges);
    }

    const medium: EdgeMedium = ap?.connectivity_type === 'wifi' ? 'wifi' : 'ethernet';
    const wifi = ap?.wifi_information;
    const edgeId = `freebox:${parentId}->${mac}`;
    edges.set(edgeId, {
        id: edgeId,
        source: parentId,
        target: id,
        medium,
        linkSpeedMbps: parseLinkSpeed(ap?.ethernet_information?.speed),
        ssid: wifi?.ssid,
        band: wifi?.band,
        signal: wifi?.signal,
        source_plugin: 'freebox'
    });
}

function pickUniFiDeviceKind(
    existing: TopologyNode | undefined,
    type: unknown,
    model: unknown
): NodeKind {
    if (existing && existing.kind !== 'client' && existing.kind !== 'unknown') {
        return existing.kind;
    }
    return mapUniFiDeviceKind(type, model);
}

function buildUniFiDeviceNode(
    dev: Record<string, any>,
    id: string,
    mac: string,
    existing: TopologyNode | undefined,
    uplinkPorts?: Set<number>
): TopologyNode {
    const modelStr = typeof dev.model === 'string' ? dev.model : undefined;
    const kind = pickUniFiDeviceKind(existing, dev.type, dev.model);
    const ports = (kind === 'switch' || kind === 'gateway') ? extractSwitchPorts(dev, uplinkPorts) : undefined;
    const localUplinkRaw = dev.uplink?.port_idx ?? dev.uplink?.local_port ?? dev.uplink?.uplink_local_port;
    const localUplinkPortIdx = typeof localUplinkRaw === 'number' && localUplinkRaw > 0 ? localUplinkRaw : undefined;
    const node: TopologyNode = {
        id,
        kind,
        label: dev.name || modelStr || existing?.label || mac,
        ip: existing?.ip ?? dev.ip,
        mac,
        vendor: existing?.vendor,
        sources: existing ? [...existing.sources] : [],
        metadata: {
            ...existing?.metadata,
            model: modelStr,
            firmware: dev.firmware_version || dev.version,
            active: dev.state === 1,
            last_seen: dev.last_seen,
            ports,
            localUplinkPortIdx
        }
    };
    addSource(node, 'unifi');
    return node;
}

function readUniFiUplinkMac(dev: Record<string, any>): string | null {
    // UniFi exposes the uplink MAC under several fields depending on firmware
    // and on whether we hit Site Manager (cloud) or the local controller.
    // Try them all so cascaded switches (USW → USW → UCG) link up properly.
    const candidates: unknown[] = [
        dev.uplink?.uplink_mac,
        dev.uplink?.mac,
        dev.uplink?.parent_mac,
        dev.uplink_mac,
        dev.last_uplink_mac,
        dev.parent_mac
    ];
    for (const c of candidates) {
        const normalized = normalizeMac(c);
        if (normalized) return normalized;
    }
    return null;
}

function processUniFiDevice(
    dev: Record<string, any>,
    nodes: Map<string, TopologyNode>,
    edges: Map<string, TopologyEdge>,
    uplinkPortsByMac?: Map<string, Set<number>>
): void {
    const mac = normalizeMac(dev.mac);
    if (!mac) return;
    const id = macNodeId(mac);
    const uplinkPorts = uplinkPortsByMac?.get(mac);
    nodes.set(id, buildUniFiDeviceNode(dev, id, mac, nodes.get(id), uplinkPorts));

    const uplinkMac = readUniFiUplinkMac(dev);
    if (uplinkMac && uplinkMac !== mac) {
        // Capture both ports so the rendered uplink edge can land on the
        // right physical port at BOTH ends:
        //  - portIndex     = port on the parent (where the cable enters)
        //  - localPortIndex = port on this device (where the cable lands)
        const remotePortRaw = dev.uplink?.uplink_remote_port ?? dev.uplink?.remote_port;
        const portIndex = typeof remotePortRaw === 'number' && remotePortRaw > 0 ? remotePortRaw : undefined;
        const localPortRaw = dev.uplink?.port_idx ?? dev.uplink?.local_port ?? dev.uplink?.uplink_local_port;
        const localPortIndex = typeof localPortRaw === 'number' && localPortRaw > 0 ? localPortRaw : undefined;
        const linkSpeedRaw = dev.uplink?.speed ?? dev.uplink?.full_duplex_speed;
        const linkSpeedMbps = typeof linkSpeedRaw === 'number' && linkSpeedRaw > 0 ? linkSpeedRaw : undefined;
        const upId = `unifi:uplink:${uplinkMac}->${mac}`;
        edges.set(upId, {
            id: upId,
            source: macNodeId(uplinkMac),
            target: id,
            medium: 'uplink',
            linkSpeedMbps,
            portIndex,
            localPortIndex,
            source_plugin: 'unifi'
        });
    } else {
        const t = String(dev.type ?? '').toLowerCase();
        if (t === 'usw' || t === 'uap') {
            logger.debug('Topology', `UniFi device "${dev.name ?? mac}" (${t}) has no uplink_mac — uplink keys present: ${dev.uplink ? Object.keys(dev.uplink).join(',') : 'none'}`);
        }
    }
}

function buildUniFiClientNode(
    cli: UniFiClient,
    id: string,
    mac: string,
    isWired: boolean,
    existing: TopologyNode | undefined
): TopologyNode {
    const node: TopologyNode = {
        id,
        kind: existing?.kind ?? 'client',
        label: existing?.label ?? (cli.name || cli.hostname || mac),
        ip: existing?.ip ?? cli.ip,
        mac,
        vendor: existing?.vendor ?? cli.oui,
        sources: existing ? [...existing.sources] : [],
        metadata: {
            ...existing?.metadata,
            last_seen: cli.last_seen ?? existing?.metadata?.last_seen
        }
    };
    if (!isWired) {
        node.metadata = {
            ...node.metadata,
            ssid: cli.essid ?? existing?.metadata?.ssid,
            band: cli.radio ?? existing?.metadata?.band,
            signal: cli.signal ?? existing?.metadata?.signal
        };
    }
    addSource(node, 'unifi');
    return node;
}

function buildUniFiClientEdge(
    cli: UniFiClient,
    mac: string,
    parentMac: string,
    isWired: boolean
): TopologyEdge {
    const linkSpeedRaw = isWired ? cli.sw_port_speed : cli.tx_rate;
    const linkSpeedMbps = typeof linkSpeedRaw === 'number' && linkSpeedRaw > 0
        ? Math.round(linkSpeedRaw)
        : undefined;
    const portIdx = isWired && typeof cli.sw_port === 'number' ? cli.sw_port : undefined;
    return {
        id: `unifi:client:${parentMac}->${mac}`,
        source: macNodeId(parentMac),
        target: macNodeId(mac),
        medium: isWired ? 'ethernet' : 'wifi',
        linkSpeedMbps,
        portIndex: portIdx,
        ssid: isWired ? undefined : cli.essid,
        band: isWired ? undefined : cli.radio,
        signal: isWired ? undefined : cli.signal,
        source_plugin: 'unifi'
    };
}

function readUniFiClientParentMac(cli: Record<string, any>, isWired: boolean): string | null {
    // UniFi reports the upstream MAC under multiple keys depending on
    // firmware/site-manager. Try the most common ones in priority order.
    const wired = [cli.sw_mac, cli.last_uplink_mac, cli.uplink_mac, cli.last_sw_mac];
    const wireless = [cli.ap_mac, cli.last_ap_mac, cli.last_uplink_mac, cli.uplink_mac];
    const candidates = isWired ? wired : wireless;
    for (const c of candidates) {
        const n = normalizeMac(c);
        if (n) return n;
    }
    return null;
}

const INFRA_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>(['gateway', 'switch', 'ap', 'repeater']);

// WAN cascade: when both Freebox and a UniFi gateway are present, link the
// gateway under the Freebox so DMZ / bridged setups read top-down. Edge
// medium is 'uplink' so it inherits the mauve dashed style.
function addFreeboxToUniFiWanCascade(
    nodes: Map<string, TopologyNode>,
    edges: Map<string, TopologyEdge>
): void {
    if (!nodes.has(FREEBOX_BOX_ID)) return;
    for (const node of nodes.values()) {
        if (node.kind !== 'gateway') continue;
        if (node.id === FREEBOX_BOX_ID) continue;
        if (!node.sources.includes('unifi')) continue;
        const wanId = `wan:freebox->${node.id}`;
        if (edges.has(wanId)) continue;
        edges.set(wanId, {
            id: wanId,
            source: FREEBOX_BOX_ID,
            target: node.id,
            medium: 'uplink',
            source_plugin: 'unifi'
        });
    }
}

// Drop Freebox-sourced edges that duplicate UniFi data:
//  (a) Freebox → UniFi infrastructure (UCG / USW / UAP). Freebox sees them
//      as wired LAN clients but the real uplink path goes through UniFi.
//      The WAN cascade above keeps the only valid Freebox → UCG link.
//  (b) Freebox → wired client when UniFi already knows the switch port —
//      UniFi's edge is more accurate, drop the Freebox duplicate.
function collectClientsWithUniFiParent(
    nodes: Map<string, TopologyNode>,
    edges: Map<string, TopologyEdge>
): Set<string> {
    const out = new Set<string>();
    for (const edge of edges.values()) {
        if (edge.source_plugin !== 'unifi') continue;
        if (edge.medium === 'uplink') continue;
        const target = nodes.get(edge.target);
        if (!target) continue;
        if (target.kind === 'client' || target.kind === 'unknown') {
            out.add(target.id);
        }
    }
    return out;
}

function isFreeboxRedundantEdge(
    edge: TopologyEdge,
    target: TopologyNode | undefined,
    clientsWithUniFiParent: Set<string>
): boolean {
    if (edge.source_plugin !== 'freebox') return false;
    if (edge.source !== FREEBOX_BOX_ID) return false;
    if (!target) return false;
    if (clientsWithUniFiParent.has(target.id)) return true;
    return INFRA_KINDS.has(target.kind) && target.sources.includes('unifi');
}

function pruneRedundantFreeboxEdges(
    nodes: Map<string, TopologyNode>,
    edges: Map<string, TopologyEdge>
): void {
    const clientsWithUniFiParent = collectClientsWithUniFiParent(nodes, edges);
    for (const [edgeId, edge] of edges) {
        const target = nodes.get(edge.target);
        if (isFreeboxRedundantEdge(edge, target, clientsWithUniFiParent)) {
            edges.delete(edgeId);
        }
    }
}

// Belt-and-braces: any non-uplink edge connecting two infra nodes is
// dropped. Infrastructure should only be wired together via uplinks.
function pruneNonUplinkInfraEdges(
    nodes: Map<string, TopologyNode>,
    edges: Map<string, TopologyEdge>
): void {
    for (const [edgeId, edge] of edges) {
        if (edge.medium === 'uplink') continue;
        const s = nodes.get(edge.source);
        const t = nodes.get(edge.target);
        if (!s || !t) continue;
        if (INFRA_KINDS.has(s.kind) && INFRA_KINDS.has(t.kind)) {
            edges.delete(edgeId);
        }
    }
}

function processUniFiClient(
    cli: UniFiClient,
    nodes: Map<string, TopologyNode>,
    edges: Map<string, TopologyEdge>
): void {
    const mac = normalizeMac(cli.mac);
    if (!mac) return;
    const id = macNodeId(mac);
    const isWired = cli.is_wired === true;
    nodes.set(id, buildUniFiClientNode(cli, id, mac, isWired, nodes.get(id)));

    const parentMac = readUniFiClientParentMac(cli as Record<string, any>, isWired);
    if (!parentMac || parentMac === mac) {
        if (isWired) {
            logger.debug('Topology', `UniFi wired client ${cli.name ?? cli.hostname ?? mac} has no sw_mac (cli keys: ${Object.keys(cli).slice(0, 12).join(',')})`);
        }
        return;
    }
    const edge = buildUniFiClientEdge(cli, mac, parentMac, isWired);
    edges.set(edge.id, edge);
}

class TopologyService {
    async getStored(): Promise<TopologyGraph | null> {
        const stored = TopologySnapshotRepository.get();
        if (!stored) return null;
        if (stored.schema_version !== SCHEMA_VERSION) {
            // Stale snapshot from an older layout convention — force a rebuild.
            return null;
        }
        return stored;
    }

    async buildAndSave(): Promise<TopologyGraph> {
        const graph = await this.build();
        TopologySnapshotRepository.save(graph);
        return graph;
    }

    private async build(): Promise<TopologyGraph> {
        const nodes = new Map<string, TopologyNode>();
        const edges = new Map<string, TopologyEdge>();
        const sources: SourcePlugin[] = [];

        await this.collectAllSources(nodes, edges, sources);
        addFreeboxToUniFiWanCascade(nodes, edges);
        pruneRedundantFreeboxEdges(nodes, edges);
        pruneNonUplinkInfraEdges(nodes, edges);

        return {
            nodes: Array.from(nodes.values()),
            edges: Array.from(edges.values()),
            sources,
            computed_at: new Date().toISOString(),
            schema_version: SCHEMA_VERSION
        };
    }

    private async collectAllSources(
        nodes: Map<string, TopologyNode>,
        edges: Map<string, TopologyEdge>,
        sources: SourcePlugin[]
    ): Promise<void> {
        await this.tryCollect('freebox', sources, () => this.collectFreebox(nodes, edges));
        await this.tryCollect('unifi', sources, async () => {
            const plugin = pluginManager.getPlugin('unifi') as UniFiPlugin | undefined;
            if (plugin) await this.collectUniFi(plugin, nodes, edges);
        });
        await this.tryCollect('scan-reseau', sources, async () => {
            this.collectScanReseauOverlay(nodes);
        });
    }

    private async tryCollect(
        pluginId: SourcePlugin,
        sources: SourcePlugin[],
        fn: () => Promise<void>
    ): Promise<void> {
        const plugin = pluginManager.getPlugin(pluginId);
        if (!plugin?.isEnabled()) return;
        try {
            await fn();
            sources.push(pluginId);
        } catch (error) {
            logger.error('Topology', `${pluginId} collection failed:`, error);
        }
    }

    private async collectFreebox(
        nodes: Map<string, TopologyNode>,
        edges: Map<string, TopologyEdge>
    ): Promise<void> {
        ensureFreeboxBox(nodes);

        const ifaceResp = await freeboxApi.getLanBrowserInterfaces();
        if (!ifaceResp.success || !Array.isArray(ifaceResp.result)) return;

        for (const iface of ifaceResp.result as Array<{ name: string }>) {
            const hostsResp = await freeboxApi.getLanHosts(iface.name);
            if (!hostsResp.success || !Array.isArray(hostsResp.result)) continue;
            for (const host of hostsResp.result as FreeboxHost[]) {
                processFreeboxHost(host, nodes, edges);
            }
        }
    }

    private async collectUniFi(
        plugin: UniFiPlugin,
        nodes: Map<string, TopologyNode>,
        edges: Map<string, TopologyEdge>
    ): Promise<void> {
        const { devices, clients } = await plugin.getTopologyData();
        const rawDevices = devices as Array<Record<string, any>>;
        const uplinkPortsByMac = buildUplinkPortMap(rawDevices);
        for (const dev of rawDevices) {
            processUniFiDevice(dev, nodes, edges, uplinkPortsByMac);
        }
        for (const cli of clients as UniFiClient[]) {
            processUniFiClient(cli, nodes, edges);
        }
    }

    private collectScanReseauOverlay(nodes: Map<string, TopologyNode>): void {
        const records = NetworkScanRepository.find({
            limit: 1000,
            sortBy: 'last_seen',
            sortOrder: 'desc'
        });

        for (const rec of records) {
            const mac = normalizeMac(rec.mac);
            const id = mac ? macNodeId(mac) : `scan:${rec.ip}`;
            const existing = nodes.get(id);
            if (existing) {
                addSource(existing, 'scan-reseau');
                if (existing.ip === undefined && rec.ip) existing.ip = rec.ip;
                if (existing.vendor === undefined && rec.vendor) existing.vendor = rec.vendor;
                continue;
            }
            const lastSeen = rec.lastSeen instanceof Date
                ? Math.floor(rec.lastSeen.getTime() / 1000)
                : undefined;
            nodes.set(id, {
                id,
                kind: 'client',
                label: rec.hostname || rec.ip,
                ip: rec.ip,
                mac: mac ?? undefined,
                vendor: rec.vendor,
                sources: ['scan-reseau'],
                metadata: {
                    active: rec.status === 'online',
                    last_seen: lastSeen
                }
            });
        }
    }
}

export const topologyService = new TopologyService();
