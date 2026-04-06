import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Activity, ArrowDown, ArrowUp } from 'lucide-react';
import { Card } from './Card';
import { RichTooltip } from '../ui/RichTooltip';
import { useConnectionStore } from '../../stores/connectionStore';
import { formatSpeed, POLLING_INTERVALS } from '../../utils/constants';
import { usePolling } from '../../hooks/usePolling';
import { api } from '../../api/client';
import { useUnifiRealtimeStore } from '../../stores/unifiRealtimeStore';

const COLORS = {
    blue: '#3b82f6',
    green: '#10b981'
};

type BandwidthRange = 0 | 3600 | 21600 | 86400 | 604800; // 0 = temps réel (live)
type BandwidthSource = 'freebox' | 'unifi';

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
    const {
        history,
        extendedHistory,
        fetchExtendedHistory,
        status
    } = useConnectionStore();
const [selectedRange, setSelectedRange] = useState<BandwidthRange>(freeboxAvailable ? 3600 : 0);
    const [source, setSource] = useState<BandwidthSource>(freeboxAvailable ? 'freebox' : 'unifi');
    const [unifiData, setUnifiData] = useState<BandwidthPoint[]>([]);
    const { history: unifiRealtimeHistory, download: unifiRealtimeDl, upload: unifiRealtimeUl, isConnected: unifiWsConnected } = useUnifiRealtimeStore();
    const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

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

    const freeboxChartData =
        selectedRange === 0
            ? history
            : (extendedHistory.length > 0 ? extendedHistory : history);

    const chartData = source === 'unifi'
        ? (selectedRange === 0 ? unifiRealtimeHistory : unifiData)
        : freeboxChartData;

    const showSourceToggle = freeboxAvailable && unifiAvailable;

    const cardTitle = (
        <span className="flex items-center gap-2">
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
            {showSourceToggle && (
                <span className="inline-flex items-center gap-0.5 bg-[#1b1b1b] rounded-full p-0.5 border border-gray-800 text-[11px] font-normal">
                    <button
                        type="button"
                        className={`px-2 py-0.5 rounded-full ${
                            source === 'freebox' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'
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
            )}
        </span>
    );

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
                    {source === 'unifi' && (() => {
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
                {source === 'freebox' ? (
                    <>
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
                            <span className="hidden sm:inline text-[11px] text-gray-500">
                                {t('dashboard.bandwidth.scale')}&nbsp;
                                <span className="text-gray-300">
                                    {selectedRange === 0
                                        ? t('dashboard.bandwidth.scaleRealtime')
                                        : (extendedHistory.length > 0 ? t('dashboard.bandwidth.scaleHistory') : t('dashboard.bandwidth.scaleRealtime'))}
                                </span>
                            </span>
                        </span>
                        <div className="inline-flex items-center gap-1 bg-[#1b1b1b] rounded-full p-1 border border-gray-800">
                                <button
                                    type="button"
                                    className={`px-2 py-0.5 rounded-full text-[11px] ${
                                        selectedRange === 0 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                                    }`}
                                    onClick={() => setSelectedRange(0)}
                                >
                                    {t('dashboard.bandwidth.live')}
                                </button>
                                <button
                                    type="button"
                                    className={`px-2 py-0.5 rounded-full text-[11px] ${
                                        selectedRange === 3600 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                                    }`}
                                    onClick={() => setSelectedRange(3600)}
                                >
                                    1h
                                </button>
                                <button
                                    type="button"
                                    className={`px-2 py-0.5 rounded-full text-[11px] ${
                                        selectedRange === 21600 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                                    }`}
                                    onClick={() => setSelectedRange(21600)}
                                >
                                    6h
                                </button>
                                <button
                                    type="button"
                                    className={`px-2 py-0.5 rounded-full text-[11px] ${
                                        selectedRange === 86400 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                                    }`}
                                    onClick={() => setSelectedRange(86400)}
                                >
                                    24h
                                </button>
                                <button
                                    type="button"
                                    className={`px-2 py-0.5 rounded-full text-[11px] ${
                                        selectedRange === 604800 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                                    }`}
                                    onClick={() => setSelectedRange(604800)}
                                >
                                    7j
                                </button>
                            </div>
                    </>
                ) : (
                    // UniFi: same range selector
                    <div className="flex items-center justify-end w-full">
                        <div className="inline-flex items-center gap-1 bg-[#1b1b1b] rounded-full p-1 border border-gray-800">
                            <button
                                type="button"
                                className={`px-2 py-0.5 rounded-full text-[11px] ${
                                    selectedRange === 0 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                                }`}
                                onClick={() => setSelectedRange(0)}
                            >
                                {t('dashboard.bandwidth.live')}
                            </button>
                            <button
                                type="button"
                                className={`px-2 py-0.5 rounded-full text-[11px] ${
                                    selectedRange === 3600 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                                }`}
                                onClick={() => setSelectedRange(3600)}
                            >
                                1h
                            </button>
                            <button
                                type="button"
                                className={`px-2 py-0.5 rounded-full text-[11px] ${
                                    selectedRange === 21600 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                                }`}
                                onClick={() => setSelectedRange(21600)}
                            >
                                6h
                            </button>
                            <button
                                type="button"
                                className={`px-2 py-0.5 rounded-full text-[11px] ${
                                    selectedRange === 86400 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                                }`}
                                onClick={() => setSelectedRange(86400)}
                            >
                                24h
                            </button>
                            <button
                                type="button"
                                className={`px-2 py-0.5 rounded-full text-[11px] ${
                                    selectedRange === 604800 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                                }`}
                                onClick={() => setSelectedRange(604800)}
                            >
                                7j
                            </button>
                        </div>
                    </div>
                )}
            </div>
            <div className="w-full" style={{ height: '256px', minHeight: '256px' }}>
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={256} minWidth={0} minHeight={256}>
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
                                type={source === 'freebox' && selectedRange === 0 ? "linear" : "monotone"}
                                dataKey="download"
                                stackId="1"
                                stroke={COLORS.blue}
                                fill={COLORS.blue}
                                fillOpacity={0.3}
                                name={t('system.download')}
                                isAnimationActive={source === 'unifi' || selectedRange !== 0}
                                hide={hiddenSeries.has('download')}
                            />
                            <Area
                                type={source === 'freebox' && selectedRange === 0 ? "linear" : "monotone"}
                                dataKey="upload"
                                stackId="2"
                                stroke={COLORS.green}
                                fill={COLORS.green}
                                fillOpacity={0.3}
                                name={t('system.upload')}
                                isAnimationActive={source === 'unifi' || selectedRange !== 0}
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
