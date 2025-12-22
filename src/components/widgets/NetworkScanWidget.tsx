/**
 * Network Scan Widget
 * 
 * Displays network scan summary statistics on the dashboard
 */

import React, { useEffect, useState } from 'react';
import { Card } from './Card';
import { Network, ArrowRight, Activity, CheckCircle } from 'lucide-react';
import { usePluginStore } from '../../stores/pluginStore';
import { api } from '../../api/client';

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
        config: { enabled: boolean; interval: number };
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
    const { pluginStats } = usePluginStore();
    const stats = pluginStats['scan-reseau'];
    
    const systemStats = stats?.system as any;
    const totalIps = systemStats?.totalIps || 0;
    const onlineIps = systemStats?.onlineIps || 0;
    const offlineIps = systemStats?.offlineIps || 0;
    const lastScan = systemStats?.lastScan ? new Date(systemStats.lastScan) : null;

    const [offlineIpsList, setOfflineIpsList] = useState<NetworkScanItem[]>([]);
    const [worstLatencyIps, setWorstLatencyIps] = useState<NetworkScanItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [autoStatus, setAutoStatus] = useState<AutoStatus | null>(null);
    const [autoStatusLoading, setAutoStatusLoading] = useState(true);

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
        return date.toLocaleDateString('fr-FR', { 
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
            // Le scan est en retard, afficher la date/heure exacte prévue
            return `Le ${nextDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} à ${nextDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
        }
        
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        // Pour les prochains scans très proches (< 1h), afficher les minutes précises
        if (diffMins < 60) {
            if (diffMins < 1) {
                return `Dans moins d'1min (${nextDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})`;
            }
            return `Dans ${diffMins}min (${nextDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})`;
        }
        
        // Pour les prochains scans dans les prochaines heures, afficher l'heure précise
        if (diffHours < 24) {
            return `Dans ${diffHours}h (${nextDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})`;
        }
        
        // Pour les prochains jours, afficher la date et l'heure
        if (diffDays < 7) {
            return `Dans ${diffDays}j (${nextDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${nextDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})`;
        }
        
        // Pour les dates plus lointaines, afficher la date complète
        return `Le ${nextDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })} à ${nextDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    };

    const formatRelativeTime = (dateStr: string): string => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'À l\'instant';
        if (diffMins < 60) return `Il y a ${diffMins}min`;
        if (diffHours < 24) return `Il y a ${diffHours}h`;
        if (diffDays < 7) return `Il y a ${diffDays}j`;
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
                    <span>Scan Réseau</span>
                </div>
            }
            actions={
                onViewDetails ? (
                    <button
                        onClick={onViewDetails}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 rounded border border-blue-500/30"
                    >
                        Voir détails
                        <ArrowRight size={14} />
                    </button>
                ) : undefined
            }
        >
            {totalIps === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Activity size={32} className="text-gray-500 mb-2" />
                    <p className="text-sm text-gray-400">Aucun scan effectué</p>
                    <p className="text-xs text-gray-500 mt-1">
                        Lancez un scan pour découvrir les IPs du réseau
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Statistics */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="text-center p-3 bg-[#1a1a1a] rounded-lg border border-gray-800">
                            <div className="text-2xl font-bold text-gray-200">{totalIps}</div>
                            <div className="text-xs text-gray-400 mt-1">Total IPs</div>
                        </div>
                        <div className="text-center p-3 bg-[#1a1a1a] rounded-lg border border-gray-800">
                            <div className="text-2xl font-bold text-emerald-400">{onlineIps}</div>
                            <div className="text-xs text-gray-400 mt-1">Online</div>
                        </div>
                        <div className="text-center p-3 bg-[#1a1a1a] rounded-lg border border-gray-800">
                            <div className="text-2xl font-bold text-red-400">{offlineIps}</div>
                            <div className="text-xs text-gray-400 mt-1">Offline</div>
                        </div>
                    </div>

                    {/* Last scan - Same format as Info Scans */}
                    <div className="pt-2 border-t border-gray-800">
                        <div className="text-xs space-y-2">
                            <div className="text-gray-400 mb-1">Dernier Scan:</div>
                            {autoStatus?.lastScan ? (
                                <div className="mb-2">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        {autoStatus.lastScan.isManual ? (
                                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">Manuel</span>
                                        ) : (
                                            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs font-medium">Auto</span>
                                        )}
                                        <span className="text-gray-400">
                                            {autoStatus.lastScan.type === 'full' ? (
                                                <>Full Scan ({autoStatus.lastScan.scanType})</>
                                            ) : (
                                                <>Refresh ({autoStatus.lastScan.scanType})</>
                                            )}
                                        </span>
                                        <span className="text-gray-300 font-medium">{formatDate(autoStatus.lastScan.timestamp)}</span>
                                        <span className="text-gray-500 text-xs">
                                            {formatRelativeTime(autoStatus.lastScan.timestamp)}
                                        </span>
                                    </div>
                                    {autoStatus.lastScan.range && (
                                        <div className="text-gray-500 text-xs mt-0.5">
                                            Plage: {autoStatus.lastScan.range}
                                        </div>
                                    )}
                                </div>
                            ) : lastScan ? (
                                <div className="mb-2">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">Manuel</span>
                                        <span className="text-gray-300">Scan</span>
                                        <span className="text-gray-300 font-medium">{formatDate(lastScan.toISOString())}</span>
                                    </div>
                                    <div className="text-gray-500 text-xs mt-0.5">
                                        {formatRelativeTime(lastScan.toISOString())}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-gray-500">Aucun scan effectué</div>
                            )}
                            
                            {/* Afficher les scans auto activés */}
                            {autoStatus && autoStatus.enabled && (autoStatus.fullScan.config.enabled || autoStatus.refresh.config.enabled) ? (
                                <div className="pt-2 border-t border-gray-800 space-y-1">
                                    {autoStatus.fullScan.config.enabled && (
                                        <div className="flex items-center gap-2 text-xs whitespace-nowrap overflow-x-auto">
                                            <CheckCircle size={12} className="text-emerald-400 flex-shrink-0" />
                                            <span className="text-gray-300">Auto</span>
                                            <span className="text-gray-300">Full scan ({autoStatus.fullScan.config.scanType})</span>
                                            {autoStatus.fullScan.lastExecution ? (
                                                <>
                                                    <span className="text-gray-500">
                                                        {formatDate(autoStatus.fullScan.lastExecution.timestamp)}
                                                    </span>
                                                    <span className="text-gray-400">
                                                        {formatRelativeTime(autoStatus.fullScan.lastExecution.timestamp)}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="text-gray-500">
                                                    {formatNextExecution(null, autoStatus.fullScan.config.interval)}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    {autoStatus.refresh.config.enabled && (
                                        <div className="flex items-center gap-2 text-xs whitespace-nowrap overflow-x-auto">
                                            <CheckCircle size={12} className="text-blue-400 flex-shrink-0" />
                                            <span className="text-gray-300">Auto</span>
                                            <span className="text-gray-300">Refresh (quick)</span>
                                            {autoStatus.refresh.lastExecution ? (
                                                <>
                                                    <span className="text-gray-500">
                                                        {formatDate(autoStatus.refresh.lastExecution.timestamp)}
                                                    </span>
                                                    <span className="text-gray-400">
                                                        {formatRelativeTime(autoStatus.refresh.lastExecution.timestamp)}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="text-gray-500">
                                                    {formatNextExecution(null, autoStatus.refresh.config.interval)}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : autoStatusLoading ? (
                                <div className="text-gray-500 text-xs pt-2 border-t border-gray-800">
                                    Chargement...
                                </div>
                            ) : autoStatus && !autoStatus.enabled ? (
                                <div className="text-gray-500 text-xs pt-2 border-t border-gray-800">
                                    Scan automatique désactivé
                                </div>
                            ) : autoStatus && autoStatus.enabled && !autoStatus.fullScan.config.enabled && !autoStatus.refresh.config.enabled ? (
                                <div className="text-gray-500 text-xs pt-2 border-t border-gray-800">
                                    Aucun scan auto configuré
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {/* Offline IPs list */}
                    {offlineIps > 0 && (
                        <div className="pt-2 border-t border-gray-800">
                            <div className="text-xs text-gray-400 mb-2 font-medium">
                                IPs Offline ({offlineIpsList.length > 0 ? offlineIpsList.length : offlineIps})
                            </div>
                            {loading && offlineIpsList.length === 0 ? (
                                <div className="text-[11px] text-gray-500 py-2">Chargement...</div>
                            ) : offlineIpsList.length > 0 ? (
                                <div className="space-y-1 max-h-32 overflow-y-auto">
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
                                <div className="text-[11px] text-gray-500 py-2">Aucune IP offline récente</div>
                            )}
                        </div>
                    )}

                    {/* Worst latency IPs */}
                    {onlineIps > 0 && (
                        <div className="pt-2 border-t border-gray-800">
                            <div className="text-xs text-gray-400 mb-2 font-medium">
                                Top Pire Latence ({worstLatencyIps.length > 0 ? worstLatencyIps.length : '--'})
                            </div>
                            {loading && worstLatencyIps.length === 0 ? (
                                <div className="text-[11px] text-gray-500 py-2">Chargement...</div>
                            ) : worstLatencyIps.length > 0 ? (
                                <div className="space-y-1">
                                    {worstLatencyIps.map((item) => (
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
                                <div className="text-[11px] text-gray-500 py-2">Aucune latence mesurée</div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
};

