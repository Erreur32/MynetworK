/**
 * Latency Monitoring Modal
 * 
 * Displays latency scatter chart exactly like Lagident
 */

import React, { useEffect, useState, useMemo } from 'react';
import { X } from 'lucide-react';
import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from 'recharts';
import { api } from '../../api/client';

interface LatencyMonitoringModalProps {
    isOpen: boolean;
    onClose: () => void;
    ip: string;
}

interface Measurement {
    latency: number | null;
    packetLoss: boolean;
    measuredAt: string;
}

interface Statistics {
    avg1h: number | null;
    max: number | null;
    min: number | null;
    avg24h: number | null;
    packetLossPercent: number;
    totalMeasurements: number;
}

interface NetworkScanResponse {
    hostname?: string;
}

/**
 * Get color for latency value (exactly like Lagident)
 * Green for low (0-50ms), Yellow/Orange for moderate (50-150ms), Red for high (150-250ms)
 */
const getLatencyColor = (latency: number | null): string => {
    if (latency === null) return '#ef4444'; // Red for packet loss
    
    if (latency < 50) return '#10b981'; // Green
    if (latency < 100) return '#f59e0b'; // Yellow/Orange
    if (latency < 150) return '#f97316'; // Orange
    return '#ef4444'; // Red
};

/**
 * Format time for X-axis (adapts based on time range)
 * For multiple days: shows "DD/MM HH:MM" or "DD/MM" if many days
 */
const formatTimeForAxis = (date: Date, dataRange?: { min: number; max: number }): string => {
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // If we have data range info, adapt format based on span
    if (dataRange) {
        const daysSpan = (dataRange.max - dataRange.min) / (1000 * 60 * 60 * 24);
        
        // If more than 7 days, show only date without time
        if (daysSpan > 7) {
            return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}`;
        }
        // If more than 2 days, show date and hour
        if (daysSpan > 2) {
            const hoursStr = hours.toString().padStart(2, '0');
            return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')} ${hoursStr}h`;
        }
    }
    
    // Default: show date and full time
    const hoursStr = hours.toString().padStart(2, '0');
    const minutesStr = minutes.toString().padStart(2, '0');
    return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')} ${hoursStr}:${minutesStr}`;
};

export const LatencyMonitoringModal: React.FC<LatencyMonitoringModalProps> = ({
    isOpen,
    onClose,
    ip
}) => {
    const [measurements, setMeasurements] = useState<Measurement[]>([]);
    const [statistics, setStatistics] = useState<Statistics | null>(null);
    const [loading, setLoading] = useState(true);
    const [hostname, setHostname] = useState<string>('');

    useEffect(() => {
        if (isOpen && ip) {
            fetchData();
        }
    }, [isOpen, ip]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch measurements (last 90 days to show multiple days with all points)
            const measurementsResponse = await api.get<Measurement[]>(`/api/latency-monitoring/measurements/${ip}?days=90`);
            if (measurementsResponse.success && measurementsResponse.result) {
                setMeasurements(measurementsResponse.result);
            }

            // Fetch statistics
            const statsResponse = await api.get<Statistics>(`/api/latency-monitoring/stats/${ip}`);
            if (statsResponse.success && statsResponse.result) {
                setStatistics(statsResponse.result);
            }

            // Try to get hostname from network scans
            try {
                const scanResponse = await api.get<NetworkScanResponse>(`/api/network-scan/${ip}`);
                if (scanResponse.success && scanResponse.result?.hostname) {
                    setHostname(scanResponse.result.hostname);
                }
            } catch {
                // Ignore errors, hostname is optional
            }
        } catch (error) {
            console.error('Failed to fetch latency data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Prepare data for scatter chart
    const chartData = useMemo(() => {
        const validMeasurements = measurements
            .filter(m => !m.packetLoss && m.latency !== null && m.latency !== undefined)
            .map(m => ({
                x: new Date(m.measuredAt).getTime(),
                y: m.latency!,
                latency: m.latency!,
                timestamp: m.measuredAt
            }));
        
        return validMeasurements;
    }, [measurements]);

    // Calculate dynamic Y domain exactly like Lagident
    // Lagident uses: min = 0, max = max(latency) + padding, with adaptive padding
    const yDomain = useMemo(() => {
        if (chartData.length === 0) return [0, 250];
        
        const latencies = chartData.map(d => d.latency);
        const minLatency = Math.min(...latencies);
        const maxLatency = Math.max(...latencies);
        const range = maxLatency - minLatency;
        
        // Lagident algorithm: always start from 0, add adaptive padding at top
        // Padding is calculated as percentage of range with minimum values
        
        let padding: number;
        
        if (range === 0) {
            // All values are the same
            padding = maxLatency > 0 ? maxLatency * 0.1 : 1;
        } else if (maxLatency < 1) {
            // Very low values (< 1ms)
            padding = Math.max(0.1, range * 0.2);
        } else if (maxLatency < 5) {
            // Low values (< 5ms)
            padding = Math.max(0.5, range * 0.15);
        } else if (maxLatency < 20) {
            // Moderate values (< 20ms)
            padding = Math.max(2, range * 0.1);
        } else if (maxLatency < 100) {
            // Medium values (< 100ms)
            padding = Math.max(5, range * 0.08);
        } else {
            // High values (>= 100ms)
            padding = Math.max(10, range * 0.05);
        }
        
        // Always start from 0 (like Lagident)
        const domainMin = 0;
        const domainMax = maxLatency + padding;
        
        // Ensure minimum range of 10ms for visibility
        const finalMax = Math.max(domainMax, 10);
        
        return [domainMin, finalMax];
    }, [chartData]);

    // Prepare packet loss data (vertical lines)
    const packetLossData = useMemo(() => {
        return measurements
            .filter(m => m.packetLoss)
            .map(m => ({
                x: new Date(m.measuredAt).getTime(),
                y: 1, // Loss axis value
                timestamp: m.measuredAt
            }));
    }, [measurements]);

    // Calculate data range for adaptive formatting
    const dataRange = useMemo(() => {
        if (chartData.length === 0) return undefined;
        const times = chartData.map(d => d.x);
        return {
            min: Math.min(...times),
            max: Math.max(...times)
        };
    }, [chartData]);

    // Format X-axis ticks with adaptive formatting
    const formatXAxis = useMemo(() => {
        return (tickItem: number) => {
            const date = new Date(tickItem);
            return formatTimeForAxis(date, dataRange);
        };
    }, [dataRange]);
    
    // Calculate optimal tick interval based on data range
    const xAxisTickInterval = useMemo(() => {
        if (!dataRange) return 'preserveStartEnd';
        const daysSpan = (dataRange.max - dataRange.min) / (1000 * 60 * 60 * 24);
        
        // For many days, show fewer ticks to avoid clutter
        if (daysSpan > 30) return 2; // Every 2nd tick
        if (daysSpan > 14) return 1; // Every tick
        if (daysSpan > 7) return 0; // Every tick
        return 0; // Show all ticks for short ranges
    }, [dataRange]);

    // Custom tooltip
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length > 0) {
            const data = payload[0].payload;
            return (
                <div className="bg-[#1f2937] border border-gray-700 rounded-lg p-3 shadow-lg">
                    <p className="text-gray-300 text-sm mb-1">
                        {new Date(data.timestamp).toLocaleString('fr-FR')}
                    </p>
                    <p className="text-white font-medium">
                        Latence: <span style={{ color: getLatencyColor(data.latency) }}>{typeof data.latency === 'number' ? data.latency.toFixed(3) : 'N/A'}ms</span>
                    </p>
                </div>
            );
        }
        return null;
    };

    if (!isOpen) return null;

    const displayName = hostname ? `${hostname} - ${ip}` : ip;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#121212] rounded-xl border border-gray-800 w-full max-w-[98vw] h-[95vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-800">
                    <div>
                        <h2 className="text-xl font-semibold text-white">Latency scatter</h2>
                        <p className="text-sm text-gray-400 mt-1">{displayName}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 p-4 pt-4 pb-2 overflow-auto">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-gray-400">Chargement des données...</div>
                        </div>
                    ) : chartData.length === 0 ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-gray-400">Aucune donnée disponible</div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col">
                            {/* Statistics */}
                            {statistics && (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 flex-shrink-0">
                                    <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                                        <div className="text-xs text-gray-400 uppercase mb-1">Moyenne (1h)</div>
                                        <div className="text-lg font-semibold text-white">
                                            {statistics.avg1h !== null ? `${statistics.avg1h.toFixed(2)}ms` : '--'}
                                        </div>
                                    </div>
                                    <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                                        <div className="text-xs text-gray-400 uppercase mb-1">Min</div>
                                        <div className="text-lg font-semibold text-white">
                                            {statistics.min !== null ? `${statistics.min.toFixed(2)}ms` : '--'}
                                        </div>
                                    </div>
                                    <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                                        <div className="text-xs text-gray-400 uppercase mb-1">Max</div>
                                        <div className="text-lg font-semibold text-white">
                                            {statistics.max !== null ? `${statistics.max.toFixed(2)}ms` : '--'}
                                        </div>
                                    </div>
                                    <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                                        <div className="text-xs text-gray-400 uppercase mb-1">Perte de paquets</div>
                                        <div className="text-lg font-semibold text-white">
                                            {statistics.packetLossPercent.toFixed(2)}%
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Scatter Chart */}
                            <div className="bg-[#1a1a1a] rounded-lg p-4 pb-2 border border-gray-800 flex-1 flex flex-col min-h-0">
                                <div className="w-full flex-1 min-h-0 bg-[#0f0f0f] rounded border border-gray-900/50 p-2 relative">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ScatterChart
                                            margin={{ top: 20, right: 80, bottom: 60, left: 20 }}
                                        >
                                        <CartesianGrid 
                                            strokeDasharray="3 3" 
                                            stroke="#374151" 
                                            vertical={true}
                                            horizontal={true}
                                        />
                                        {/* Fine vertical grid lines for X-axis */}
                                        <CartesianGrid 
                                            strokeDasharray="1 1" 
                                            stroke="#2a2a2a" 
                                            vertical={true}
                                            horizontal={false}
                                        />
                                        <XAxis
                                            type="number"
                                            dataKey="x"
                                            domain={['dataMin', 'dataMax']}
                                            tickFormatter={formatXAxis}
                                            stroke="#6b7280"
                                            tick={{ fill: '#6b7280', fontSize: 10 }}
                                            angle={-45}
                                            textAnchor="end"
                                            height={70}
                                            interval={typeof xAxisTickInterval === 'number' ? xAxisTickInterval : undefined}
                                            allowDuplicatedCategory={false}
                                        />
                                        <YAxis
                                            yAxisId="latency"
                                            type="number"
                                            dataKey="y"
                                            domain={yDomain}
                                            label={{ value: 'Latency', angle: -90, position: 'insideLeft', style: { fill: '#9ca3af' } }}
                                            stroke="#6b7280"
                                            tick={{ fill: '#6b7280', fontSize: 11 }}
                                            allowDataOverflow={false}
                                        />
                                        <YAxis
                                            yAxisId="loss"
                                            type="number"
                                            dataKey="y"
                                            domain={[0, 1]}
                                            orientation="right"
                                            label={{ value: 'Loss', angle: 90, position: 'insideRight', style: { fill: '#9ca3af' } }}
                                            stroke="#6b7280"
                                            tick={{ fill: '#6b7280', fontSize: 11 }}
                                            ticks={[0, 1]}
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Scatter
                                            yAxisId="latency"
                                            name="Latency"
                                            data={chartData}
                                            fill="#8884d8"
                                        >
                                            {chartData.map((entry, index) => (
                                                <Cell 
                                                    key={`cell-${index}`} 
                                                    fill={getLatencyColor(entry.latency)}
                                                    r={chartData.length > 5000 ? 2 : chartData.length > 2000 ? 3 : 4}
                                                />
                                            ))}
                                        </Scatter>
                                        {/* Packet loss as vertical lines */}
                                        {packetLossData.length > 0 && (
                                            <Scatter
                                                yAxisId="loss"
                                                name="Packet Loss"
                                                data={packetLossData}
                                                fill="#ef4444"
                                            >
                                                {packetLossData.map((entry, index) => (
                                                    <Cell key={`loss-${index}`} fill="#ef4444" />
                                                ))}
                                            </Scatter>
                                        )}
                                    </ScatterChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Color Legend */}
                                <div className="flex items-center justify-end mt-2 gap-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 bg-gradient-to-t from-[#10b981] via-[#f59e0b] to-[#ef4444] rounded"></div>
                                        <div className="text-xs text-gray-400">
                                            <div>HIGH</div>
                                            <div className="mt-1">LOW</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

