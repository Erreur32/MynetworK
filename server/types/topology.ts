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
        ports?: Array<{
            idx: number;
            name?: string;
            up: boolean;
            speed?: number;
            poe?: boolean;
            media?: string;
            uplink?: boolean;
        }>;
        /** Port number on THIS device that goes upstream (UniFi uplink.port_idx). */
        localUplinkPortIdx?: number;
        [key: string]: unknown;
    };
}

export interface TopologyEdge {
    id: string;
    source: string;
    target: string;
    medium: EdgeMedium;
    linkSpeedMbps?: number;
    /** Port index on the SOURCE device (e.g. port on the switch where the
     *  edge exits). Used by the source-side per-port handle. */
    portIndex?: number;
    /** Port index on the TARGET device (e.g. the uplink port on a child
     *  switch where the parent's cable lands). Used by the target-side
     *  per-port handle so uplink edges align with the right port on both
     *  ends, not just the parent. */
    localPortIndex?: number;
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
    schema_version?: number;
}
