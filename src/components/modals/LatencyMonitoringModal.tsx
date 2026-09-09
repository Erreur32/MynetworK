/**
 * Latency Monitoring Modal
 * 
 * Displays latency scatter chart exactly like Lagident
 */

import React, { useEffect, useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { api } from '../../api/client';
import { LatencyCanvasChart } from './LatencyCanvasChart';

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
 * Format time for X-axis (adapts based on time range)
 * Optimized for horizontal display - shorter formats to avoid overlap
 */
const formatTimeForAxis = (date: Date, dataRange?: { min: number; max: number }): string => {
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // If we have data range info, adapt format based on span
    if (dataRange) {
        const daysSpan = (dataRange.max - dataRange.min) / (1000 * 60 * 60 * 24);
        
        // If more than 7 days, show only date (DD/MM)
        if (daysSpan > 7) {
            return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}`;
        }
        // If more than 2 days, show date and hour (DD/MM HHh)
        if (daysSpan > 2) {
            const hoursStr = hours.toString().padStart(2, '0');
            return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')} ${hoursStr}h`;
        }
        // If more than 1 day, show date and hour (DD/MM HHh)
        if (daysSpan > 1) {
            const hoursStr = hours.toString().padStart(2, '0');
            return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')} ${hoursStr}h`;
        }
    }
    
    // Default for < 1 day: show hour and minutes (HH:MM) - shorter format
    const hoursStr = hours.toString().padStart(2, '0');
    const minutesStr = minutes.toString().padStart(2, '0');
    return `${hoursStr}:${minutesStr}`;
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
    const [selectedDays, setSelectedDays] = useState<number>(3); // Default 3 days like Lagident

    useEffect(() => {
        if (isOpen && ip) {
            fetchData();
        }
    }, [isOpen, ip, selectedDays]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch measurements with selected period
            // Lagident keeps 3 days by default (~17,280 measurements per target)
            // We'll fetch the selected period but downsample if needed for performance
            const measurementsResponse = await api.get<Measurement[]>(`/api/latency-monitoring/measurements/${ip}?days=${selectedDays}`);
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

    // Safety net only: the server already caps the payload to ~4000 points
    // (see /api/latency-monitoring/measurements bucketing). This is a plain
    // fixed-stride decimation to guarantee a hard cap regardless of server config.
    const MAX_POINTS = 6000;

    const chartData = useMemo(() => {
        const validMeasurements = measurements
            .filter(m => !m.packetLoss && m.latency !== null && m.latency !== undefined)
            .map(m => ({
                x: new Date(m.measuredAt).getTime(),
                latency: m.latency!,
                timestamp: m.measuredAt
            }));

        if (validMeasurements.length <= MAX_POINTS) {
            return validMeasurements;
        }

        const step = Math.ceil(validMeasurements.length / MAX_POINTS);
        const decimated: typeof validMeasurements = [];
        for (let i = 0; i < validMeasurements.length; i += step) {
            decimated.push(validMeasurements[i]);
        }
        return decimated;
    }, [measurements]);

    // Calculate dynamic Y domain exactly like Lagident
    // Lagident uses: min = 0, max = max(latency) + padding, with adaptive padding
    const yDomain = useMemo<[number, number]>(() => {
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
    
    if (!isOpen) return null;

    const displayName = hostname ? `${hostname} - ${ip}` : ip;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#121212] rounded-xl border border-gray-800 w-full max-w-[98vw] h-[95vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-800">
                    <div className="flex-1">
                        <div className="flex items-center gap-4">
                            <div>
                                <h2 className="text-xl font-semibold text-white">Latency scatter</h2>
                                <p className="text-sm text-gray-400 mt-1">{displayName}</p>
                            </div>
                            {/* Period selector */}
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-gray-400">Période:</label>
                                <select
                                    value={selectedDays}
                                    onChange={(e) => setSelectedDays(Number(e.target.value))}
                                    className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                                >
                                    <option value={1}>1 jour</option>
                                    <option value={3}>3 jours</option>
                                    <option value={7}>7 jours</option>
                                    <option value={30}>30 jours</option>
                                </select>
                            </div>
                        </div>
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
                                {/* Info about downsampling if applied */}
                                {measurements.length > MAX_POINTS && (
                                    <div className="mb-2 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 rounded px-3 py-2">
                                        ⚡ Optimisation: {measurements.length.toLocaleString()} points → {chartData.length.toLocaleString()} points affichés (downsampling pour performance)
                                    </div>
                                )}
                                <div className="w-full flex-1 min-h-0 bg-[#0f0f0f] rounded border border-gray-900/50 p-2 relative">
                                    <LatencyCanvasChart
                                        data={chartData}
                                        lossData={packetLossData}
                                        yDomain={yDomain}
                                        formatXAxis={formatXAxis}
                                    />
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

