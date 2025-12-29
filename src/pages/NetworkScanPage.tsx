/**
 * Network Scan Page
 * 
 * Dedicated page for network scanning functionality
 * Allows scanning network ranges, viewing history, and configuring automatic scans
 */

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { ArrowLeft, Network, RefreshCw, Play, Trash2, Search, Filter, X, CheckCircle, XCircle, Clock, Edit2, Save, X as XIcon, Settings, HelpCircle, ArrowUp, ArrowDown, BarChart2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Card } from '../components/widgets/Card';
import { MiniBarChart } from '../components/widgets/BarChart';
import { usePluginStore } from '../stores/pluginStore';
import { usePolling } from '../hooks/usePolling';
import { POLLING_INTERVALS } from '../utils/constants';
import { api } from '../api/client';
import { NetworkScanConfigModal } from '../components/modals/NetworkScanConfigModal';
import { LatencyMonitoringModal } from '../components/modals/LatencyMonitoringModal';

interface NetworkScanPageProps {
    onBack: () => void;
}

interface NetworkScan {
    id: number;
    ip: string;
    mac?: string;
    hostname?: string;
    vendor?: string;
    hostnameSource?: string; // 'freebox' | 'unifi' | 'scanner' | 'system' | 'manual'
    vendorSource?: string; // 'freebox' | 'unifi' | 'scanner' | 'api' | 'manual'
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
        config: { enabled: boolean; interval: number; scanType: 'full' | 'quick' };
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

// Format duration in milliseconds to human-readable string (e.g., "1m 23s" or "45.2s")
const formatDuration = (durationMs: number): string => {
    if (durationMs >= 60000) {
        const minutes = Math.floor(durationMs / 60000);
        const seconds = Math.floor((durationMs % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }
    return `${(durationMs / 1000).toFixed(1)}s`;
};

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
    const [currentScanRange, setCurrentScanRange] = useState<string>('');
    const [scanProgress, setScanProgress] = useState<{ scanned: number; total: number; found: number; updated: number } | null>(null);
    const [lastScanSummary, setLastScanSummary] = useState<{ range: string; scanned: number; found: number; updated: number; duration: number; detectionSummary?: { mac: number; vendor: number; hostname: number } } | null>(null);
    const [autoDetect, setAutoDetect] = useState(false);
    const [scanType, setScanType] = useState<'full' | 'quick'>('full');
    const [defaultConfigLoaded, setDefaultConfigLoaded] = useState(false);
    const [scanPollingInterval, setScanPollingInterval] = useState<NodeJS.Timeout | null>(null);
    const [showAddIpModal, setShowAddIpModal] = useState(false);
    const [manualIp, setManualIp] = useState('');
    const [manualMac, setManualMac] = useState('');
    const [manualHostname, setManualHostname] = useState('');
    const [isAddingIp, setIsAddingIp] = useState(false);
    
    // Latency monitoring state
    const [monitoringStatus, setMonitoringStatus] = useState<Record<string, boolean>>({});
    const [latencyStats, setLatencyStats] = useState<Record<string, { avg1h: number | null; max: number | null }>>({});
    const [selectedIpForGraph, setSelectedIpForGraph] = useState<string | null>(null);
    const [showLatencyModal, setShowLatencyModal] = useState(false);
    
    // Filters - Load from localStorage or use defaults
    const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>(() => {
        try {
            const saved = localStorage.getItem('networkScan_statusFilter');
            if (saved && ['all', 'online', 'offline'].includes(saved)) {
                return saved as 'all' | 'online' | 'offline';
            }
        } catch (error) {
            console.warn('Failed to load status filter from localStorage:', error);
        }
        return 'online'; // Default: show only online IPs
    });
    const [searchFilter, setSearchFilter] = useState<string>('');
    const [debouncedSearchFilter, setDebouncedSearchFilter] = useState<string>('');
    const [sortBy, setSortBy] = useState<'ip' | 'last_seen' | 'first_seen' | 'status' | 'ping_latency' | 'hostname' | 'mac' | 'vendor'>(() => {
        try {
            const saved = localStorage.getItem('networkScan_sortBy');
            if (saved && ['ip', 'last_seen', 'first_seen', 'status', 'ping_latency', 'hostname', 'mac', 'vendor'].includes(saved)) {
                return saved as 'ip' | 'last_seen' | 'first_seen' | 'status' | 'ping_latency' | 'hostname' | 'mac' | 'vendor';
            }
        } catch (error) {
            console.warn('Failed to load sortBy from localStorage:', error);
        }
        return 'ip'; // Default: sort by IP
    });
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(() => {
        try {
            const saved = localStorage.getItem('networkScan_sortOrder');
            if (saved && ['asc', 'desc'].includes(saved)) {
                return saved as 'asc' | 'desc';
            }
        } catch (error) {
            console.warn('Failed to load sortOrder from localStorage:', error);
        }
        return 'asc'; // Default: ascending order
    });
    
    // Save statusFilter to localStorage when it changes
    useEffect(() => {
        try {
            localStorage.setItem('networkScan_statusFilter', statusFilter);
        } catch (error) {
            console.warn('Failed to save statusFilter to localStorage:', error);
        }
    }, [statusFilter]);

    // Save sortBy to localStorage when it changes
    useEffect(() => {
        try {
            localStorage.setItem('networkScan_sortBy', sortBy);
        } catch (error) {
            console.warn('Failed to save sortBy to localStorage:', error);
        }
    }, [sortBy]);

    // Save sortOrder to localStorage when it changes
    useEffect(() => {
        try {
            localStorage.setItem('networkScan_sortOrder', sortOrder);
        } catch (error) {
            console.warn('Failed to save sortOrder to localStorage:', error);
        }
    }, [sortOrder]);

    // Debounce search filter to avoid too many API calls
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchFilter(searchFilter);
        }, 300); // Wait 300ms after user stops typing
        
        return () => clearTimeout(timer);
    }, [searchFilter]);
    
    // Results per page - Load from localStorage or default to 'full' (all results)
    const [resultsPerPage, setResultsPerPage] = useState<number | 'full'>(() => {
        const saved = localStorage.getItem('networkScan_resultsPerPage');
        if (saved === 'full') return 'full';
        if (saved) {
            const num = parseInt(saved, 10);
            if ([20, 50].includes(num)) return num;
        }
        return 'full'; // Default: show all results
    });
    
    // Editing hostname state
    const [editingHostname, setEditingHostname] = useState<string | null>(null);
    const [editedHostname, setEditedHostname] = useState<string>('');
    
    // Config modal state
    const [configModalOpen, setConfigModalOpen] = useState(false);
    const [showHelpModal, setShowHelpModal] = useState(false);
    
    // IEEE OUI vendor database stats
    const [wiresharkVendorStats, setWiresharkVendorStats] = useState<{ totalVendors: number; lastUpdate: string | null } | null>(null);

    const scanReseauPlugin = plugins.find(p => p.id === 'scan-reseau');
    const isActive = scanReseauPlugin?.enabled && scanReseauPlugin?.connectionStatus;

    // Declare all fetch functions before useEffect hooks that use them
    const fetchStats = useCallback(async () => {
        try {
            const response = await api.get<ScanStats>('/api/network-scan/stats');
            if (response.success && response.result) {
                setStats(response.result);
            }
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    }, []);

    const fetchStatsHistory = useCallback(async () => {
        try {
            const response = await api.get<Array<{ time: string; total: number; online: number; offline: number }>>('/api/network-scan/stats-history?hours=48');
            if (response.success && response.result) {
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
    }, []);

    const fetchWiresharkVendorStats = useCallback(async () => {
        try {
            const response = await api.get<{ totalVendors: number; lastUpdate: string | null }>('/api/network-scan/wireshark-vendor-stats');
            if (response.success && response.result) {
                setWiresharkVendorStats(response.result);
            }
        } catch (error) {
            console.error('Failed to fetch IEEE OUI vendor stats:', error);
        }
    }, []);

    const fetchHistory = useCallback(async () => {
        try {
            const params: any = {
                sortBy: sortBy,
                sortOrder: sortOrder
            };
            // Only add limit if not 'full'
            if (resultsPerPage !== 'full') {
                params.limit = resultsPerPage.toString();
            }
            if (statusFilter !== 'all') params.status = statusFilter;
            if (debouncedSearchFilter) params.search = debouncedSearchFilter;

            const queryString = new URLSearchParams(params).toString();
            const response = await api.get<{ items: NetworkScan[]; total: number; limit: number; offset: number }>(`/api/network-scan/history?${queryString}`);
            if (response.success && response.result) {
                // Always set scans, even if empty array (to clear the list)
                setScans(response.result.items || []);
            } else {
                // If API call fails, clear the list anyway
                setScans([]);
            }
        } catch (error) {
            console.error('Failed to fetch history:', error);
        }
    }, [resultsPerPage, sortBy, sortOrder, statusFilter, debouncedSearchFilter]);

    const fetchDefaultConfig = useCallback(async () => {
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
    }, []);

    const fetchAutoStatus = useCallback(async () => {
        try {
            setAutoStatusLoading(true);
            const response = await api.get<AutoStatus>('/api/network-scan/auto-status');
            if (response.success && response.result) {
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
    }, []);

    // Fetch latency monitoring status and stats
    const fetchMonitoringData = useCallback(async () => {
        if (scans.length === 0) return;
        
        try {
            const ips = scans.map(scan => scan.ip);
            
            // Fetch monitoring status in batch
            const statusResponse = await api.post<Record<string, boolean>>('/api/latency-monitoring/status/batch', { ips });
            if (statusResponse.success && statusResponse.result) {
                setMonitoringStatus(statusResponse.result);
            }
            
            // Fetch stats only for IPs with monitoring enabled
            const enabledIps = ips.filter(ip => statusResponse.success && statusResponse.result?.[ip]);
            if (enabledIps.length > 0) {
                const statsResponse = await api.post<Record<string, { avg1h: number | null; max: number | null }>>('/api/latency-monitoring/stats/batch', { ips: enabledIps });
                if (statsResponse.success && statsResponse.result) {
                    setLatencyStats(statsResponse.result);
                }
            }
        } catch (error) {
            console.error('Failed to fetch monitoring data:', error);
        }
    }, [scans]);

    // Toggle monitoring for an IP
    const handleToggleMonitoring = async (ip: string, enabled: boolean) => {
        try {
            const endpoint = enabled ? `/api/latency-monitoring/enable/${ip}` : `/api/latency-monitoring/disable/${ip}`;
            const response = await api.post(endpoint);
            
            if (response.success) {
                setMonitoringStatus(prev => ({ ...prev, [ip]: enabled }));
                // Refresh stats if enabled
                if (enabled) {
                    setTimeout(() => fetchMonitoringData(), 1000);
                } else {
                    // Remove stats if disabled
                    setLatencyStats(prev => {
                        const newStats = { ...prev };
                        delete newStats[ip];
                        return newStats;
                    });
                }
            } else {
                alert(response.error?.message || 'Erreur lors de la modification du monitoring');
            }
        } catch (error: any) {
            console.error('Failed to toggle monitoring:', error);
            alert('Erreur lors de la modification du monitoring: ' + (error.message || 'Erreur inconnue'));
        }
    };

    // Open latency graph modal
    const handleOpenLatencyGraph = (ip: string) => {
        setSelectedIpForGraph(ip);
        setShowLatencyModal(true);
    };

    useEffect(() => {
        fetchPlugins();
        fetchStats();
        fetchStatsHistory();
        fetchWiresharkVendorStats();
        fetchDefaultConfig();
        fetchAutoStatus();
    }, [fetchPlugins, fetchStats, fetchStatsHistory, fetchWiresharkVendorStats, fetchDefaultConfig, fetchAutoStatus]);

    useEffect(() => {
        if (defaultConfigLoaded) {
            fetchHistory();
        }
    }, [defaultConfigLoaded, fetchHistory]);

    // Fetch monitoring data when scans change
    useEffect(() => {
        if (scans.length > 0) {
            fetchMonitoringData();
        }
    }, [scans, fetchMonitoringData]);

    // Cleanup polling interval on unmount
    useEffect(() => {
        return () => {
            if (scanPollingInterval) {
                clearInterval(scanPollingInterval);
            }
        };
    }, [scanPollingInterval]);

    // Poll scan progress during auto scans
    useEffect(() => {
        const isAutoScanRunning = autoStatus && (
            autoStatus.fullScan.scheduler.running || 
            autoStatus.refresh.scheduler.running
        );

        if (!isAutoScanRunning) {
            // Clear progress when auto scan stops
            if (scanProgress && !isScanning && !isRefreshing) {
                setScanProgress(null);
            }
            return;
        }

        // Poll progress every 2 seconds during auto scans
        const progressInterval = setInterval(async () => {
            try {
                const progressResponse = await api.get('/api/network-scan/progress');
                if (progressResponse.success && progressResponse.result) {
                    setScanProgress(progressResponse.result);
                } else if (progressResponse.success && !progressResponse.result) {
                    // Scan completed, clear progress
                    setScanProgress(null);
                }
            } catch (error) {
                // Ignore errors, progress is optional
            }
        }, 2000);

        return () => {
            clearInterval(progressInterval);
        };
    }, [autoStatus, scanProgress, isScanning, isRefreshing]);

    // Poll stats every 30 seconds if active
    // Optimized: Only fetch essential data, stagger requests to avoid blocking
    usePolling(() => {
        if (isActive && !isScanning && !isRefreshing) {
            // Fetch stats first (lightweight)
            fetchStats();
            // Then fetch history and stats history after a short delay to avoid blocking
            setTimeout(() => {
                fetchHistory();
                fetchStatsHistory();
            }, 100);
            // Fetch auto status less frequently (every other poll)
            setTimeout(() => {
                fetchAutoStatus();
            }, 200);
        }
    }, {
        enabled: isActive && !isScanning && !isRefreshing,
        interval: POLLING_INTERVALS.system
    });
    
    const handleResultsPerPageChange = (value: string) => {
        if (value === 'full') {
            setResultsPerPage('full');
            localStorage.setItem('networkScan_resultsPerPage', 'full');
        } else {
            const numValue = parseInt(value, 10);
            setResultsPerPage(numValue);
            localStorage.setItem('networkScan_resultsPerPage', numValue.toString());
        }
    };


    const handleScan = async () => {
        // Prevent multiple simultaneous scans
        if (isScanning || isRefreshing) {
            return;
        }

        setIsScanning(true);
        setCurrentScanRange(scanRange || (autoDetect ? 'Auto-détection' : '192.168.1.0/24'));
        setScanProgress(null);
        setLastScanSummary(null);
        
        // Start polling to refresh the list and progress during scan
        // Reduced frequency to 2 seconds to improve performance
        const interval = setInterval(async () => {
            fetchHistory();
            fetchStats();
            
            // Fetch scan progress
            try {
                const progressResponse = await api.get('/api/network-scan/progress');
                if (progressResponse.success && progressResponse.result) {
                    setScanProgress(progressResponse.result);
                } else if (progressResponse.success && !progressResponse.result) {
                    // Scan completed, clear progress
                    setScanProgress(null);
                }
            } catch (error) {
                // Ignore errors, progress is optional
            }
        }, 2000); // Refresh every 2 seconds during scan (reduced from 1s for better performance)
        setScanPollingInterval(interval);
        
        try {
            const response = await api.post<{
                result?: {
                range: string;
                scanType: string;
                scanned: number;
                found: number;
                updated: number;
                duration: number;
                    detectionSummary?: { mac: number; vendor: number; hostname: number };
                };
            }>('/api/network-scan/scan', {
                range: scanRange || undefined,
                autoDetect: autoDetect || !scanRange,
                scanType
            });

            if (response.success && response.result) {
                // Store scan summary
                const result = response.result as {
                    range: string;
                    scanType: string;
                    scanned: number;
                    found: number;
                    updated: number;
                    duration: number;
                    detectionSummary?: { mac: number; vendor: number; hostname: number };
                };
                setLastScanSummary({
                    range: result.range || scanRange || 'Auto-détection',
                    scanned: result.scanned || 0,
                    found: result.found || 0,
                    updated: result.updated || 0,
                    duration: result.duration || 0,
                    detectionSummary: result.detectionSummary
                });
                
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
            setCurrentScanRange('');
            setScanProgress(null);
            // Stop polling when scan is done
            clearInterval(interval);
            setScanPollingInterval(null);
        }
    };

    const handleAddManualIp = async () => {
        if (!manualIp.trim()) {
            alert('Veuillez saisir une adresse IP');
            return;
        }

        // Validate IP format
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipRegex.test(manualIp.trim())) {
            alert('Format d\'adresse IP invalide');
            return;
        }

        setIsAddingIp(true);
        try {
            const response = await api.post('/api/network-scan/add-manual', {
                ip: manualIp.trim(),
                mac: manualMac.trim() || undefined,
                hostname: manualHostname.trim() || undefined,
                scanType: scanType
            });

            if (response.success && response.result) {
                const result = response.result as { message?: string; ip?: string; status?: string };
                alert(result.message || 'IP ajoutée avec succès');
                // Reset form
                setManualIp('');
                setManualMac('');
                setManualHostname('');
                setShowAddIpModal(false);
                // Refresh the list
                await fetchHistory();
                await fetchStats();
            } else {
                alert(response.error?.message || 'Erreur lors de l\'ajout de l\'IP');
            }
        } catch (error: any) {
            console.error('Add manual IP failed:', error);
            alert('Erreur lors de l\'ajout: ' + (error.message || 'Erreur inconnue'));
        } finally {
            setIsAddingIp(false);
        }
    };

    const handleRefresh = async () => {
        // Prevent multiple simultaneous scans
        if (isScanning || isRefreshing) {
            return;
        }

        setIsRefreshing(true);
        setCurrentScanRange('Rafraîchissement des IPs existantes');
        setScanProgress(null);
        setLastScanSummary(null);
        
        // Start polling to refresh the list during refresh
        // Reduced frequency to 2 seconds to improve performance
        const interval = setInterval(async () => {
            fetchHistory();
            fetchStats();
            
            // Fetch scan progress (refresh also uses the same progress system)
            try {
                const progressResponse = await api.get('/api/network-scan/progress');
                if (progressResponse.success && progressResponse.result) {
                    setScanProgress(progressResponse.result);
                } else if (progressResponse.success && !progressResponse.result) {
                    // Refresh completed, clear progress
                    setScanProgress(null);
                }
            } catch (error) {
                // Ignore errors, progress is optional
            }
        }, 2000); // Refresh every 2 seconds during refresh (reduced from 1s for better performance)
        
        try {
            const response = await api.post<{
                result?: {
                    scanned: number;
                    online: number;
                    offline: number;
                    duration: number;
                };
            }>('/api/network-scan/refresh', { scanType: 'quick' });

            if (response.success && response.result) {
                // Store refresh summary
                const result = response.result as {
                    scanned: number;
                    online: number;
                    offline: number;
                    duration: number;
                };
                setLastScanSummary({
                    range: 'IPs existantes',
                    scanned: result.scanned || 0,
                    found: result.online || 0,
                    updated: result.offline || 0,
                    duration: result.duration || 0
                });
                
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
            setCurrentScanRange('');
            setScanProgress(null);
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

    // Helper function to get badge info for source
    const getSourceBadge = (source?: string, type: 'hostname' | 'vendor' = 'hostname') => {
        if (!source) return null;
        
        // Don't show badge for scanner - if no badge, it's from scanner by default
        if (source === 'scanner') return null;
        
        const badges: Record<string, { label: string; color: string; bgColor: string }> = {
            freebox: { label: 'Freebox', color: 'text-blue-300', bgColor: 'bg-blue-500/20' },
            unifi: { label: 'UniFi', color: 'text-purple-300', bgColor: 'bg-purple-500/20' },
            api: { label: 'API', color: 'text-yellow-300', bgColor: 'bg-yellow-500/20' },
            system: { label: 'Système', color: 'text-gray-300', bgColor: 'bg-gray-500/20' },
            manual: { label: 'Manuel', color: 'text-orange-300', bgColor: 'bg-orange-500/20' }
        };
        
        return badges[source] || null;
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

    // Note: Filtering is done server-side, but we keep client-side filtering as a fallback
    // This ensures that even if server-side filtering has issues, client-side will catch it
    // Optimized with useMemo to avoid recalculating on every render
    const filteredScans = useMemo(() => {
        return scans.filter(scan => {
            if (statusFilter !== 'all' && scan.status !== statusFilter) return false;
            if (searchFilter) {
                const searchLower = searchFilter.toLowerCase().trim();
                if (!searchLower) return true; // Empty search shows all
                
                // Check all fields, handling null/undefined/empty/-- values
                const ipMatch = scan.ip?.toLowerCase().includes(searchLower) || false;
                
                // Handle MAC: check if it exists and is not empty/--
                const macValue = scan.mac?.trim();
                const macMatch = macValue && macValue !== '--' ? macValue.toLowerCase().includes(searchLower) : false;
                
                // Handle hostname: check if it exists and is not empty/--
                const hostnameValue = scan.hostname?.trim();
                const hostnameMatch = hostnameValue && hostnameValue !== '--' ? hostnameValue.toLowerCase().includes(searchLower) : false;
                
                // Handle vendor: check if it exists and is not empty/--
                const vendorValue = scan.vendor?.trim();
                const vendorMatch = vendorValue && vendorValue !== '--' ? vendorValue.toLowerCase().includes(searchLower) : false;
                
                return ipMatch || macMatch || hostnameMatch || vendorMatch;
            }
            return true;
        });
    }, [scans, statusFilter, searchFilter]);

    // Optimize chart data calculations with useMemo
    const totalChartData = useMemo(() => {
        if (!stats) return { data: [], labels: [] };
        
        let chartData: number[];
        if (statsHistory.length > 0) {
            chartData = statsHistory.map(h => h.total || 0).filter(v => v >= 0);
            if (chartData.length === 0 || chartData.every(v => v === 0)) {
                chartData = Array(24).fill(stats.total || 0);
            }
        } else {
            chartData = Array(24).fill(stats.total || 0);
        }
        
        const displayData = chartData.slice(-48);
        if (displayData.length < 12) {
            const fillValue = displayData.length > 0 ? displayData[displayData.length - 1] : stats.total || 0;
            while (displayData.length < 12) {
                displayData.unshift(fillValue);
            }
        }
        
        const timeLabels = statsHistory.length > 0 
            ? statsHistory.map(h => h.time).slice(-48)
            : [];
        const labels = timeLabels.length === displayData.length 
            ? timeLabels 
            : displayData.map((_, i) => {
                const now = new Date();
                const hoursAgo = displayData.length - i - 1;
                const time = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
                return time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            });
        
        return { data: displayData, labels };
    }, [stats, statsHistory]);

    const onlineChartData = useMemo(() => {
        if (!stats) return { data: [], labels: [] };
        
        let chartData: number[];
        if (statsHistory.length > 0) {
            chartData = statsHistory.map(h => h.online || 0).filter(v => v >= 0);
            if (chartData.length === 0 || chartData.every(v => v === 0)) {
                chartData = Array(24).fill(stats.online || 0);
            }
        } else {
            chartData = Array(24).fill(stats.online || 0);
        }
        
        const displayData = chartData.slice(-48);
        if (displayData.length < 12) {
            const fillValue = displayData.length > 0 ? displayData[displayData.length - 1] : stats.online || 0;
            while (displayData.length < 12) {
                displayData.unshift(fillValue);
            }
        }
        
        const timeLabels = statsHistory.length > 0 
            ? statsHistory.map(h => h.time).slice(-48)
            : [];
        const labels = timeLabels.length === displayData.length 
            ? timeLabels 
            : displayData.map((_, i) => {
                const now = new Date();
                const hoursAgo = displayData.length - i - 1;
                const time = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
                return time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            });
        
        return { data: displayData, labels };
    }, [stats, statsHistory]);

    const offlineChartData = useMemo(() => {
        if (!stats) return { data: [], labels: [] };
        
        let chartData: number[];
        if (statsHistory.length > 0) {
            chartData = statsHistory.map(h => h.offline || 0).filter(v => v >= 0);
            if (chartData.length === 0 || chartData.every(v => v === 0)) {
                chartData = Array(24).fill(stats.offline || 0);
            }
        } else {
            chartData = Array(24).fill(stats.offline || 0);
        }
        
        const displayData = chartData.slice(-48);
        if (displayData.length < 12) {
            const fillValue = displayData.length > 0 ? displayData[displayData.length - 1] : stats.offline || 0;
            while (displayData.length < 12) {
                displayData.unshift(fillValue);
            }
        }
        
        const timeLabels = statsHistory.length > 0 
            ? statsHistory.map(h => h.time).slice(-48)
            : [];
        const labels = timeLabels.length === displayData.length 
            ? timeLabels 
            : displayData.map((_, i) => {
                const now = new Date();
                const hoursAgo = displayData.length - i - 1;
                const time = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
                return time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            });
        
        return { data: displayData, labels };
    }, [stats, statsHistory]);

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
                                {autoStatus && !autoStatusLoading && (
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
                                                    <>Full Scan <span className="text-gray-500">({autoStatus.lastScan.scanType === 'full' ? 'Complet' : 'Rapide'})</span></>
                                                ) : (
                                                    <>Refresh <span className="text-gray-500">({autoStatus.lastScan.scanType === 'full' ? 'Complet' : 'Rapide'})</span></>
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
                                
                                {/* Prochains scans automatiques */}
                                {autoStatus && autoStatus.enabled && (autoStatus.fullScan.config.enabled || autoStatus.refresh.config.enabled) && (
                                    <div className="pt-2 border-t border-gray-800 space-y-2">
                                        {autoStatus.fullScan.config.enabled && (
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-gray-300 font-medium w-14">Full Scan</span>
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium w-16 text-center ${
                                                    autoStatus.fullScan.config.scanType === 'full'
                                                        ? 'bg-purple-500/20 border border-purple-500/50 text-purple-400'
                                                        : 'bg-blue-500/20 border border-blue-500/50 text-blue-400'
                                                }`}>
                                                    {autoStatus.fullScan.config.scanType === 'full' ? 'Complet' : 'Rapide'}
                                                </span>
                                                <span className="text-gray-400">
                                                    {formatNextExecution(
                                                        (autoStatus.fullScan.lastExecution?.type === 'auto' 
                                                            ? autoStatus.fullScan.lastExecution?.timestamp 
                                                            : null) || null,
                                                        autoStatus.fullScan.config.interval
                                                    )}
                                                </span>
                                            </div>
                                        )}
                                        {autoStatus.refresh.config.enabled && (
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-gray-300 font-medium w-14">Refresh</span>
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium w-16 text-center ${
                                                    autoStatus.refresh.config.scanType === 'full'
                                                        ? 'bg-purple-500/20 border border-purple-500/50 text-purple-400'
                                                        : 'bg-blue-500/20 border border-blue-500/50 text-blue-400'
                                                }`}>
                                                    {autoStatus.refresh.config.scanType === 'full' ? 'Complet' : 'Rapide'}
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
                            
                            {/* Colonne 2 : Boutons d'action et stats */}
                            <div className="space-y-3">
                                {/* Boutons d'action */}
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        onClick={handleRefresh}
                                        disabled={isRefreshing}
                                        className="w-full px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-colors text-xs"
                                    >
                                        <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                                        Rafraîchir
                                    </button>
                                    <button
                                        onClick={handleScan}
                                        disabled={isScanning}
                                        className="w-full px-2 py-1 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg border border-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-colors text-xs"
                                    >
                                        <Play size={12} className={isScanning ? 'animate-spin' : ''} />
                                        Scanner
                                    </button>
                                    <button
                                        onClick={() => setShowAddIpModal(true)}
                                        disabled={isScanning || isRefreshing}
                                        className="w-full px-2 py-1 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded-lg border border-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-colors text-xs"
                                        title="Ajouter une IP manuellement"
                                    >
                                        <Network size={12} />
                                        Ajouter IP
                                    </button>
                                </div>
                                
                                {/* Stats vendors et scan auto */}
                                <div className="pt-2 border-t border-gray-800 space-y-2">
                                    {/* Info base vendors IEEE OUI */}
                                    {wiresharkVendorStats && (
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className="text-gray-400">Base vendors:</span>
                                            {wiresharkVendorStats.totalVendors > 0 ? (
                                                <>
                                                    <span className="text-emerald-400 font-medium">{wiresharkVendorStats.totalVendors.toLocaleString()}</span>
                                                    {wiresharkVendorStats.lastUpdate && (
                                                        <span className="text-gray-500">
                                                            (mise à jour: {new Date(wiresharkVendorStats.lastUpdate).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })})
                                                        </span>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="text-orange-400">Non chargée</span>
                                            )}
                                        </div>
                                    )}
                                    
                                    {/* Scan auto actif ou pas */}
                                    {autoStatusLoading ? (
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <span>Scan auto:</span>
                                            <span>Chargement...</span>
                                        </div>
                                    ) : autoStatus ? (
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className="text-gray-400">Scan auto:</span>
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                                autoStatus.enabled && (autoStatus.fullScan.config.enabled || autoStatus.refresh.config.enabled)
                                                    ? 'bg-emerald-500/20 text-emerald-400'
                                                    : 'bg-gray-500/20 text-gray-400'
                                            }`} style={{ transition: 'none' }}>
                                                {autoStatus.enabled && (autoStatus.fullScan.config.enabled || autoStatus.refresh.config.enabled) ? 'Actif' : 'Inactif'}
                                            </span>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </Card>
                    
                    {/* Total IPs - 1 colonne */}
                    <Card title="Total IPs">
                        <div className="text-3xl font-bold text-gray-200 text-center mb-1">{stats.total}</div>
                        <div className="h-16 mt-1">
                            <MiniBarChart data={totalChartData.data} color="#9ca3af" labels={totalChartData.labels} valueLabel="Total IPs" height={64} fadeFromBottom={true} />
                        </div>
                    </Card>
                    
                    {/* Online - 1 colonne */}
                    <Card title="Online">
                        <div className="text-3xl font-bold text-emerald-400 text-center mb-1">{stats.online}</div>
                        <div className="h-16 mt-1">
                            <MiniBarChart data={onlineChartData.data} color="#10b981" labels={onlineChartData.labels} valueLabel="Online" height={64} />
                        </div>
                    </Card>
                    
                    {/* Offline - 1 colonne */}
                    <Card title="Offline">
                        <div className="text-3xl font-bold text-red-400 text-center mb-1">{stats.offline}</div>
                        <div className="h-16 mt-1">
                            <MiniBarChart data={offlineChartData.data} color="#f87171" labels={offlineChartData.labels} valueLabel="Offline" height={64} />
                        </div>
                    </Card>
                </div>
            )}

            {/* Results Table */}
                <Card
                    title={
                        <div className="flex items-center gap-2 flex-wrap">
                        <div className="p-1.5 bg-cyan-500/20 rounded-lg">
                            <Network size={16} className="text-cyan-400" />
                        </div>
                        
                        <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-lg text-sm font-bold">
                            {stats?.total || 0}
                        </span>
                        
                        {/* Scan en cours */}
                        {(isScanning || isRefreshing || (autoStatus && ((autoStatus.fullScan.scheduler.running) || (autoStatus.refresh.scheduler.running)))) && (
                            <>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-semibold animate-pulse">
                                <RefreshCw size={12} className="animate-spin" />
                                    <span>
                                        {isScanning ? 'Scan' : 
                                         isRefreshing ? 'Refresh' : 
                                         (autoStatus?.fullScan.scheduler.running) ? 'Auto Full Scan' :
                                         (autoStatus?.refresh.scheduler.running) ? 'Auto Refresh' : 'Scan'}
                                    </span>
                                </div>
                                {(currentScanRange || (autoStatus && autoStatus.lastScan?.range)) && (
                                    <div className="text-xs text-gray-400 px-2 py-0.5 bg-gray-800/50 rounded">
                                        Range: <span className="text-gray-300 font-medium">{currentScanRange || autoStatus?.lastScan?.range || ''}</span>
                                    </div>
                                )}
                                {scanProgress && scanProgress.total > 0 && (
                                    <div className="flex items-center gap-2 px-2 py-1 bg-blue-500/10 rounded border border-blue-500/30">
                                        <div className="flex-1 min-w-[150px]">
                                            <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                                                <div 
                                                    className="bg-blue-500 h-full transition-all duration-300 ease-out"
                                                    style={{ width: `${Math.min(100, (scanProgress.scanned / scanProgress.total) * 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                        <span className="text-xs text-blue-300 font-semibold whitespace-nowrap">
                                            {scanProgress.scanned}/{scanProgress.total} ({Math.round((scanProgress.scanned / scanProgress.total) * 100)}%)
                                        </span>
                                        {(scanProgress.found > 0 || scanProgress.updated > 0) && (
                                            <span className="text-xs text-gray-300 whitespace-nowrap">
                                                +{scanProgress.found} ↑{scanProgress.updated}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                        
                        {/* Résumé du scan terminé */}
                        {lastScanSummary && !isScanning && !isRefreshing && (
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                                <div className="px-2 py-0.5 bg-gray-800/50 rounded border border-gray-700">
                                    <span className="text-gray-400">Range:</span>
                                    <span className="text-gray-200 ml-1 font-medium">{lastScanSummary.range}</span>
                                </div>
                                <div className="px-2 py-0.5 bg-gray-800/50 rounded border border-gray-700">
                                    <span className="text-gray-400">Durée:</span>
                                    <span className="text-gray-200 ml-1 font-medium">{formatDuration(lastScanSummary.duration)}</span>
                                </div>
                                <div className="px-2 py-0.5 bg-gray-800/50 rounded border border-gray-700">
                                    <span className="text-gray-400">Scannés:</span>
                                    <span className="text-gray-200 ml-1 font-medium">{lastScanSummary.scanned}</span>
                                </div>
                                <div className="px-2 py-0.5 bg-emerald-500/20 rounded border border-emerald-500/30">
                                    <span className="text-gray-400">Trouvés:</span>
                                    <span className="text-emerald-400 ml-1 font-medium">{lastScanSummary.found}</span>
                                </div>
                                <div className="px-2 py-0.5 bg-blue-500/20 rounded border border-blue-500/30">
                                    <span className="text-gray-400">Mis à jour:</span>
                                    <span className="text-blue-400 ml-1 font-medium">{lastScanSummary.updated}</span>
                                </div>
                                {lastScanSummary.detectionSummary && (
                                    <>
                                        <div className="px-2 py-0.5 bg-gray-800/50 rounded border border-gray-700">
                                            <span className="text-gray-400">MAC:</span>
                                            <span className="text-gray-200 ml-1 font-medium">{lastScanSummary.detectionSummary.mac}</span>
                                        </div>
                                        <div className="px-2 py-0.5 bg-gray-800/50 rounded border border-gray-700">
                                            <span className="text-gray-400">Vendor:</span>
                                            <span className="text-gray-200 ml-1 font-medium">{lastScanSummary.detectionSummary.vendor}</span>
                                        </div>
                                        <div className="px-2 py-0.5 bg-gray-800/50 rounded border border-gray-700">
                                            <span className="text-gray-400">Hostname:</span>
                                            <span className="text-gray-200 ml-1 font-medium">{lastScanSummary.detectionSummary.hostname}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                        </div>
                    }
                    actions={
                        <div className="flex items-center gap-3 flex-wrap">
                            {/* Barre de recherche agrandie et stylée */}
                            <div className="relative flex-1 min-w-[420px] max-w-[500px]">
                                <Search size={18} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 transition-colors" />
                                <input
                                    type="text"
                                    value={searchFilter}
                                    onChange={(e) => setSearchFilter(e.target.value)}
                                    placeholder="Rechercher par IP, MAC, hostname ou vendor..."
                                    className="w-full pl-12 pr-4 py-2.5 bg-[#1a1a1a] border-2 border-gray-700 rounded-xl text-base text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 hover:border-gray-600"
                                />
                                {searchFilter && (
                                    <button
                                        onClick={() => setSearchFilter('')}
                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-700 rounded-full transition-colors"
                                        title="Effacer"
                                    >
                                        <X size={16} className="text-gray-400 hover:text-gray-200" />
                                    </button>
                                )}
                            </div>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as any)}
                                className="px-4 py-2.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                            >
                                <option value="all">Tous</option>
                                <option value="online">Online</option>
                                <option value="offline">Offline</option>
                            </select>
                        <div className="flex items-center gap-2">
                                <label className="text-sm text-gray-400 whitespace-nowrap">Résultats:</label>
                                <select
                                    value={resultsPerPage === 'full' ? 'full' : resultsPerPage.toString()}
                                    onChange={(e) => handleResultsPerPageChange(e.target.value)}
                                    className="px-4 py-2.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                >
                                    <option value="20">20</option>
                                    <option value="50">50</option>
                                    <option value="full">Full</option>
                                </select>
                            </div>
                        </div>
                    }
            >
                <div className="overflow-x-auto">
                    <table className="w-full table-auto">
                        <colgroup>
                            <col className="min-w-[144px]" /><col className="min-w-[200px]" /><col className="min-w-[200px]" /><col className="min-w-[140px]" /><col className="min-w-[100px]" /><col className="min-w-[80px]" /><col className="min-w-[80px]" /><col className="min-w-[80px]" /><col className="min-w-[120px]" /><col className="min-w-[100px]" /><col className="min-w-[60px]" />
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
                                    if (sortBy === 'vendor') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                    else { setSortBy('vendor'); setSortOrder('asc'); }
                                }}>
                                    <div className="flex items-center gap-2">
                                        <span>Vendor</span>
                                        {sortBy === 'vendor' && (
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
                                <th className="text-left py-3 px-4 text-sm text-gray-400">
                                    <span>Avg1h</span>
                                </th>
                                <th className="text-left py-3 px-4 text-sm text-gray-400">
                                    <span>Max</span>
                                </th>
                                <th className="text-left py-3 px-4 text-sm text-gray-400">
                                    <span>Monitoring</span>
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
                                <th className="text-right py-3 pr-2 pl-0 text-sm text-gray-400 w-1 whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredScans.length === 0 ? (
                                <tr>
                                    <td colSpan={11} className="text-center py-8 text-gray-500">
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
                                filteredScans.map((scan, index) => (
                                    <tr 
                                        key={scan.id} 
                                        className={`border-b border-gray-800/50 transition-all duration-200 cursor-pointer hover:bg-[#1d1d1d] hover:shadow-lg hover:border-gray-700 ${
                                            index % 2 === 0 
                                                ? 'bg-[#111111]' 
                                                : 'bg-[#0e1013a3]'
                                        } ${
                                            ((isScanning || isRefreshing) || (autoStatus && ((autoStatus.fullScan.scheduler.running) || (autoStatus.refresh.scheduler.running)))) && scan.status === 'online' 
                                                ? 'animate-pulse' 
                                                : ''
                                        }`}
                                    >
                                        <td className={`py-3 px-4 text-sm font-mono break-words ${
                                            scan.status === 'offline' ? 'text-gray-500' : ''
                                        }`} style={scan.status !== 'offline' ? { color: 'rgb(152, 181, 238)' } : {}} title={scan.ip}>{scan.ip}</td>
                                        <td className="py-3 px-4 text-sm text-gray-300">
                                            {editingHostname === scan.ip ? (
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <input
                                                        type="text"
                                                        value={editedHostname}
                                                        onChange={(e) => setEditedHostname(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleSaveHostname(scan.ip);
                                                            if (e.key === 'Escape') handleCancelEditHostname();
                                                        }}
                                                        className="px-2 py-1 bg-[#1a1a1a] border border-blue-500 rounded text-gray-200 text-sm focus:outline-none focus:border-blue-400 w-full min-w-[150px]"
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
                                                <div className="flex items-start gap-2 group flex-wrap">
                                                    <span className="break-words whitespace-normal" title={scan.hostname || '--'}>{scan.hostname || '--'}</span>
                                                    {scan.hostnameSource && (() => {
                                                        const badge = getSourceBadge(scan.hostnameSource, 'hostname');
                                                        return badge ? (
                                                            <span className={`px-1.5 py-0.5 text-xs rounded ${badge.bgColor} ${badge.color} whitespace-nowrap flex-shrink-0`} title={`Source: ${badge.label}`}>
                                                                {badge.label}
                                                            </span>
                                                        ) : null;
                                                    })()}
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
                                        <td className="py-3 px-4 text-sm text-gray-300">
                                            <div className="flex items-start gap-2 flex-wrap">
                                                <span className="break-words whitespace-normal" title={scan.vendor || '--'}>{scan.vendor || '--'}</span>
                                                {scan.vendorSource && (() => {
                                                    const badge = getSourceBadge(scan.vendorSource, 'vendor');
                                                    return badge ? (
                                                        <span className={`px-1.5 py-0.5 text-xs rounded ${badge.bgColor} ${badge.color} whitespace-nowrap flex-shrink-0`} title={`Source: ${badge.label}`}>
                                                            {badge.label}
                                                        </span>
                                                    ) : null;
                                                })()}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-sm font-mono text-gray-400 break-all whitespace-normal" title={scan.mac || '--'}>{scan.mac || '--'}</td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                {scan.status === 'online' ? (
                                                    <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
                                                ) : scan.status === 'offline' ? (
                                                    <XCircle size={16} className="text-red-400 flex-shrink-0" />
                                                ) : (
                                                    <Clock size={16} className="text-gray-400 flex-shrink-0" />
                                                )}
                                                <span className="text-sm capitalize break-words whitespace-normal">{scan.status}</span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`text-sm font-medium break-words whitespace-normal ${getLatencyColor(scan.pingLatency)}`} title={formatLatency(scan.pingLatency)}>
                                                {formatLatency(scan.pingLatency)}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`text-sm font-medium ${latencyStats[scan.ip]?.avg1h !== null && latencyStats[scan.ip]?.avg1h !== undefined ? getLatencyColor(latencyStats[scan.ip].avg1h!) : 'text-gray-500'}`}>
                                                {latencyStats[scan.ip]?.avg1h !== null && latencyStats[scan.ip]?.avg1h !== undefined ? `${latencyStats[scan.ip].avg1h!.toFixed(3)}ms` : '--'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`text-sm font-medium ${latencyStats[scan.ip]?.max !== null && latencyStats[scan.ip]?.max !== undefined ? getLatencyColor(latencyStats[scan.ip].max!) : 'text-gray-500'}`}>
                                                {latencyStats[scan.ip]?.max !== null && latencyStats[scan.ip]?.max !== undefined ? `${latencyStats[scan.ip].max!.toFixed(3)}ms` : '--'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleToggleMonitoring(scan.ip, !monitoringStatus[scan.ip])}
                                                    className="p-1 hover:bg-blue-500/10 rounded transition-colors"
                                                    title={monitoringStatus[scan.ip] ? 'Désactiver le monitoring' : 'Activer le monitoring'}
                                                >
                                                    {monitoringStatus[scan.ip] ? (
                                                        <ToggleRight size={18} className="text-blue-400" />
                                                    ) : (
                                                        <ToggleLeft size={18} className="text-gray-500" />
                                                    )}
                                                </button>
                                                {monitoringStatus[scan.ip] && (
                                                    <button
                                                        onClick={() => handleOpenLatencyGraph(scan.ip)}
                                                        className="p-1 hover:bg-green-500/10 text-green-400 rounded transition-colors"
                                                        title="Voir le graphique de latence"
                                                    >
                                                        <BarChart2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-sm text-gray-400 break-words whitespace-normal" title={formatRelativeTime(scan.lastSeen)}>
                                            {formatRelativeTime(scan.lastSeen)}
                                        </td>
                                        <td className="py-3 pr-2 pl-0 text-right w-1 whitespace-nowrap">
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
                    onVendorUpdate={() => {
                        // Refresh vendor stats after vendor database update
                        fetchWiresharkVendorStats();
                    }}
                    onDataChanged={async () => {
                        console.log('[NetworkScanPage] onDataChanged called - clearing all scan data');
                        
                        // Clear local state IMMEDIATELY (before API calls)
                        setScans([]);
                        setStats(null);
                        setStatsHistory([]);
                        setLastScanSummary(null);
                        setScanProgress(null);
                        setCurrentScanRange('');
                        
                        console.log('[NetworkScanPage] Local state cleared, fetching fresh data...');
                        
                        // Reload all data when scans are cleared
                        try {
                            await Promise.all([
                                fetchHistory(),
                                fetchStats(),
                                fetchStatsHistory(),
                                fetchWiresharkVendorStats()
                            ]);
                            console.log('[NetworkScanPage] All data refreshed after clear');
                        } catch (error) {
                            console.error('[NetworkScanPage] Error refreshing data after clear:', error);
                        }
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

            {/* Add Manual IP Modal */}
            {showAddIpModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-theme-secondary rounded-lg border border-theme shadow-xl max-w-md w-full mx-4">
                        <div className="p-6 border-b border-theme">
                            <h2 className="text-xl font-bold text-theme-primary flex items-center gap-2">
                                <Network size={20} />
                                Ajouter une IP manuellement
                            </h2>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-theme-secondary mb-2">
                                    Adresse IP <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={manualIp}
                                    onChange={(e) => setManualIp(e.target.value)}
                                    placeholder="192.168.1.100"
                                    className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    disabled={isAddingIp}
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-theme-secondary mb-2">
                                    MAC (optionnel)
                                </label>
                                <input
                                    type="text"
                                    value={manualMac}
                                    onChange={(e) => setManualMac(e.target.value)}
                                    placeholder="aa:bb:cc:dd:ee:ff"
                                    className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    disabled={isAddingIp}
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-theme-secondary mb-2">
                                    Hostname (optionnel)
                                </label>
                                <input
                                    type="text"
                                    value={manualHostname}
                                    onChange={(e) => setManualHostname(e.target.value)}
                                    placeholder="Mon-PC"
                                    className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    disabled={isAddingIp}
                                />
                            </div>

                            <div className="flex items-center gap-2 text-sm text-theme-tertiary">
                                <span>Type de scan:</span>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        checked={scanType === 'full'}
                                        onChange={() => setScanType('full')}
                                        disabled={isAddingIp}
                                        className="text-cyan-500"
                                    />
                                    <span>Complet</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        checked={scanType === 'quick'}
                                        onChange={() => setScanType('quick')}
                                        disabled={isAddingIp}
                                        className="text-cyan-500"
                                    />
                                    <span>Rapide</span>
                                </label>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 p-6 border-t border-theme">
                            <button
                                onClick={() => {
                                    setShowAddIpModal(false);
                                    setManualIp('');
                                    setManualMac('');
                                    setManualHostname('');
                                }}
                                disabled={isAddingIp}
                                className="px-4 py-2 bg-gray-500/10 hover:bg-gray-500/20 text-gray-400 rounded-lg border border-gray-500/30 transition-colors disabled:opacity-50"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleAddManualIp}
                                disabled={isAddingIp || !manualIp.trim()}
                                className="px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded-lg border border-orange-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isAddingIp ? (
                                    <>
                                        <RefreshCw size={16} className="animate-spin" />
                                        Ajout en cours...
                                    </>
                                ) : (
                                    <>
                                        <Network size={16} />
                                        Ajouter
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Latency Monitoring Modal */}
            {showLatencyModal && selectedIpForGraph && (
                <LatencyMonitoringModal
                    isOpen={showLatencyModal}
                    onClose={() => {
                        setShowLatencyModal(false);
                        setSelectedIpForGraph(null);
                    }}
                    ip={selectedIpForGraph}
                />
            )}
        </div>
    );
};

