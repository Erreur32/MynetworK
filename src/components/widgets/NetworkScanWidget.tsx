/**
 * Network Scan Widget
 * 
 * Displays network scan summary statistics on the dashboard
 */

import React, { useEffect, useState } from 'react';
import { Card } from './Card';
import { Network, ArrowRight, Activity } from 'lucide-react';
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

    // Format last scan date
    const formatLastScan = (date: Date | null): string => {
        if (!date) return 'Jamais';
        
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'À l\'instant';
        if (diffMins < 60) return `Il y a ${diffMins}min`;
        if (diffHours < 24) return `Il y a ${diffHours}h`;
        if (diffDays < 7) return `Il y a ${diffDays}j`;
        
        return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
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

                    {/* Last scan */}
                    <div className="pt-2 border-t border-gray-800">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">Dernier scan :</span>
                            <span className="text-gray-300 font-medium">{formatLastScan(lastScan)}</span>
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
                                <div className="space-y-1 max-h-32 overflow-y-auto">
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

