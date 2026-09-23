import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Activity, ArrowDown, ArrowUp, Router, Pause, Eye, EyeOff } from 'lucide-react';
import { Card } from './Card';
import { RichTooltip } from '../ui/RichTooltip';
import { VendorIcon } from '../ui/VendorIcon';
import { hasVendorIcon } from '../../utils/vendorBrand';
import { useConnectionStore } from '../../stores/connectionStore';
import { usePluginStore } from '../../stores/pluginStore';
import { formatSpeed, POLLING_INTERVALS } from '../../utils/constants';
import { usePolling } from '../../hooks/usePolling';
import { api } from '../../api/client';
import { useUnifiRealtimeStore } from '../../stores/unifiRealtimeStore';

const COLORS = {
    blue: '#3b82f6',
    green: '#10b981'
};

const LIVE_ICON_MIN_KBPS = 50; // ignore noise, same bar as the backend live ranking
const MAX_LIVE_ICONS = 4; // cap how many devices show simultaneously in the cluster

type BandwidthRange = 0 | 3600 | 21600 | 86400 | 604800; // 0 = temps réel (live)
type BandwidthSource = 'freebox' | 'unifi';

// Persist the chart's source/period choice across reloads (per browser, not synced to the account).
const SOURCE_STORAGE_KEY = 'mynetwork_bandwidth_source';
const RANGE_STORAGE_KEY = 'mynetwork_bandwidth_range';
const VALID_RANGES: BandwidthRange[] = [0, 3600, 21600, 86400, 604800];

function readStoredSource(fallback: BandwidthSource): BandwidthSource {
    try {
        const v = localStorage.getItem(SOURCE_STORAGE_KEY);
        if (v === 'freebox' || v === 'unifi') return v;
    } catch { /* ignore */ }
    return fallback;
}

function readStoredRange(fallback: BandwidthRange): BandwidthRange {
    try {
        const v = localStorage.getItem(RANGE_STORAGE_KEY);
        const n = v !== null ? Number(v) : Number.NaN;
        if ((VALID_RANGES as number[]).includes(n)) return n as BandwidthRange;
    } catch { /* ignore */ }
    return fallback;
}

interface BandwidthPoint {
    time: string;
    download: number;
    upload: number;
}

interface BandwidthHistoryWidgetProps {
    freeboxAvailable?: boolean;
    unifiAvailable?: boolean;
}

export const BandwidthHistoryWidget: React.FC<BandwidthHistoryWidgetProps> = ({
    freeboxAvailable = true,
    unifiAvailable = false
}) => {
    const { t } = useTranslation();
    const history = useConnectionStore(s => s.history);
    const extendedHistory = useConnectionStore(s => s.extendedHistory);
    const fetchExtendedHistory = useConnectionStore(s => s.fetchExtendedHistory);
    const status = useConnectionStore(s => s.status);
const [selectedRangeState, setSelectedRangeState] = useState<BandwidthRange>(() => readStoredRange(freeboxAvailable ? 3600 : 0));
    const selectedRange = selectedRangeState;
    const [sourceState, setSourceState] = useState<BandwidthSource>(() => readStoredSource(freeboxAvailable ? 'freebox' : 'unifi'));
    const source = sourceState;

    const setSelectedRange = (range: BandwidthRange) => {
        setSelectedRangeState(range);
        try { localStorage.setItem(RANGE_STORAGE_KEY, String(range)); } catch { /* ignore */ }
    };
    const setSource = (src: BandwidthSource) => {
        setSourceState(src);
        try { localStorage.setItem(SOURCE_STORAGE_KEY, src); } catch { /* ignore */ }
    };
    const [unifiData, setUnifiData] = useState<BandwidthPoint[]>([]);
    const { history: unifiRealtimeHistory, download: unifiRealtimeDl, upload: unifiRealtimeUl, isConnected: unifiWsConnected, topClients } = useUnifiRealtimeStore();
    // No UniFi gateway device (UDM/USG/Cloud Gateway) detected: WAN throughput isn't measurable
    // (APs/switches-only setups). Same signal as unifi/traffic, see TrafficTab.tsx.
    const unifiPluginStats = usePluginStore(s => s.pluginStats['unifi']) as any;
    const hasUnifiGateway = !!unifiPluginStats?.system?.gatewaySummary;

    // Live mode only: click the graph to freeze it in place (curve + device icons) so there's
    // enough time to hover an icon and read its tooltip, the live data keeps scrolling
    // underneath otherwise, moving the icon out from under the cursor.
    const [isPaused, setIsPaused] = useState(false);
    const [frozenUnifiHistory, setFrozenUnifiHistory] = useState<typeof unifiRealtimeHistory | null>(null);
    const [frozenFreeboxHistory, setFrozenFreeboxHistory] = useState<typeof history | null>(null);
    const [frozenTopClients, setFrozenTopClients] = useState<typeof topClients | null>(null);

    const toggleGraphPause = () => {
        if (selectedRange !== 0) return; // pause only makes sense in live mode
        if (!isPaused) {
            setFrozenUnifiHistory(unifiRealtimeHistory);
            setFrozenFreeboxHistory(history);
            setFrozenTopClients(topClients);
        }
        setIsPaused(p => !p);
    };
    const handleGraphKeyDown = (e: React.KeyboardEvent) => {
        if (selectedRange !== 0) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleGraphPause();
        }
    };

    // Leaving live mode (or switching source) always resumes, a frozen snapshot of a
    // range/source you're no longer looking at would be confusing.
    useEffect(() => {
        setIsPaused(false);
        setFrozenUnifiHistory(null);
        setFrozenFreeboxHistory(null);
        setFrozenTopClients(null);
    }, [selectedRange, source]);

    const effectiveUnifiHistory = isPaused && frozenUnifiHistory ? frozenUnifiHistory : unifiRealtimeHistory;
    const effectiveFreeboxHistory = isPaused && frozenFreeboxHistory ? frozenFreeboxHistory : history;
    const effectiveTopClients = isPaused && frozenTopClients ? frozenTopClients : topClients;

    // Toggle to hide the live device icons entirely, if they're more distracting than useful
    const [showLiveIcons, setShowLiveIcons] = useState(true);

    // Live device icons: show the current top consumers side by side near the live edge, straight
    // from the already-ranked topClients list. Deliberately not tied to a specific point on the
    // curve, an earlier version tried to caption individual historical peaks along the curve
    // (per-point "who was #1 at that instant"), but that only ever tracked a single device per
    // point, so a client that was consistently-but-narrowly #1 (e.g. a phone) hid every other
    // heavy device (e.g. a PC) that never got to be #1 even once. Showing the top N simultaneously
    // fixes that and is far simpler/less bug-prone than curve-position tracking.
    const liveIcons = useMemo(() => {
        if (source !== 'unifi' || selectedRange !== 0 || !showLiveIcons) return [];
        return effectiveTopClients
            .filter(c => c.download + c.upload >= LIVE_ICON_MIN_KBPS)
            .slice(0, MAX_LIVE_ICONS);
    }, [source, selectedRange, showLiveIcons, effectiveTopClients]);
    const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
    const navigate = useNavigate();

    // Reset source if availability changes
    useEffect(() => {
        if (source === 'freebox' && !freeboxAvailable && unifiAvailable) {
            setSource('unifi');
        } else if (source === 'unifi' && !unifiAvailable && freeboxAvailable) {
            setSource('freebox');
        }
    }, [freeboxAvailable, unifiAvailable, source]);

    // Freebox: load history when widget mounts and when range changes
    useEffect(() => {
        if (source === 'freebox' && selectedRange > 0) {
            fetchExtendedHistory(selectedRange).catch(() => {});
        }
    }, [fetchExtendedHistory, selectedRange, source]);

    // Freebox: keep history ranges updated over time
    usePolling(() => {
        if (selectedRange > 0) {
            fetchExtendedHistory(selectedRange).catch(() => {});
        }
    }, {
        enabled: source === 'freebox' && selectedRange > 0,
        interval: POLLING_INTERVALS.system
    });

    // UniFi: fetch bandwidth history
    const fetchUnifiData = async () => {
        try {
            const response = await api.get<BandwidthPoint[]>(`/api/plugins/unifi/bandwidth-history?range=${selectedRange}`);
            if (response.success && response.result) {
                setUnifiData(response.result);
            }
        } catch {
            // ignore
        }
    };

    useEffect(() => {
        if (source === 'unifi') {
            fetchUnifiData();
        }
    }, [source, selectedRange]);

    usePolling(fetchUnifiData, {
        enabled: source === 'unifi',
        interval: POLLING_INTERVALS.system
    });

    let freeboxChartData = extendedHistory.length > 0 ? extendedHistory : history;
    if (selectedRange === 0) freeboxChartData = effectiveFreeboxHistory;

    let chartData = freeboxChartData;
    if (source === 'unifi') chartData = selectedRange === 0 ? effectiveUnifiHistory : unifiData;

    let liveGraphTitle: string | undefined;
    if (selectedRange === 0) liveGraphTitle = isPaused ? t('dashboard.bandwidth.clickToResume') : t('dashboard.bandwidth.clickToPause');

    const showSourceToggle = freeboxAvailable && unifiAvailable;

    const cardTitle = (
        <span className="flex items-center gap-1.5">
            {source === 'freebox' ? 'Freebox' : 'UniFi'} {t('dashboard.bandwidth.title')}
            <RichTooltip
                title={t('dashboard.bandwidth.tooltip.title')}
                description={t('dashboard.bandwidth.tooltip.desc')}
                rows={[
                    { label: 'Download', value: t('dashboard.bandwidth.tooltip.downloadValue'), color: 'sky', dot: true },
                    { label: 'Upload', value: t('dashboard.bandwidth.tooltip.uploadValue'), color: 'emerald', dot: true },
                ]}
                position="bottom"
                width={290}
                iconSize={12}
            />
        </span>
    );

    const sourceToggle = showSourceToggle ? (
        <span className="inline-flex items-center gap-0.5 bg-[#1b1b1b] rounded-full p-0.5 border border-gray-800 text-[11px] font-normal">
            <button
                type="button"
                className={`px-2 py-0.5 rounded-full ${
                    source === 'freebox' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
                onClick={() => setSource('freebox')}
            >
                Freebox
            </button>
            <button
                type="button"
                className={`px-2 py-0.5 rounded-full ${
                    source === 'unifi' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
                onClick={() => setSource('unifi')}
            >
                UniFi
            </button>
        </span>
    ) : null;

    return (
        <Card
            title={cardTitle}
            actions={
                <span className="flex items-center gap-3">
{source === 'freebox' && status && (
                        <span className="flex items-center gap-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                                <ArrowDown size={13} className="text-blue-400" />
                                <span className="font-medium text-gray-300">{formatSpeed(status.rate_down)}</span>
                            </span>
                            <span className="flex items-center gap-1">
                                <ArrowUp size={13} className="text-green-400" />
                                <span className="font-medium text-gray-300">{formatSpeed(status.rate_up)}</span>
                            </span>
                        </span>
                    )}
                    {source === 'unifi' && hasUnifiGateway && (() => {
                        // Use realtime WebSocket data when in live mode and connected
                        const useRealtime = selectedRange === 0 && unifiWsConnected && unifiRealtimeHistory.length > 0;
                        const dlKBs = useRealtime ? unifiRealtimeDl : (unifiData[unifiData.length - 1]?.download ?? 0);
                        const ulKBs = useRealtime ? unifiRealtimeUl : (unifiData[unifiData.length - 1]?.upload ?? 0);
                        if (dlKBs === 0 && ulKBs === 0 && !useRealtime && unifiData.length === 0) return null;
                        return (
                            <span className="flex items-center gap-3 text-xs text-gray-500">
                                <span className="flex items-center gap-1">
                                    <ArrowDown size={13} className="text-blue-400" />
                                    <span className="font-medium text-gray-300">{formatSpeed(dlKBs * 1024)}</span>
                                </span>
                                <span className="flex items-center gap-1">
                                    <ArrowUp size={13} className="text-green-400" />
                                    <span className="font-medium text-gray-300">{formatSpeed(ulKBs * 1024)}</span>
                                </span>
                            </span>
                        );
                    })()}
                </span>
            }
        >
            <div className="flex items-center justify-between mb-3 text-xs text-gray-500">
                {sourceToggle && <div>{sourceToggle}</div>}
                <span className="flex items-center gap-3">
                    <span>
                        {t('dashboard.bandwidth.period')}&nbsp;
                        <span className="text-gray-300">
                            {selectedRange === 0 && t('dashboard.bandwidth.realtime')}
                            {selectedRange === 3600 && '1h'}
                            {selectedRange === 21600 && '6h'}
                            {selectedRange === 86400 && '24h'}
                            {selectedRange === 604800 && '7j'}
                        </span>
                    </span>
                </span>
                <div className="inline-flex items-center gap-1 bg-[#1b1b1b] rounded-full p-1 border border-gray-800">
                    {([0, 3600, 21600, 86400, 604800] as BandwidthRange[]).map((range) => (
                        <button
                            key={range}
                            type="button"
                            className={`px-2 py-0.5 rounded-full text-[11px] ${
                                selectedRange === range ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                            }`}
                            onClick={() => setSelectedRange(range)}
                        >
                            {range === 0 && t('dashboard.bandwidth.live')}
                            {range === 3600 && '1h'}
                            {range === 21600 && '6h'}
                            {range === 86400 && '24h'}
                            {range === 604800 && '7j'}
                        </button>
                    ))}
                    {selectedRange === 0 && isPaused && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            <Pause size={10} />
                            {t('dashboard.bandwidth.paused')}
                        </span>
                    )}
                    {selectedRange === 0 && source === 'unifi' && (
                        <button
                            type="button"
                            onClick={() => setShowLiveIcons(v => !v)}
                            title={showLiveIcons ? t('dashboard.bandwidth.hideIcons') : t('dashboard.bandwidth.showIcons')}
                            className={`flex items-center px-1.5 py-0.5 rounded-full text-[11px] ${
                                showLiveIcons ? 'text-gray-400 hover:text-gray-200' : 'bg-gray-700 text-gray-200'
                            }`}
                        >
                            {showLiveIcons ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                    )}
                </div>
            </div>
            <div
                className="w-full relative"
                style={{ height: '256px', minHeight: '256px', cursor: selectedRange === 0 ? 'pointer' : 'default' }}
                onClick={selectedRange === 0 ? toggleGraphPause : undefined}
                onKeyDown={selectedRange === 0 ? handleGraphKeyDown : undefined}
                role={selectedRange === 0 ? 'button' : undefined}
                tabIndex={selectedRange === 0 ? 0 : undefined}
                title={liveGraphTitle}
            >
                {source === 'unifi' && selectedRange === 0 && liveIcons.length > 0 && (
                    <div className="absolute top-2 right-3 z-10 flex items-center gap-1.5">
                        {liveIcons.map((c, i) => (
                            <button
                                key={c.mac}
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation(); // don't also toggle graph pause
                                    navigate(`/search?s=${encodeURIComponent(c.ip || c.mac)}`);
                                }}
                                title={`${c.name}\n${formatSpeed(c.download * 1024)} ↓ · ${formatSpeed(c.upload * 1024)} ↑\n${t('dashboard.bandwidth.viewDevice')}`}
                                className={`flex items-center gap-1 rounded-full border backdrop-blur-sm shadow-lg cursor-pointer pointer-events-auto transition-transform hover:scale-105 whitespace-nowrap ${
                                    i === 0
                                        ? 'bg-amber-500/15 border-amber-400/50 px-2 py-1'
                                        : 'bg-black/70 border-gray-700 px-1.5 py-1'
                                }`}
                            >
                                <span className="relative flex items-center justify-center">
                                    {hasVendorIcon(c.vendor, c.name)
                                        ? <VendorIcon vendor={c.vendor} label={c.name} size={i === 0 ? 15 : 13} />
                                        : <Router size={i === 0 ? 15 : 13} className="text-gray-300" />}
                                </span>
                                <span className={`text-[10px] font-medium ${i === 0 ? 'text-amber-200' : 'text-gray-300'}`}>
                                    {formatSpeed((c.download + c.upload) * 1024)}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
                {source === 'unifi' && !hasUnifiGateway ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500">
                        <Router className="w-10 h-10 mb-3 opacity-30" />
                        <p className="text-sm font-medium">{t('unifi.bandwidth.noGateway')}</p>
                        <p className="text-xs mt-1 text-gray-600 max-w-sm text-center">{t('unifi.bandwidth.noGatewayHint')}</p>
                    </div>
                ) : chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={256} minWidth={0} minHeight={256} debounce={100}>
                        <AreaChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis
                                dataKey="time"
                                stroke="#6b7280"
                                tick={{ fill: '#6b7280', fontSize: 11 }}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                stroke="#6b7280"
                                tick={{ fill: '#6b7280', fontSize: 10 }}
                                tickFormatter={(value) => formatSpeed(value * 1024)}
                                width={65}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                                labelStyle={{ color: '#9ca3af' }}
                                formatter={((value: number, _name: string, props: { dataKey: string }) => {
                                    const label = props.dataKey === 'download' ? t('system.download') : t('system.upload');
                                    const color = props.dataKey === 'download' ? COLORS.blue : COLORS.green;
                                    return [
                                        <span key="value" style={{ color }}>{formatSpeed(value * 1024)}</span>,
                                        label
                                    ];
                                }) as any}
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
                                stackId="1"
                                stroke={COLORS.blue}
                                fill={COLORS.blue}
                                fillOpacity={0.3}
                                name={t('system.download')}
                                isAnimationActive={false}
                                hide={hiddenSeries.has('download')}
                            />
                            <Area
                                type="monotone"
                                dataKey="upload"
                                stackId="2"
                                stroke={COLORS.green}
                                fill={COLORS.green}
                                fillOpacity={0.3}
                                name={t('system.upload')}
                                isAnimationActive={false}
                                hide={hiddenSeries.has('upload')}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500">
                        <Activity className="w-10 h-10 mb-3 opacity-50" />
                        <p className="text-sm">{t('dashboard.bandwidth.collectingData')}</p>
                        <p className="text-xs mt-1">{t('dashboard.bandwidth.chartWillFill')}</p>
                    </div>
                )}
            </div>
        </Card>
    );
};
