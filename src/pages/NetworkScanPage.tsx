/**
 * Network Scan Page
 * 
 * Dedicated page for network scanning functionality
 * Allows scanning network ranges, viewing history, and configuring automatic scans
 */

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Network, RefreshCw, Play, Trash2, Search, Filter, X, CheckCircle, XCircle, Clock, Edit2, Save, X as XIcon, Settings, HelpCircle } from 'lucide-react';
import { Card } from '../components/widgets/Card';
import { usePluginStore } from '../stores/pluginStore';
import { usePolling } from '../hooks/usePolling';
import { POLLING_INTERVALS } from '../utils/constants';
import { api } from '../api/client';
import { NetworkScanConfigModal } from '../components/modals/NetworkScanConfigModal';

interface NetworkScanPageProps {
    onBack: () => void;
}

interface NetworkScan {
    id: number;
    ip: string;
    mac?: string;
    hostname?: string;
    vendor?: string;
    status: 'online' | 'offline' | 'unknown';
    pingLatency?: number;
    firstSeen: string;
    lastSeen: string;
    scanCount: number;
    additionalInfo?: Record<string, unknown>;
}

interface ScanStats {
    total: number;
    online: number;
    offline: number;
    unknown: number;
    lastScan?: string;
}

interface AutoStatus {
    enabled: boolean; // Master switch
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


export const NetworkScanPage: React.FC<NetworkScanPageProps> = ({ onBack }) => {
    const { plugins, fetchPlugins } = usePluginStore();
    const [scans, setScans] = useState<NetworkScan[]>([]);
    const [stats, setStats] = useState<ScanStats | null>(null);
    const [autoStatus, setAutoStatus] = useState<AutoStatus | null>(null);
    const [autoStatusLoading, setAutoStatusLoading] = useState(true);
    const [isScanning, setIsScanning] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [scanRange, setScanRange] = useState<string>('192.168.1.0/24');
    const [autoDetect, setAutoDetect] = useState(false);
    const [scanType, setScanType] = useState<'full' | 'quick'>('full');
    const [defaultConfigLoaded, setDefaultConfigLoaded] = useState(false);
    const [scanPollingInterval, setScanPollingInterval] = useState<NodeJS.Timeout | null>(null);
    
    // Filters
    const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
    const [searchFilter, setSearchFilter] = useState<string>('');
    const [sortBy, setSortBy] = useState<'ip' | 'last_seen' | 'first_seen' | 'status' | 'ping_latency'>('last_seen');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    
    // Editing hostname state
    const [editingHostname, setEditingHostname] = useState<string | null>(null);
    const [editedHostname, setEditedHostname] = useState<string>('');
    
    // Config modal state
    const [configModalOpen, setConfigModalOpen] = useState(false);
    const [showHelpModal, setShowHelpModal] = useState(false);

    const scanReseauPlugin = plugins.find(p => p.id === 'scan-reseau');
    const isActive = scanReseauPlugin?.enabled && scanReseauPlugin?.connectionStatus;

    const fetchDefaultConfig = async () => {
        try {
            const response = await api.get<{ defaultRange: string; defaultScanType: 'full' | 'quick'; defaultAutoDetect: boolean }>('/api/network-scan/default-config');
            if (response.success && response.result) {
                setScanRange(response.result.defaultRange);
                setAutoDetect(response.result.defaultAutoDetect);
                setScanType(response.result.defaultScanType);
            }
        } catch (error) {
            console.error('Failed to fetch default config:', error);
        } finally {
            setDefaultConfigLoaded(true);
        }
    };

    const fetchAutoStatus = async () => {
        try {
            setAutoStatusLoading(true);
            const response = await api.get<AutoStatus>('/api/network-scan/auto-status');
            if (response.success && response.result) {
                console.log('Auto-status received:', response.result);
                console.log('Enabled status:', response.result.enabled);
                setAutoStatus(response.result);
            } else {
                // Si pas de réponse, initialiser avec des valeurs par défaut
                setAutoStatus({
                    enabled: false,
                    fullScan: {
                        config: { enabled: false, interval: 1440, scanType: 'full' },
                        scheduler: { enabled: false, running: false },
                        lastExecution: null
                    },
                    refresh: {
                        config: { enabled: false, interval: 10 },
                        scheduler: { enabled: false, running: false },
                        lastExecution: null
                    }
                });
            }
        } catch (error) {
            console.error('Failed to fetch auto status:', error);
            // En cas d'erreur, initialiser avec des valeurs par défaut
            setAutoStatus({
                enabled: false,
                fullScan: {
                    config: { enabled: false, interval: 1440, scanType: 'full' },
                    scheduler: { enabled: false, running: false },
                    lastExecution: null
                },
                refresh: {
                    config: { enabled: false, interval: 10 },
                    scheduler: { enabled: false, running: false },
                    lastExecution: null
                }
            });
        } finally {
            setAutoStatusLoading(false);
        }
    };

    useEffect(() => {
        fetchPlugins();
        fetchStats();
        fetchDefaultConfig();
        fetchAutoStatus();
    }, [fetchPlugins]);

    useEffect(() => {
        if (defaultConfigLoaded) {
            fetchHistory();
        }
    }, [defaultConfigLoaded, statusFilter, searchFilter, sortBy, sortOrder]);

    // Cleanup polling interval on unmount
    useEffect(() => {
        return () => {
            if (scanPollingInterval) {
                clearInterval(scanPollingInterval);
            }
        };
    }, [scanPollingInterval]);

    // Poll stats every 30 seconds if active
    usePolling(() => {
        if (isActive) {
            fetchStats();
            fetchHistory();
            fetchAutoStatus();
        }
    }, {
        enabled: isActive,
        interval: POLLING_INTERVALS.system
    });

    const fetchStats = async () => {
        try {
            const response = await api.get<ScanStats>('/api/network-scan/stats');
            if (response.success && response.result) {
                setStats(response.result);
            }
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    };

    const fetchHistory = async () => {
        try {
            const params: any = {
                limit: '1000',
                sortBy: sortBy,
                sortOrder: sortOrder
            };
            if (statusFilter !== 'all') params.status = statusFilter;
            if (searchFilter) params.search = searchFilter;

            const queryString = new URLSearchParams(params).toString();
            const response = await api.get<{ items: NetworkScan[]; total: number; limit: number; offset: number }>(`/api/network-scan/history?${queryString}`);
            if (response.success && response.result) {
                setScans(response.result.items || []);
            }
        } catch (error) {
            console.error('Failed to fetch history:', error);
        }
    };


    const handleScan = async () => {
        setIsScanning(true);
        
        // Start polling to refresh the list during scan
        const interval = setInterval(() => {
            fetchHistory();
            fetchStats();
        }, 2000); // Refresh every 2 seconds during scan
        setScanPollingInterval(interval);
        
        try {
            const response = await api.post<{
                range: string;
                scanType: string;
                scanned: number;
                found: number;
                updated: number;
                duration: number;
            }>('/api/network-scan/scan', {
                range: scanRange || undefined,
                autoDetect: autoDetect || !scanRange,
                scanType
            });

            if (response.success) {
                // Final refresh after scan completes
                await fetchStats();
                await fetchHistory();
            } else {
                alert(response.error?.message || 'Erreur lors du scan');
            }
        } catch (error: any) {
            console.error('Scan failed:', error);
            alert('Erreur lors du scan: ' + (error.message || 'Erreur inconnue'));
        } finally {
            setIsScanning(false);
            // Stop polling when scan is done
            clearInterval(interval);
            setScanPollingInterval(null);
        }
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        
        // Start polling to refresh the list during refresh
        const interval = setInterval(() => {
            fetchHistory();
            fetchStats();
        }, 1500); // Refresh every 1.5 seconds during refresh
        
        try {
            const response = await api.post('/api/network-scan/refresh', { scanType: 'quick' });

            if (response.success) {
                // Final refresh after refresh completes
                await fetchStats();
                await fetchHistory();
            } else {
                alert(response.error?.message || 'Erreur lors du rafraîchissement');
            }
        } catch (error: any) {
            console.error('Refresh failed:', error);
            alert('Erreur lors du rafraîchissement: ' + (error.message || 'Erreur inconnue'));
        } finally {
            setIsRefreshing(false);
            clearInterval(interval);
        }
    };

    const handleDelete = async (ip: string) => {
        const confirmed = window.confirm(`Êtes-vous sûr de vouloir supprimer l'IP ${ip} de l'historique ?\n\nCette action est irréversible.`);
        if (!confirmed) return;

        try {
            const response = await api.delete(`/api/network-scan/${ip}`);

            if (response.success) {
                await fetchHistory();
                await fetchStats();
            } else {
                alert(response.error?.message || 'Erreur lors de la suppression');
            }
        } catch (error: any) {
            console.error('Delete failed:', error);
            alert('Erreur lors de la suppression: ' + (error.message || 'Erreur inconnue'));
        }
    };


    const handleStartEditHostname = (ip: string, currentHostname: string) => {
        setEditingHostname(ip);
        setEditedHostname(currentHostname || '');
    };

    const handleCancelEditHostname = () => {
        setEditingHostname(null);
        setEditedHostname('');
    };

    const handleSaveHostname = async (ip: string) => {
        try {
            // Use POST with _method override or direct POST to update endpoint
            const response = await api.post(`/api/network-scan/${ip}/hostname`, { hostname: editedHostname.trim() || null });

            if (response.success) {
                await fetchHistory();
                setEditingHostname(null);
                setEditedHostname('');
            } else {
                alert(response.error?.message || 'Erreur lors de la sauvegarde du hostname');
            }
        } catch (error: any) {
            console.error('Save hostname failed:', error);
            alert('Erreur lors de la sauvegarde: ' + (error.message || 'Erreur inconnue'));
        }
    };

    const getLatencyColor = (latency?: number): string => {
        if (!latency) return 'text-gray-400';
        if (latency < 50) return 'text-emerald-400';
        if (latency < 100) return 'text-yellow-400';
        if (latency < 200) return 'text-orange-400';
        return 'text-red-400';
    };

    // fetchHistory is now handled in the useEffect above that depends on defaultConfigLoaded

    const formatDate = (dateStr: string): string => {
        const date = new Date(dateStr);
        return date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

    const formatNextExecution = (lastExecution: string | null, intervalMinutes: number): string => {
        if (!lastExecution) {
            return 'Bientôt';
        }
        
        const lastDate = new Date(lastExecution);
        const nextDate = new Date(lastDate.getTime() + intervalMinutes * 60000);
        const now = new Date();
        const diffMs = nextDate.getTime() - now.getTime();
        
        if (diffMs <= 0) {
            return 'Bientôt';
        }
        
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 60) return `Dans ${diffMins}min`;
        if (diffHours < 24) return `Dans ${diffHours}h`;
        if (diffDays < 7) return `Dans ${diffDays}j`;
        return `Le ${nextDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
    };

    const filteredScans = scans.filter(scan => {
        if (statusFilter !== 'all' && scan.status !== statusFilter) return false;
        if (searchFilter) {
            const searchLower = searchFilter.toLowerCase();
            return (
                scan.ip.toLowerCase().includes(searchLower) ||
                (scan.mac && scan.mac.toLowerCase().includes(searchLower)) ||
                (scan.hostname && scan.hostname.toLowerCase().includes(searchLower))
            );
        }
        return true;
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-[#1a1a1a] rounded-lg transition-colors"
                        title="Retour au dashboard"
                    >
                        <ArrowLeft size={20} className="text-gray-400" />
                    </button>
                    <div className="flex items-center gap-2">
                        <Network size={24} className="text-cyan-400" />
                        <h1 className="text-2xl font-bold">Scan Réseau</h1>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                {isActive && (
                        <div className="flex items-center gap-1.5 text-green-400 text-sm">
                            <div className="w-2 h-2 rounded-full bg-green-400" />
                            <span>Actif</span>
                        </div>
                    )}
                    <button
                        onClick={() => setConfigModalOpen(true)}
                        className="px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30 transition-colors flex items-center gap-2"
                        title="Configuration du scan"
                    >
                        <Settings size={16} />
                        <span>Configuration</span>
                    </button>
                    </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card title="Total IPs">
                        <div className="text-3xl font-bold text-gray-200">{stats.total}</div>
                    </Card>
                    <Card title="Online">
                        <div className="text-3xl font-bold text-emerald-400">{stats.online}</div>
                    </Card>
                    <Card title="Offline">
                        <div className="text-3xl font-bold text-red-400">{stats.offline}</div>
                    </Card>
                    <Card title="Info Scans">
                        <div className="space-y-2 text-xs"> Dernier Scan:
                            {/* Afficher le dernier scan avec son type et sa date exacte */}
                            {autoStatus?.lastScan ? (
                                <div className="mb-2">
                                    <div className="flex items-center gap-2 mb-1">
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
                                        <span className="text-gray-500 text-xs mt-0.5">
                                        {formatRelativeTime(autoStatus.lastScan.timestamp)} </span>
                                    </div>

                                    {autoStatus.lastScan.range && (
                                        <div className="text-gray-500 text-xs mt-0.5">
                                            Plage: {autoStatus.lastScan.range}
                                        </div>
                                    )}
                                </div>
                            ) : stats?.lastScan ? (
                                <div className="mb-2">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">Manuel</span>
                                        <span className="text-gray-300">Scan</span> <span className="text-gray-300 font-medium">{formatDate(stats.lastScan)}</span>
                                    </div>
                    
                                    <div className="text-gray-500 text-xs mt-0.5">
                                        {formatRelativeTime(stats.lastScan)}
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
                                                        {new Date(autoStatus.fullScan.lastExecution.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                        {' '}
                                                        {new Date(autoStatus.fullScan.lastExecution.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    <span className="text-gray-400">
                                                        {formatRelativeTime(autoStatus.fullScan.lastExecution.timestamp)}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="text-gray-500">Bientôt</span>
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
                                                        {new Date(autoStatus.refresh.lastExecution.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                        {' '}
                                                        {new Date(autoStatus.refresh.lastExecution.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    <span className="text-gray-400">
                                                        {formatRelativeTime(autoStatus.refresh.lastExecution.timestamp)}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="text-gray-500">Bientôt</span>
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
                    </Card>
                </div>
            )}

            {/* Results Table */}
                <Card
                    title={
                        <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-cyan-500/20 rounded-lg">
                            <Network size={16} className="text-cyan-400" />
                        </div>
                        
                        <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-xs font-semibold">
                            {filteredScans.length}
                        </span>
                        {(isScanning || isRefreshing) && (
                            <div className="flex items-center gap-2 px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-semibold animate-pulse">
                                <RefreshCw size={12} className="animate-spin" />
                                <span>{isScanning ? 'Scan en cours...' : 'Rafraîchissement...'}</span>
                            </div>
                        )}
                        </div>
                    }
                    actions={
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleRefresh}
                                disabled={isRefreshing}
                                className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                                Rafraîchir
                            </button>
                            <button
                                onClick={handleScan}
                                disabled={isScanning}
                                className="px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg border border-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <Play size={16} className={isScanning ? 'animate-spin' : ''} />
                                Scanner
                            </button>
                            <button
                                onClick={() => setShowHelpModal(true)}
                                className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30 flex items-center justify-center"
                                title="Aide sur les plages IP et le scan"
                                type="button"
                            >
                                <HelpCircle size={16} />
                            </button>
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                                placeholder="Rechercher..."
                                className="pl-10 pr-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as any)}
                            className="px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                        >
                            <option value="all">Tous</option>
                            <option value="online">Online</option>
                            <option value="offline">Offline</option>
                        </select>
                    </div>
                }
            >
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-800">
                                <th className="text-left py-3 px-4 text-sm text-gray-400 cursor-pointer hover:text-gray-300" onClick={() => {
                                    if (sortBy === 'ip') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                    else { setSortBy('ip'); setSortOrder('asc'); }
                                }}>
                                    IP {sortBy === 'ip' && (sortOrder === 'asc' ? '↑' : '↓')}
                                </th>
                                <th className="text-left py-3 px-4 text-sm text-gray-400">MAC</th>
                                <th className="text-left py-3 px-4 text-sm text-gray-400">Hostname</th>
                                <th className="text-left py-3 px-4 text-sm text-gray-400 cursor-pointer hover:text-gray-300" onClick={() => {
                                    if (sortBy === 'status') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                    else { setSortBy('status'); setSortOrder('asc'); }
                                }}>
                                    Statut {sortBy === 'status' && (sortOrder === 'asc' ? '↑' : '↓')}
                                </th>
                                <th className="text-left py-3 px-4 text-sm text-gray-400 cursor-pointer hover:text-gray-300" onClick={() => {
                                    if (sortBy === 'ping_latency') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                    else { setSortBy('ping_latency'); setSortOrder('asc'); }
                                }}>
                                    Latence {sortBy === 'ping_latency' && (sortOrder === 'asc' ? '↑' : '↓')}
                                </th>
                                <th className="text-left py-3 px-4 text-sm text-gray-400 cursor-pointer hover:text-gray-300" onClick={() => {
                                    if (sortBy === 'last_seen') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                    else { setSortBy('last_seen'); setSortOrder('desc'); }
                                }}>
                                    Dernière vue {sortBy === 'last_seen' && (sortOrder === 'asc' ? '↑' : '↓')}
                                </th>
                                <th className="text-left py-3 px-4 text-sm text-gray-400">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredScans.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-center py-8 text-gray-500">
                                        {isScanning || isRefreshing ? (
                                            <div className="flex items-center justify-center gap-2">
                                                <RefreshCw size={16} className="animate-spin text-blue-400" />
                                                <span>Scan en cours...</span>
                                            </div>
                                        ) : (
                                            'Aucun résultat'
                                        )}
                                    </td>
                                </tr>
                            ) : (
                                filteredScans.map((scan) => (
                                    <tr 
                                        key={scan.id} 
                                        className={`border-b border-gray-800 hover:bg-[#1a1a1a] transition-colors ${
                                            (isScanning || isRefreshing) && scan.status === 'online' 
                                                ? 'animate-pulse bg-blue-500/5' 
                                                : ''
                                        }`}
                                    >
                                        <td className="py-3 px-4 text-sm font-mono text-gray-200">{scan.ip}</td>
                                        <td className="py-3 px-4 text-sm font-mono text-gray-400">{scan.mac || '--'}</td>
                                        <td className="py-3 px-4 text-sm text-gray-300">
                                            {editingHostname === scan.ip ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={editedHostname}
                                                        onChange={(e) => setEditedHostname(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleSaveHostname(scan.ip);
                                                            if (e.key === 'Escape') handleCancelEditHostname();
                                                        }}
                                                        className="px-2 py-1 bg-[#1a1a1a] border border-blue-500 rounded text-gray-200 text-sm focus:outline-none focus:border-blue-400"
                                                        autoFocus
                                                    />
                                                    <button
                                                        onClick={() => handleSaveHostname(scan.ip)}
                                                        className="p-1 hover:bg-emerald-500/10 text-emerald-400 rounded transition-colors"
                                                        title="Sauvegarder"
                                                    >
                                                        <Save size={14} />
                                                    </button>
                                                    <button
                                                        onClick={handleCancelEditHostname}
                                                        className="p-1 hover:bg-red-500/10 text-red-400 rounded transition-colors"
                                                        title="Annuler"
                                                    >
                                                        <XIcon size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 group">
                                                    <span>{scan.hostname || '--'}</span>
                                                    <button
                                                        onClick={() => handleStartEditHostname(scan.ip, scan.hostname || '')}
                                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-500/10 text-blue-400 rounded transition-all"
                                                        title="Renommer"
                                                    >
                                                        <Edit2 size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                {scan.status === 'online' ? (
                                                    <CheckCircle size={16} className="text-emerald-400" />
                                                ) : scan.status === 'offline' ? (
                                                    <XCircle size={16} className="text-red-400" />
                                                ) : (
                                                    <Clock size={16} className="text-gray-400" />
                                                )}
                                                <span className="text-sm capitalize">{scan.status}</span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`text-sm font-medium ${getLatencyColor(scan.pingLatency)}`}>
                                                {scan.pingLatency ? `${scan.pingLatency}ms` : '--'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-sm text-gray-400">
                                            {formatRelativeTime(scan.lastSeen)}
                                        </td>
                                        <td className="py-3 px-4">
                                            <button
                                                onClick={() => handleDelete(scan.ip)}
                                                className="p-1 hover:bg-red-500/10 text-red-400 rounded transition-colors"
                                                title="Supprimer"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Config Modal */}
            {configModalOpen && (
                <NetworkScanConfigModal
                    isOpen={configModalOpen}
                    onClose={() => {
                        setConfigModalOpen(false);
                        // Reload default config after closing modal in case it was changed
                        fetchDefaultConfig();
                    }}
                />
            )}

            {/* Help Modal for Network Range - tips displayed from the scan page */}
            {showHelpModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-[#121212] border border-gray-700 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-gray-800">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-purple-500/20 rounded-lg">
                                    <Network size={24} className="text-purple-400" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-semibold text-white">Aide - Format de plage réseau</h2>
                                    <p className="text-sm text-gray-400 mt-1">Comment spécifier une plage d'IPs à scanner</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowHelpModal(false)}
                                className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-lg"
                                type="button"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-4">
                            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                                <h3 className="text-lg font-semibold text-purple-400 mb-3">Format de plage réseau</h3>
                                <div className="space-y-3 text-sm text-gray-300">
                                    <div>
                                        <p className="font-semibold text-purple-300 mb-1">Notation CIDR (recommandé) :</p>
                                        <code className="block bg-[#1a1a1a] px-3 py-2 rounded text-emerald-400 font-mono text-xs my-2">
                                            192.168.1.0/24
                                        </code>
                                        <p className="text-gray-400 text-xs">
                                            Scanne les IPs de 192.168.1.1 à 192.168.1.254 (254 IPs)
                                        </p>
                                    </div>
                                    <div>
                                        <p className="font-semibold text-purple-300 mb-1">Notation par plage :</p>
                                        <code className="block bg-[#1a1a1a] px-3 py-2 rounded text-emerald-400 font-mono text-xs my-2">
                                            192.168.1.1-254
                                        </code>
                                        <p className="text-gray-400 text-xs">
                                            Scanne les IPs de 192.168.1.1 à 192.168.1.254
                                        </p>
                                    </div>
                                    <div className="bg-[#1a1a1a] rounded p-3 mt-3">
                                        <p className="font-semibold text-yellow-400 mb-2 text-xs">Masques réseau courants :</p>
                                        <ul className="space-y-1 text-xs text-gray-400">
                                            <li><code className="text-emerald-400">/24</code> = 254 IPs (192.168.1.1-254) - Réseau local standard</li>
                                            <li><code className="text-emerald-400">/25</code> = 126 IPs (192.168.1.1-192.168.1.126)</li>
                                            <li><code className="text-emerald-400">/26</code> = 62 IPs (192.168.1.1-192.168.1.62)</li>
                                            <li><code className="text-red-400">/16</code> = 65534 IPs - Trop large, non supporté</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex justify-end p-6 border-t border-gray-800">
                            <button
                                onClick={() => setShowHelpModal(false)}
                                className="px-4 py-2 bg-gray-500/10 hover:bg-gray-500/20 text-gray-400 rounded-lg border border-gray-500/30 transition-colors"
                                type="button"
                            >
                                Fermer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

