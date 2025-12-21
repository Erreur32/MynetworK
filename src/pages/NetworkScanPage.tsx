/**
 * Network Scan Page
 * 
 * Dedicated page for network scanning functionality
 * Allows scanning network ranges, viewing history, and configuring automatic scans
 */

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Network, RefreshCw, Play, Settings, Trash2, Search, Filter, X, CheckCircle, XCircle, Clock, Edit2, Save, X as XIcon, Info, HelpCircle } from 'lucide-react';
import { Card } from '../components/widgets/Card';
import { usePluginStore } from '../stores/pluginStore';
import { usePolling } from '../hooks/usePolling';
import { POLLING_INTERVALS } from '../utils/constants';
import { api } from '../api/client';

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

interface AutoScanConfig {
    enabled: boolean;
    interval: number;
    scanType: 'full' | 'quick';
}

export const NetworkScanPage: React.FC<NetworkScanPageProps> = ({ onBack }) => {
    const { plugins, fetchPlugins } = usePluginStore();
    const [scans, setScans] = useState<NetworkScan[]>([]);
    const [stats, setStats] = useState<ScanStats | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [scanRange, setScanRange] = useState<string>('');
    const [autoDetect, setAutoDetect] = useState(true);
    const [scanType, setScanType] = useState<'full' | 'quick'>('full');
    const [autoConfig, setAutoConfig] = useState<AutoScanConfig>({ enabled: false, interval: 30, scanType: 'quick' });
    
    // Filters
    const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
    const [searchFilter, setSearchFilter] = useState<string>('');
    const [sortBy, setSortBy] = useState<'ip' | 'last_seen' | 'first_seen' | 'status' | 'ping_latency'>('last_seen');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    
    // Editing hostname state
    const [editingHostname, setEditingHostname] = useState<string | null>(null);
    const [editedHostname, setEditedHostname] = useState<string>('');
    
    // Modal state
    const [showHelpModal, setShowHelpModal] = useState(false);

    const scanReseauPlugin = plugins.find(p => p.id === 'scan-reseau');
    const isActive = scanReseauPlugin?.enabled && scanReseauPlugin?.connectionStatus;

    useEffect(() => {
        fetchPlugins();
        fetchStats();
        fetchHistory();
        fetchConfig();
    }, [fetchPlugins]);

    // Poll stats every 30 seconds if active
    usePolling(() => {
        if (isActive) {
            fetchStats();
            fetchHistory();
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

    const fetchConfig = async () => {
        try {
            const response = await api.get<AutoScanConfig>('/api/network-scan/config');
            if (response.success && response.result) {
                setAutoConfig(response.result);
            }
        } catch (error) {
            console.error('Failed to fetch config:', error);
        }
    };

    const handleScan = async () => {
        setIsScanning(true);
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
                // Refresh stats and history
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
        }
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            const response = await api.post('/api/network-scan/refresh', { scanType: 'quick' });

            if (response.success) {
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

    const handleSaveAutoConfig = async () => {
        try {
            const response = await api.post<AutoScanConfig>('/api/network-scan/config', autoConfig);

            if (response.success && response.result) {
                setAutoConfig(response.result);
                alert('Configuration sauvegardée');
            } else {
                alert(response.error?.message || 'Erreur lors de la sauvegarde');
            }
        } catch (error: any) {
            console.error('Save config failed:', error);
            alert('Erreur lors de la sauvegarde: ' + (error.message || 'Erreur inconnue'));
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

    useEffect(() => {
        fetchHistory();
    }, [statusFilter, searchFilter, sortBy, sortOrder]);

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
                {isActive && (
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 text-green-400 text-sm">
                            <div className="w-2 h-2 rounded-full bg-green-400" />
                            <span>Actif</span>
                        </div>
                    </div>
                )}
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
                    <Card title="Dernier scan">
                        <div className="text-sm text-gray-400">
                            {stats.lastScan ? formatRelativeTime(stats.lastScan) : 'Jamais'}
                        </div>
                    </Card>
                </div>
            )}

            {/* Scan Configuration - Two columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Configuration du scan */}
                <Card
                    title={
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-blue-500/20 rounded-lg">
                                <Settings size={16} className="text-blue-400" />
                            </div>
                            <span>Configuration du scan</span>
                        </div>
                    }
                    actions={
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowHelpModal(true)}
                                className="p-1.5 hover:bg-blue-500/10 text-blue-400 rounded-lg transition-colors"
                                title="Aide"
                            >
                                <HelpCircle size={16} />
                            </button>
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
                        </div>
                    }
                >
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex items-center gap-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={autoDetect}
                                        onChange={(e) => setAutoDetect(e.target.checked)}
                                        className="w-4 h-4"
                                    />
                                    <span className="text-sm">Auto-détection</span>
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Type de scan</label>
                                <select
                                    value={scanType}
                                    onChange={(e) => setScanType(e.target.value as 'full' | 'quick')}
                                    className="w-full px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500"
                                >
                                    <option value="quick">Rapide (ping uniquement)</option>
                                    <option value="full">Complet (ping + MAC + hostname)</option>
                                </select>
                            </div>
                        </div>

                        {!autoDetect && (
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Plage IP (CIDR ou range)</label>
                                <input
                                    type="text"
                                    value={scanRange}
                                    onChange={(e) => setScanRange(e.target.value)}
                                    placeholder="192.168.1.0/24 ou 192.168.1.1-254"
                                    className="w-full px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500"
                                />
                            </div>
                        )}
                    </div>
                </Card>

                {/* Scan automatique */}
                <Card
                    title={
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-purple-500/20 rounded-lg">
                                <Clock size={16} className="text-purple-400" />
                            </div>
                            <span>Scan automatique</span>
                        </div>
                    }
                >
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={autoConfig.enabled}
                                    onChange={(e) => setAutoConfig({ ...autoConfig, enabled: e.target.checked })}
                                    className="w-4 h-4"
                                />
                                <span className="text-sm">Activer le scan automatique</span>
                            </label>
                        </div>

                        {autoConfig.enabled && (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-gray-400 mb-2">Intervalle</label>
                                        <select
                                            value={autoConfig.interval}
                                            onChange={(e) => setAutoConfig({ ...autoConfig, interval: parseInt(e.target.value) })}
                                            className="w-full px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500"
                                        >
                                            <option value="15">15 minutes</option>
                                            <option value="30">30 minutes</option>
                                            <option value="60">1 heure</option>
                                            <option value="120">2 heures</option>
                                            <option value="360">6 heures</option>
                                            <option value="720">12 heures</option>
                                            <option value="1440">24 heures</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm text-gray-400 mb-2">Type de scan</label>
                                        <select
                                            value={autoConfig.scanType}
                                            onChange={(e) => setAutoConfig({ ...autoConfig, scanType: e.target.value as 'full' | 'quick' })}
                                            className="w-full px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500"
                                        >
                                            <option value="quick">Rapide</option>
                                            <option value="full">Complet</option>
                                        </select>
                                    </div>
                                </div>

                                <button
                                    onClick={handleSaveAutoConfig}
                                    className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30"
                                >
                                    Sauvegarder
                                </button>
                            </>
                        )}
                    </div>
                </Card>
            </div>

            {/* Results Table */}
            <Card
                title={
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-cyan-500/20 rounded-lg">
                            <Network size={16} className="text-cyan-400" />
                        </div>
                        <span>Résultats</span>
                        <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-xs font-semibold">
                            {filteredScans.length}
                        </span>
                    </div>
                }
                actions={
                    <div className="flex items-center gap-2">
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
                                        Aucun résultat
                                    </td>
                                </tr>
                            ) : (
                                filteredScans.map((scan) => (
                                    <tr key={scan.id} className="border-b border-gray-800 hover:bg-[#1a1a1a]">
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

            {/* Help Modal */}
            {showHelpModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-[#121212] border border-gray-700 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-gray-800">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-500/20 rounded-lg">
                                    <Info size={24} className="text-blue-400" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-semibold text-white">Aide - Scanner vs Rafraîchir</h2>
                                    <p className="text-sm text-gray-400 mt-1">Différence entre les deux actions de scan</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowHelpModal(false)}
                                className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-lg"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-green-500/20 rounded-lg mt-0.5">
                                            <Play size={20} className="text-green-400" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-lg font-semibold text-green-400 mb-2">Scanner</h3>
                                            <p className="text-gray-300 text-sm leading-relaxed">
                                                Effectue un <strong>scan complet</strong> d'une plage réseau (ex: 192.168.1.0/24).
                                            </p>
                                            <ul className="mt-3 space-y-2 text-sm text-gray-400">
                                                <li className="flex items-start gap-2">
                                                    <span className="text-green-400 mt-1">✓</span>
                                                    <span><strong>Découvre de nouvelles IPs</strong> sur le réseau</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-green-400 mt-1">✓</span>
                                                    <span>Met à jour les IPs existantes</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-green-400 mt-1">✓</span>
                                                    <span>Peut scanner jusqu'à 254 IPs</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-yellow-400 mt-1">⏱</span>
                                                    <span><strong>Plus lent</strong> (scan complet de la plage)</span>
                                                </li>
                                            </ul>
                                            <p className="mt-3 text-xs text-gray-500 italic">
                                                💡 Utilisez cette option pour découvrir tous les appareils sur votre réseau.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 bg-blue-500/20 rounded-lg mt-0.5">
                                            <RefreshCw size={20} className="text-blue-400" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-lg font-semibold text-blue-400 mb-2">Rafraîchir</h3>
                                            <p className="text-gray-300 text-sm leading-relaxed">
                                                Re-ping <strong>uniquement les IPs déjà connues</strong> dans la base de données.
                                            </p>
                                            <ul className="mt-3 space-y-2 text-sm text-gray-400">
                                                <li className="flex items-start gap-2">
                                                    <span className="text-blue-400 mt-1">✓</span>
                                                    <span>Met à jour le statut (online/offline) des IPs connues</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-blue-400 mt-1">✓</span>
                                                    <span>Met à jour la latence des IPs actives</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-red-400 mt-1">✗</span>
                                                    <span><strong>Ne découvre pas</strong> de nouvelles IPs</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-green-400 mt-1">⚡</span>
                                                    <span><strong>Plus rapide</strong> (seulement les IPs déjà trouvées)</span>
                                                </li>
                                            </ul>
                                            <p className="mt-3 text-xs text-gray-500 italic">
                                                💡 Utilisez cette option pour vérifier rapidement l'état des appareils déjà découverts.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                                <h4 className="text-sm font-semibold text-gray-300 mb-2">Exemple d'utilisation :</h4>
                                <ol className="space-y-2 text-sm text-gray-400 list-decimal list-inside">
                                    <li><strong>Premier scan :</strong> Utilisez "Scanner" pour découvrir tous les appareils sur votre réseau</li>
                                    <li><strong>Vérifications régulières :</strong> Utilisez "Rafraîchir" pour mettre à jour rapidement les statuts</li>
                                    <li><strong>Nouveaux appareils :</strong> Utilisez "Scanner" à nouveau si vous ajoutez de nouveaux équipements</li>
                                </ol>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex justify-end p-6 border-t border-gray-800">
                            <button
                                onClick={() => setShowHelpModal(false)}
                                className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30 transition-colors"
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

