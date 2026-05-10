/**
 * Topology Page
 *
 * Displays the computed network topology snapshot.
 * Phase 1: header, stats cards, source badges, refresh button, raw graph preview.
 * Phase 2 will swap the preview for a React Flow interactive graph.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft,
    Network,
    RefreshCw,
    Sparkles,
    Wifi,
    Cable,
    Router as RouterIcon,
    Clock,
    CircleDot
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '../components/widgets/Card';
import { api } from '../api/client';
import { usePluginStore } from '../stores/pluginStore';
import { TopologyGraph } from '../components/topology/TopologyGraph';

type SourcePlugin = 'freebox' | 'unifi' | 'scan-reseau';

interface TopologyNode {
    id: string;
    kind: 'gateway' | 'switch' | 'ap' | 'repeater' | 'client' | 'unknown';
    label: string;
    ip?: string;
    mac?: string;
    vendor?: string;
    sources: SourcePlugin[];
    metadata?: { active?: boolean; [key: string]: unknown };
}

interface TopologyEdge {
    id: string;
    source: string;
    target: string;
    medium: 'ethernet' | 'wifi' | 'uplink';
    linkSpeedMbps?: number;
    portIndex?: number;
    ssid?: string;
    band?: string;
    signal?: number;
    source_plugin: SourcePlugin;
}

interface TopologyGraph {
    nodes: TopologyNode[];
    edges: TopologyEdge[];
    sources: SourcePlugin[];
    computed_at: string;
}

interface TopologyPageProps {
    onBack: () => void;
}

// Dedupe nodes by canonical MAC. The backend already merges by MAC when
// building the snapshot, but scan-reseau records without a MAC fall back
// to id=`scan:${ip}` and may double a device that another plugin reported
// with its real MAC. Scanner-only nodes (no MAC) are kept under their own id.
function dedupeNodesByMac(nodes: TopologyNode[]): TopologyNode[] {
    const seen = new Set<string>();
    return nodes.filter(n => {
        const key = n.mac ? n.mac.toLowerCase() : `id:${n.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function buildEdgeMediumSets(edges: TopologyEdge[]): { wifi: Set<string>; ethernet: Set<string> } {
    const wifi = new Set<string>();
    const ethernet = new Set<string>();
    for (const e of edges) {
        if (e.medium === 'wifi') wifi.add(e.target);
        else if (e.medium === 'ethernet') ethernet.add(e.target);
    }
    return { wifi, ethernet };
}

// Skip clients that ONLY Freebox knows about and that are offline — those
// are stale DHCP cache entries the Freebox hangs onto for days. They inflate
// the wired count without representing real devices.
function shouldSkipFreeboxStaleClient(n: TopologyNode): boolean {
    return n.sources.length === 1
        && n.sources[0] === 'freebox'
        && n.metadata?.active === false;
}

// A client may have several parent edges (e.g. UniFi sees it on Wi-Fi AND
// Freebox sees it via its LAN port). Prefer wifi when both are present —
// UniFi's wifi attribution is authoritative; Freebox often defaults to
// ethernet for any host without explicit `ap.connectivity_type === 'wifi'`.
function classifyClientMedium(
    nodeId: string,
    wifi: Set<string>,
    ethernet: Set<string>
): 'wifi' | 'ethernet' | null {
    if (wifi.has(nodeId)) return 'wifi';
    if (ethernet.has(nodeId)) return 'ethernet';
    return null;
}

function computeTopologyStats(graph: TopologyGraph) {
    const uniqueNodes = dedupeNodesByMac(graph.nodes);
    const kinds = uniqueNodes.reduce<Record<string, number>>((acc, n) => {
        acc[n.kind] = (acc[n.kind] ?? 0) + 1;
        return acc;
    }, {});
    const { wifi, ethernet } = buildEdgeMediumSets(graph.edges);
    let online = 0;
    let offline = 0;
    let wifiClients = 0;
    let wiredClients = 0;
    for (const n of uniqueNodes) {
        if (n.metadata?.active === false) offline++;
        else online++;
        const isClient = n.kind === 'client' || n.kind === 'unknown';
        if (!isClient || shouldSkipFreeboxStaleClient(n)) continue;
        const medium = classifyClientMedium(n.id, wifi, ethernet);
        if (medium === 'wifi') wifiClients++;
        else if (medium === 'ethernet') wiredClients++;
    }
    const infra = (kinds.gateway ?? 0) + (kinds.switch ?? 0) + (kinds.ap ?? 0) + (kinds.repeater ?? 0);
    return { kinds, online, offline, wifiClients, wiredClients, infra };
}

function formatRelative(iso: string, t: (k: string, opts?: any) => string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return iso;
    const diffMs = Date.now() - then;
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return t('topology.justNow');
    if (mins < 60) return t('topology.minutesAgo', { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('topology.hoursAgo', { count: hours });
    const days = Math.floor(hours / 24);
    return t('topology.daysAgo', { count: days });
}

export const TopologyPage: React.FC<TopologyPageProps> = ({ onBack }) => {
    const { t } = useTranslation();
    const { plugins } = usePluginStore();
    const [graph, setGraph] = useState<TopologyGraph | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const hasRichPlugin = useMemo(() => {
        return plugins.some(p => (p.id === 'freebox' || p.id === 'unifi') && p.enabled);
    }, [plugins]);

    const fetchSnapshot = useCallback(async () => {
        try {
            setError(null);
            const resp = await api.get<TopologyGraph | null>('/api/topology');
            if (resp.success) {
                setGraph((resp as any).result ?? null);
            } else {
                setError(t('topology.fetchError'));
            }
        } catch (e: any) {
            setError(e?.message || t('topology.fetchError'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    const refresh = useCallback(async () => {
        try {
            setRefreshing(true);
            setError(null);
            const resp = await api.post<TopologyGraph>('/api/topology/refresh');
            if (resp.success && (resp as any).result) {
                setGraph((resp as any).result);
            } else {
                setError(t('topology.refreshError'));
            }
        } catch (e: any) {
            setError(e?.message || t('topology.refreshError'));
        } finally {
            setRefreshing(false);
        }
    }, [t]);

    useEffect(() => {
        fetchSnapshot();
    }, [fetchSnapshot]);

    const stats = useMemo(() => graph ? computeTopologyStats(graph) : null, [graph]);

    const infraSub = (() => {
        if (!stats) return '—';
        const parts = [
            stats.kinds.gateway ? `${stats.kinds.gateway} GW` : null,
            stats.kinds.switch ? `${stats.kinds.switch} SW` : null,
            stats.kinds.ap ? `${stats.kinds.ap} AP` : null,
            stats.kinds.repeater ? `${stats.kinds.repeater} RPT` : null
        ].filter(Boolean);
        return parts.length > 0 ? parts.join(' · ') : '—';
    })();

    return (
        <div className="space-y-3">
            {/* Hero header — compact, with stat chips inline so the graph below
                gets the maximum vertical real estate */}
            <div className="relative overflow-hidden rounded-2xl border-theme bg-gradient-to-br from-indigo-600/20 via-sky-500/10 to-emerald-500/10 p-3 sm:p-4">
                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-sky-400/10 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
                <div className="relative flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <button
                            onClick={onBack}
                            className="p-1.5 rounded-lg btn-theme hover:bg-accent-primary/20 text-theme-primary transition-colors"
                            aria-label={t('common.back')}
                        >
                            <ArrowLeft size={16} />
                        </button>
                        <div className="p-1.5 rounded-lg bg-gradient-to-br from-sky-500/30 to-indigo-500/30 border border-sky-400/30 flex-none">
                            <Network size={18} className="text-sky-300" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg sm:text-xl font-bold text-theme-primary truncate">
                                    {t('topology.title')}
                                </h1>
                                <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                    <Sparkles size={10} />
                                    {t('topology.beta')}
                                </span>
                            </div>
                            {graph && stats && (
                                <div className="mt-1 flex items-center gap-3 text-[11px] text-theme-secondary flex-wrap">
                                    <HeroStat icon={<CircleDot size={12} className="text-emerald-300" />} label={t('topology.stats.online')} value={stats.online} sub={`${stats.offline} ${t('topology.stats.offline').toLowerCase()}`} />
                                    <HeroStat icon={<RouterIcon size={12} className="text-amber-300" />} label={t('topology.stats.infrastructure')} value={stats.infra} sub={infraSub} />
                                    <HeroStat icon={<Cable size={12} className="text-lime-300" />} label={t('topology.stats.wiredClients')} value={stats.wiredClients} />
                                    <HeroStat icon={<Wifi size={12} className="text-sky-300" />} label={t('topology.stats.wirelessClients')} value={stats.wifiClients} />
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {graph?.computed_at && (
                            <span className="hidden sm:flex items-center gap-1.5 text-xs text-theme-secondary px-2 py-1 rounded-md border-theme">
                                <Clock size={12} />
                                {formatRelative(graph.computed_at, t)}
                            </span>
                        )}
                        <button
                            onClick={refresh}
                            disabled={refreshing}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-primary/20 hover:bg-accent-primary/30 text-accent-primary border border-accent-primary/40 transition-colors disabled:opacity-50"
                        >
                            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                            <span className="text-sm font-medium">
                                {refreshing ? t('topology.refreshing') : t('topology.refresh')}
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                    {error}
                </div>
            )}

            {(() => {
                if (loading) {
                    return (
                        <Card title="">
                            <div className="p-8 text-center text-theme-secondary text-sm">
                                {t('topology.loading')}
                            </div>
                        </Card>
                    );
                }
                if (graph) return null;
                return (
                <Card title="">
                    <div className="p-10 text-center space-y-4">
                        <div className="mx-auto w-14 h-14 rounded-full bg-accent-primary/15 border border-accent-primary/30 flex items-center justify-center">
                            <Network size={28} className="text-accent-primary" />
                        </div>
                        <h2 className="text-lg font-semibold text-theme-primary">
                            {hasRichPlugin ? t('topology.empty.title') : t('topology.empty.noPlugin')}
                        </h2>
                        <p className="text-sm text-theme-secondary max-w-md mx-auto">
                            {hasRichPlugin ? t('topology.empty.cta') : t('topology.empty.noPluginCta')}
                        </p>
                        {hasRichPlugin && (
                            <button
                                onClick={refresh}
                                disabled={refreshing}
                                className="mx-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-primary/20 hover:bg-accent-primary/30 text-accent-primary border border-accent-primary/40 transition-colors disabled:opacity-50"
                            >
                                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                                <span className="text-sm font-medium">{t('topology.computeNow')}</span>
                            </button>
                        )}
                    </div>
                </Card>
                );
            })()}

            {!loading && graph && (
                <>
                    {/* Interactive graph fills the rest of the viewport */}
                    <TopologyGraph graph={graph} height="calc(100vh - 200px)" />
                </>
            )}
        </div>
    );
};

interface HeroStatProps {
    icon: React.ReactNode;
    label: string;
    value: number;
    sub?: string;
}

const HeroStat: React.FC<HeroStatProps> = ({ icon, label, value, sub }) => (
    <span className="inline-flex items-baseline gap-1.5">
        <span className="self-center">{icon}</span>
        <span className="font-mono font-semibold text-theme-primary">{value}</span>
        <span className="uppercase tracking-wide text-[10px] text-theme-secondary">{label}</span>
        {sub && <span className="text-[10px] text-theme-secondary/70">({sub})</span>}
    </span>
);

export default TopologyPage;
