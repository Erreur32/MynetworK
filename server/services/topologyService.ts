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
import { UniFiDeviceSnapshotRepository, type UniFiDeviceSnapshot } from '../database/models/UniFiDeviceSnapshot.js';
import { lookupUniFiModel, deriveDisplayName, totalPortsFor, type UniFiModelSpec } from './unifiModelCatalog.js';
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
// 10 — Devices store metadata.localUplinkPortIdxs (number[]) — plural to
//      support LAG / multi-uplink, each member port gets a top-card chip.
// 11 — Scan-reseau ICMP success now ORs metadata.active=true onto existing
//      Freebox/UniFi nodes (per-MAC), so a host the scanner just pinged is
//      online even when the Freebox ARP cache claims otherwise.
// 13 — Drop client/unknown nodes that Freebox sees but UniFi doesn't, when
//      either (a) their IP matches a UniFi-sourced infra node's IP, or
//      (b) their vendor contains "Ubiquiti" while at least one UniFi infra
//      node exists. Handles DMZ setups where the Freebox sees the UCG as a
//      LAN client with a different MAC than the UniFi-side one.
// 14 — VM-aware grouping: tag client/unknown nodes whose MAC OUI matches a
//      known hypervisor (KVM/Proxmox/VMware/Xen/Hyper-V/VirtualBox/Docker),
//      and when 2+ VMs share the same switch port, synthesize a vm-host
//      node + virtual edges so the graph shows one cable to the hypervisor
//      and the VMs branch off it.
// 15 — Same as 14 but bucket also fires when portIndex is unknown: fallback
//      key (parentId, hypervisor) handles Freebox-only views that don't
//      report ports (one hypervisor on the same parent ≈ one host).
// 16 — VM hypervisor anchoring: if UniFi sees ANY VM of a hypervisor on a
//      switch port, reparent ALL VMs of that hypervisor to that same UniFi
//      port (drop their Freebox shadow edges). Then bucket+synth produces a
//      single vm-host card on the real UniFi port instead of a stale stack
//      on freebox:box. Anchor is skipped if UniFi sees the hypervisor on
//      multiple ports (ambiguous multi-host cluster).
// 17 — Fold the physical hypervisor host into the vm-host card: when a
//      vm-host is synthesized on a port and exactly one non-VM client also
//      sits on that port, take its label/IP/MAC/vendor onto the vm-host
//      and drop the standalone client so the user doesn't see a phantom
//      duplicate next to the stack.
// 18 — vm-host metadata now carries vmActiveCount / vmInactiveCount so the
//      stack card can show "21 active · 1 offline" at a glance.
const SCHEMA_VERSION = 18;

interface SwitchPort {
    idx: number;
    name?: string;
    up: boolean;
    speed?: number; // Mbps
    poe?: boolean;
    media?: string; // 'GE', 'SFP+', 'XG', '10G', etc.
    /** Receives a downstream device's uplink (this device is the parent of the cascade). */
    uplink?: boolean;
    /** This device's own uplink port — the cable goes UPstream from here. */
    localUplink?: boolean;
}

// poe_power can be a string ("5.234") or number depending on firmware.
function parsePoePower(raw: unknown): number {
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') return Number.parseFloat(raw);
    return Number.NaN;
}

function isPoeActive(p: Record<string, any>): boolean {
    const poeMode = typeof p.poe_mode === 'string' ? p.poe_mode.toLowerCase() : '';
    const enabled = p.poe_enable === true
        || p.poe_enable === 'true'
        || (poeMode !== '' && poeMode !== 'off');
    if (!enabled) return false;
    const power = parsePoePower(p.poe_power);
    return Number.isFinite(power) && power > 0;
}

function buildSwitchPort(
    p: Record<string, any>,
    idx: number,
    uplinkPortIdx?: Set<number>,
    localUplinkPortIdx?: Set<number>
): SwitchPort {
    const speedRaw = p.speed;
    const speed = typeof speedRaw === 'number' && speedRaw > 0 ? speedRaw : undefined;
    const mediaRaw = p.media ?? p.if_type;
    return {
        idx,
        name: typeof p.name === 'string' ? p.name : undefined,
        up: Boolean(p.up),
        speed,
        poe: isPoeActive(p),
        media: typeof mediaRaw === 'string' ? mediaRaw : undefined,
        uplink: uplinkPortIdx?.has(idx) === true,
        localUplink: localUplinkPortIdx?.has(idx) === true
    };
}

function extractSwitchPorts(
    dev: Record<string, any>,
    uplinkPortIdx?: Set<number>,
    localUplinkPortIdx?: Set<number>
): SwitchPort[] | undefined {
    const table = dev.port_table;
    if (!Array.isArray(table) || table.length === 0) return undefined;
    const ports: SwitchPort[] = [];
    for (const p of table) {
        const idx = typeof p?.port_idx === 'number' ? p.port_idx : null;
        if (idx === null || idx <= 0) continue;
        ports.push(buildSwitchPort(p, idx, uplinkPortIdx, localUplinkPortIdx));
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
    const isRepeater = ap.type === 'repeater';
    // The Freebox API reports the box itself as an access_point for wired
    // clients (ap.mac = the box's Wi-Fi MAC) — without this guard we'd create
    // a second "Freebox" gateway node next to freebox:box (one with the MAC,
    // one without). Merge the AP MAC onto freebox:box and reuse the same id.
    if (!isRepeater) {
        const fbx = nodes.get(FREEBOX_BOX_ID);
        if (fbx && !fbx.mac) fbx.mac = apMac;
        return FREEBOX_BOX_ID;
    }
    // Repeater branch — distinct device, separate node + uplink edge.
    const apId = macNodeId(apMac);
    if (!nodes.has(apId)) {
        nodes.set(apId, {
            id: apId,
            kind: 'repeater',
            label: 'Freebox repeater',
            mac: apMac,
            sources: ['freebox'],
            metadata: { active: true }
        });
    }
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

// Different UniFi firmwares put the uplink local port under different keys.
function readUniFiLocalUplinkPort(dev: Record<string, any>): number | undefined {
    const raw = dev.uplink?.port_idx ?? dev.uplink?.local_port ?? dev.uplink?.uplink_local_port;
    return typeof raw === 'number' && raw > 0 ? raw : undefined;
}

// Collect local uplink ports — supports LAG / multi-uplink via per-port
// is_uplink flags, falling back to device.uplink.* for older firmwares.
function collectLocalUplinkPortIdxs(dev: Record<string, any>): number[] {
    const out: number[] = [];
    if (Array.isArray(dev.port_table)) {
        for (const p of dev.port_table) {
            if (p?.is_uplink === true && typeof p.port_idx === 'number' && p.port_idx > 0) {
                if (!out.includes(p.port_idx)) out.push(p.port_idx);
            }
        }
    }
    if (out.length === 0) {
        const single = readUniFiLocalUplinkPort(dev);
        if (single !== undefined) out.push(single);
    }
    out.sort((a, b) => a - b);
    return out;
}

function logMissingLocalUplinkPort(
    dev: Record<string, any>,
    kind: NodeKind,
    mac: string,
    localUplinkPortIdxs: number[]
): void {
    if (localUplinkPortIdxs.length > 0) return;
    if (kind !== 'switch' && kind !== 'gateway') return;
    if (!dev.uplink) return;
    const t = String(dev.type ?? '').toLowerCase();
    if (t !== 'usw' && t !== 'ugw' && t !== 'udm') return;
    const keys = Object.keys(dev.uplink).slice(0, 16).join(',');
    logger.debug('Topology', `UniFi ${t} "${dev.name ?? mac}" has uplink object but no port_idx / local_port — uplink keys: ${keys}`);
}

// Maps UniFi kind → catalogue family for fallback display-name derivation.
function familyForKind(kind: NodeKind): 'gateway' | 'switch' | 'ap' | 'unknown' {
    if (kind === 'gateway' || kind === 'switch' || kind === 'ap') return kind;
    return 'unknown';
}

// Build a friendly display name: catalogue match wins, otherwise derive from
// family + port count, with the scan-reseau hostname as a stronger fallback
// than the raw model code (often more readable than e.g. "US24P250").
function resolveModelDisplay(
    rawCode: string | undefined,
    spec: UniFiModelSpec | undefined,
    kind: NodeKind,
    portCount: number | undefined,
    existing: TopologyNode | undefined
): string | undefined {
    if (spec) return spec.displayName;
    if (kind !== 'switch' && kind !== 'gateway' && kind !== 'ap') return undefined;
    // Use the scan-reseau-sourced hostname if it looks like a real device name.
    const hostnameCandidate = typeof existing?.metadata?.host_type === 'string'
        ? undefined
        : existing?.label;
    return deriveDisplayName(rawCode, familyForKind(kind), portCount, hostnameCandidate);
}

// Replay a cached port_table when UniFi is offline / hasn't returned the live
// table. Forces every port to up=false so the UI grids them grey, and clears
// PoE / speed (those reflect a past state that's no longer valid).
function replayCachedPorts(
    snap: UniFiDeviceSnapshot | undefined,
    uplinkPorts: Set<number> | undefined,
    localUplinkPortIdxs: number[]
): { ports: ReturnType<typeof extractSwitchPorts>; fromSnapshot: boolean } {
    if (!snap || snap.portTable.length === 0) return { ports: undefined, fromSnapshot: false };
    const uplinkSet = new Set(localUplinkPortIdxs.length > 0 ? localUplinkPortIdxs : snap.localUplinkPortIdxs);
    const ports = extractSwitchPorts({ port_table: snap.portTable }, uplinkPorts, uplinkSet);
    if (!ports) return { ports: undefined, fromSnapshot: false };
    for (const p of ports) {
        p.up = false;
        p.speed = undefined;
        p.poe = false;
    }
    return { ports, fromSnapshot: true };
}

function buildUniFiDeviceNode(
    dev: Record<string, any>,
    id: string,
    mac: string,
    existing: TopologyNode | undefined,
    uplinkPorts: Set<number> | undefined,
    snapshotByMac: Map<string, UniFiDeviceSnapshot>
): TopologyNode {
    const modelStr = typeof dev.model === 'string' ? dev.model : undefined;
    const kind = pickUniFiDeviceKind(existing, dev.type, dev.model);
    const localUplinkPortIdxs = collectLocalUplinkPortIdxs(dev);
    logMissingLocalUplinkPort(dev, kind, mac, localUplinkPortIdxs);
    const isSwitchOrGateway = kind === 'switch' || kind === 'gateway';
    const livePorts = isSwitchOrGateway
        ? extractSwitchPorts(dev, uplinkPorts, new Set(localUplinkPortIdxs))
        : undefined;

    // Cache the live port_table for future offline replays; if we don't have
    // a live one, fall back to the cached snapshot (greyed-out).
    let ports = livePorts;
    let portsFromSnapshot = false;
    if (isSwitchOrGateway) {
        if (livePorts && livePorts.length > 0 && Array.isArray(dev.port_table)) {
            UniFiDeviceSnapshotRepository.upsert({
                mac,
                model: modelStr,
                portTable: dev.port_table,
                localUplinkPortIdxs
            });
        } else {
            const replayed = replayCachedPorts(snapshotByMac.get(mac), uplinkPorts, localUplinkPortIdxs);
            if (replayed.ports) {
                ports = replayed.ports;
                portsFromSnapshot = replayed.fromSnapshot;
            }
        }
    }

    const spec = lookupUniFiModel(modelStr);
    const portCount = spec ? totalPortsFor(spec) : ports?.length;
    const modelDisplay = resolveModelDisplay(modelStr, spec, kind, portCount, existing);
    // Catalogue tells us whether the device has a dedicated WAN slot. For
    // unknown models we fall back on kind — gateways usually have one (keeps
    // current behaviour for unrecognised gateways), switches never do.
    const hasDedicatedUplink =
        typeof spec?.hasDedicatedUplink === 'boolean'
            ? spec.hasDedicatedUplink
            : kind === 'gateway';

    const node: TopologyNode = {
        id,
        kind,
        label: dev.name || modelDisplay || modelStr || existing?.label || mac,
        ip: existing?.ip ?? dev.ip,
        mac,
        vendor: existing?.vendor,
        sources: existing ? [...existing.sources] : [],
        metadata: {
            ...existing?.metadata,
            model: modelStr,
            modelDisplay,
            firmware: dev.firmware_version || dev.version,
            active: dev.state === 1,
            last_seen: dev.last_seen,
            ports,
            portsFromSnapshot: portsFromSnapshot ? true : undefined,
            hasDedicatedUplink,
            localUplinkPortIdxs: localUplinkPortIdxs.length > 0 ? localUplinkPortIdxs : undefined
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
    uplinkPortsByMac: Map<string, Set<number>> | undefined,
    snapshotByMac: Map<string, UniFiDeviceSnapshot>
): void {
    const mac = normalizeMac(dev.mac);
    if (!mac) return;
    const id = macNodeId(mac);
    const uplinkPorts = uplinkPortsByMac?.get(mac);
    nodes.set(id, buildUniFiDeviceNode(dev, id, mac, nodes.get(id), uplinkPorts, snapshotByMac));

    const uplinkMac = readUniFiUplinkMac(dev);
    if (uplinkMac && uplinkMac !== mac) {
        // Capture both ports so the rendered uplink edge can land on the
        // right physical port at BOTH ends:
        //  - portIndex     = port on the parent (where the cable enters)
        //  - localPortIndex = port on this device (where the cable lands)
        const remotePortRaw = dev.uplink?.uplink_remote_port ?? dev.uplink?.remote_port;
        const portIndex = typeof remotePortRaw === 'number' && remotePortRaw > 0 ? remotePortRaw : undefined;
        const localPortIndex = readUniFiLocalUplinkPort(dev);
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

// `null` means there is no UniFi infrastructure at all — caller can bail.
function collectUnifiInfraIps(nodes: Map<string, TopologyNode>): Set<string> | null {
    const ips = new Set<string>();
    let hasUnifiInfra = false;
    for (const node of nodes.values()) {
        if (!INFRA_KINDS.has(node.kind)) continue;
        if (!node.sources.includes('unifi')) continue;
        hasUnifiInfra = true;
        if (node.ip) ips.add(node.ip);
    }
    return hasUnifiInfra ? ips : null;
}

function isFreeboxOrphanClient(node: TopologyNode): boolean {
    if (node.sources.includes('unifi')) return false;
    if (!node.sources.includes('freebox')) return false;
    return node.kind === 'client' || node.kind === 'unknown';
}

function looksLikeUnifiInfraClone(node: TopologyNode, unifiInfraIps: Set<string>): boolean {
    if (node.ip && unifiInfraIps.has(node.ip)) return true;
    return typeof node.vendor === 'string' && /ubiquiti/i.test(node.vendor);
}

function dropEdgesTouching(edges: Map<string, TopologyEdge>, droppedIds: Set<string>): void {
    if (droppedIds.size === 0) return;
    for (const [edgeId, edge] of edges) {
        if (droppedIds.has(edge.source) || droppedIds.has(edge.target)) {
            edges.delete(edgeId);
        }
    }
}

// When the Freebox is in DMZ towards a UniFi gateway, the Freebox reports
// the UCG as a LAN client (vendor=Ubiquiti) with its WAN-side MAC, while
// UniFi reports the same physical device as a gateway with its LAN-side
// MAC. MAC-based dedup can't merge them, so we end up with a duplicate
// "Client Ubiquiti" node. Drop those duplicates by matching on either:
//   (a) an IP shared with a UniFi-sourced infra node, OR
//   (b) vendor contains "Ubiquiti" when at least one UniFi infra is present
// Filter is "UniFi doesn't already know this node" rather than "Freebox-only"
// so a scan-reseau overlay doesn't shield the orphan.
function pruneFreeboxNodesDuplicatingUniFiInfra(
    nodes: Map<string, TopologyNode>,
    edges: Map<string, TopologyEdge>
): void {
    const unifiInfraIps = collectUnifiInfraIps(nodes);
    if (!unifiInfraIps) return;
    const dropped = new Set<string>();
    for (const [id, node] of nodes) {
        if (!isFreeboxOrphanClient(node)) continue;
        if (!looksLikeUnifiInfraClone(node, unifiInfraIps)) continue;
        dropped.add(id);
        nodes.delete(id);
    }
    dropEdgesTouching(edges, dropped);
}

// Group VM clients sharing the same switch port into a synthetic "vm-host"
// node. We detect VMs by the well-known MAC OUI prefixes used by hypervisors
// (KVM/Proxmox, VMware, Xen, Hyper-V, VirtualBox, Docker). When 2+ VMs land
// on the same switch port, we insert a vm-host between them so the graph
// shows one cable to the hypervisor and the VMs branch off virtually.

type Hypervisor = 'kvm' | 'proxmox' | 'vmware' | 'virtualbox' | 'xen' | 'hyperv' | 'docker';

const VM_OUI_PREFIXES: ReadonlyArray<readonly [string, Hypervisor]> = [
    ['52:54:00', 'kvm'],
    ['bc:24:11', 'proxmox'],
    ['00:50:56', 'vmware'],
    ['00:0c:29', 'vmware'],
    ['00:05:69', 'vmware'],
    ['00:1c:14', 'vmware'],
    ['08:00:27', 'virtualbox'],
    ['0a:00:27', 'virtualbox'],
    ['00:16:3e', 'xen'],
    ['00:15:5d', 'hyperv'],
    ['02:42:ac', 'docker']
];

function detectHypervisorFromMac(mac: string | undefined): Hypervisor | null {
    if (!mac) return null;
    const norm = mac.toLowerCase();
    for (const [prefix, hv] of VM_OUI_PREFIXES) {
        if (norm.startsWith(prefix)) return hv;
    }
    return null;
}

function tagVMClients(nodes: Map<string, TopologyNode>): void {
    for (const node of nodes.values()) {
        if (node.kind !== 'client' && node.kind !== 'unknown') continue;
        const hv = detectHypervisorFromMac(node.mac);
        if (!hv) continue;
        const meta = node.metadata ?? {};
        meta.isVM = true;
        meta.hypervisor = hv;
        node.metadata = meta;
    }
}

interface VmBucket {
    parentId: string;
    portIndex: number | undefined;
    sourcePlugin: SourcePlugin;
    vmIds: string[];
    edgeIds: string[];
    hypervisors: Set<Hypervisor>;
}

// Bucket key: port-based when the source plugin gives us a port (UniFi
// switch), hypervisor-based otherwise (Freebox sees VMs as plain LAN
// clients without port info — one hypervisor on the same parent ≈ one host).
function pickBucketPartition(portIndex: number | undefined, hv: Hypervisor | null): string {
    if (typeof portIndex === 'number') return `p${portIndex}`;
    return `h${hv ?? 'mixed'}`;
}

function bucketVMsByParent(
    nodes: Map<string, TopologyNode>,
    edges: Map<string, TopologyEdge>
): Map<string, VmBucket> {
    const buckets = new Map<string, VmBucket>();
    for (const [edgeId, edge] of edges) {
        if (edge.medium !== 'ethernet') continue;
        const target = nodes.get(edge.target);
        const parent = nodes.get(edge.source);
        if (!target || !parent) continue;
        if (target.metadata?.isVM !== true) continue;
        if (parent.kind !== 'switch' && parent.kind !== 'gateway') continue;
        const hv = (target.metadata.hypervisor ?? null) as Hypervisor | null;
        const partition = pickBucketPartition(edge.portIndex, hv);
        const key = `${parent.id}|${partition}`;
        let bucket = buckets.get(key);
        if (!bucket) {
            bucket = {
                parentId: parent.id,
                portIndex: edge.portIndex,
                sourcePlugin: edge.source_plugin,
                vmIds: [],
                edgeIds: [],
                hypervisors: new Set()
            };
            buckets.set(key, bucket);
        }
        bucket.vmIds.push(target.id);
        bucket.edgeIds.push(edgeId);
        if (hv) bucket.hypervisors.add(hv);
    }
    return buckets;
}

function buildVmHostLabel(hypervisors: Set<Hypervisor>): string {
    if (hypervisors.size !== 1) return 'VM host';
    const hv = hypervisors.values().next().value;
    switch (hv) {
        case 'kvm':
        case 'proxmox':   return 'Proxmox / KVM';
        case 'vmware':    return 'VMware host';
        case 'virtualbox':return 'VirtualBox host';
        case 'xen':       return 'Xen host';
        case 'hyperv':    return 'Hyper-V host';
        case 'docker':    return 'Docker host';
        default:          return 'VM host';
    }
}

function pickVmHostIdSuffix(bucket: VmBucket): string {
    if (typeof bucket.portIndex === 'number') return `p${bucket.portIndex}`;
    const hv = bucket.hypervisors.size === 1
        ? bucket.hypervisors.values().next().value
        : 'mixed';
    return `h${hv}`;
}

function synthesizeOneVmHost(
    bucket: VmBucket,
    nodes: Map<string, TopologyNode>,
    edges: Map<string, TopologyEdge>
): void {
    const suffix = pickVmHostIdSuffix(bucket);
    const hostId = `vmhost:${bucket.parentId}:${suffix}`;
    let activeCount = 0;
    for (const vmId of bucket.vmIds) {
        const vm = nodes.get(vmId);
        if (vm?.metadata?.active !== false) activeCount++;
    }
    const inactiveCount = bucket.vmIds.length - activeCount;
    nodes.set(hostId, {
        id: hostId,
        kind: 'vm-host',
        label: buildVmHostLabel(bucket.hypervisors),
        sources: [],
        metadata: {
            // vm-host counts as active if any of its VMs is active — that way
            // the card itself doesn't get faded just because most VMs are off.
            active: activeCount > 0,
            vmCount: bucket.vmIds.length,
            vmActiveCount: activeCount,
            vmInactiveCount: inactiveCount,
            hypervisor: bucket.hypervisors.size === 1
                ? bucket.hypervisors.values().next().value
                : 'mixed'
        }
    });
    for (const edgeId of bucket.edgeIds) edges.delete(edgeId);
    const switchEdgeId = `vmhost-link:${bucket.parentId}:${suffix}`;
    const switchEdge: TopologyEdge = {
        id: switchEdgeId,
        source: bucket.parentId,
        target: hostId,
        medium: 'ethernet',
        source_plugin: bucket.sourcePlugin
    };
    if (typeof bucket.portIndex === 'number') switchEdge.portIndex = bucket.portIndex;
    edges.set(switchEdgeId, switchEdge);
    for (const vmId of bucket.vmIds) {
        const virtId = `virt:${hostId}->${vmId}`;
        edges.set(virtId, {
            id: virtId,
            source: hostId,
            target: vmId,
            medium: 'virtual',
            source_plugin: bucket.sourcePlugin
        });
    }
}

interface HypervisorAnchor {
    parentId: string;
    portIndex: number | undefined;
    sourcePlugin: SourcePlugin;
}

// Find the canonical UniFi switch port for each hypervisor. Premise: same
// hypervisor seen on a UniFi switch port ⇒ that's the physical host's uplink
// to the LAN. If UniFi reports >1 distinct port for the same hypervisor we
// can't disambiguate (multi-host cluster), so we skip — better leave the
// graph as-is than guess wrong.
interface AnchorCandidate {
    hv: Hypervisor;
    anchor: HypervisorAnchor;
    key: string;
}

function pickAnchorCandidateFromEdge(
    edge: TopologyEdge,
    nodes: Map<string, TopologyNode>
): AnchorCandidate | null {
    if (edge.source_plugin !== 'unifi') return null;
    if (edge.medium !== 'ethernet') return null;
    const target = nodes.get(edge.target);
    if (!target || target.metadata?.isVM !== true) return null;
    const hv = target.metadata.hypervisor as Hypervisor | undefined;
    if (!hv) return null;
    const parent = nodes.get(edge.source);
    if (!parent) return null;
    if (parent.kind !== 'switch' && parent.kind !== 'gateway') return null;
    return {
        hv,
        anchor: { parentId: parent.id, portIndex: edge.portIndex, sourcePlugin: 'unifi' },
        key: `${parent.id}|${edge.portIndex ?? 'noport'}`
    };
}

function buildHypervisorAnchorMap(
    nodes: Map<string, TopologyNode>,
    edges: Map<string, TopologyEdge>
): Map<Hypervisor, HypervisorAnchor> {
    const seenPortsByHv = new Map<Hypervisor, Map<string, HypervisorAnchor>>();
    for (const edge of edges.values()) {
        const candidate = pickAnchorCandidateFromEdge(edge, nodes);
        if (!candidate) continue;
        let ports = seenPortsByHv.get(candidate.hv);
        if (!ports) {
            ports = new Map();
            seenPortsByHv.set(candidate.hv, ports);
        }
        if (!ports.has(candidate.key)) ports.set(candidate.key, candidate.anchor);
    }
    const anchors = new Map<Hypervisor, HypervisorAnchor>();
    for (const [hv, ports] of seenPortsByHv) {
        if (ports.size !== 1) continue;
        const [first] = ports.values();
        anchors.set(hv, first);
    }
    return anchors;
}

function pickAnchorForVMNode(
    node: TopologyNode,
    anchors: Map<Hypervisor, HypervisorAnchor>
): HypervisorAnchor | null {
    if (node.metadata?.isVM !== true) return null;
    const hv = node.metadata.hypervisor as Hypervisor | undefined;
    if (!hv) return null;
    return anchors.get(hv) ?? null;
}

function applyAnchorToVMEdges(
    node: TopologyNode,
    anchor: HypervisorAnchor,
    edges: Map<string, TopologyEdge>
): void {
    let alreadyOnAnchor = false;
    const edgesToDrop: string[] = [];
    for (const [edgeId, edge] of edges) {
        if (edge.target !== node.id) continue;
        if (edge.medium !== 'ethernet' && edge.medium !== 'wifi') continue;
        if (edge.source === anchor.parentId && edge.portIndex === anchor.portIndex) {
            alreadyOnAnchor = true;
            continue;
        }
        edgesToDrop.push(edgeId);
    }
    for (const id of edgesToDrop) edges.delete(id);
    if (alreadyOnAnchor) return;
    const newId = `vm-anchor:${anchor.parentId}:${anchor.portIndex ?? 'n'}:${node.id}`;
    const newEdge: TopologyEdge = {
        id: newId,
        source: anchor.parentId,
        target: node.id,
        medium: 'ethernet',
        source_plugin: anchor.sourcePlugin
    };
    if (typeof anchor.portIndex === 'number') newEdge.portIndex = anchor.portIndex;
    edges.set(newId, newEdge);
}

// Reparent every VM of a hypervisor onto its UniFi anchor (when one exists),
// dropping any pre-existing parent edges to that VM. Result: all VMs sharing
// a hypervisor end up on the same UniFi switch port, ready to bucket+synth
// into a single vm-host card on the right physical port.
function reparentVMsToHypervisorAnchor(
    nodes: Map<string, TopologyNode>,
    edges: Map<string, TopologyEdge>
): void {
    const anchors = buildHypervisorAnchorMap(nodes, edges);
    if (anchors.size === 0) return;
    for (const node of nodes.values()) {
        const anchor = pickAnchorForVMNode(node, anchors);
        if (!anchor) continue;
        applyAnchorToVMEdges(node, anchor, edges);
    }
}

// After a vm-host is synthesized on (parent, port), look for the physical
// hypervisor host on the same port (its NIC's real MAC OUI doesn't match a
// VM OUI, so it's just a non-VM client there). If there is EXACTLY ONE such
// non-VM client on the port, it's the host — fold its identity (label, IP,
// MAC, vendor) into the vm-host card and drop it from the graph so the user
// doesn't see a phantom duplicate next to the stack.
function findPhysicalHostOnPort(
    nodes: Map<string, TopologyNode>,
    edges: Map<string, TopologyEdge>,
    parentId: string,
    portIndex: number | undefined
): TopologyNode | null {
    const candidates: TopologyNode[] = [];
    for (const edge of edges.values()) {
        if (edge.source !== parentId) continue;
        if (edge.medium !== 'ethernet') continue;
        if (edge.portIndex !== portIndex) continue;
        const target = nodes.get(edge.target);
        if (!target) continue;
        if (target.kind !== 'client' && target.kind !== 'unknown') continue;
        if (target.metadata?.isVM === true) continue;
        candidates.push(target);
    }
    return candidates.length === 1 ? candidates[0] : null;
}

function mergePhysicalHostIntoVmHost(
    vmHost: TopologyNode,
    physicalHost: TopologyNode,
    nodes: Map<string, TopologyNode>,
    edges: Map<string, TopologyEdge>
): void {
    if (physicalHost.label) vmHost.label = physicalHost.label;
    if (physicalHost.ip) vmHost.ip = physicalHost.ip;
    if (physicalHost.mac) vmHost.mac = physicalHost.mac;
    if (physicalHost.vendor) vmHost.vendor = physicalHost.vendor;
    vmHost.metadata = {
        ...vmHost.metadata,
        hostHostname: physicalHost.label,
        hostIp: physicalHost.ip,
        hostMac: physicalHost.mac,
        hostVendor: physicalHost.vendor,
        hostType: physicalHost.metadata?.host_type
    };
    nodes.delete(physicalHost.id);
    const edgesToDrop: string[] = [];
    for (const [edgeId, edge] of edges) {
        if (edge.source === physicalHost.id || edge.target === physicalHost.id) {
            edgesToDrop.push(edgeId);
        }
    }
    for (const id of edgesToDrop) edges.delete(id);
}

function summarizeVmTagging(nodes: Map<string, TopologyNode>): { taggedCount: number; hvBreakdown: Record<string, number> } {
    let taggedCount = 0;
    const hvBreakdown: Record<string, number> = {};
    for (const n of nodes.values()) {
        if (n.metadata?.isVM !== true) continue;
        taggedCount++;
        const raw = n.metadata.hypervisor;
        const hv = typeof raw === 'string' && raw ? raw : '?';
        hvBreakdown[hv] = (hvBreakdown[hv] ?? 0) + 1;
    }
    return { taggedCount, hvBreakdown };
}

function processBucket(
    bucket: VmBucket,
    nodes: Map<string, TopologyNode>,
    edges: Map<string, TopologyEdge>
): void {
    const hvList = Array.from(bucket.hypervisors).join('+') || 'unknown';
    if (bucket.vmIds.length < 2) {
        logger.debug(
            'Topology',
            `VM bucket skipped (only ${bucket.vmIds.length}): parent=${bucket.parentId} port=${bucket.portIndex} hv=${hvList}`
        );
        return;
    }
    logger.info(
        'Topology',
        `VM stack synth: parent=${bucket.parentId} port=${bucket.portIndex} count=${bucket.vmIds.length} hv=${hvList}`
    );
    synthesizeOneVmHost(bucket, nodes, edges);
    const hostId = `vmhost:${bucket.parentId}:${pickVmHostIdSuffix(bucket)}`;
    const vmHost = nodes.get(hostId);
    if (!vmHost) return;
    const physical = findPhysicalHostOnPort(nodes, edges, bucket.parentId, bucket.portIndex);
    if (!physical) return;
    logger.info(
        'Topology',
        `VM stack merge host: vmhost=${hostId} physical=${physical.id} label=${physical.label} ip=${physical.ip ?? '-'}`
    );
    mergePhysicalHostIntoVmHost(vmHost, physical, nodes, edges);
}

function detectAndGroupVMs(
    nodes: Map<string, TopologyNode>,
    edges: Map<string, TopologyEdge>
): void {
    tagVMClients(nodes);
    reparentVMsToHypervisorAnchor(nodes, edges);
    const { taggedCount, hvBreakdown } = summarizeVmTagging(nodes);
    const buckets = bucketVMsByParent(nodes, edges);
    logger.info(
        'Topology',
        `VM detection — tagged ${taggedCount} client(s) [${
            Object.entries(hvBreakdown).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'
        }], ${buckets.size} parent-port bucket(s)`
    );
    for (const bucket of buckets.values()) processBucket(bucket, nodes, edges);
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
        pruneFreeboxNodesDuplicatingUniFiInfra(nodes, edges);
        pruneNonUplinkInfraEdges(nodes, edges);
        detectAndGroupVMs(nodes, edges);

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
        // Pre-fetch every cached snapshot once (table is one row per UniFi
        // device, small) so the offline-replay branch in buildUniFiDeviceNode
        // is an O(1) Map lookup instead of an N+1 SELECT-per-device hit.
        const snapshotByMac = UniFiDeviceSnapshotRepository.findAll();
        for (const dev of rawDevices) {
            processUniFiDevice(dev, nodes, edges, uplinkPortsByMac, snapshotByMac);
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
        // Index existing nodes by their MAC so a scan-reseau record matching
        // an already-discovered MAC merges in even when the existing node's id
        // isn't `mac:XX:…` — typically the Freebox (id=`freebox:box`, MAC set
        // via ensureFreeboxAp) which previously produced a duplicate node.
        const nodeByMac = new Map<string, TopologyNode>();
        for (const n of nodes.values()) {
            if (n.mac) nodeByMac.set(n.mac, n);
        }
        for (const rec of records) {
            const mac = normalizeMac(rec.mac);
            const lastSeen = toUnixSeconds(rec.lastSeen);
            const isOnline = rec.status === 'online';
            const macMatch = mac ? nodeByMac.get(mac) : undefined;
            if (macMatch) {
                mergeScanReseauIntoExisting(macMatch, rec, isOnline, lastSeen);
                continue;
            }
            const id = mac ? macNodeId(mac) : `scan:${rec.ip}`;
            const existing = nodes.get(id);
            if (existing) {
                mergeScanReseauIntoExisting(existing, rec, isOnline, lastSeen);
            } else {
                const newNode = buildScanReseauNode(id, mac, rec, isOnline, lastSeen);
                nodes.set(id, newNode);
                if (mac) nodeByMac.set(mac, newNode);
            }
        }
    }
}

function toUnixSeconds(d: unknown): number | undefined {
    return d instanceof Date ? Math.floor(d.getTime() / 1000) : undefined;
}

// A fresh ICMP success is a stronger liveness signal than Freebox's stale
// ARP cache or UniFi's last_seen window — OR it in, but never flip
// true→false from the scanner (a UniFi AP with state===1 stays online even
// if its mgmt IP didn't answer the last sweep).
function mergeScanReseauIntoExisting(
    existing: TopologyNode,
    rec: { ip?: string; vendor?: string },
    isOnline: boolean,
    lastSeen: number | undefined
): void {
    addSource(existing, 'scan-reseau');
    if (existing.ip === undefined && rec.ip) existing.ip = rec.ip;
    if (existing.vendor === undefined && rec.vendor) existing.vendor = rec.vendor;
    if (!isOnline) return;
    if (!existing.metadata) existing.metadata = {};
    existing.metadata.active = true;
    const prevSeen = typeof existing.metadata.last_seen === 'number' ? existing.metadata.last_seen : 0;
    if (lastSeen && lastSeen > prevSeen) existing.metadata.last_seen = lastSeen;
}

function buildScanReseauNode(
    id: string,
    mac: string | null,
    rec: { ip: string; hostname?: string; vendor?: string },
    isOnline: boolean,
    lastSeen: number | undefined
): TopologyNode {
    return {
        id,
        kind: 'client',
        label: rec.hostname || rec.ip,
        ip: rec.ip,
        mac: mac ?? undefined,
        vendor: rec.vendor,
        sources: ['scan-reseau'],
        metadata: { active: isOnline, last_seen: lastSeen }
    };
}

export const topologyService = new TopologyService();
