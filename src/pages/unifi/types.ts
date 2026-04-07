/**
 * Shared types for UniFi sub-components
 */

export interface BandwidthPoint {
    time: string;
    timestamp: number;
    download: number; // KB/s
    upload: number;   // KB/s
}

export type ThreatRange = 3600 | 43200 | 86400 | 172800 | 604800 | 2592000;
export type ThreatSeverity = 'ALL' | 'LOW' | 'SUSPICIOUS' | 'CONCERNING';
export type ThreatSortKey = 'timestamp' | 'threatLevel' | 'policy' | 'srcIp' | 'dstIp' | 'country' | 'action' | 'service' | 'direction' | 'dstPort' | 'flowCount';
export type TabType = 'overview' | 'nat' | 'analyse' | 'clients' | 'traffic' | 'threats' | 'debug' | 'switches';
export type ClientSortKey = 'name' | 'ip' | 'mac' | 'switch' | 'port' | 'speed' | 'ap' | 'ssid' | 'type';
export type AlertFilter = 'all' | 'info' | 'warning' | 'critical';
export type EventFilter = 'all' | 'alerts' | 'system' | 'connections';

export interface ThreatData {
    available: boolean;
    source: string;
    summary: { total: number; low: number; suspicious: number; concerning: number };
    topPolicies: Array<{ name: string; count: number }>;
    topClients: Array<{ mac: string; name?: string; ip?: string; count: number }>;
    topRegions: Array<{ country: string; count: number }>;
    recentFlows: Array<{
        timestamp: number; action: string; threatLevel: string;
        policy: string; srcIp?: string; dstIp?: string;
        clientMac?: string; clientName?: string; country?: string; proto?: string;
        service?: string; direction?: string; signature?: string;
        dstPort?: number; srcPort?: number; flowCount?: number;
    }>;
}

export interface ThreatDebug {
    deploymentType?: string;
    rangeSeconds?: number;
    source?: string;
}

export interface NatRuleItem {
    id: string;
    name?: string;
    enabled: boolean;
    protocol: string;
    dst_port?: string;
    fwd_port?: string;
    fwd_host?: string;
    src?: string;
    comment?: string;
}
