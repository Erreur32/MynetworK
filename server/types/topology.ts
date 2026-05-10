/**
 * Network topology shared types
 *
 * The topology graph is computed periodically (daily cron + on-demand) by
 * topologyService.ts and persisted as a single-row snapshot in SQLite.
 * The shape is plugin-agnostic: each active plugin contributes nodes/edges,
 * deduplicated by MAC across sources.
 */

export type NodeKind =
    | 'gateway'
    | 'switch'
    | 'ap'
    | 'repeater'
    | 'client'
    | 'unknown';

export type EdgeMedium = 'ethernet' | 'wifi' | 'uplink';

export type SourcePlugin = 'freebox' | 'unifi' | 'scan-reseau';

export interface TopologyNode {
    id: string;
    kind: NodeKind;
    label: string;
    ip?: string;
    mac?: string;
    vendor?: string;
    sources: SourcePlugin[];
    metadata?: {
        host_type?: string;
        model?: string;
        firmware?: string;
        active?: boolean;
        last_seen?: number; // unix seconds
        ssid?: string;
        signal?: number;
        band?: string;
        [key: string]: unknown;
    };
}

export interface TopologyEdge {
    id: string;
    source: string;
    target: string;
    medium: EdgeMedium;
    linkSpeedMbps?: number;
    portIndex?: number;
    ssid?: string;
    band?: string;
    signal?: number;
    source_plugin: SourcePlugin;
}

export interface TopologyGraph {
    nodes: TopologyNode[];
    edges: TopologyEdge[];
    sources: SourcePlugin[];
    computed_at: string; // ISO 8601
}
