import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, RefreshCw, BarChart2, Activity, Users, Server, Link2, Gauge, Router } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Card } from '../../components/widgets/Card';
import { RichTooltip } from '../../components/ui/RichTooltip';
import { VendorIcon } from '../../components/ui/VendorIcon';
import { hasVendorIcon } from '../../utils/vendorBrand';
import { SortableTh } from '../../components/ui/SortableTh';
import { useSortableTable } from '../../hooks/useSortableTable';
import { BandwidthPoint } from './types';
import { useUnifiRealtimeStore } from '../../stores/unifiRealtimeStore';
import { api } from '../../api/client';
import { formatBytes, formatSpeed, POLLING_INTERVALS } from '../../utils/constants';
import { getClientRateBytesPerSec } from '../../utils/unifiClientRate';
import { usePolling } from '../../hooks/usePolling';

type BandwidthRange = 0 | 3600 | 21600 | 86400 | 604800;
type TrafficPeriod = 'live' | 'today' | 'alltime';

// Persist this page's own graph period + "Volume de données" tab choice across reloads (per browser).
const TRAFFIC_TAB_RANGE_STORAGE_KEY = 'mynetwork_traffictab_range';
const TRAFFIC_TAB_PERIOD_STORAGE_KEY = 'mynetwork_traffictab_period';
const VALID_TRAFFIC_TAB_RANGES: BandwidthRange[] = [0, 3600, 21600, 86400, 604800];

function readStoredTrafficTabRange(fallback: BandwidthRange): BandwidthRange {
    try {
        const v = localStorage.getItem(TRAFFIC_TAB_RANGE_STORAGE_KEY);
        const n = v !== null ? Number(v) : NaN;
        if ((VALID_TRAFFIC_TAB_RANGES as number[]).includes(n)) return n as BandwidthRange;
    } catch { /* ignore */ }
    return fallback;
}

function readStoredTrafficTabPeriod(fallback: TrafficPeriod): TrafficPeriod {
    try {
        const v = localStorage.getItem(TRAFFIC_TAB_PERIOD_STORAGE_KEY);
        if (v === 'live' || v === 'today' || v === 'alltime') return v;
    } catch { /* ignore */ }
    return fallback;
}

interface TopTrafficClient {
    mac: string;
    name: string;
    ip?: string;
    vendor?: string | null;
    rxBytes: number;
    txBytes: number;
}

interface TrafficTabProps {
    unifiStats: any;
    bandwidthHistory: BandwidthPoint[];
    isLoadingBandwidth: boolean;
    wanInterfaces: Array<{ id: string; name: string; ip?: string }>;
    selectedWan: string;
    setSelectedWan: (id: string) => void;
    fetchBandwidthHistory: () => void;
    showAllTrafficClients: boolean;
    setShowAllTrafficClients: (v: boolean) => void;
    onNavigateToSearch?: (ip: string) => void;
}

export const TrafficTab: React.FC<TrafficTabProps> = ({
    unifiStats,
    bandwidthHistory,
    isLoadingBandwidth,
    wanInterfaces,
    selectedWan,
    setSelectedWan,
    fetchBandwidthHistory,
    showAllTrafficClients,
    setShowAllTrafficClients,
    onNavigateToSearch,
}) => {
    const { t } = useTranslation();
    const { history: realtimeHistory, download: realtimeDl, upload: realtimeUl, isConnected: wsConnected, topClients: liveTopClients } = useUnifiRealtimeStore();
    const [selectedRange, setSelectedRangeState] = useState<BandwidthRange>(() => readStoredTrafficTabRange(0));
    const setSelectedRange = (range: BandwidthRange) => {
        setSelectedRangeState(range);
        try { localStorage.setItem(TRAFFIC_TAB_RANGE_STORAGE_KEY, String(range)); } catch { /* ignore */ }
    };
    const [rangeHistory, setRangeHistory] = useState<BandwidthPoint[]>([]);
    const [isLoadingRange, setIsLoadingRange] = useState(false);
    const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
    const [trafficPeriod, setTrafficPeriodState] = useState<TrafficPeriod>(() => readStoredTrafficTabPeriod('today'));
    const setTrafficPeriod = (period: TrafficPeriod) => {
        setTrafficPeriodState(period);
        try { localStorage.setItem(TRAFFIC_TAB_PERIOD_STORAGE_KEY, period); } catch { /* ignore */ }
    };
    const [topTraffic, setTopTraffic] = useState<TopTrafficClient[]>([]);
    const [isLoadingTopTraffic, setIsLoadingTopTraffic] = useState(false);

    const fetchTopTraffic = useCallback(async () => {
        if (trafficPeriod === 'live') return;
        setIsLoadingTopTraffic(true);
        try {
            const res = await api.get<TopTrafficClient[]>(`/api/plugins/unifi/top-clients-history?period=${trafficPeriod}&limit=10`);
            if (res.success && Array.isArray(res.result)) {
                setTopTraffic(res.result);
            }
        } catch { /* ignore */ } finally {
            setIsLoadingTopTraffic(false);
        }
    }, [trafficPeriod]);

    useEffect(() => {
        fetchTopTraffic();
        const interval = setInterval(fetchTopTraffic, 60000);
        return () => clearInterval(interval);
    }, [fetchTopTraffic]);

    // Sortable "Volume de données" table. Live mode reads straight from the WebSocket-fed
    // realtime store (no REST call); today/all-time read from topTraffic (fetched above).
    const trafficRows: Array<{ mac: string; name: string; ip?: string; vendor?: string | null; volumeValue: number; volumeText: string }> =
        trafficPeriod === 'live'
            ? liveTopClients.map(c => ({ mac: c.mac, name: c.name, ip: c.ip, vendor: c.vendor, volumeValue: c.download + c.upload, volumeText: formatSpeed((c.download + c.upload) * 1024) }))
            : topTraffic.map(c => ({ mac: c.mac, name: c.name, ip: c.ip, vendor: c.vendor, volumeValue: c.rxBytes + c.txBytes, volumeText: formatBytes(c.rxBytes + c.txBytes) }));

    const topTrafficSort = useSortableTable<typeof trafficRows[number], 'name' | 'ip' | 'volume'>(
        trafficRows,
        (c, key) => {
            if (key === 'name') return c.name.toLowerCase();
            if (key === 'ip') return c.ip || '';
            return c.volumeValue;
        },
        'volume'
    );

    // Sort state for the other two tables — their source data (topClients/topDevices) is
    // recomputed each render from unifiStats inside the JSX below, so sorting is applied
    // there with a plain array sort rather than via useSortableTable.
    const [clientsSortKey, setClientsSortKey] = useState<'name' | 'ip' | 'ap' | 'speed' | 'signal'>('speed');
    const [clientsSortDir, setClientsSortDir] = useState<'asc' | 'desc'>('desc');
    const toggleClientsSort = (key: typeof clientsSortKey) => {
        if (key === clientsSortKey) setClientsSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        else { setClientsSortKey(key); setClientsSortDir('desc'); }
    };

    const [apSortKey, setApSortKey] = useState<'name' | 'throughput'>('throughput');
    const [apSortDir, setApSortDir] = useState<'asc' | 'desc'>('desc');
    const toggleApSort = (key: typeof apSortKey) => {
        if (key === apSortKey) setApSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        else { setApSortKey(key); setApSortDir('desc'); }
    };

    // Fetch historical data when range > 0
    const fetchRangeHistory = useCallback(async () => {
        if (selectedRange === 0) return;
        setIsLoadingRange(true);
        try {
            const res = await api.get<BandwidthPoint[]>(`/api/plugins/unifi/bandwidth-history?wanId=${selectedWan}&range=${selectedRange}`);
            if (res.success && Array.isArray(res.result)) {
                setRangeHistory(res.result);
            }
        } catch { /* ignore */ } finally {
            setIsLoadingRange(false);
        }
    }, [selectedRange, selectedWan]);

    useEffect(() => {
        if (selectedRange > 0) {
            fetchRangeHistory();
        }
    }, [selectedRange, selectedWan, fetchRangeHistory]);

    // Same auto-refresh as the home page's BandwidthHistoryWidget — without this, 1h/6h/24h/7j
    // only ever showed data as of the moment the range was picked, requiring a manual refresh click.
    usePolling(fetchRangeHistory, {
        enabled: selectedRange > 0,
        interval: POLLING_INTERVALS.system
    });

    const renderClickableIp = (ip: string | null | undefined, className: string = '', size: number = 9) => {
        if (!ip || ip === '-' || ip === 'N/A') {
            return <span className={className}>{ip || '-'}</span>;
        }

        if (onNavigateToSearch) {
            return (
                <button
                    onClick={() => {
                        const urlParams = new URLSearchParams(window.location.search);
                        urlParams.set('s', ip);
                        const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
                        window.history.pushState(null, '', newUrl);
                        onNavigateToSearch(ip);
                    }}
                    className={`text-left hover:text-cyan-400 transition-colors cursor-pointer inline-flex items-baseline gap-0.5 ${className}`}
                    title={`Rechercher ${ip} dans la page de recherche`}
                >
                    <span>{ip}</span>
                    <Link2 size={size} className="opacity-50 relative top-[-2px]" />
                </button>
            );
        }

        return <span className={className}>{ip}</span>;
    };

    // Use realtime WebSocket data when available, fallback to HTTP history
    const dl = wsConnected ? realtimeDl : (bandwidthHistory[bandwidthHistory.length - 1]?.download ?? 0);
    const ul = wsConnected ? realtimeUl : (bandwidthHistory[bandwidthHistory.length - 1]?.upload ?? 0);
    const fmtKB = (kb: number) => kb >= 1024
        ? `${(kb / 1024).toFixed(1)} MB/s`
        : `${kb} KB/s`;
    const activeWan = wanInterfaces.find(w => w.id === selectedWan);
    const wanLabel = activeWan ? activeWan.name : selectedWan.toUpperCase();
    const wanIp = activeWan?.ip;

    // Chart data: Live = WebSocket realtime, other ranges = HTTP fetched history
    const chartHistory = selectedRange === 0
        ? (wsConnected && realtimeHistory.length > 1 ? realtimeHistory : bandwidthHistory)
        : (rangeHistory.length > 0 ? rangeHistory : bandwidthHistory);

    return (
        <div className="col-span-full space-y-4">
            {/* Current rates header */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Download card */}
                <div className="col-span-1 md:col-span-2 flex items-center gap-4 p-5 bg-blue-950/40 border border-blue-700/30 rounded-xl">
                    <div className="p-3 bg-blue-900/50 rounded-xl">
                        <ArrowDown size={28} className="text-blue-400" />
                    </div>
                    <div>
                        <div className="text-xs text-blue-400/80 uppercase tracking-wider mb-0.5">
                            {t('system.download')}
                            <span className="ml-2 text-blue-600/70 normal-case">{wanLabel}{wanIp ? ` · ${wanIp}` : ''}</span>
                        </div>
                        <div className="text-3xl font-bold text-blue-300 font-mono">{fmtKB(dl)}</div>
                    </div>
                </div>
                {/* Upload card */}
                <div className="col-span-1 md:col-span-2 flex items-center gap-4 p-5 bg-emerald-950/40 border border-emerald-700/30 rounded-xl">
                    <div className="p-3 bg-emerald-900/50 rounded-xl">
                        <ArrowUp size={28} className="text-emerald-400" />
                    </div>
                    <div>
                        <div className="text-xs text-emerald-400/80 uppercase tracking-wider mb-0.5">
                            {t('system.upload')}
                            <span className="ml-2 text-emerald-600/70 normal-case">{wanLabel}{wanIp ? ` · ${wanIp}` : ''}</span>
                        </div>
                        <div className="text-3xl font-bold text-emerald-300 font-mono">{fmtKB(ul)}</div>
                    </div>
                </div>
            </div>

            {/* Bandwidth Chart */}
            <Card
                title={
                    <span className="flex items-center gap-1.5">
                        {t('unifi.bandwidth.chartTitle')}
                        {selectedRange === 0 && wsConnected && (
                            <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30 rounded-full animate-pulse">
                                LIVE
                            </span>
                        )}
                        <RichTooltip
                            title="Graphique bande passante WAN"
                            description="Débit calculé par delta entre deux mesures successives des compteurs cumulatifs WAN du gateway UniFi."
                            rows={[
                                { label: 'Download', value: 'Octets reçus depuis Internet (KB/s)', color: 'blue', dot: true },
                                { label: 'Upload', value: 'Octets envoyés vers Internet (KB/s)', color: 'emerald', dot: true },
                            ]}
                            footer={selectedRange === 0 && wsConnected ? "WebSocket temps réel (~3s)" : "Polling toutes les ~30s"}
                            position="bottom"
                            width={280}
                        />
                    </span>
                }
                className="bg-unifi-card border border-gray-800 rounded-xl"
            >
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* WAN selector */}
                        <div className="flex items-center gap-1 bg-gray-900/80 border border-gray-700 rounded-lg p-0.5">
                            {(wanInterfaces.length > 0 ? wanInterfaces : [{ id: 'wan1', name: 'WAN 1' }]).map(wan => (
                                <button
                                    key={wan.id}
                                    onClick={() => setSelectedWan(wan.id)}
                                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                                        selectedWan === wan.id
                                            ? 'bg-blue-600/80 text-white'
                                            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                                    }`}
                                >
                                    {wan.name}
                                    {wan.ip && (
                                        <span className={`ml-1.5 text-xs ${selectedWan === wan.id ? 'text-blue-200/70' : 'text-gray-600'}`}>
                                            {wan.ip}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Range selector */}
                        <div className="inline-flex items-center gap-0.5 bg-[#1b1b1b] rounded-full p-0.5 border border-gray-800">
                            {([
                                { value: 0 as BandwidthRange, label: 'Live' },
                                { value: 3600 as BandwidthRange, label: '1h' },
                                { value: 21600 as BandwidthRange, label: '6h' },
                                { value: 86400 as BandwidthRange, label: '24h' },
                                { value: 604800 as BandwidthRange, label: '7j' },
                            ]).map(r => (
                                <button
                                    key={r.value}
                                    type="button"
                                    className={`px-2 py-0.5 rounded-full text-[11px] transition-colors ${
                                        selectedRange === r.value
                                            ? 'bg-blue-600 text-white'
                                            : 'text-gray-400 hover:text-gray-200'
                                    }`}
                                    onClick={() => setSelectedRange(r.value)}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={selectedRange === 0 ? fetchBandwidthHistory : fetchRangeHistory}
                            disabled={isLoadingBandwidth || isLoadingRange}
                            className="p-1 hover:bg-gray-800 rounded transition-colors"
                            title={t('admin.refresh')}
                        >
                            <RefreshCw size={12} className={(isLoadingBandwidth || isLoadingRange) ? 'animate-spin text-blue-400' : 'text-gray-400'} />
                        </button>
                    </div>
                </div>

                {chartHistory.length >= 2 ? (
                    <ResponsiveContainer width="100%" height={320}>
                        <AreaChart data={chartHistory} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                            <defs>
                                <linearGradient id="gradDlTraffic" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.03} />
                                </linearGradient>
                                <linearGradient id="gradUlTraffic" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.03} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                            <XAxis
                                dataKey="time"
                                stroke="#374151"
                                tick={{ fill: '#6b7280', fontSize: 10 }}
                                interval="preserveStartEnd"
                                tickLine={false}
                            />
                            <YAxis
                                stroke="#374151"
                                tick={{ fill: '#6b7280', fontSize: 10 }}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(v: number) => v >= 1024 ? `${(v / 1024).toFixed(0)}M` : `${v}K`}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '10px', padding: '10px 14px' }}
                                labelStyle={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}
                                formatter={(value: number, name: string) => {
                                    const kb = value;
                                    const fmt = kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB/s` : `${kb} KB/s`;
                                    const color = name === t('system.download') ? '#60a5fa' : '#34d399';
                                    return [<span key="v" style={{ color, fontWeight: 600 }}>{fmt}</span>, name];
                                }}
                            />
                            <Legend
                                onClick={(e) => {
                                    const key = e.dataKey as string;
                                    setHiddenSeries((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(key)) next.delete(key); else next.add(key);
                                        return next;
                                    });
                                }}
                                formatter={(value, entry) => (
                                    <span style={{ color: hiddenSeries.has((entry as any).dataKey) ? '#6b7280' : (entry as any).color, cursor: 'pointer', textDecoration: hiddenSeries.has((entry as any).dataKey) ? 'line-through' : 'none' }}>
                                        {value}
                                    </span>
                                )}
                            />
                            <Area
                                type="monotone"
                                dataKey="download"
                                name={t('system.download')}
                                stroke="#3b82f6"
                                strokeWidth={2}
                                fill="url(#gradDlTraffic)"
                                dot={false}
                                activeDot={{ r: 4, fill: '#3b82f6' }}
                                isAnimationActive={false}
                                hide={hiddenSeries.has('download')}
                            />
                            <Area
                                type="monotone"
                                dataKey="upload"
                                name={t('system.upload')}
                                stroke="#10b981"
                                strokeWidth={2}
                                fill="url(#gradUlTraffic)"
                                dot={false}
                                activeDot={{ r: 4, fill: '#10b981' }}
                                isAnimationActive={false}
                                hide={hiddenSeries.has('upload')}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                        {isLoadingBandwidth ? (
                            <>
                                <RefreshCw size={32} className="animate-spin mb-3 opacity-50" />
                                <p className="text-sm">{t('unifi.bandwidth.loading')}</p>
                            </>
                        ) : (
                            <>
                                <BarChart2 size={40} className="mb-3 opacity-30" />
                                <p className="text-sm font-medium">{t('unifi.bandwidth.noData')}</p>
                                <p className="text-xs mt-1 text-gray-600">{t('unifi.bandwidth.noDataHint')}</p>
                            </>
                        )}
                    </div>
                )}
            </Card>

            <Card title={t('unifi.trafficNetwork')} className="bg-unifi-card border border-gray-800 rounded-xl">
                {unifiStats?.devices ? (
                    (() => {
                        const devices = unifiStats.devices as any[];
                        const clients = devices.filter((d: any) => (d.type || '').toLowerCase() === 'client');

                        // Kbps, to match the arithmetic below (formatBitsPerSecond, trafficByDevice aggregation).
                        const getSpeed = (c: any): number => (getClientRateBytesPerSec(c).total * 8) / 1000;

                        const formatBitsPerSecond = (bps: number | null | undefined): string => {
                            if (!bps || bps <= 0) return '-';
                            const kbps = bps / 1_000;
                            const mbps = bps / 1_000_000;
                            const gbps = bps / 1_000_000_000;
                            if (gbps >= 1) return `${gbps.toFixed(2)} Gb/s`;
                            if (mbps >= 1) return `${mbps.toFixed(2)} Mb/s`;
                            if (kbps >= 1) return `${kbps.toFixed(0)} kb/s`;
                            return `${bps.toFixed(0)} b/s`;
                        };

                        const formatSpeedDisplay = (c: any): string => {
                            const s = getSpeed(c);
                            if (!s || s <= 0) return '-';
                            if (s >= 1_000_000) {
                                return `${(s / 1_000_000).toFixed(2)} Gb/s`;
                            }
                            if (s >= 1_000) {
                                return `${(s / 1_000).toFixed(2)} Mb/s`;
                            }
                            return `${s} kb/s`;
                        };

                        const getApNameForClient = (c: any): string => {
                            return (c.ap_name || c.last_uplink_name || '').toString();
                        };

                        const getSignalInfoTraffic = (c: any): { rssi?: number; quality?: string } => {
                            const raw = (typeof c.signal === 'number' ? c.signal : c.rssi) as number | undefined;
                            if (raw == null || Number.isNaN(raw)) return {};

                            let quality: string;
                            if (raw >= -50) quality = t('unifi.excellent');
                            else if (raw >= -60) quality = t('unifi.veryGood');
                            else if (raw >= -70) quality = t('unifi.good');
                            else if (raw >= -80) quality = t('unifi.average');
                            else quality = t('unifi.weak');

                            return { rssi: raw, quality };
                        };

                        const sortedTrafficClients = [...clients].sort(
                            (a, b) => getSpeed(b) - getSpeed(a)
                        );
                        const topClients = showAllTrafficClients
                            ? sortedTrafficClients
                            : sortedTrafficClients.slice(0, 16);

                        // Re-order the already-selected top clients by whichever column was clicked
                        const displayClients = [...topClients].sort((a, b) => {
                            const getVal = (c: any): string | number => {
                                if (clientsSortKey === 'name') return ((c.name || c.hostname || c.ip || '').toString()).toLowerCase();
                                if (clientsSortKey === 'ip') return (c.ip || '').toString();
                                if (clientsSortKey === 'ap') return getApNameForClient(c) || '';
                                if (clientsSortKey === 'signal') return getSignalInfoTraffic(c).rssi ?? -999;
                                return getSpeed(c);
                            };
                            const av = getVal(a);
                            const bv = getVal(b);
                            if (av < bv) return clientsSortDir === 'asc' ? -1 : 1;
                            if (av > bv) return clientsSortDir === 'asc' ? 1 : -1;
                            return 0;
                        });

                        const trafficByDevice = new Map<string, { down: number; up: number; ref: any }>();
                        for (const c of clients) {
                            const speed = getSpeed(c);
                            if (!speed || speed <= 0) continue;
                            const apName = getApNameForClient(c) || 'Inconnu';
                            const key = apName;
                            const current = trafficByDevice.get(key) || { down: 0, up: 0, ref: null };
                            current.down += speed;
                            current.ref = current.ref || c;
                            trafficByDevice.set(key, current);
                        }

                        const topDevices = Array.from(trafficByDevice.entries())
                            .sort((a, b) => b[1].down - a[1].down)
                            .slice(0, 8);

                        const displayDevices = [...topDevices].sort((a, b) => {
                            if (apSortKey === 'name') {
                                return apSortDir === 'asc' ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0]);
                            }
                            return apSortDir === 'asc' ? a[1].down - b[1].down : b[1].down - a[1].down;
                        });

                        const activeClientsCount = clients.length;

                        return (
                            <div className="space-y-6">
                                {/* Ligne 1 : cartes synthétiques */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-unifi-card rounded-xl px-4 py-3 border border-gray-800 flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-gray-400">{t('unifi.activeClientsUniFi')}</span>
                                            <Users size={16} className="text-purple-400" />
                                        </div>
                                        <div className="mt-1 text-3xl font-semibold text-white">
                                            {activeClientsCount}
                                        </div>
                                        <p className="text-[11px] text-gray-500">
                                            {t('unifi.clientsCountDescription')}
                                        </p>
                                    </div>
                                    <div className="bg-unifi-card rounded-xl px-4 py-3 border border-gray-800 flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-gray-400">{t('unifi.mainSources')}</span>
                                            <Server size={16} className="text-amber-400" />
                                        </div>
                                        <div className="mt-1 space-y-1 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-gray-400">{t('unifi.apSwitchTracked')}</span>
                                                <span className="text-gray-200 font-semibold">
                                                    {topDevices.length}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-400">{t('unifi.topClientsListed')}</span>
                                                <span className="text-gray-200 font-semibold">
                                                    {topClients.length}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-gray-500 mt-1">
                                                {t('unifi.basedOnInstantSpeed')}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Ligne 2 : Top clients / Trafic par AP */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-unifi-card rounded-xl px-4 py-3 border border-gray-800">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex flex-col">
                                                <h3 className="text-sm font-semibold text-white">
                                                    {t('unifi.clientsByThroughput')}
                                                </h3>
                                                <span className="text-[11px] text-gray-500">
                                                    {t('unifi.sortedByInstantSpeed')}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setShowAllTrafficClients(!showAllTrafficClients)}
                                                className="px-3 py-1 rounded-full border border-gray-700 text-[11px] text-gray-200 hover:bg-gray-800 transition-colors"
                                            >
                                                {showAllTrafficClients
                                                    ? t('unifi.showTop16')
                                                    : t('unifi.seeAllClients')}
                                            </button>
                                        </div>
                                        {topClients.length === 0 ? (
                                            <p className="text-xs text-gray-500">
                                                {t('unifi.noClientWithThroughput')}
                                            </p>
                                        ) : (
                                            <table className="min-w-full text-[12px] text-gray-200">
                                                <thead className="bg-theme-card text-gray-300 text-xs">
                                                    <tr>
                                                        <SortableTh label={t('unifi.tableName')} active={clientsSortKey === 'name'} dir={clientsSortDir} onClick={() => toggleClientsSort('name')} />
                                                        <SortableTh label="IP" active={clientsSortKey === 'ip'} dir={clientsSortDir} onClick={() => toggleClientsSort('ip')} />
                                                        <SortableTh label="AP" active={clientsSortKey === 'ap'} dir={clientsSortDir} onClick={() => toggleClientsSort('ap')} />
                                                        <SortableTh label={t('unifi.speed')} align="right" active={clientsSortKey === 'speed'} dir={clientsSortDir} onClick={() => toggleClientsSort('speed')} />
                                                        <SortableTh label={t('unifi.signalPort').split(' / ')[0]} active={clientsSortKey === 'signal'} dir={clientsSortDir} onClick={() => toggleClientsSort('signal')} />
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {displayClients.map((c: any, idx: number) => (
                                                        <tr
                                                            key={c.id || c.mac || idx}
                                                            className={idx % 2 === 0 ? 'bg-unifi-card/30' : 'bg-unifi-card/20'}
                                                        >
                                                            <td className="px-2 py-1 text-left text-sm font-medium text-gray-200">
                                                                {(() => {
                                                                    const name = (c.name || c.hostname || '').toString().trim();
                                                                    const label = name || (c.ip || '').toString() || (c.mac || '').toString();
                                                                    const icon = hasVendorIcon(undefined, label)
                                                                        ? <VendorIcon label={label} size={13} />
                                                                        : <Router size={13} className="text-gray-400 shrink-0" />;
                                                                    if (name) {
                                                                        return <span className="inline-flex items-center gap-1.5">{icon}<span className="truncate">{name}</span></span>;
                                                                    }
                                                                    const ip = (c.ip || '').toString();
                                                                    const mac = (c.mac || '').toString();
                                                                    if (ip) return <span className="inline-flex items-center gap-1.5">{icon}{renderClickableIp(ip, 'text-gray-200', 8)}</span>;
                                                                    if (mac) return <span className="inline-flex items-center gap-1.5">{icon}{mac}</span>;
                                                                    return '-';
                                                                })()}
                                                            </td>
                                                            <td className="px-2 py-1 text-left text-xs font-mono text-sky-300">
                                                                {renderClickableIp(c.ip, 'text-sky-300 font-mono text-xs', 8)}
                                                            </td>
                                                            <td className="px-2 py-1 text-left text-xs text-gray-400">
                                                                {getApNameForClient(c) || '-'}
                                                            </td>
                                                            <td className="px-2 py-1 text-right text-xs font-mono">
                                                                {formatSpeedDisplay(c)}
                                                            </td>
                                                            <td className="px-2 py-1 text-left text-xs text-gray-400">
                                                                {(() => {
                                                                    const signal = getSignalInfoTraffic(c);
                                                                    if (signal.rssi == null) {
                                                                        return 'RSSI: -';
                                                                    }

                                                                    let colorClass = 'bg-red-500';
                                                                    if (signal.rssi >= -60) {
                                                                        colorClass = 'bg-emerald-400';
                                                                    } else if (signal.rssi >= -70) {
                                                                        colorClass = 'bg-amber-400';
                                                                    } else if (signal.rssi >= -80) {
                                                                        colorClass = 'bg-orange-500';
                                                                    }

                                                                    return (
                                                                        <span className="flex items-center gap-1">
                                                                            <span className={`w-2 h-2 rounded-full ${colorClass}`} />
                                                                            <span>
                                                                                RSSI:&nbsp;
                                                                                <span className="text-gray-200">
                                                                                    {signal.rssi} dBm
                                                                                </span>
                                                                                {signal.quality && (
                                                                                    <span className="ml-1 text-gray-500">
                                                                                        ({signal.quality})
                                                                                    </span>
                                                                                )}
                                                                            </span>
                                                                        </span>
                                                                    );
                                                                })()}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>

                                    <div className="space-y-4">
                                    <div className="bg-unifi-card rounded-xl px-4 py-3 border border-gray-800">
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-sm font-semibold text-white">
                                                {t('unifi.trafficByAp')}
                                            </h3>
                                            <span className="text-[11px] text-gray-500">
                                                {t('unifi.aggregatedFromClients')}
                                            </span>
                                        </div>
                                        {topDevices.length === 0 ? (
                                            <p className="text-xs text-gray-500">
                                                {t('unifi.noMeasurableTraffic')}
                                            </p>
                                        ) : (
                                            <table className="min-w-full text-[12px] text-gray-200">
                                                <thead className="bg-theme-card text-gray-300 text-xs">
                                                    <tr>
                                                        <SortableTh label={t('unifi.apSwitchCol')} active={apSortKey === 'name'} dir={apSortDir} onClick={() => toggleApSort('name')} />
                                                        <SortableTh label={t('unifi.totalThroughput')} align="right" active={apSortKey === 'throughput'} dir={apSortDir} onClick={() => toggleApSort('throughput')} />
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {displayDevices.map(([name, info], idx) => (
                                                        <tr
                                                            key={name}
                                                            className={idx % 2 === 0 ? 'bg-unifi-card/30' : 'bg-unifi-card/20'}
                                                        >
                                                            <td className="px-2 py-1 text-left text-sm font-medium text-gray-200">
                                                                <span className="inline-flex items-center gap-1.5">
                                                                    <Server size={13} className="text-gray-400 shrink-0" />
                                                                    <span className="truncate">{name}</span>
                                                                </span>
                                                            </td>
                                                            <td className="px-2 py-1 text-right text-xs font-mono">
                                                                {formatBitsPerSecond(info.down * 1_000)} {/* approx bits/s */}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>

                                    {/* Volume de données (today / all-time) — UniFi only, Freebox has no per-host counters */}
                                    <div className="bg-unifi-card rounded-xl px-4 py-3 border border-gray-800">
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                                                <Gauge size={14} className="text-cyan-400" />
                                                {t('unifi.topTraffic')}
                                            </h3>
                                            <span className="inline-flex items-center gap-0.5 bg-[#1b1b1b] rounded-full p-0.5 border border-gray-800 text-[11px]">
                                                <button
                                                    type="button"
                                                    className={`px-2 py-0.5 rounded-full ${trafficPeriod === 'live' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                                                    onClick={() => setTrafficPeriod('live')}
                                                >
                                                    {t('unifi.trafficLive')}
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`px-2 py-0.5 rounded-full ${trafficPeriod === 'today' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                                                    onClick={() => setTrafficPeriod('today')}
                                                >
                                                    {t('unifi.trafficToday')}
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`px-2 py-0.5 rounded-full ${trafficPeriod === 'alltime' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                                                    onClick={() => setTrafficPeriod('alltime')}
                                                >
                                                    {t('unifi.trafficAllTime')}
                                                </button>
                                            </span>
                                        </div>
                                        {isLoadingTopTraffic && trafficRows.length === 0 ? (
                                            <p className="text-xs text-gray-500">{t('unifi.loading')}</p>
                                        ) : trafficRows.length === 0 ? (
                                            <p className="text-xs text-gray-500">{t('unifi.noTrafficDataYet')}</p>
                                        ) : (
                                            <table className="min-w-full text-[12px] text-gray-200">
                                                <thead className="bg-theme-card text-gray-300 text-xs">
                                                    <tr>
                                                        <th className="px-2 py-1 text-left">#</th>
                                                        <SortableTh label={t('unifi.deviceCol')} active={topTrafficSort.sortKey === 'name'} dir={topTrafficSort.sortDir} onClick={() => topTrafficSort.toggleSort('name')} />
                                                        <SortableTh label="IP" active={topTrafficSort.sortKey === 'ip'} dir={topTrafficSort.sortDir} onClick={() => topTrafficSort.toggleSort('ip')} />
                                                        <SortableTh label={t('unifi.totalVolume')} align="right" active={topTrafficSort.sortKey === 'volume'} dir={topTrafficSort.sortDir} onClick={() => topTrafficSort.toggleSort('volume')} />
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {topTrafficSort.sorted.map((c, idx) => (
                                                        <tr
                                                            key={c.mac}
                                                            className={idx % 2 === 0 ? 'bg-unifi-card/30' : 'bg-unifi-card/20'}
                                                        >
                                                            <td className="px-2 py-1 text-left text-gray-500">{idx + 1}</td>
                                                            <td className="px-2 py-1 text-left text-sm font-medium text-gray-200">
                                                                <span className="inline-flex items-center gap-1.5">
                                                                    {hasVendorIcon(c.vendor, c.name)
                                                                        ? <VendorIcon vendor={c.vendor} label={c.name} size={13} />
                                                                        : <Router size={13} className="text-gray-400" />}
                                                                    {c.name}
                                                                </span>
                                                            </td>
                                                            <td className="px-2 py-1 text-left text-xs font-mono text-sky-300">
                                                                {renderClickableIp(c.ip, 'text-sky-300 font-mono text-xs', 8)}
                                                            </td>
                                                            <td className="px-2 py-1 text-right text-xs font-mono text-cyan-400 font-semibold">
                                                                {c.volumeText}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>
                                </div>
                            </div>
                        );
                    })()
                ) : (
                    <div className="text-center py-8 text-gray-500">
                        <Activity size={32} className="mx-auto mb-2" />
                        <p>{t('unifi.noTrafficData')}</p>
                    </div>
                )}
            </Card>
        </div>
    );
};
