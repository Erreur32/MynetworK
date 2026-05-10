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

    const stats = useMemo(() => {
        if (!graph) return null;
        const kinds = graph.nodes.reduce<Record<string, number>>((acc, n) => {
            acc[n.kind] = (acc[n.kind] ?? 0) + 1;
            return acc;
        }, {});
        let online = 0;
        let offline = 0;
        let wifiClients = 0;
        let wiredClients = 0;
        const parentMediumByClient = new Map<string, 'ethernet' | 'wifi' | 'uplink'>();
        for (const e of graph.edges) {
            // Edges go parent → child in the model. Each non-uplink edge tells
            // us how the target client is attached to the network.
            if (e.medium === 'uplink') continue;
            parentMediumByClient.set(e.target, e.medium);
        }
        for (const n of graph.nodes) {
            if (n.metadata?.active === false) offline++;
            else online++;
            if (n.kind === 'client' || n.kind === 'unknown') {
                const m = parentMediumByClient.get(n.id);
                if (m === 'wifi') wifiClients++;
                else if (m === 'ethernet') wiredClients++;
            }
        }
        const infra = (kinds.gateway ?? 0) + (kinds.switch ?? 0) + (kinds.ap ?? 0) + (kinds.repeater ?? 0);
        return { kinds, online, offline, wifiClients, wiredClients, infra };
    }, [graph]);

    return (
        <div className="space-y-6">
            {/* Hero header */}
            <div className="relative overflow-hidden rounded-2xl border-theme bg-gradient-to-br from-indigo-600/20 via-sky-500/10 to-emerald-500/10 p-6">
                <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-sky-400/10 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-12 -left-12 w-56 h-56 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
                <div className="relative flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-4">
                        <button
                            onClick={onBack}
                            className="mt-1 p-2 rounded-lg btn-theme hover:bg-accent-primary/20 text-theme-primary transition-colors"
                            aria-label={t('common.back')}
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <div>
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-gradient-to-br from-sky-500/30 to-indigo-500/30 border border-sky-400/30">
                                    <Network size={22} className="text-sky-300" />
                                </div>
                                <h1 className="text-2xl font-bold text-theme-primary">
                                    {t('topology.title')}
                                </h1>
                                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                    <Sparkles size={12} />
                                    {t('topology.beta')}
                                </span>
                            </div>
                            <p className="mt-1 text-sm text-theme-secondary max-w-2xl">
                                {t('topology.subtitle')}
                            </p>
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
                    {/* Stat tiles */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatTile
                            icon={<CircleDot size={18} className="text-emerald-300" />}
                            label={t('topology.stats.online')}
                            value={stats?.online ?? 0}
                            sub={`${stats?.offline ?? 0} ${t('topology.stats.offline').toLowerCase()}`}
                            tint="from-emerald-500/15 to-emerald-500/5 border-emerald-500/20"
                        />
                        <StatTile
                            icon={<RouterIcon size={18} className="text-amber-300" />}
                            label={t('topology.stats.infrastructure')}
                            value={stats?.infra ?? 0}
                            sub={[
                                stats?.kinds.gateway ? `${stats.kinds.gateway} GW` : null,
                                stats?.kinds.switch ? `${stats.kinds.switch} SW` : null,
                                stats?.kinds.ap ? `${stats.kinds.ap} AP` : null,
                                stats?.kinds.repeater ? `${stats.kinds.repeater} RPT` : null
                            ].filter(Boolean).join(' · ') || '—'}
                            tint="from-amber-500/15 to-amber-500/5 border-amber-500/20"
                        />
                        <StatTile
                            icon={<Cable size={18} className="text-lime-300" />}
                            label={t('topology.stats.wiredClients')}
                            value={stats?.wiredClients ?? 0}
                            tint="from-lime-500/15 to-lime-500/5 border-lime-500/20"
                        />
                        <StatTile
                            icon={<Wifi size={18} className="text-pink-300" />}
                            label={t('topology.stats.wirelessClients')}
                            value={stats?.wifiClients ?? 0}
                            tint="from-pink-500/15 to-pink-500/5 border-pink-500/20"
                        />
                    </div>

                    {/* Interactive graph */}
                    <TopologyGraph graph={graph} />
                    <div className="text-xs text-theme-secondary/70 text-center">
                        {t('topology.nodesPreview', { count: graph.nodes.length, edges: graph.edges.length })}
                    </div>
                </>
            )}
        </div>
    );
};

interface StatTileProps {
    icon: React.ReactNode;
    label: string;
    value: number;
    tint: string;
    sub?: string;
}

const StatTile: React.FC<StatTileProps> = ({ icon, label, value, tint, sub }) => (
    <div className={`rounded-xl border bg-gradient-to-br ${tint} p-4`}>
        <div className="flex items-center gap-2 text-xs text-theme-secondary uppercase tracking-wide">
            {icon}
            <span>{label}</span>
        </div>
        <div className="mt-2 text-2xl font-bold text-theme-primary">{value}</div>
        {sub && <div className="mt-1 text-[11px] text-theme-secondary truncate">{sub}</div>}
    </div>
);

export default TopologyPage;
