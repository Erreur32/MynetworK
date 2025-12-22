/**
 * Network Scan Page
 * 
 * Dedicated page for network scanning functionality
 * Allows scanning network ranges, viewing history, and configuring automatic scans
 */

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Network, RefreshCw, Play, Trash2, Search, Filter, X, CheckCircle, XCircle, Clock, Edit2, Save, X as XIcon, Settings, HelpCircle, ArrowUp, ArrowDown } from 'lucide-react';
import { Card } from '../components/widgets/Card';
import { MiniBarChart } from '../components/widgets/BarChart';
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
    const [statsHistory, setStatsHistory] = useState<Array<{ time: string; total: number; online: number; offline: number }>>([]);
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
    const [sortBy, setSortBy] = useState<'ip' | 'last_seen' | 'first_seen' | 'status' | 'ping_latency' | 'hostname' | 'mac' | 'vendor'>('ip');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    
    // Results per page - Load from localStorage or default to 20
    const [resultsPerPage, setResultsPerPage] = useState<number>(() => {
        const saved = localStorage.getItem('networkScan_resultsPerPage');
        return saved ? parseInt(saved, 10) : 20;
    });
    const [customResultsPerPage, setCustomResultsPerPage] = useState<string>('');
    const [showCustomInput, setShowCustomInput] = useState(false);
    
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
        fetchStatsHistory();
        fetchDefaultConfig();
        fetchAutoStatus();
    }, [fetchPlugins]);

    useEffect(() => {
        if (defaultConfigLoaded) {
            fetchHistory();
        }
    }, [defaultConfigLoaded, statusFilter, searchFilter, sortBy, sortOrder, resultsPerPage]);

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
            fetchStatsHistory();
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

    const fetchStatsHistory = async () => {
        try {
            const response = await api.get<Array<{ time: string; total: number; online: number; offline: number }>>('/api/network-scan/stats-history?hours=24');
            if (response.success && response.result) {
                console.log('Stats history received:', response.result.length, 'hours');
                console.log('Sample data:', response.result.slice(0, 3));
                // Ensure we have valid data (filter out any invalid entries)
                const validData = response.result.filter(h => 
                    typeof h.total === 'number' && 
                    typeof h.online === 'number' && 
                    typeof h.offline === 'number'
                );
                setStatsHistory(validData);
            } else {
                console.warn('Stats history response:', response);
            }
        } catch (error) {
            console.error('Failed to fetch stats history:', error);
        }
    };

    const fetchHistory = async () => {
        try {
            const params: any = {
                limit: resultsPerPage.toString(),
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
    
    const handleResultsPerPageChange = (value: string) => {
        if (value === 'custom') {
            setShowCustomInput(true);
        } else {
            const numValue = parseInt(value, 10);
            setResultsPerPage(numValue);
            localStorage.setItem('networkScan_resultsPerPage', numValue.toString());
            setShowCustomInput(false);
        }
    };
    
    const handleCustomResultsPerPageSubmit = () => {
        const numValue = parseInt(customResultsPerPage, 10);
        if (numValue > 0 && numValue <= 10000) {
            setResultsPerPage(numValue);
            localStorage.setItem('networkScan_resultsPerPage', numValue.toString());
            setShowCustomInput(false);
            setCustomResultsPerPage('');
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

    const formatLatency = (latency?: number): string => {
        if (!latency) return '--';
        
        // For very large values (likely errors or invalid data), format in a readable way
        if (latency >= 1000000) {
            // Convert to seconds
            const seconds = Math.floor(latency / 1000);
            if (seconds >= 86400) {
                // Days
                const days = Math.floor(seconds / 86400);
                const hours = Math.floor((seconds % 86400) / 3600);
                if (hours > 0) {
                    return `${days}j ${hours}h`;
                }
                return `${days}j`;
            } else if (seconds >= 3600) {
                // Hours
                const hours = Math.floor(seconds / 3600);
                const mins = Math.floor((seconds % 3600) / 60);
                if (mins > 0) {
                    return `${hours}h ${mins}min`;
                }
                return `${hours}h`;
            } else if (seconds >= 60) {
                // Minutes
                const mins = Math.floor(seconds / 60);
                const secs = seconds % 60;
                if (secs > 0) {
                    return `${mins}min ${secs}s`;
                }
                return `${mins}min`;
            } else {
                // Seconds
                return `${seconds}s`;
            }
        }
        
        // Normal latency values (< 1 second)
        return `${latency}ms`;
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
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    {/* Info Scans - Prend 2 colonnes sur la gauche */}
                    <Card 
                        title={
                            <div className="flex items-center gap-2">
                                <span>Info Scans</span> 
                                {autoStatus && (
                                    <div className="flex items-center gap-1.5"><span className="text-xs text-gray-500">Auto</span>
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            autoStatus.enabled && (autoStatus.fullScan.config.enabled || autoStatus.refresh.config.enabled)
                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                : 'bg-gray-500/20 text-gray-400'
                                        }`}>
                                            {autoStatus.enabled && (autoStatus.fullScan.config.enabled || autoStatus.refresh.config.enabled) ? 'ON' : 'OFF'}
                                        </span>
                                         
                                    </div>
                                )}
                            </div>
                        }
                        className="md:col-span-2"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Colonne 1 : Informations des scans */}
                            <div className="space-y-2 text-xs">
                                <div className="font-medium text-gray-300 mb-2">Dernier Scan:</div>
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
                                                        {new Date(autoStatus.refresh.lastExecution.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                        {' '}
                                                        {new Date(autoStatus.refresh.lastExecution.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
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
                            
                            {/* Colonne 2 : Boutons d'action */}
                            <div className="flex flex-col gap-3">
                                
                                <button
                                    onClick={handleRefresh}
                                    disabled={isRefreshing}
                                    className="w-full px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                                >
                                    <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                                    Rafraîchir
                                </button>
                                <button
                                    onClick={handleScan}
                                    disabled={isScanning}
                                    className="w-full px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg border border-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Play size={16} className={isScanning ? 'animate-spin' : ''} />
                                    Scanner
                                </button>
                                {isScanning || isRefreshing ? (
                                    <div className="flex items-center justify-center gap-2 px-2 py-1.5 bg-blue-500/20 text-blue-400 rounded text-xs font-semibold animate-pulse">
                                        <RefreshCw size={12} className="animate-spin" />
                                        <span>{isScanning ? 'Scan en cours...' : 'Rafraîchissement...'}</span>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </Card>
                    
                    {/* Total IPs - 1 colonne */}
                    <Card title="Total IPs">
                        <div className="text-3xl font-bold text-gray-200 text-center mb-2">{stats.total}</div>
                        <div className="h-12 mt-2">
                            {(() => {
                                let chartData: number[];
                                if (statsHistory.length > 0) {
                                    // Use historical data, filter out invalid values
                                    chartData = statsHistory.map(h => h.total || 0).filter(v => v >= 0);
                                    // If all values are 0, use current value for all bars
                                    if (chartData.length === 0 || chartData.every(v => v === 0)) {
                                        chartData = Array(24).fill(stats.total || 0);
                                    }
                                } else {
                                    // No history, show current value repeated
                                    chartData = Array(24).fill(stats.total || 0);
                                }
                                // Limit to last 48 bars (for 15-min intervals = 12 hours max)
                                // This ensures we see recent activity with good granularity
                                const displayData = chartData.slice(-48);
                                // Ensure at least 12 bars are shown for visibility
                                if (displayData.length < 12) {
                                    const fillValue = displayData.length > 0 ? displayData[displayData.length - 1] : stats.total || 0;
                                    while (displayData.length < 12) {
                                        displayData.unshift(fillValue);
                                    }
                                }
                                const timeLabels = statsHistory.length > 0 
                                    ? statsHistory.map(h => h.time).slice(-48)
                                    : [];
                                // Ensure labels array matches data array length
                                const labels = timeLabels.length === displayData.length 
                                    ? timeLabels 
                                    : displayData.map((_, i) => {
                                        const now = new Date();
                                        const hoursAgo = displayData.length - i - 1;
                                        const time = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
                                        return time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                                    });
                                return <MiniBarChart data={displayData} color="#9ca3af" labels={labels} valueLabel="Total IPs" />;
                            })()}
                        </div>
                    </Card>
                    
                    {/* Online - 1 colonne */}
                    <Card title="Online">
                        <div className="text-3xl font-bold text-emerald-400 text-center mb-2">{stats.online}</div>
                        <div className="h-12 mt-2">
                            {(() => {
                                let chartData: number[];
                                if (statsHistory.length > 0) {
                                    // Use historical data, filter out invalid values
                                    chartData = statsHistory.map(h => h.online || 0).filter(v => v >= 0);
                                    // If all values are 0, use current value for all bars
                                    if (chartData.length === 0 || chartData.every(v => v === 0)) {
                                        chartData = Array(24).fill(stats.online || 0);
                                    }
                                } else {
                                    // No history, show current value repeated
                                    chartData = Array(24).fill(stats.online || 0);
                                }
                                // Limit to last 48 bars (for 15-min intervals = 12 hours max)
                                // This ensures we see recent activity with good granularity
                                const displayData = chartData.slice(-48);
                                // Ensure at least 12 bars are shown for visibility
                                if (displayData.length < 12) {
                                    const fillValue = displayData.length > 0 ? displayData[displayData.length - 1] : stats.online || 0;
                                    while (displayData.length < 12) {
                                        displayData.unshift(fillValue);
                                    }
                                }
                                const timeLabels = statsHistory.length > 0 
                                    ? statsHistory.map(h => h.time).slice(-48)
                                    : [];
                                // Ensure labels array matches data array length
                                const labels = timeLabels.length === displayData.length 
                                    ? timeLabels 
                                    : displayData.map((_, i) => {
                                        const now = new Date();
                                        const hoursAgo = displayData.length - i - 1;
                                        const time = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
                                        return time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                                    });
                                return <MiniBarChart data={displayData} color="#10b981" labels={labels} valueLabel="Online" />;
                            })()}
                        </div>
                    </Card>
                    
                    {/* Offline - 1 colonne */}
                    <Card title="Offline">
                        <div className="text-3xl font-bold text-red-400 text-center mb-2">{stats.offline}</div>
                        <div className="h-12 mt-2">
                            {(() => {
                                let chartData: number[];
                                if (statsHistory.length > 0) {
                                    // Use historical data, filter out invalid values
                                    chartData = statsHistory.map(h => h.offline || 0).filter(v => v >= 0);
                                    // If all values are 0, use current value for all bars
                                    if (chartData.length === 0 || chartData.every(v => v === 0)) {
                                        chartData = Array(24).fill(stats.offline || 0);
                                    }
                                } else {
                                    // No history, show current value repeated
                                    chartData = Array(24).fill(stats.offline || 0);
                                }
                                // Limit to last 48 bars (for 15-min intervals = 12 hours max)
                                // This ensures we see recent activity with good granularity
                                const displayData = chartData.slice(-48);
                                // Ensure at least 12 bars are shown for visibility
                                if (displayData.length < 12) {
                                    const fillValue = displayData.length > 0 ? displayData[displayData.length - 1] : stats.offline || 0;
                                    while (displayData.length < 12) {
                                        displayData.unshift(fillValue);
                                    }
                                }
                                const timeLabels = statsHistory.length > 0 
                                    ? statsHistory.map(h => h.time).slice(-48)
                                    : [];
                                // Ensure labels array matches data array length
                                const labels = timeLabels.length === displayData.length 
                                    ? timeLabels 
                                    : displayData.map((_, i) => {
                                        const now = new Date();
                                        const hoursAgo = displayData.length - i - 1;
                                        const time = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
                                        return time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                                    });
                                return <MiniBarChart data={displayData} color="#ef4444" labels={labels} valueLabel="Offline" />;
                            })()}
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
                        
                        <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-lg text-sm font-bold">
                            {stats?.total || 0}
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
                        <div className="flex items-center gap-2 flex-wrap">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as any)}
                                className="px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                            >
                                <option value="all">Tous</option>
                                <option value="online">Online</option>
                                <option value="offline">Offline</option>
                            </select>
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-gray-400 whitespace-nowrap">Résultats:</label>
                                {showCustomInput ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min="1"
                                            max="10000"
                                            value={customResultsPerPage}
                                            onChange={(e) => setCustomResultsPerPage(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    handleCustomResultsPerPageSubmit();
                                                } else if (e.key === 'Escape') {
                                                    setShowCustomInput(false);
                                                    setCustomResultsPerPage('');
                                                }
                                            }}
                                            placeholder="Nombre"
                                            className="w-20 px-2 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                                            autoFocus
                                        />
                                        <button
                                            onClick={handleCustomResultsPerPageSubmit}
                                            className="px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30 text-sm"
                                        >
                                            OK
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowCustomInput(false);
                                                setCustomResultsPerPage('');
                                            }}
                                            className="px-3 py-2 bg-gray-500/10 hover:bg-gray-500/20 text-gray-400 rounded-lg border border-gray-500/30 text-sm"
                                        >
                                            Annuler
                                        </button>
                                    </div>
                                ) : (
                                    <select
                                        value={resultsPerPage.toString()}
                                        onChange={(e) => handleResultsPerPageChange(e.target.value)}
                                        className="px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                                    >
                                        <option value="20">20</option>
                                        <option value="30">30</option>
                                        <option value="50">50</option>
                                        <option value="100">100</option>
                                        <option value="custom">Manuel</option>
                                    </select>
                                )}
                            </div>
                        </div>
                    }
            >
                {/* Barre de recherche centrée */}
                <div className="flex justify-center mb-4">
                    <div className="relative w-full max-w-md">
                        <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchFilter}
                            onChange={(e) => setSearchFilter(e.target.value)}
                            placeholder="Rechercher..."
                            className="w-full pl-10 pr-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                        />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full table-fixed">
                        <colgroup>
                            <col className="w-36" />
                            <col className="w-40" />
                            <col className="w-48" />
                            <col className="w-24" />
                            <col className="w-32" />
                            <col className="w-40" />
                            <col className="w-24" />
                        </colgroup>
                        <thead>
                            <tr className="border-b border-gray-800">
                                <th className="text-left py-3 px-4 text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition-colors" onClick={() => {
                                    if (sortBy === 'ip') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                    else { setSortBy('ip'); setSortOrder('asc'); }
                                }}>
                                    <div className="flex items-center gap-2">
                                        <span>IP</span>
                                        {sortBy === 'ip' && (
                                            sortOrder === 'asc' ? <ArrowDown size={14} className="text-blue-400" /> : <ArrowUp size={14} className="text-blue-400" />
                                        )}
                                    </div>
                                </th>
                                <th className="text-left py-3 px-4 text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition-colors" onClick={() => {
                                    if (sortBy === 'mac') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                    else { setSortBy('mac'); setSortOrder('asc'); }
                                }}>
                                    <div className="flex items-center gap-2">
                                        <span>MAC</span>
                                        {sortBy === 'mac' && (
                                            sortOrder === 'asc' ? <ArrowDown size={14} className="text-blue-400" /> : <ArrowUp size={14} className="text-blue-400" />
                                        )}
                                    </div>
                                </th>
                                <th className="text-left py-3 px-4 text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition-colors" onClick={() => {
                                    if (sortBy === 'hostname') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                    else { setSortBy('hostname'); setSortOrder('asc'); }
                                }}>
                                    <div className="flex items-center gap-2">
                                        <span>Hostname</span>
                                        {sortBy === 'hostname' && (
                                            sortOrder === 'asc' ? <ArrowDown size={14} className="text-blue-400" /> : <ArrowUp size={14} className="text-blue-400" />
                                        )}
                                    </div>
                                </th>
                                <th className="text-left py-3 px-4 text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition-colors" onClick={() => {
                                    if (sortBy === 'status') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                    else { setSortBy('status'); setSortOrder('asc'); }
                                }}>
                                    <div className="flex items-center gap-2">
                                        <span>Statut</span>
                                        {sortBy === 'status' && (
                                            sortOrder === 'asc' ? <ArrowUp size={14} className="text-blue-400" /> : <ArrowDown size={14} className="text-blue-400" />
                                        )}
                                    </div>
                                </th>
                                <th className="text-left py-3 px-4 text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition-colors" onClick={() => {
                                    if (sortBy === 'ping_latency') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                    else { setSortBy('ping_latency'); setSortOrder('asc'); }
                                }}>
                                    <div className="flex items-center gap-2">
                                        <span>Latence</span>
                                        {sortBy === 'ping_latency' && (
                                            sortOrder === 'asc' ? <ArrowUp size={14} className="text-blue-400" /> : <ArrowDown size={14} className="text-blue-400" />
                                        )}
                                    </div>
                                </th>
                                <th className="text-left py-3 px-4 text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition-colors" onClick={() => {
                                    if (sortBy === 'last_seen') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                    else { setSortBy('last_seen'); setSortOrder('asc'); }
                                }}>
                                    <div className="flex items-center gap-2">
                                        <span>Dernière vue</span>
                                        {sortBy === 'last_seen' && (
                                            sortOrder === 'asc' ? <ArrowUp size={14} className="text-blue-400" /> : <ArrowDown size={14} className="text-blue-400" />
                                        )}
                                    </div>
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
                                        <td className={`py-3 px-4 text-sm font-mono truncate ${
                                            scan.status === 'offline' ? 'text-gray-500' : 'text-gray-200'
                                        }`} title={scan.ip}>{scan.ip}</td>
                                        <td className="py-3 px-4 text-sm font-mono text-gray-400 truncate" title={scan.mac || '--'}>{scan.mac || '--'}</td>
                                        <td className="py-3 px-4 text-sm text-gray-300 truncate">
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
                                                        className="px-2 py-1 bg-[#1a1a1a] border border-blue-500 rounded text-gray-200 text-sm focus:outline-none focus:border-blue-400 w-full"
                                                        autoFocus
                                                    />
                                                    <button
                                                        onClick={() => handleSaveHostname(scan.ip)}
                                                        className="p-1 hover:bg-emerald-500/10 text-emerald-400 rounded transition-colors flex-shrink-0"
                                                        title="Sauvegarder"
                                                    >
                                                        <Save size={14} />
                                                    </button>
                                                    <button
                                                        onClick={handleCancelEditHostname}
                                                        className="p-1 hover:bg-red-500/10 text-red-400 rounded transition-colors flex-shrink-0"
                                                        title="Annuler"
                                                    >
                                                        <XIcon size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 group">
                                                    <span className="truncate" title={scan.hostname || '--'}>{scan.hostname || '--'}</span>
                                                    <button
                                                        onClick={() => handleStartEditHostname(scan.ip, scan.hostname || '')}
                                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-500/10 text-blue-400 rounded transition-all flex-shrink-0"
                                                        title="Renommer"
                                                    >
                                                        <Edit2 size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 truncate">
                                            <div className="flex items-center gap-2">
                                                {scan.status === 'online' ? (
                                                    <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
                                                ) : scan.status === 'offline' ? (
                                                    <XCircle size={16} className="text-red-400 flex-shrink-0" />
                                                ) : (
                                                    <Clock size={16} className="text-gray-400 flex-shrink-0" />
                                                )}
                                                <span className="text-sm capitalize truncate">{scan.status}</span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 truncate">
                                            <span className={`text-sm font-medium ${getLatencyColor(scan.pingLatency)}`} title={formatLatency(scan.pingLatency)}>
                                                {formatLatency(scan.pingLatency)}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-sm text-gray-400 truncate" title={formatRelativeTime(scan.lastSeen)}>
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

