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
const SCHEMA_VERSION = 4;

interface SwitchPort {
    idx: number;
    name?: string;
    up: boolean;
    speed?: number; // Mbps
    poe?: boolean;
}

function extractSwitchPorts(dev: Record<string, any>): SwitchPort[] | undefined {
    const table = dev.port_table;
    if (!Array.isArray(table) || table.length === 0) return undefined;
    const ports: SwitchPort[] = [];
    for (const p of table) {
        const idx = typeof p?.port_idx === 'number' ? p.port_idx : null;
        if (idx === null || idx <= 0) continue;
        const speedRaw = p.speed;
        const speed = typeof speedRaw === 'number' && speedRaw > 0 ? speedRaw : undefined;
        const poeActive = Boolean(p.poe_enable) && typeof p.poe_power === 'number' && p.poe_power > 0;
        ports.push({
            idx,
            name: typeof p.name === 'string' ? p.name : undefined,
            up: Boolean(p.up),
            speed,
            poe: poeActive
        });
    }
    if (ports.length === 0) return undefined;
    ports.sort((a, b) => a.idx - b.idx);
    return ports;
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
    existing: TopologyNode | undefined
): TopologyNode {
    const modelStr = typeof dev.model === 'string' ? dev.model : undefined;
    const kind = pickUniFiDeviceKind(existing, dev.type, dev.model);
    const ports = kind === 'switch' ? extractSwitchPorts(dev) : undefined;
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
            ports
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
    edges: Map<string, TopologyEdge>
): void {
    const mac = normalizeMac(dev.mac);
    if (!mac) return;
    const id = macNodeId(mac);
    nodes.set(id, buildUniFiDeviceNode(dev, id, mac, nodes.get(id)));

    const uplinkMac = readUniFiUplinkMac(dev);
    if (uplinkMac && uplinkMac !== mac) {
        const upId = `unifi:uplink:${uplinkMac}->${mac}`;
        edges.set(upId, {
            id: upId,
            source: macNodeId(uplinkMac),
            target: id,
            medium: 'uplink',
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

        await this.tryCollect('freebox', sources, () => this.collectFreebox(nodes, edges));
        await this.tryCollect('unifi', sources, async () => {
            const plugin = pluginManager.getPlugin('unifi') as UniFiPlugin | undefined;
            if (plugin) await this.collectUniFi(plugin, nodes, edges);
        });
        await this.tryCollect('scan-reseau', sources, async () => {
            this.collectScanReseauOverlay(nodes);
        });

        // WAN cascade: when both Freebox and a UniFi gateway are present,
        // link the gateway under the Freebox so DMZ / bridged setups read
        // top-down (Freebox = WAN modem, UCG = router behind it). Edge medium
        // is 'uplink' so it inherits the mauve dashed style.
        if (nodes.has(FREEBOX_BOX_ID)) {
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

        return {
            nodes: Array.from(nodes.values()),
            edges: Array.from(edges.values()),
            sources,
            computed_at: new Date().toISOString(),
            schema_version: SCHEMA_VERSION
        };
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
        for (const dev of devices as Array<Record<string, any>>) {
            processUniFiDevice(dev, nodes, edges);
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
