/**
 * Network Scan Widget
 * 
 * Displays network scan summary statistics on the dashboard
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from './Card';
import { Network, ArrowRight, Activity, CheckCircle, Gauge, Router, Info } from 'lucide-react';
import { usePluginStore } from '../../stores/pluginStore';
import { api } from '../../api/client';
import { formatBytes, formatSpeed } from '../../utils/constants';
import { usePolling } from '../../hooks/usePolling';
import { VendorIcon } from '../ui/VendorIcon';
import { hasVendorIcon } from '../../utils/vendorBrand';
import { useUnifiRealtimeStore } from '../../stores/unifiRealtimeStore';

interface NetworkScanWidgetProps {
    onViewDetails?: () => void;
}

interface NetworkScanItem {
    id: number;
    ip: string;
    mac?: string;
    hostname?: string;
    status: 'online' | 'offline' | 'unknown';
    pingLatency?: number;
}

interface TopTrafficClient {
    mac: string;
    name: string;
    ip?: string;
    vendor?: string | null;
    rxBytes: number;
    txBytes: number;
}

type TrafficPeriod = 'live' | 'today' | 'alltime';

// Persist the "Volume de données" tab choice across reloads (per browser).
const TRAFFIC_PERIOD_STORAGE_KEY = 'mynetwork_traffic_period';

function readStoredTrafficPeriod(fallback: TrafficPeriod): TrafficPeriod {
    try {
        const v = localStorage.getItem(TRAFFIC_PERIOD_STORAGE_KEY);
        if (v === 'live' || v === 'today' || v === 'alltime') return v;
    } catch { /* ignore */ }
    return fallback;
}

interface AutoStatus {
    enabled: boolean;
    fullScan: {
        config: { enabled: boolean; interval: number; scanType: 'full' | 'quick' };
        scheduler: { enabled: boolean; running: boolean };
        lastExecution: {
            timestamp: string;
            type: 'manual' | 'auto';
            scanType: 'full' | 'quick';
            range?: string;
        } | null;
    };
    refresh: {
        config: { enabled: boolean; interval: number; scanType?: 'full' | 'quick' };
        scheduler: { enabled: boolean; running: boolean };
        lastExecution: {
            timestamp: string;
            type: 'manual' | 'auto';
            scanType: 'full' | 'quick';
        } | null;
    };
    lastScan: {
        timestamp: string;
        type: 'full' | 'refresh';
        scanType: 'full' | 'quick';
        isManual: boolean;
        range?: string;
    } | null;
}

export const NetworkScanWidget: React.FC<NetworkScanWidgetProps> = ({ onViewDetails }) => {
    const { t, i18n } = useTranslation();
    const dateLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';
    const { pluginStats } = usePluginStore();
    const stats = pluginStats['scan-reseau'];
    
    const systemStats = stats?.system as any;
    const totalIps = systemStats?.totalIps || 0;
    const onlineIps = systemStats?.onlineIps || 0;
    const offlineIps = systemStats?.offlineIps || 0;
    const lastScan = systemStats?.lastScan ? new Date(systemStats.lastScan) : null;

    const [offlineIpsList, setOfflineIpsList] = useState<NetworkScanItem[]>([]);
    const [worstLatencyIps, setWorstLatencyIps] = useState<NetworkScanItem[]>([]);
    const [latencyLimit, setLatencyLimit] = useState<5 | 10>(5);
    const [loading, setLoading] = useState(false);
    const [autoStatus, setAutoStatus] = useState<AutoStatus | null>(null);
    const [autoStatusLoading, setAutoStatusLoading] = useState(true);
    const [scanRange, setScanRange] = useState<string>('192.168.1.0/24');

    const navigate = useNavigate();
    const { plugins } = usePluginStore();
    const hasUniFi = plugins.some(p => p.id === 'unifi' && p.enabled && p.connectionStatus);
    const [trafficPeriod, setTrafficPeriodState] = useState<TrafficPeriod>(() => readStoredTrafficPeriod('today'));
    const setTrafficPeriod = (period: TrafficPeriod) => {
        setTrafficPeriodState(period);
        try { localStorage.setItem(TRAFFIC_PERIOD_STORAGE_KEY, period); } catch { /* ignore */ }
    };
    const [topTraffic, setTopTraffic] = useState<TopTrafficClient[]>([]);
    const [topTrafficLoading, setTopTrafficLoading] = useState(false);
    const { topClients: liveTopClients, isConnected: unifiWsConnected } = useUnifiRealtimeStore();

    // Fetch top traffic consumers (UniFi only — see feasibility notes: no per-host counters on Freebox)
    // Live mode reads straight from the WebSocket-fed realtime store, no REST call needed.
    const fetchTopTraffic = async () => {
        if (!hasUniFi || trafficPeriod === 'live') return;
        setTopTrafficLoading(true);
        try {
            const response = await api.get<TopTrafficClient[]>(`/api/plugins/unifi/top-clients-history?period=${trafficPeriod}&limit=10`);
            if (response.success && response.result) {
                setTopTraffic(response.result);
            }
        } catch {
            // ignore
        } finally {
            setTopTrafficLoading(false);
        }
    };

    useEffect(() => {
        fetchTopTraffic();
    }, [hasUniFi, trafficPeriod]);

    usePolling(fetchTopTraffic, {
        enabled: hasUniFi && trafficPeriod !== 'live',
        interval: 60000
    });

    const trafficRows = trafficPeriod === 'live'
        ? liveTopClients.map(c => ({ mac: c.mac, name: c.name, ip: c.ip, vendor: c.vendor, volumeText: formatSpeed((c.download + c.upload) * 1024) }))
        : topTraffic.map(c => ({ mac: c.mac, name: c.name, ip: c.ip, vendor: c.vendor, volumeText: formatBytes(c.rxBytes + c.txBytes) }));

    // Fetch default scan range
    useEffect(() => {
        const fetchDefaultConfig = async () => {
            try {
                const response = await api.get<{ defaultRange: string; defaultAutoDetect: boolean }>('/api/network-scan/default-config');
                if (response.success && response.result) {
                    setScanRange(response.result.defaultRange);
                }
            } catch (error) {
                console.error('Failed to fetch default config:', error);
            }
        };
        
        fetchDefaultConfig();
    }, []);

    // Fetch auto status
    useEffect(() => {
        let isMounted = true;
        
        const fetchAutoStatus = async () => {
            try {
                setAutoStatusLoading(true);
                const response = await api.get<AutoStatus>('/api/network-scan/auto-status');
                if (isMounted && response.success && response.result) {
                    setAutoStatus(response.result);
                }
            } catch (error) {
                console.error('Failed to fetch auto status:', error);
            } finally {
                if (isMounted) {
                    setAutoStatusLoading(false);
                }
            }
        };
        
        fetchAutoStatus();
        
        return () => {
            isMounted = false;
        };
    }, []);

    // Fetch offline IPs and worst latency IPs
    useEffect(() => {
        if (totalIps === 0) {
            setOfflineIpsList([]);
            setWorstLatencyIps([]);
            return;
        }

        let isMounted = true;

        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch offline IPs
                const offlineParams = new URLSearchParams({
                    status: 'offline',
                    limit: '10',
                    sortBy: 'last_seen',
                    sortOrder: 'desc'
                });
                const offlineResponse = await api.get<{ items: NetworkScanItem[]; total: number; limit: number; offset: number }>(`/api/network-scan/history?${offlineParams.toString()}`);
                if (isMounted && offlineResponse.success && offlineResponse.result?.items) {
                    setOfflineIpsList(offlineResponse.result.items);
                } else if (isMounted) {
                    setOfflineIpsList([]);
                }

                // Fetch worst latency IPs (online only, sorted by latency desc)
                const latencyParams = new URLSearchParams({
                    status: 'online',
                    limit: '10',
                    sortBy: 'ping_latency',
                    sortOrder: 'desc'
                });
                const latencyResponse = await api.get<{ items: NetworkScanItem[]; total: number; limit: number; offset: number }>(`/api/network-scan/history?${latencyParams.toString()}`);
                if (isMounted && latencyResponse.success && latencyResponse.result?.items) {
                    // Filter to only include IPs with latency > 0 and sort by latency desc
                    const withLatency = latencyResponse.result.items
                        .filter((item: NetworkScanItem) => item.pingLatency && item.pingLatency > 0)
                        .sort((a: NetworkScanItem, b: NetworkScanItem) => (b.pingLatency || 0) - (a.pingLatency || 0))
                        .slice(0, 10);
                    setWorstLatencyIps(withLatency);
                } else if (isMounted) {
                    setWorstLatencyIps([]);
                }
            } catch (error) {
                console.error('Failed to fetch network scan details:', error);
                if (isMounted) {
                    setOfflineIpsList([]);
                    setWorstLatencyIps([]);
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            isMounted = false;
        };
    }, [totalIps]);

    // Format date helper
    const formatDate = (dateStr: string): string => {
        const date = new Date(dateStr);
        return date.toLocaleDateString(dateLocale, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Format relative time helper
    const formatNextExecution = (lastExecution: string | null, intervalMinutes: number): string => {
        const now = new Date();
        let nextDate: Date;
        
        if (!lastExecution) {
            // Si pas de dernière exécution, le prochain scan est dans l'intervalle configuré
            nextDate = new Date(now.getTime() + intervalMinutes * 60000);
        } else {
            const lastDate = new Date(lastExecution);
            nextDate = new Date(lastDate.getTime() + intervalMinutes * 60000);
        }
        
        const diffMs = nextDate.getTime() - now.getTime();
        
        // Si le prochain scan est déjà passé (retard), afficher quand même la date précise
        if (diffMs <= 0) {
            const d = nextDate.toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit' });
            const tm = nextDate.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' });
            return t('networkScan.time.nextExecutionDate', { date: d, time: tm });
        }
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        const tm = nextDate.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' });
        const d = nextDate.toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit' });
        const dFull = nextDate.toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' });
        if (diffMins < 60) {
            if (diffMins < 1) return t('networkScan.time.nextExecutionLessThan1Min', { time: tm });
            return t('networkScan.time.nextExecutionMinutes', { count: diffMins, time: tm });
        }
        if (diffHours < 24) return t('networkScan.time.nextExecutionHours', { count: diffHours, time: tm });
        if (diffDays < 7) return t('networkScan.time.nextExecutionDays', { count: diffDays, date: d, time: tm });
        return t('networkScan.time.nextExecutionDate', { date: dFull, time: tm });
    };

    const formatRelativeTime = (dateStr: string): string => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        if (diffMins < 1) return t('networkScan.time.justNow');
        if (diffMins < 60) return t('networkScan.time.minutesAgo', { count: diffMins });
        if (diffHours < 24) return t('networkScan.time.hoursAgo', { count: diffHours });
        if (diffDays < 7) return t('networkScan.time.daysAgo', { count: diffDays });
        return formatDate(dateStr);
    };

    // Get latency color class
    const getLatencyColor = (latency?: number): string => {
        if (!latency) return 'text-gray-400';
        if (latency < 50) return 'text-emerald-400';
        if (latency < 100) return 'text-yellow-400';
        if (latency < 200) return 'text-orange-400';
        return 'text-red-400';
    };

    return (
        <Card
            title={
                <div className="flex items-center gap-2">
                    <Network size={18} className="text-cyan-400" />
                    <span>{t('networkScan.title')}</span>
                </div>
            }
            actions={
                onViewDetails ? (
                    <button
                        onClick={onViewDetails}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 rounded border border-blue-500/30"
                    >
                        {t('networkScan.widget.viewDetails')}
                        <ArrowRight size={14} />
                    </button>
                ) : undefined
            }
        >
            {totalIps === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Activity size={32} className="text-gray-500 mb-2" />
                    <p className="text-sm text-gray-400">{t('networkScan.widget.noScanDone')}</p>
                    <p className="text-xs text-gray-500 mt-1">
                        {t('networkScan.widget.launchScanHint')}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Statistics */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="text-center p-3 bg-[#1a1a1a] rounded-lg border border-gray-800">
                            <div className="text-2xl font-bold text-gray-200">{totalIps}</div>
                            <div className="text-xs text-gray-400 mt-1">{t('networkScan.widget.totalIps')}</div>
                        </div>
                        <div className="text-center p-3 bg-[#1a1a1a] rounded-lg border border-gray-800">
                            <div className="text-2xl font-bold text-emerald-400">{onlineIps}</div>
                            <div className="text-xs text-gray-400 mt-1">{t('networkScan.widget.online')}</div>
                        </div>
                        <div className="text-center p-3 bg-[#1a1a1a] rounded-lg border border-gray-800">
                            <div className="text-2xl font-bold text-red-400">{offlineIps}</div>
                            <div className="text-xs text-gray-400 mt-1">{t('networkScan.widget.offline')}</div>
                        </div>
                    </div>

                    {/* Last scan - Same format as Info Scans */}
                    <div className="pt-2 border-t border-gray-800">
                        <div className="text-xs space-y-2">
                            <div className="font-medium text-gray-300 mb-2">{t('networkScan.widget.lastScan')}</div>
                            {autoStatus?.lastScan ? (
                                <div className="mb-2">
                                    <div className="flex items-center gap-2 mb-1">
                                        {autoStatus.lastScan.isManual ? (
                                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">{t('networkScan.widget.manual')}</span>
                                        ) : (
                                            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs font-medium">{t('networkScan.widget.auto')}</span>
                                        )}
                                        <span className="text-gray-400">
                                            {autoStatus.lastScan.type === 'full' ? (
                                                <>{t('networkScan.widget.fullScan')} <span className="text-gray-500">({t('networkScan.widget.complete')})</span></>
                                            ) : (
                                                <>{t('networkScan.widget.refresh')} <span className="text-gray-500">({autoStatus.lastScan.scanType === 'full' ? t('networkScan.widget.complete') : t('networkScan.widget.quick')})</span></>
                                            )}
                                        </span>
                                        {autoStatus.lastScan.range && (
                                            <span className="px-2 py-0.5 bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 rounded text-xs font-medium">
                                                {autoStatus.lastScan.range}
                                            </span>
                                        )}
                                        <span className="text-gray-300 font-medium">{formatDate(autoStatus.lastScan.timestamp)}</span>
                                        <span className="text-gray-500 text-xs mt-0.5">
                                            {formatRelativeTime(autoStatus.lastScan.timestamp)}
                                        </span>
                                    </div>
                                </div>
                            ) : lastScan ? (
                                <div className="mb-2">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">{t('networkScan.widget.manual')}</span>
                                        <span className="text-gray-300">{t('networkScan.scanTypes.scan')}</span>
                                        <span className="text-gray-300 font-medium">{formatDate(lastScan.toISOString())}</span>
                                    </div>
                                    <div className="text-gray-500 text-xs mt-0.5">
                                        {formatRelativeTime(lastScan.toISOString())}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-gray-500">{t('networkScan.widget.noScanDone')}</div>
                            )}
                            
                            {/* Prochains scans automatiques - Même style que Info Scans */}
                            {autoStatus && autoStatus.enabled && (autoStatus.fullScan.config.enabled || autoStatus.refresh.config.enabled) && (
                                <div className="pt-2 border-t border-gray-800 space-y-2">
                                    {autoStatus.fullScan.config.enabled && (
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-gray-300 font-medium w-14">{t('networkScan.widget.fullScan')}</span>
                                            <span className="px-2 py-0.5 rounded text-xs font-medium w-16 text-center bg-purple-500/20 border border-purple-500/50 text-purple-400">
                                                {t('networkScan.widget.complete')}
                                            </span>
                                            <span className="text-gray-400">
                                                {formatNextExecution(
                                                    (autoStatus.fullScan.lastExecution?.type === 'auto' 
                                                        ? autoStatus.fullScan.lastExecution?.timestamp 
                                                        : null) || null,
                                                    autoStatus.fullScan.config.interval
                                                )}
                                            </span>
                                            {scanRange && (
                                                <span className="px-2 py-0.5 bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 rounded text-xs font-medium">
                                                    {scanRange}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    {autoStatus.refresh.config.enabled && (
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-gray-300 font-medium w-14">{t('networkScan.widget.refresh')}</span>
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium w-16 text-center ${
                                                (autoStatus.refresh.config.scanType || 'quick') === 'full'
                                                    ? 'bg-purple-500/20 border border-purple-500/50 text-purple-400'
                                                    : 'bg-blue-500/20 border border-blue-500/50 text-blue-400'
                                            }`}>
                                                {(autoStatus.refresh.config.scanType || 'quick') === 'full' ? t('networkScan.widget.complete') : t('networkScan.widget.quick')}
                                            </span>
                                            <span className="text-gray-400">
                                                {formatNextExecution(
                                                    (autoStatus.refresh.lastExecution?.type === 'auto' 
                                                        ? autoStatus.refresh.lastExecution?.timestamp 
                                                        : null) || null,
                                                    autoStatus.refresh.config.interval
                                                )}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Offline IPs list */}
                    {offlineIps > 0 && (
                        <div className="pt-2 border-t border-gray-800">
                            <div className="text-xs text-gray-400 mb-2 font-medium">
                                {t('networkScan.widget.offlineIps')} ({offlineIpsList.length > 0 ? offlineIpsList.length : offlineIps})
                            </div>
                            {loading && offlineIpsList.length === 0 ? (
                                <div className="text-[11px] text-gray-500 py-2">{t('networkScan.widget.loading')}</div>
                            ) : offlineIpsList.length > 0 ? (
                                <div className="space-y-1 max-h-80 overflow-y-auto">
                                    {offlineIpsList.map((item) => (
                                        <div 
                                            key={item.id} 
                                            className="flex items-center justify-between text-[11px] py-1 px-2 bg-[#1a1a1a] rounded border border-gray-800"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-red-400"></span>
                                                <span className="text-gray-300 font-mono">{item.ip}</span>
                                                {item.hostname && (
                                                    <span className="text-gray-500">({item.hostname})</span>
                                                )}
                                            </div>
                                            {item.mac && (
                                                <span className="text-gray-500 font-mono text-[10px]">{item.mac}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-[11px] text-gray-500 py-2">{t('networkScan.widget.noOfflineRecent')}</div>
                            )}
                        </div>
                    )}

                    {/* Top traffic consumers — UniFi only (Freebox API has no per-host byte counters) */}
                    {!hasUniFi && (
                        <div className="pt-2 border-t border-gray-800">
                            <div className="text-xs text-gray-400 font-medium flex items-center gap-1.5 mb-2">
                                <Gauge size={13} className="text-gray-600" />
                                {t('networkScan.widget.topTraffic')}
                            </div>
                            <div className="text-[11px] text-gray-500 py-2 flex items-start gap-2">
                                <Info size={14} className="text-gray-600 shrink-0 mt-0.5" />
                                <span>{t('networkScan.widget.trafficFreeboxUnavailable')}</span>
                            </div>
                        </div>
                    )}
                    {hasUniFi && (
                        <div className="pt-2 border-t border-gray-800">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-xs text-gray-400 font-medium flex items-center gap-1.5">
                                    <Gauge size={13} className="text-cyan-400" />
                                    {t('networkScan.widget.topTraffic')} ({trafficRows.length > 0 ? trafficRows.length : '--'})
                                    {trafficPeriod === 'live' && (
                                        <span className={`w-1.5 h-1.5 rounded-full ${unifiWsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                                    )}
                                </div>
                                <span className="inline-flex items-center gap-0.5 bg-[#1b1b1b] rounded-full p-0.5 border border-gray-800 text-[11px]">
                                    <button
                                        type="button"
                                        className={`px-2 py-0.5 rounded-full ${trafficPeriod === 'live' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                                        onClick={() => setTrafficPeriod('live')}
                                    >
                                        {t('networkScan.widget.trafficLive')}
                                    </button>
                                    <button
                                        type="button"
                                        className={`px-2 py-0.5 rounded-full ${trafficPeriod === 'today' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                                        onClick={() => setTrafficPeriod('today')}
                                    >
                                        {t('networkScan.widget.trafficToday')}
                                    </button>
                                    <button
                                        type="button"
                                        className={`px-2 py-0.5 rounded-full ${trafficPeriod === 'alltime' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                                        onClick={() => setTrafficPeriod('alltime')}
                                    >
                                        {t('networkScan.widget.trafficAllTime')}
                                    </button>
                                </span>
                            </div>
                            {topTrafficLoading && trafficRows.length === 0 ? (
                                <div className="text-[11px] text-gray-500 py-2">{t('networkScan.widget.loading')}</div>
                            ) : trafficRows.length > 0 ? (
                                <div className="space-y-1 max-h-80 overflow-y-auto">
                                    {trafficRows.map((c, i) => (
                                        <button
                                            key={c.mac}
                                            type="button"
                                            onClick={() => navigate(`/search?s=${encodeURIComponent(c.ip || c.mac)}`)}
                                            className="w-full flex items-center justify-between text-[11px] py-1 px-2 bg-[#1a1a1a] hover:bg-[#232323] rounded border border-gray-800 transition-colors"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-gray-500 w-4 text-right shrink-0">{i + 1}</span>
                                                {hasVendorIcon(c.vendor, c.name)
                                                    ? <VendorIcon vendor={c.vendor} label={c.name} size={13} />
                                                    : <Router size={13} className="text-gray-400 shrink-0" />}
                                                <span className="text-gray-300 truncate">{c.name}</span>
                                                {c.ip && <span className="text-gray-500 font-mono shrink-0">({c.ip})</span>}
                                            </div>
                                            <span className="text-cyan-400 font-semibold shrink-0 ml-2">
                                                {c.volumeText}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-[11px] text-gray-500 py-2">{t('networkScan.widget.noTrafficData')}</div>
                            )}
                        </div>
                    )}

                    {/* Worst latency IPs */}
                    {onlineIps > 0 && (
                        <div className="pt-2 border-t border-gray-800">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-xs text-gray-400 font-medium">
                                    {t('networkScan.widget.topWorstLatency')} ({worstLatencyIps.length > 0 ? Math.min(worstLatencyIps.length, latencyLimit) : '--'})
                                </div>
                                <span className="inline-flex items-center gap-0.5 bg-[#1b1b1b] rounded-full p-0.5 border border-gray-800 text-[11px]">
                                    <button
                                        type="button"
                                        className={`px-2 py-0.5 rounded-full ${latencyLimit === 5 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                                        onClick={() => setLatencyLimit(5)}
                                    >
                                        5
                                    </button>
                                    <button
                                        type="button"
                                        className={`px-2 py-0.5 rounded-full ${latencyLimit === 10 ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                                        onClick={() => setLatencyLimit(10)}
                                    >
                                        10
                                    </button>
                                </span>
                            </div>
                            {loading && worstLatencyIps.length === 0 ? (
                                <div className="text-[11px] text-gray-500 py-2">{t('networkScan.widget.loading')}</div>
                            ) : worstLatencyIps.length > 0 ? (
                                <div className="space-y-1">
                                    {worstLatencyIps.slice(0, latencyLimit).map((item) => (
                                        <div 
                                            key={item.id} 
                                            className="flex items-center justify-between text-[11px] py-1 px-2 bg-[#1a1a1a] rounded border border-gray-800"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                                                <span className="text-gray-300 font-mono">{item.ip}</span>
                                                {item.hostname && (
                                                    <span className="text-gray-500">({item.hostname})</span>
                                                )}
                                            </div>
                                            {item.pingLatency && (
                                                <span className={`font-semibold ${getLatencyColor(item.pingLatency)}`}>
                                                    {item.pingLatency}ms
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-[11px] text-gray-500 py-2">{t('networkScan.widget.noLatencyMeasured')}</div>
                            )}
                        </div>
                    )}

                </div>
            )}
        </Card>
    );
};

