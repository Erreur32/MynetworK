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

function normalizeMac(mac: unknown): string | null {
    if (typeof mac !== 'string') return null;
    const cleaned = mac.toLowerCase().replace(/[^0-9a-f]/g, '');
    if (cleaned.length !== 12) return null;
    return cleaned.match(/.{2}/g)!.join(':');
}

function macNodeId(mac: string): string {
    return `mac:${mac}`;
}

function addSource(node: TopologyNode, src: SourcePlugin): void {
    if (!node.sources.includes(src)) node.sources.push(src);
}

function mapUniFiDeviceKind(type: unknown, model: unknown): NodeKind {
    const t = String(type ?? '').toLowerCase();
    const m = String(model ?? '').toLowerCase();
    if (t === 'uap' || m.startsWith('u') && m.includes('ap')) return 'ap';
    if (t === 'usw' || m.startsWith('us')) return 'switch';
    if (t === 'ugw' || t === 'udm' || m.includes('udm') || m.includes('gateway')) return 'gateway';
    return 'unknown';
}

class TopologyService {
    async getStored(): Promise<TopologyGraph | null> {
        return TopologySnapshotRepository.get();
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

        const freeboxPlugin = pluginManager.getPlugin('freebox');
        if (freeboxPlugin?.isEnabled()) {
            try {
                await this.collectFreebox(nodes, edges);
                sources.push('freebox');
            } catch (error) {
                logger.error('Topology', 'Freebox collection failed:', error);
            }
        }

        const unifiPlugin = pluginManager.getPlugin('unifi') as UniFiPlugin | undefined;
        if (unifiPlugin?.isEnabled()) {
            try {
                await this.collectUniFi(unifiPlugin, nodes, edges);
                sources.push('unifi');
            } catch (error) {
                logger.error('Topology', 'UniFi collection failed:', error);
            }
        }

        const scanPlugin = pluginManager.getPlugin('scan-reseau');
        if (scanPlugin?.isEnabled()) {
            try {
                this.collectScanReseauOverlay(nodes);
                sources.push('scan-reseau');
            } catch (error) {
                logger.error('Topology', 'Scan-reseau collection failed:', error);
            }
        }

        // WAN uplink: link UniFi gateway(s) to the Freebox box (child→parent
        // direction matches the rest of the model — dagre then puts Freebox at
        // the top, with UCG below it and the rest of the UniFi tree underneath).
        if (nodes.has(FREEBOX_BOX_ID)) {
            for (const node of nodes.values()) {
                if (node.kind !== 'gateway') continue;
                if (node.id === FREEBOX_BOX_ID) continue;
                if (!node.sources.includes('unifi')) continue;
                const wanId = `wan:${node.id}->freebox`;
                if (!edges.has(wanId)) {
                    edges.set(wanId, {
                        id: wanId,
                        source: node.id,
                        target: FREEBOX_BOX_ID,
                        medium: 'uplink',
                        source_plugin: 'unifi'
                    });
                }
            }
        }

        return {
            nodes: Array.from(nodes.values()),
            edges: Array.from(edges.values()),
            sources,
            computed_at: new Date().toISOString()
        };
    }

    private async collectFreebox(
        nodes: Map<string, TopologyNode>,
        edges: Map<string, TopologyEdge>
    ): Promise<void> {
        // Always emit a Freebox node as the LAN root
        if (!nodes.has(FREEBOX_BOX_ID)) {
            nodes.set(FREEBOX_BOX_ID, {
                id: FREEBOX_BOX_ID,
                kind: 'gateway',
                label: 'Freebox',
                sources: ['freebox'],
                metadata: {}
            });
        } else {
            addSource(nodes.get(FREEBOX_BOX_ID)!, 'freebox');
        }

        const ifaceResp = await freeboxApi.getLanBrowserInterfaces();
        if (!ifaceResp.success || !Array.isArray(ifaceResp.result)) return;

        for (const iface of ifaceResp.result as Array<{ name: string }>) {
            const hostsResp = await freeboxApi.getLanHosts(iface.name);
            if (!hostsResp.success || !Array.isArray(hostsResp.result)) continue;

            for (const host of hostsResp.result as Array<Record<string, any>>) {
                const mac = normalizeMac(host?.l2ident?.id);
                if (!mac) continue;
                const id = macNodeId(mac);

                const ipv4 = (host.l3connectivities ?? []).find(
                    (l: any) => l?.af === 'ipv4' && l?.active
                )?.addr as string | undefined;
                const ap = host.access_point as Record<string, any> | undefined;

                const existing = nodes.get(id);
                const node: TopologyNode = {
                    id,
                    kind: existing?.kind ?? 'client',
                    label: host.primary_name || host.vendor_name || mac,
                    ip: existing?.ip ?? ipv4,
                    mac,
                    vendor: existing?.vendor ?? host.vendor_name,
                    sources: existing ? [...existing.sources] : [],
                    metadata: {
                        ...(existing?.metadata ?? {}),
                        host_type: host.host_type,
                        active: !!host.active,
                        last_seen: host.last_activity,
                        ...(ap?.wifi_information && {
                            ssid: ap.wifi_information.ssid,
                            band: ap.wifi_information.band,
                            signal: ap.wifi_information.signal
                        })
                    }
                };
                addSource(node, 'freebox');
                nodes.set(id, node);

                // Determine parent node (AP/repeater MAC, or fall back to box)
                let parentId = FREEBOX_BOX_ID;
                const apMac = normalizeMac(ap?.mac);
                if (apMac && apMac !== mac) {
                    const apId = macNodeId(apMac);
                    if (!nodes.has(apId)) {
                        const isRepeater = ap?.type === 'repeater';
                        nodes.set(apId, {
                            id: apId,
                            kind: isRepeater ? 'repeater' : 'gateway',
                            label: isRepeater ? `Freebox repeater` : 'Freebox',
                            mac: apMac,
                            sources: ['freebox'],
                            metadata: { active: true }
                        });
                    }
                    parentId = apId;

                    // Repeater → box uplink edge. Edge convention: source = child,
                    // target = parent (dagre places source below target, so this puts
                    // the Freebox at the top in TB / on the right in LR).
                    if (apId !== FREEBOX_BOX_ID) {
                        const upId = `freebox:uplink:${apMac}`;
                        if (!edges.has(upId)) {
                            edges.set(upId, {
                                id: upId,
                                source: apId,
                                target: FREEBOX_BOX_ID,
                                medium: 'uplink',
                                source_plugin: 'freebox'
                            });
                        }
                    }
                }

                const medium: EdgeMedium = ap?.connectivity_type === 'wifi' ? 'wifi' : 'ethernet';
                const speedRaw = ap?.ethernet_information?.speed;
                const linkSpeedMbps = typeof speedRaw === 'number'
                    ? speedRaw
                    : (typeof speedRaw === 'string' && /^\d+$/.test(speedRaw))
                        ? Number(speedRaw)
                        : undefined;

                const edgeId = `freebox:${mac}->${parentId}`;
                edges.set(edgeId, {
                    id: edgeId,
                    source: id,
                    target: parentId,
                    medium,
                    linkSpeedMbps,
                    ssid: ap?.wifi_information?.ssid,
                    band: ap?.wifi_information?.band,
                    signal: ap?.wifi_information?.signal,
                    source_plugin: 'freebox'
                });
            }
        }
    }

    private async collectUniFi(
        plugin: UniFiPlugin,
        nodes: Map<string, TopologyNode>,
        edges: Map<string, TopologyEdge>
    ): Promise<void> {
        const { devices, clients } = await plugin.getTopologyData();

        for (const dev of devices) {
            const mac = normalizeMac(dev.mac);
            if (!mac) continue;
            const id = macNodeId(mac);

            const existing = nodes.get(id);
            const kind = existing && existing.kind !== 'client' && existing.kind !== 'unknown'
                ? existing.kind
                : mapUniFiDeviceKind(dev.type, dev.model);

            const node: TopologyNode = {
                id,
                kind,
                label: dev.name || (typeof dev.model === 'string' ? dev.model : undefined) || existing?.label || mac,
                ip: existing?.ip ?? dev.ip,
                mac,
                vendor: existing?.vendor,
                sources: existing ? [...existing.sources] : [],
                metadata: {
                    ...(existing?.metadata ?? {}),
                    model: typeof dev.model === 'string' ? dev.model : undefined,
                    firmware: (dev as any).firmware_version || (dev as any).version,
                    active: dev.state === 1,
                    last_seen: dev.last_seen
                }
            };
            addSource(node, 'unifi');
            nodes.set(id, node);

            // Uplink edge: this device → its uplink (parent). Source=child, target=parent.
            const uplinkMac = normalizeMac((dev as any).uplink?.uplink_mac);
            if (uplinkMac && uplinkMac !== mac) {
                const upId = `unifi:uplink:${mac}->${uplinkMac}`;
                edges.set(upId, {
                    id: upId,
                    source: id,
                    target: macNodeId(uplinkMac),
                    medium: 'uplink',
                    source_plugin: 'unifi'
                });
            }
        }

        for (const cli of clients as Array<Record<string, any>>) {
            const mac = normalizeMac(cli.mac);
            if (!mac) continue;
            const id = macNodeId(mac);
            const isWired = !!cli.is_wired;

            const existing = nodes.get(id);
            const node: TopologyNode = {
                id,
                kind: existing?.kind ?? 'client',
                label: existing?.label ?? (cli.name || cli.hostname || mac),
                ip: existing?.ip ?? cli.ip,
                mac,
                vendor: existing?.vendor ?? cli.oui,
                sources: existing ? [...existing.sources] : [],
                metadata: {
                    ...(existing?.metadata ?? {}),
                    last_seen: cli.last_seen ?? existing?.metadata?.last_seen,
                    ...(!isWired && {
                        ssid: cli.essid ?? existing?.metadata?.ssid,
                        band: cli.radio ?? existing?.metadata?.band,
                        signal: cli.signal ?? existing?.metadata?.signal
                    })
                }
            };
            addSource(node, 'unifi');
            nodes.set(id, node);

            const parentMac = normalizeMac(isWired ? cli.sw_mac : cli.ap_mac);
            if (!parentMac || parentMac === mac) continue;

            const linkSpeedRaw = isWired ? cli.sw_port_speed : cli.tx_rate;
            const linkSpeedMbps = typeof linkSpeedRaw === 'number' && linkSpeedRaw > 0
                ? Math.round(linkSpeedRaw)
                : undefined;
            const portIdx = isWired && typeof cli.sw_port === 'number' ? cli.sw_port : undefined;

            const edgeId = `unifi:client:${mac}->${parentMac}`;
            edges.set(edgeId, {
                id: edgeId,
                source: id,
                target: macNodeId(parentMac),
                medium: isWired ? 'ethernet' : 'wifi',
                linkSpeedMbps,
                portIndex: portIdx,
                ssid: !isWired ? cli.essid : undefined,
                band: !isWired ? cli.radio : undefined,
                signal: !isWired ? cli.signal : undefined,
                source_plugin: 'unifi'
            });
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
                if (!existing.ip && rec.ip) existing.ip = rec.ip;
                if (!existing.vendor && rec.vendor) existing.vendor = rec.vendor;
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
