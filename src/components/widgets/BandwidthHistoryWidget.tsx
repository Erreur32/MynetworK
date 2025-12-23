import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Activity, ArrowDown, ArrowUp } from 'lucide-react';
import { Card } from './Card';
import { useConnectionStore } from '../../stores/connectionStore';
import { useAuthStore } from '../../stores/authStore';
import { formatSpeed, POLLING_INTERVALS } from '../../utils/constants';
import { usePolling } from '../../hooks/usePolling';

const COLORS = {
    blue: '#3b82f6',
    green: '#10b981'
};

type BandwidthRange = 0 | 3600 | 21600 | 86400 | 604800; // 0 = temps réel (live)

export const BandwidthHistoryWidget: React.FC = () => {
    const {
        history,
        extendedHistory,
        fetchExtendedHistory,
        status
    } = useConnectionStore();
    const { login, isLoggedIn } = useAuthStore();

    const [selectedRange, setSelectedRange] = useState<BandwidthRange>(3600);

    useEffect(() => {
        // Load history when widget mounts and when range changes (RRD only for non-zero ranges)
        if (selectedRange > 0) {
            fetchExtendedHistory(selectedRange).catch(() => {
                // If RRD not available, we will fallback to live history
            });
        }
    }, [fetchExtendedHistory, selectedRange]);

    // Keep 1h / 6h / 24h / 7j ranges updated over time (RRD is a rolling window)
    // This ensures that even en mode historique the graph continues to move, like live mode.
    usePolling(() => {
        if (selectedRange > 0) {
            fetchExtendedHistory(selectedRange).catch(() => {
                // If RRD not available, we will fallback to live history
            });
        }
    }, {
        enabled: selectedRange > 0,
        interval: POLLING_INTERVALS.system
    });

    const chartData =
        selectedRange === 0
            ? history
            : (extendedHistory.length > 0 ? extendedHistory : history);

    return (
        <Card
            title="Bande passante Freebox"
            actions={
                status && (
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
                )
            }
        >
            <div className="flex items-center justify-between mb-3 text-xs text-gray-500">
                <span className="flex items-center gap-3">
                    <span>
                        Période:&nbsp;
                        <span className="text-gray-300">
                            {selectedRange === 0 && 'Temps réel'}
                            {selectedRange === 3600 && '1h'}
                            {selectedRange === 21600 && '6h'}
                            {selectedRange === 86400 && '24h'}
                            {selectedRange === 604800 && '7j'}
                        </span>
                    </span>
                    <span className="hidden sm:inline text-[11px] text-gray-500">
                        Échelle:&nbsp;
                        <span className="text-gray-300">
                            {selectedRange === 0
                                ? 'temps réel (live)'
                                : (extendedHistory.length > 0 ? 'historique (RRD)' : 'temps réel (live)')}
                        </span>
                    </span>
                </span>
                <div className="flex items-center gap-2">
                    <div className="inline-flex items-center gap-1 bg-[#1b1b1b] rounded-full p-1 border border-gray-800">
                        <button
                            type="button"
                            className={`px-2 py-0.5 rounded-full text-[11px] ${
                                selectedRange === 0 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                            }`}
                            onClick={() => setSelectedRange(0)}
                        >
                            Live
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
                    <button
                        type="button"
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-[#1b1b1b] border border-gray-800 text-gray-300 hover:bg-[#252525] hover:text-white"
                        onClick={() => {
                            // Manual trigger to refresh Freebox auth + reload history
                            login().then(() => {
                                if (selectedRange > 0) {
                                    fetchExtendedHistory(selectedRange).catch(() => {});
                                }
                            }).catch(() => {
                                if (selectedRange > 0) {
                                    fetchExtendedHistory(selectedRange).catch(() => {});
                                }
                            });
                        }}
                        title={isLoggedIn ? 'Rafraîchir l’historique via Freebox' : 'Tenter de se reconnecter à la Freebox'}
                    >
                        <span
                            className={`w-2 h-2 rounded-full ${
                                isLoggedIn ? 'bg-emerald-400' : 'bg-red-500'
                            }`}
                        />
                        <span>Auth</span>
                    </button>
                </div>
            </div>
            <div className="w-full" style={{ height: '256px', minHeight: '256px' }}>
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={256} minWidth={0} minHeight={256}>
                        <AreaChart data={chartData} isAnimationActive={selectedRange !== 0}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis
                                dataKey="time"
                                stroke="#6b7280"
                                tick={{ fill: '#6b7280', fontSize: 11 }}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                stroke="#6b7280"
                                tick={{ fill: '#6b7280', fontSize: 11 }}
                                tickFormatter={(value) => formatSpeed(value * 1024).split(' ')[0]}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                                labelStyle={{ color: '#9ca3af' }}
                                formatter={((value: number, _name: string, props: { dataKey: string }) => {
                                    const label = props.dataKey === 'download' ? 'Descendant' : 'Montant';
                                    const color = props.dataKey === 'download' ? COLORS.blue : COLORS.green;
                                    return [
                                        <span key="value" style={{ color }}>{formatSpeed(value * 1024)}</span>,
                                        label
                                    ];
                                }) as any}
                            />
                            <Legend />
                            <Area
                                type={selectedRange === 0 ? "linear" : "monotone"}
                                dataKey="download"
                                stackId="1"
                                stroke={COLORS.blue}
                                fill={COLORS.blue}
                                fillOpacity={0.3}
                                name="Descendant"
                                isAnimationActive={selectedRange !== 0}
                            />
                            <Area
                                type={selectedRange === 0 ? "linear" : "monotone"}
                                dataKey="upload"
                                stackId="2"
                                stroke={COLORS.green}
                                fill={COLORS.green}
                                fillOpacity={0.3}
                                name="Montant"
                                isAnimationActive={selectedRange !== 0}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500">
                        <Activity className="w-10 h-10 mb-3 opacity-50" />
                        <p className="text-sm">Collecte des données en cours...</p>
                        <p className="text-xs mt-1">Le graphique se remplira automatiquement.</p>
                    </div>
                )}
            </div>
        </Card>
    );
};

