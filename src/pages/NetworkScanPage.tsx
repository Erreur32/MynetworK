/**
 * Network Scan Page
 * 
 * Dedicated page for network scanning functionality
 * Allows scanning network ranges, viewing history, and configuring automatic scans
 */

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { ArrowLeft, Network, RefreshCw, Play, Trash2, Search, Filter, X, CheckCircle, XCircle, Clock, Edit2, Save, X as XIcon, Settings, HelpCircle, ArrowUp, ArrowDown, BarChart2, ToggleLeft, ToggleRight, Link2, Loader2, Terminal, Globe, Lock, Database, Mail, FolderInput, Monitor, Server, Share2, Container, ShieldX, Square, type LucideIcon } from 'lucide-react';
import { Card } from '../components/widgets/Card';
import { MiniBarChart } from '../components/widgets/BarChart';
import { usePluginStore } from '../stores/pluginStore';
import { usePolling } from '../hooks/usePolling';
import { POLLING_INTERVALS } from '../utils/constants';
import { api } from '../api/client';
import { NetworkScanConfigModal } from '../components/modals/NetworkScanConfigModal';
import { LatencyMonitoringModal } from '../components/modals/LatencyMonitoringModal';
import { ToastContainer, type ToastData } from '../components/ui/Toast';
import { useTranslation } from 'react-i18next';

/** Ports connus : numéro → nom du service (pour les tooltips) */
const WELL_KNOWN_PORTS: Record<number, string> = {
    20: 'FTP-DATA', 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3',
    143: 'IMAP', 443: 'HTTPS', 445: 'SMB', 993: 'IMAPS', 995: 'POP3S', 1433: 'SQL Server', 3306: 'MySQL',
    3389: 'RDP', 5432: 'PostgreSQL', 5900: 'VNC', 6379: 'Redis', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt', 9000: 'PhpMyAdmin',
    2375: 'Docker', 2376: 'Docker TLS'
};

/** Icônes Lucide par port (services connus) */
const PORT_ICONS: Record<number, LucideIcon> = {
    20: FolderInput, 21: FolderInput, 22: Terminal, 23: Terminal, 25: Mail, 53: Globe, 80: Globe,
    110: Mail, 143: Mail, 443: Lock, 445: Share2, 993: Mail, 995: Mail, 1433: Database, 3306: Database,
    3389: Monitor, 5432: Database, 5900: Monitor, 6379: Database, 8080: Globe, 8443: Lock, 9000: Server,
    2375: Container, 2376: Container
};
function getPortIcon(port: number): LucideIcon {
    return PORT_ICONS[port] ?? Server;
}

/** Port categories for tooltip grouping (keys are i18n identifiers) */
const PORT_CATEGORIES: Record<string, number[]> = {
    'web': [80, 443, 8080, 8443, 9000],
    'databases': [3306, 5432, 6379, 1433],
    'mail': [25, 110, 143, 993, 995],
    'system': [20, 21, 22, 23, 53, 445],
    'remoteAccess': [3389, 5900],
    'docker': [2375, 2376]
};
const getPortCategory = (port: number): string => {
    for (const [cat, ports] of Object.entries(PORT_CATEGORIES)) {
        if (ports.includes(port)) return cat;
    }
    return 'other';
};

/** Couleur par catégorie : Système = orange, Docker = indigo, reste = cyan */
function getPortCategoryColor(cat: string): { label: string; cell: string; icon: string } {
    switch (cat) {
        case 'system':
            return { label: 'text-amber-400', cell: 'bg-amber-500/20 border-amber-500/40 text-amber-300', icon: 'text-amber-400/90' };
        case 'docker':
            return { label: 'text-indigo-400', cell: 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300', icon: 'text-indigo-400/90' };
        default:
            return { label: 'text-cyan-400', cell: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300', icon: 'text-cyan-400/90' };
    }
}

/** Options optionnelles pour le positionnement. tableRect = garder le tooltip horizontalement dans le tableau. */
type TooltipPositionOptions = { preferAbove?: boolean; offsetX?: number; offsetY?: number; tableRect?: { left: number; right: number } };

/** Écart vertical minimal entre la ligne et le tooltip (rapproché de la ligne). */
const TOOLTIP_V_GAP = 2;

/** Calcule left/top du tooltip. Au-dessus ou en dessous de la ligne selon placement. Horizontalement : au niveau de la colonne, puis clamp dans le tableau si tableRect fourni, puis dans la fenêtre. */
function getTooltipPosition(
    rect: { left: number; top: number; bottom: number; right: number },
    tooltipWidth: number,
    tooltipHeight: number,
    options?: boolean | TooltipPositionOptions
): { left: number; top: number } {
    const forcePreferAbove = options === true || (typeof options === 'object' && options?.preferAbove);
    const offsetX = typeof options === 'object' && options?.offsetX != null ? options.offsetX : 0;
    const offsetY = typeof options === 'object' && options?.offsetY != null ? options.offsetY : 0;
    const tableRect = typeof options === 'object' && options?.tableRect != null ? options.tableRect : null;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 300;
    const margin = 16;
    let left = rect.left - offsetX;
    if (tableRect != null) {
        left = Math.max(tableRect.left, Math.min(left, tableRect.right - tooltipWidth));
    }
    if (left + tooltipWidth > vw - margin) left = vw - tooltipWidth - margin;
    if (left < margin) left = margin;
    const aboveTop = rect.top - tooltipHeight - TOOLTIP_V_GAP;
    const belowTop = rect.bottom + TOOLTIP_V_GAP;
    const rowInLowerHalf = rect.top > vh / 2;
    const preferAbove = forcePreferAbove || rowInLowerHalf;
    let top: number;
    if (preferAbove) {
        top = aboveTop >= margin ? aboveTop : belowTop;
    } else {
        top = belowTop + tooltipHeight <= vh - margin ? belowTop : aboveTop;
    }
    top -= offsetY;
    if (top + tooltipHeight > vh - margin) top = Math.max(margin, rect.top - tooltipHeight - TOOLTIP_V_GAP - offsetY);
    if (top < margin) top = margin;
    return { left, top };
}

interface NetworkScanPageProps {
    onBack: () => void;
    onNavigateToSearch?: (ip: string) => void;
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

export const NetworkScanPage: React.FC<NetworkScanPageProps> = ({ onBack, onNavigateToSearch }) => {
    const { t, i18n } = useTranslation();
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
    const [refreshType, setRefreshType] = useState<'full' | 'quick'>('quick'); // Type de refresh (quick/full)
    const [showRefreshDropdown, setShowRefreshDropdown] = useState(false); // État pour afficher/masquer le dropdown
    const refreshDropdownRef = useRef<HTMLDivElement>(null); // Référence pour fermer le dropdown au clic extérieur
    const [defaultConfigLoaded, setDefaultConfigLoaded] = useState(false);
    const [scanPollingInterval, setScanPollingInterval] = useState<NodeJS.Timeout | null>(null);
    const [showAddIpModal, setShowAddIpModal] = useState(false);
    const [manualIp, setManualIp] = useState('');
    const [manualMac, setManualMac] = useState('');
    const [manualHostname, setManualHostname] = useState('');
    const [isAddingIp, setIsAddingIp] = useState(false);
    const [rescanningIp, setRescanningIp] = useState<string | null>(null);
    const [rescanSuccessIp, setRescanSuccessIp] = useState<string | null>(null);
    const [toasts, setToasts] = useState<ToastData[]>([]);
    
    // Port scan (nmap) progress - active when scan ports runs in background after full scan
    const [portScanProgress, setPortScanProgress] = useState<{ active: boolean; current: number; total: number; currentIp?: string } | null>(null);

    // Hover tooltips (MAC + Ports) - anchor rect pour positionner dans la fenêtre
    const [macTooltip, setMacTooltip] = useState<{ mac: string; rect: { left: number; top: number; bottom: number; right: number } } | null>(null);
    const [portsTooltip, setPortsTooltip] = useState<{ ip: string; openPorts: { port: number; protocol?: string }[]; lastPortScan?: string; rect: { left: number; top: number; bottom: number; right: number } } | null>(null);
    const [firstSeenTooltip, setFirstSeenTooltip] = useState<{ fullDate: string; rect: { left: number; top: number; bottom: number; right: number } } | null>(null);
    const [statusTooltip, setStatusTooltip] = useState<{ label: string; text: string; rect: { left: number; top: number; bottom: number; right: number } } | null>(null);
    const [latencyTooltip, setLatencyTooltip] = useState<{ label: string; text: string; rect: { left: number; top: number; bottom: number; right: number } } | null>(null);
    const [hostnameTooltip, setHostnameTooltip] = useState<{ label: string; text: string; rect: { left: number; top: number; bottom: number; right: number } } | null>(null);
    const [vendorTooltip, setVendorTooltip] = useState<{ label: string; text: string; rect: { left: number; top: number; bottom: number; right: number } } | null>(null);
    const [actionsTooltip, setActionsTooltip] = useState<{ label: string; text: string; rect: { left: number; top: number; bottom: number; right: number } } | null>(null);
    const [monitoringTooltip, setMonitoringTooltip] = useState<{ label: string; text: string; linkText?: string; rect: { left: number; top: number; bottom: number; right: number } } | null>(null);
    const [scatterIconTooltip, setScatterIconTooltip] = useState<{ rect: { left: number; top: number; bottom: number; right: number } } | null>(null);
    const [ipTooltip, setIpTooltip] = useState<{ label: string; text: string; rect: { left: number; top: number; bottom: number; right: number } } | null>(null);
    const TOOLTIP_MAC_W = 320;
    const TOOLTIP_MAC_H = 100;
    const TOOLTIP_PORTS_W = 420;
    const TOOLTIP_PORTS_H = 320;
    const tooltipHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const hideAllTooltips = useCallback(() => {
        setMacTooltip(null);
        setPortsTooltip(null);
        setFirstSeenTooltip(null);
        setStatusTooltip(null);
        setLatencyTooltip(null);
        setHostnameTooltip(null);
        setVendorTooltip(null);
        setActionsTooltip(null);
        setMonitoringTooltip(null);
        setScatterIconTooltip(null);
        setIpTooltip(null);
    }, []);
    const scheduleTooltipHide = useCallback((ms = 80) => {
        if (tooltipHideTimeoutRef.current) clearTimeout(tooltipHideTimeoutRef.current);
        tooltipHideTimeoutRef.current = setTimeout(() => {
            hideAllTooltips();
            tooltipHideTimeoutRef.current = null;
        }, ms);
    }, [hideAllTooltips]);
    const cancelTooltipHide = useCallback(() => {
        if (tooltipHideTimeoutRef.current) {
            clearTimeout(tooltipHideTimeoutRef.current);
            tooltipHideTimeoutRef.current = null;
        }
    }, []);

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
    const [sortBy, setSortBy] = useState<'ip' | 'last_seen' | 'first_seen' | 'status' | 'ping_latency' | 'hostname' | 'mac' | 'vendor' | 'avg1h' | 'max' | 'monitoring'>(() => {
        try {
            const saved = localStorage.getItem('networkScan_sortBy');
            if (saved && ['ip', 'last_seen', 'first_seen', 'status', 'ping_latency', 'hostname', 'mac', 'vendor', 'avg1h', 'max', 'monitoring'].includes(saved)) {
                return saved as 'ip' | 'last_seen' | 'first_seen' | 'status' | 'ping_latency' | 'hostname' | 'mac' | 'vendor' | 'avg1h' | 'max' | 'monitoring';
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

    const fetchPortScanProgress = useCallback(async () => {
        try {
            const res = await api.get<{ active: boolean; current: number; total: number; currentIp?: string }>('/api/network-scan/port-scan-progress');
            if (res.success && res.result) {
                setPortScanProgress(res.result);
            }
        } catch {
            // ignore
        }
    }, []);

    const [portScanStopping, setPortScanStopping] = useState(false);
    const handleStopPortScan = useCallback(async () => {
        if (!portScanProgress?.active || portScanStopping) return;
        setPortScanStopping(true);
        try {
            await api.post('/api/network-scan/port-scan-stop');
            await fetchPortScanProgress();
        } catch {
            // ignore
        } finally {
            setPortScanStopping(false);
        }
    }, [portScanProgress?.active, portScanStopping, fetchPortScanProgress]);

    const fetchHistory = useCallback(async () => {
        try {
            // Avg1h, Max, Monitoring are client-side only (latencyStats/monitoringStatus).
            // Send a server-supported sortBy so the API returns data; client will re-sort in filteredScans.
            const serverSortBy = (sortBy === 'avg1h' || sortBy === 'max' || sortBy === 'monitoring')
                ? 'last_seen'
                : sortBy;
            const params: any = {
                sortBy: serverSortBy,
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
            // Update port scan progress so we show active state if nmap is running
            await fetchPortScanProgress();
        } catch (error) {
            console.error('Failed to fetch history:', error);
        }
    }, [resultsPerPage, sortBy, sortOrder, statusFilter, debouncedSearchFilter, fetchPortScanProgress]);

    const fetchDefaultConfig = useCallback(async () => {
        try {
            const response = await api.get<{ defaultRange: string; defaultAutoDetect: boolean }>('/api/network-scan/default-config');
            if (response.success && response.result) {
                setScanRange(response.result.defaultRange);
                setAutoDetect(response.result.defaultAutoDetect);
                // scanType n'est plus utilisé - scan complet toujours en 'full'
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
                        config: { enabled: false, interval: 10, scanType: 'quick' },
                        scheduler: { enabled: false, running: false },
                        lastExecution: null
                    },
                    lastScan: null
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
                    config: { enabled: false, interval: 10, scanType: 'quick' },
                    scheduler: { enabled: false, running: false },
                    lastExecution: null
                },
                lastScan: null
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
                alert(response.error?.message || t('networkScan.errors.monitoringUpdate'));
            }
        } catch (error: any) {
            console.error('Failed to toggle monitoring:', error);
            alert(t('networkScan.errors.monitoringUpdateWithError', { error: error.message || t('networkScan.errors.unknown') }));
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
                const progressResponse = await api.get<{ scanned: number; total: number; found: number; updated: number }>('/api/network-scan/progress');
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

    // Poll port-scan progress when it is active (nmap running in background after full scan)
    useEffect(() => {
        if (!portScanProgress?.active) return;
        const t = setInterval(fetchPortScanProgress, 2000);
        return () => clearInterval(t);
    }, [portScanProgress?.active, fetchPortScanProgress]);

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
        setCurrentScanRange(scanRange || (autoDetect ? t('networkScan.scanTypes.autoDetect') : '192.168.1.0/24'));
        setScanProgress(null);
        setLastScanSummary(null);
        
        // Start polling to refresh the list and progress during scan
        // Reduced frequency to 2 seconds to improve performance
        const interval = setInterval(async () => {
            fetchHistory();
            fetchStats();
            fetchPortScanProgress();
            
            // Fetch scan progress or final results
            try {
                const progressResponse = await api.get<{
                    status?: 'in_progress' | 'completed';
                    scanned?: number;
                    total?: number;
                    found?: number;
                    updated?: number;
                    duration?: number;
                    range?: string;
                    scanType?: string;
                    detectionSummary?: { mac: number; vendor: number; hostname: number };
                } | null>('/api/network-scan/progress');
                
                if (progressResponse.success && progressResponse.result) {
                    const result = progressResponse.result;
                    
                    if (result && result.status === 'completed') {
                        // Scan completed, store final results and stop polling
                        setLastScanSummary({
                            range: result.range || scanRange || t('networkScan.scanTypes.autoDetect'),
                            scanned: result.scanned || 0,
                            found: result.found || 0,
                            updated: result.updated || 0,
                            duration: result.duration || 0,
                            detectionSummary: result.detectionSummary
                        });
                        setScanProgress(null);
                        setIsScanning(false);
                        setCurrentScanRange('');
                        clearInterval(interval);
                        setScanPollingInterval(null);
                        
                        // Final refresh after scan completes; then check if port scan started (nmap in background)
                        await fetchStats();
                        await fetchHistory();
                        await fetchPortScanProgress();
                    } else if (result && result.status === 'in_progress') {
                        // Scan still in progress, update progress
                        setScanProgress({
                            scanned: result.scanned || 0,
                            total: result.total || 0,
                            found: result.found || 0,
                            updated: result.updated || 0
                        });
                    } else if (result) {
                        // Legacy format (no status field) - assume in progress if has scanned/total
                        if (result.scanned !== undefined && result.total !== undefined) {
                            setScanProgress({
                                scanned: result.scanned,
                                total: result.total,
                                found: result.found || 0,
                                updated: result.updated || 0
                            });
                        }
                    }
                } else if (progressResponse.success && !progressResponse.result) {
                    // No scan in progress and no results (shouldn't happen during scan, but handle gracefully)
                    setScanProgress(null);
                }
            } catch (error) {
                // Ignore errors, progress is optional
            }
        }, 2000); // Refresh every 2 seconds during scan (reduced from 1s for better performance)
        setScanPollingInterval(interval);
        
        try {
            // Start scan (returns immediately with "scan started" status)
            const response = await api.post<{
                result?: {
                    message: string;
                range: string;
                scanType: string;
                    status: string;
                };
            }>('/api/network-scan/scan', {
                range: scanRange || undefined,
                autoDetect: autoDetect || !scanRange
                // scanType retiré - scan complet toujours en mode 'full'
            });

            if (response.success && response.result) {
                // Scan started successfully, polling will handle progress and results
                // The polling interval already set above will check for progress and final results
            } else {
                setIsScanning(false);
                setCurrentScanRange('');
                setScanProgress(null);
                clearInterval(interval);
                setScanPollingInterval(null);
                alert(response.error?.message || t('networkScan.errors.scanStart'));
            }
        } catch (error: any) {
            console.error('Scan failed:', error);
            setIsScanning(false);
            setCurrentScanRange('');
            setScanProgress(null);
            clearInterval(interval);
            setScanPollingInterval(null);
            alert(t('networkScan.errors.scanStartWithError', { error: error.message || t('networkScan.errors.unknown') }));
        }
    };

    const handleStopScan = async () => {
        if (!isScanning) return;
        try {
            const response = await api.post<{ result?: { stopped: boolean } }>('/api/network-scan/scan-stop');
            if (response.success) {
                addToast('success', t('networkScan.success.scanStopRequested'));
            } else {
                addToast('error', response.error?.message || t('networkScan.errors.scanStop'));
            }
        } catch (error: any) {
            addToast('error', t('networkScan.errors.scanStopWithError', { error: error.message || t('networkScan.errors.unknown') }));
        }
    };

    const handleAddManualIp = async () => {
        if (!manualIp.trim()) {
            alert(t('networkScan.errors.ipRequired'));
            return;
        }

        // Validate IP format
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipRegex.test(manualIp.trim())) {
            alert(t('networkScan.errors.invalidIpFormat'));
            return;
        }

        setIsAddingIp(true);
        try {
            const response = await api.post('/api/network-scan/add-manual', {
                ip: manualIp.trim(),
                mac: manualMac.trim() || undefined,
                hostname: manualHostname.trim() || undefined
                // scanType retiré - ajout manuel toujours en mode 'full'
            });

            if (response.success && response.result) {
                const result = response.result as { message?: string; ip?: string; status?: string };
                alert(result.message || t('networkScan.success.ipAdded'));
                // Reset form
                setManualIp('');
                setManualMac('');
                setManualHostname('');
                setShowAddIpModal(false);
                // Refresh the list
                await fetchHistory();
                await fetchStats();
            } else {
                alert(response.error?.message || t('networkScan.errors.ipAdd'));
            }
        } catch (error: any) {
            console.error('Add manual IP failed:', error);
            alert(t('networkScan.errors.ipAddWithError', { error: error.message || t('networkScan.errors.unknown') }));
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
        setCurrentScanRange(t('networkScan.scanInfo.refreshingExisting'));
        setScanProgress(null);
        setLastScanSummary(null);
        
        // Start polling to refresh the list during refresh
        // Reduced frequency to 2 seconds to improve performance
        const interval = setInterval(async () => {
            fetchHistory();
            fetchStats();
            
            // Fetch scan progress (refresh also uses the same progress system)
            try {
                const progressResponse = await api.get<{ scanned: number; total: number; found: number; updated: number }>('/api/network-scan/progress');
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
            }>('/api/network-scan/refresh', { scanType: refreshType });

            if (response.success && response.result) {
                // Store refresh summary
                const result = response.result as {
                    scanned: number;
                    online: number;
                    offline: number;
                    duration: number;
                };
                setLastScanSummary({
                    range: t('networkScan.scanInfo.existingIps'),
                    scanned: result.scanned || 0,
                    found: result.online || 0,
                    updated: result.offline || 0,
                    duration: result.duration || 0
                });
                
                // Final refresh after refresh completes
                await fetchStats();
                await fetchHistory();
            } else {
                alert(response.error?.message || t('networkScan.errors.refresh'));
            }
        } catch (error: any) {
            console.error('Refresh failed:', error);
            alert(t('networkScan.errors.refreshWithError', { error: error.message || t('networkScan.errors.unknown') }));
        } finally {
            setIsRefreshing(false);
            setCurrentScanRange('');
            setScanProgress(null);
            clearInterval(interval);
        }
    };

    const handleDelete = async (ip: string) => {
        const confirmed = window.confirm(t('networkScan.confirm.deleteIp', { ip }));
        if (!confirmed) return;

        try {
            const response = await api.delete(`/api/network-scan/${ip}`);

            if (response.success) {
                await fetchHistory();
                await fetchStats();
            } else {
                alert(response.error?.message || t('networkScan.errors.delete'));
            }
        } catch (error: any) {
            console.error('Delete failed:', error);
            alert(t('networkScan.errors.deleteWithError', { error: error.message || t('networkScan.errors.unknown') }));
        }
    };

    const addToast = useCallback((type: ToastData['type'], message: string, id?: string, progress?: number) => {
        const toastId = id || `toast-${Date.now()}`;
        setToasts((prev) => {
            const existing = prev.find((t) => t.id === toastId);
            if (existing) {
                return prev.map((t) => (t.id === toastId ? { ...t, type, message, progress } : t));
            }
            return [...prev, { id: toastId, type, message, progress }];
        });
        return toastId;
    }, []);
    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const handleRescan = async (ip: string, status: 'online' | 'offline' | 'unknown') => {
        if (status === 'offline') return; // Do not rescan offline IPs
        if (rescanningIp === ip) return; // Prevent double-click

        setRescanningIp(ip);
        setRescanSuccessIp(null);
        try {
            const response = await api.post(`/api/network-scan/${ip}/rescan`);

            if (response.success) {
                // Update UI immediately so user sees success even if refresh fails
                setRescanSuccessIp(ip);
                addToast('success', t('networkScan.success.rescanDone', { ip }));
                setTimeout(() => setRescanSuccessIp(null), 2500);
                // Refresh list/stats in background; do not let failures here affect the rescan success or trigger full-page behavior
                Promise.all([
                    fetchHistory(),
                    fetchStats(),
                    fetchPortScanProgress()
                ]).catch((err) => {
                    console.warn('[NetworkScanPage] Background refresh after rescan failed:', err);
                    addToast('warning', t('networkScan.success.rescanDoneRefreshFailed'));
                });
            } else {
                addToast('error', response.error?.message || t('networkScan.errors.rescan'));
            }
        } catch (error: any) {
            console.error('Rescan failed:', error);
            const msg = error?.message || error?.error?.message || t('networkScan.errors.unknown');
            addToast('error', t('networkScan.errors.rescanWithError', { error: msg }));
        } finally {
            setRescanningIp(null);
        }
    };

    const handleBan = async (ip: string) => {
        const confirmed = window.confirm(t('networkScan.confirm.banIp', { ip }));
        if (!confirmed) return;

        try {
            const response = await api.post('/api/network-scan/blacklist/add', { ip });

            if (response.success) {
                await fetchHistory();
                await fetchStats();
            } else {
                alert(response.error?.message || t('networkScan.errors.ban'));
            }
        } catch (error: any) {
            console.error('Ban failed:', error);
            alert(t('networkScan.errors.banWithError', { error: error.message || t('networkScan.errors.unknown') }));
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
            freebox: { label: t('networkScan.badges.freebox'), color: 'text-purple-300', bgColor: 'bg-purple-500/20' },
            unifi: { label: t('networkScan.badges.unifi'), color: 'text-blue-300', bgColor: 'bg-blue-500/20' },
            api: { label: t('networkScan.badges.api'), color: 'text-yellow-300', bgColor: 'bg-yellow-500/20' },
            system: { label: t('networkScan.badges.system'), color: 'text-gray-300', bgColor: 'bg-gray-500/20' },
            manual: { label: t('networkScan.badges.manual'), color: 'text-orange-300', bgColor: 'bg-orange-500/20' }
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
                alert(response.error?.message || t('networkScan.errors.hostnameSave'));
            }
        } catch (error: any) {
            console.error('Save hostname failed:', error);
            alert(t('networkScan.errors.hostnameSaveWithError', { error: error.message || t('networkScan.errors.unknown') }));
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

    const currentLocale = i18n.language === 'fr' ? 'fr-FR' : 'en-US';

    const formatDate = (dateStr: string): string => {
        const date = new Date(dateStr);
        return date.toLocaleString(currentLocale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

    /** Short format for first detection: minutes / hours / days / day+month / year depending on age */
    const formatFirstDetectionShort = (dateStr: string): string => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        const diffMonths = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
        const diffYears = now.getFullYear() - date.getFullYear();

        if (diffMins < 1) return t('networkScan.time.justNow');
        if (diffMins < 60) return t('networkScan.time.minutesAgo', { count: diffMins });
        if (diffHours < 24) return t('networkScan.time.hoursAgo', { count: diffHours });
        if (diffDays < 31) return t('networkScan.time.daysAgo', { count: diffDays });
        if (diffYears < 1) return date.toLocaleDateString(currentLocale, { day: '2-digit', month: '2-digit' });
        return date.getFullYear().toString();
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
        
        // If the next scan is overdue, show the exact planned date/time
        if (diffMs <= 0) {
            const dateStr = nextDate.toLocaleDateString(currentLocale, { day: '2-digit', month: '2-digit' });
            const timeStr = nextDate.toLocaleTimeString(currentLocale, { hour: '2-digit', minute: '2-digit' });
            return t('networkScan.time.nextExecutionLate', { date: dateStr, time: timeStr });
        }
        
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        const timeStr = nextDate.toLocaleTimeString(currentLocale, { hour: '2-digit', minute: '2-digit' });
        
        // For very close scans (< 1h), show precise minutes
        if (diffMins < 60) {
            if (diffMins < 1) {
                return t('networkScan.time.nextExecutionLessThan1Min', { time: timeStr });
            }
            return t('networkScan.time.nextExecutionMinutes', { count: diffMins, time: timeStr });
        }
        
        // For scans within next hours, show precise time
        if (diffHours < 24) {
            return t('networkScan.time.nextExecutionHours', { count: diffHours, time: timeStr });
        }
        
        // For next days, show date and time
        if (diffDays < 7) {
            const dateStr = nextDate.toLocaleDateString(currentLocale, { day: '2-digit', month: '2-digit' });
            return t('networkScan.time.nextExecutionDays', { count: diffDays, date: dateStr, time: timeStr });
        }
        
        // For further dates, show full date
        const fullDateStr = nextDate.toLocaleDateString(currentLocale, { day: '2-digit', month: '2-digit', year: 'numeric' });
        const fullTimeStr = nextDate.toLocaleTimeString(currentLocale, { hour: '2-digit', minute: '2-digit' });
        return t('networkScan.time.nextExecutionDate', { date: fullDateStr, time: fullTimeStr });
    };

    // Note: Filtering is done server-side, but we keep client-side filtering as a fallback
    // This ensures that even if server-side filtering has issues, client-side will catch it
    // Optimized with useMemo to avoid recalculating on every render
    const filteredScans = useMemo(() => {
        let filtered = scans.filter(scan => {
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
                
                // Handle ports (openPorts from scan de ports)
                const openPorts = (scan.additionalInfo as { openPorts?: { port: number }[] })?.openPorts;
                const portsMatch = Array.isArray(openPorts) && openPorts.some((p) => String(p.port).includes(searchLower));
                
                return ipMatch || macMatch || hostnameMatch || vendorMatch || portsMatch;
        }
        return true;
    });

        // Client-side sorting for avg1h, max, and monitoring (server-side sorting for others)
        if (sortBy === 'avg1h' || sortBy === 'max' || sortBy === 'monitoring') {
            filtered = [...filtered].sort((a, b) => {
                if (sortBy === 'avg1h') {
                    const aVal = latencyStats[a.ip]?.avg1h ?? null;
                    const bVal = latencyStats[b.ip]?.avg1h ?? null;
                    if (aVal === null && bVal === null) return 0;
                    if (aVal === null) return 1;
                    if (bVal === null) return -1;
                    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
                } else if (sortBy === 'max') {
                    const aVal = latencyStats[a.ip]?.max ?? null;
                    const bVal = latencyStats[b.ip]?.max ?? null;
                    if (aVal === null && bVal === null) return 0;
                    if (aVal === null) return 1;
                    if (bVal === null) return -1;
                    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
                } else if (sortBy === 'monitoring') {
                    const aVal = monitoringStatus[a.ip] ? 1 : 0;
                    const bVal = monitoringStatus[b.ip] ? 1 : 0;
                    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
                }
                return 0;
            });
        }

        return filtered;
    }, [scans, statusFilter, searchFilter, sortBy, sortOrder, latencyStats, monitoringStatus]);

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
                return time.toLocaleTimeString(currentLocale, { hour: '2-digit', minute: '2-digit' });
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
                return time.toLocaleTimeString(currentLocale, { hour: '2-digit', minute: '2-digit' });
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
                return time.toLocaleTimeString(currentLocale, { hour: '2-digit', minute: '2-digit' });
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
                        title={t('networkScan.tooltips.backToDashboard')}
                    >
                        <ArrowLeft size={20} className="text-gray-400" />
                    </button>
                    <div className="flex items-center gap-2">
                        <Network size={24} className="text-cyan-400" />
                        <h1 className="text-2xl font-bold">{t('networkScan.title')}</h1>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setConfigModalOpen(true)}
                        className="px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30 transition-colors flex items-center gap-2"
                        title={t('networkScan.tooltips.config')}
                    >
                        <Settings size={16} />
                        <span>{t('networkScan.buttons.config')}</span>
                    </button>
                    </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    {/* Info Scans - Prend 2 colonnes sur la gauche */}
                    <Card 
                        title={
                            <div className="flex items-center gap-2 flex-wrap">
                                <span>{t('networkScan.stats.infoScans')}</span>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`} title={isActive ? t('networkScan.stats.pluginActive') : t('networkScan.stats.pluginInactive')}>
                                    {isActive ? t('networkScan.status.on') : t('networkScan.status.off')}
                                </span>
                            </div>
                        }
                        className="md:col-span-2"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Colonne 1 : Informations des scans */}
                        <div className="space-y-2 text-xs">
                                {/* Prochains scans automatiques */}
                                {autoStatus && autoStatus.enabled && (autoStatus.fullScan.config.enabled || autoStatus.refresh.config.enabled) && (
                                    <div className="space-y-2 mb-2">
                                        {autoStatus.fullScan.config.enabled && (
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-gray-300 font-medium w-14">{t('networkScan.scanTypes.fullScan')}</span>
                                                <span className="px-2 py-0.5 rounded text-xs font-medium w-16 text-center bg-purple-500/20 border border-purple-500/50 text-purple-400">
                                                    {t('networkScan.scanTypes.full')}
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
                                                <span className="text-gray-300 font-medium w-14">{t('networkScan.scanTypes.refresh')}</span>
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium w-16 text-center ${
                                                    autoStatus.refresh.config.scanType === 'full'
                                                        ? 'bg-purple-500/20 border border-purple-500/50 text-purple-400'
                                                        : 'bg-blue-500/20 border border-blue-500/50 text-blue-400'
                                                }`}>
                                                    {autoStatus.refresh.config.scanType === 'full' ? t('networkScan.scanTypes.complete') : t('networkScan.scanTypes.quick')}
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
                                
                                <div className="pt-2 border-t border-gray-800">
                                    <div className="font-medium text-gray-300 mb-2">{t('networkScan.stats.lastScan')}</div>
                            {/* Afficher le dernier scan avec son type et sa date exacte */}
                            {autoStatus?.lastScan ? (
                                <div className="mb-2">
                                    <div className="flex items-center gap-2 mb-1">
                                        {autoStatus.lastScan.isManual ? (
                                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">{t('networkScan.scanTypes.manual')}</span>
                                        ) : (
                                            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs font-medium">{t('networkScan.scanTypes.auto')}</span>
                                        )}
                                        <span className="text-gray-400">
                                            {autoStatus.lastScan.type === 'full' ? (
                                                        <>{t('networkScan.scanTypes.fullScan')} <span className="text-gray-500">({t('networkScan.scanTypes.full')})</span></>
                                            ) : (
                                                        <>{t('networkScan.scanTypes.refresh')} <span className="text-gray-500">({autoStatus.lastScan.scanType === 'full' ? t('networkScan.scanTypes.complete') : t('networkScan.scanTypes.quick')})</span></>
                                            )}
                                        </span>
                                                <span className="text-gray-300 font-medium">{formatDate(autoStatus.lastScan.timestamp)}</span>
                                                <span className="text-gray-500 text-xs mt-0.5">
                                                {formatRelativeTime(autoStatus.lastScan.timestamp)} </span>
                                    </div>
                                </div>
                            ) : stats?.lastScan ? (
                                <div className="mb-2">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">{t('networkScan.scanTypes.manual')}</span>
                                        <span className="text-gray-300">{t('networkScan.scanTypes.scan')}</span> <span className="text-gray-300 font-medium">{formatDate(stats.lastScan)}</span>
                                    </div>
                    
                                    <div className="text-gray-500 text-xs mt-0.5">
                                        {formatRelativeTime(stats.lastScan)}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-gray-500">{t('networkScan.stats.noScan')}</div>
                            )}
                                            </div>
                                                    </div>
                            
                            {/* Colonne 2 : Boutons d'action et stats */}
                            <div className="space-y-3">
                                {/* Boutons d'action */}
                                <div className="grid grid-cols-3 gap-1">
                                    {/* Bouton Refresh avec dropdown */}
                                    <div className="relative" ref={refreshDropdownRef}>
                                        <div className="flex">
                                            <button
                                                onClick={handleRefresh}
                                                disabled={isRefreshing}
                                                className="flex-1 px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-l-lg border border-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1 transition-colors text-xs"
                                                title={refreshType === 'quick' ? t('networkScan.tooltips.refreshQuick') : t('networkScan.tooltips.refreshFull')}
                                            >
                                                <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                                                <span className="truncate">{t('networkScan.buttons.refresh')}</span>
                                            </button>
                                            <button
                                                onClick={() => setShowRefreshDropdown(!showRefreshDropdown)}
                                                disabled={isRefreshing}
                                                className={`px-1.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-r-lg border border-l-0 border-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors text-xs ${showRefreshDropdown ? 'bg-blue-500/20' : ''}`}
                                                title={t('networkScan.tooltips.chooseRefreshType')}
                                            >
                                                <ArrowDown size={10} className={`opacity-80 transition-transform duration-200 ${showRefreshDropdown ? 'rotate-180' : ''}`} />
                                            </button>
                                                    </div>
                                        {/* Dropdown menu - collé au bouton */}
                                        {showRefreshDropdown && (
                                            <div className="absolute left-0 top-full w-full bg-[#1a1a1a] border border-t-0 border-blue-500/30 rounded-b-lg shadow-xl z-50 overflow-hidden">
                                                <button
                                                    onClick={() => {
                                                        setRefreshType('quick');
                                                        setShowRefreshDropdown(false);
                                                        handleRefresh();
                                                    }}
                                                    disabled={isRefreshing}
                                                    className={`w-full px-3 py-2 text-xs text-left hover:bg-blue-500/10 transition-colors flex items-center gap-2 ${refreshType === 'quick' ? 'bg-blue-500/20 text-blue-400 font-medium' : 'text-gray-300'}`}
                                                >
                                                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60"></span>
                                                    {t('networkScan.scanTypes.quick')}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setRefreshType('full');
                                                        setShowRefreshDropdown(false);
                                                        handleRefresh();
                                                    }}
                                                    disabled={isRefreshing}
                                                    className={`w-full px-3 py-2 text-xs text-left hover:bg-blue-500/10 transition-colors flex items-center gap-2 border-t border-gray-800 ${refreshType === 'full' ? 'bg-blue-500/20 text-blue-400 font-medium' : 'text-gray-300'}`}
                                                >
                                                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60"></span>
                                                    {t('networkScan.scanTypes.complete')}
                                                </button>
                                                </div>
                                        )}
                                                </div>
                                    <button
                                        onClick={isScanning ? handleStopScan : handleScan}
                                        disabled={isRefreshing && !isScanning}
                                        className={`w-full px-2 py-1 rounded-lg border flex items-center justify-center gap-1.5 transition-colors text-xs ${isScanning ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30' : 'bg-green-500/10 hover:bg-green-500/20 text-green-400 border-green-500/30'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                        title={isScanning ? t('networkScan.tooltips.stopScan') : t('networkScan.tooltips.fullScan')}
                                    >
                                        {isScanning ? (
                                            <>
                                                <Square size={12} fill="currentColor" />
                                                {t('networkScan.buttons.stop')}
                                            </>
                                        ) : (
                                            <>
                                                <Play size={12} />
                                                {t('networkScan.buttons.scan')}
                                            </>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => setShowAddIpModal(true)}
                                        disabled={isScanning || isRefreshing}
                                        className="w-full px-2 py-1 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded-lg border border-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-colors text-xs"
                                        title={t('networkScan.tooltips.addIp')}
                                    >
                                        <Network size={12} />
                                        {t('networkScan.buttons.addIp')}
                                    </button>
                                    
                                </div>
                                
                                {/* Stats vendors et scan auto */}
                                <div className="pt-2 border-t border-gray-800 space-y-2">
                                    {/* Info base vendors IEEE OUI */}
                                    {wiresharkVendorStats && (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 text-xs">
                                                <span className="text-gray-400 w-20">{t('networkScan.stats.vendorBase')}</span>
                                                {wiresharkVendorStats.totalVendors > 0 ? (
                                                    <>
                                                        <span className="text-emerald-400 font-medium">{wiresharkVendorStats.totalVendors.toLocaleString()}</span>
                                                        {wiresharkVendorStats.lastUpdate && (
                                                            <span className="text-gray-500">
                                                            ({t('networkScan.stats.update')} {new Date(wiresharkVendorStats.lastUpdate).toLocaleDateString(currentLocale, { day: '2-digit', month: '2-digit' })})
                                                        </span>
                                            )}
                                        </>
                                            ) : (
                                                <span className="text-orange-400">{t('networkScan.stats.notLoaded')}</span>
                                            )}
                                            </div>
                                            {scanRange && (
                                                <div className="flex items-center gap-2 text-xs">
                                                    <span className="text-gray-400 w-20">{t('networkScan.stats.network')}</span>
                                                    <span className="px-2 py-0.5 bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 rounded text-xs font-medium">
                                                        {scanRange}
                                                    </span>
                                                    </div>
                                            )}
                                                    </div>
                                    )}
                                    
                                    {/* Scan auto actif ou pas */}
                                    {autoStatusLoading ? (
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <span className="w-20">{t('networkScan.stats.autoScan')}</span>
                                            <span>{t('networkScan.status.loading')}</span>
                                                </div>
                                    ) : autoStatus ? (
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className="text-gray-400 w-20">{t('networkScan.stats.autoScan')}</span>
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                                autoStatus.enabled && (autoStatus.fullScan.config.enabled || autoStatus.refresh.config.enabled)
                                                    ? 'bg-emerald-500/20 text-emerald-400'
                                                    : 'bg-gray-500/20 text-gray-400'
                                            }`} style={{ transition: 'none' }}>
                                                {autoStatus.enabled && (autoStatus.fullScan.config.enabled || autoStatus.refresh.config.enabled) ? t('networkScan.status.active') : t('networkScan.status.inactive')}
                                            </span>
                                                </div>
                                    ) : null}
                                </div>
                                </div>
                                </div>
                    </Card>
                    
                    {/* Total IPs - 1 colonne */}
                    <Card title={t('networkScan.stats.totalIps')}>
                        <div className="text-3xl font-bold text-gray-200 text-center mb-1">{stats.total}</div>
                        <div className="h-16 mt-1">
                            <MiniBarChart data={totalChartData.data} color="#9ca3af" labels={totalChartData.labels} valueLabel={t('networkScan.stats.totalIps')} height={64} fadeFromBottom={true} />
                                </div>
                    </Card>
                    
                    {/* Online - 1 colonne */}
                    <Card title={t('networkScan.status.online')}>
                        <div className="text-3xl font-bold text-emerald-400 text-center mb-1">{stats.online}</div>
                        <div className="h-16 mt-1">
                            <MiniBarChart data={onlineChartData.data} color="#10b981" labels={onlineChartData.labels} valueLabel={t('networkScan.status.online')} height={64} />
                        </div>
                    </Card>
                    
                    {/* Offline - 1 colonne */}
                    <Card title={t('networkScan.status.offline')}>
                        <div className="text-3xl font-bold text-red-400 text-center mb-1">{stats.offline}</div>
                        <div className="h-16 mt-1">
                            <MiniBarChart data={offlineChartData.data} color="#f87171" labels={offlineChartData.labels} valueLabel={t('networkScan.status.offline')} height={64} />
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
                        
                        <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-lg text-sm font-bold cursor-help" title={t('networkScan.tooltips.headerTotal')}>
                            {stats?.total || 0}
                        </span>
                        
                        {/* Scan en cours */}
                        {(isScanning || isRefreshing || (autoStatus && ((autoStatus.fullScan.scheduler.running) || (autoStatus.refresh.scheduler.running)))) && (
                            <>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-semibold animate-pulse">
                                <RefreshCw size={12} className="animate-spin" />
                                    <span>
                                        {isScanning ? t('networkScan.status.scanning') : 
                                         isRefreshing ? t('networkScan.status.refreshing') : 
                                         (autoStatus?.fullScan.scheduler.running) ? t('networkScan.status.autoFullScan') :
                                         (autoStatus?.refresh.scheduler.running) ? t('networkScan.status.autoRefresh') : t('networkScan.status.scanning')}
                                    </span>
                                </div>
                                {(currentScanRange || (autoStatus && autoStatus.lastScan?.range)) && (
                                    <div className="text-xs text-gray-400 px-2 py-0.5 bg-gray-800/50 rounded">
                                        {t('networkScan.scanInfo.range')} <span className="text-gray-300 font-medium">{currentScanRange || autoStatus?.lastScan?.range || ''}</span>
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
                                    <span className="text-gray-400">{t('networkScan.scanInfo.range')}</span>
                                    <span className="text-gray-200 ml-1 font-medium">{lastScanSummary.range}</span>
                                </div>
                                <div className="px-2 py-0.5 bg-gray-800/50 rounded border border-gray-700">
                                    <span className="text-gray-400">{t('networkScan.scanInfo.duration')}</span>
                                    <span className="text-gray-200 ml-1 font-medium">{formatDuration(lastScanSummary.duration)}</span>
                                </div>
                                <div className="px-2 py-0.5 bg-gray-800/50 rounded border border-gray-700">
                                    <span className="text-gray-400">{t('networkScan.scanInfo.scanned')}</span>
                                    <span className="text-gray-200 ml-1 font-medium">{lastScanSummary.scanned}</span>
                                </div>
                                <div className="px-2 py-0.5 bg-emerald-500/20 rounded border border-emerald-500/30">
                                    <span className="text-gray-400">{t('networkScan.scanInfo.found')}</span>
                                    <span className="text-emerald-400 ml-1 font-medium">{lastScanSummary.found}</span>
                                </div>
                                <div className="px-2 py-0.5 bg-blue-500/20 rounded border border-blue-500/30">
                                    <span className="text-gray-400">{t('networkScan.scanInfo.updated')}</span>
                                    <span className="text-blue-400 ml-1 font-medium">{lastScanSummary.updated}</span>
                                </div>
                                {lastScanSummary.detectionSummary && (
                                    <>
                                        <div className="px-2 py-0.5 bg-gray-800/50 rounded border border-gray-700">
                                            <span className="text-gray-400">{t('networkScan.scanInfo.mac')}</span>
                                            <span className="text-gray-200 ml-1 font-medium">{lastScanSummary.detectionSummary.mac}</span>
                                        </div>
                                        <div className="px-2 py-0.5 bg-gray-800/50 rounded border border-gray-700">
                                            <span className="text-gray-400">{t('networkScan.scanInfo.vendor')}</span>
                                            <span className="text-gray-200 ml-1 font-medium">{lastScanSummary.detectionSummary.vendor}</span>
                                        </div>
                                        <div className="px-2 py-0.5 bg-gray-800/50 rounded border border-gray-700">
                                            <span className="text-gray-400">{t('networkScan.scanInfo.hostname')}</span>
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
                                    id="search-filter"
                                    name="search-filter"
                                type="text"
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                                    placeholder={t('networkScan.placeholders.search')}
                                    className="w-full pl-12 pr-4 py-2.5 bg-[#1a1a1a] border-2 border-gray-700 rounded-xl text-base text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 hover:border-gray-600"
                            />
                                {searchFilter && (
                                    <button
                                        onClick={() => setSearchFilter('')}
                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-700 rounded-full transition-colors"
                                        title={t('networkScan.tooltips.clear')}
                                    >
                                        <X size={16} className="text-gray-400 hover:text-gray-200" />
                                    </button>
                                )}
                        </div>
                        <div className="flex items-center gap-1.5" role="group" aria-label={t('networkScan.filters.statusFilterLabel')}>
                            {(['all', 'online', 'offline'] as const).map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setStatusFilter(value)}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                                        statusFilter === value
                                            ? value === 'all'
                                                ? 'bg-gray-500/25 text-gray-100 border-gray-300 ring-2 ring-gray-300/50 ring-offset-1 ring-offset-[#121212]'
                                                : value === 'online'
                                                    ? 'bg-emerald-500/30 text-emerald-300 border-emerald-400 ring-2 ring-emerald-400/60 ring-offset-1 ring-offset-[#121212]'
                                                    : 'bg-red-500/30 text-red-300 border-red-400 ring-2 ring-red-400/60 ring-offset-1 ring-offset-[#121212]'
                                            : value === 'all'
                                                ? 'bg-gray-500/10 text-gray-400 border-gray-600 hover:bg-gray-500/20 hover:text-gray-300'
                                                : value === 'online'
                                                    ? 'bg-emerald-500/5 text-emerald-400/50 border-emerald-500/20 hover:bg-emerald-500/10 hover:text-emerald-400/70'
                                                    : 'bg-red-500/5 text-red-400/50 border-red-500/20 hover:bg-red-500/10 hover:text-red-400/70'
                                    }`}
                                >
                                    {value === 'all' ? t('networkScan.filters.all') : value === 'online' ? t('networkScan.status.online') : t('networkScan.status.offline')}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="px-2 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold cursor-help" title={t('networkScan.tooltips.headerOnline')}>
                                {stats?.online ?? 0}
                            </span>
                            <span className="px-2 py-1.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-400/90 text-xs font-semibold cursor-help" title={t('networkScan.tooltips.headerOffline')}>
                                {stats?.offline ?? 0}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                                <label htmlFor="results-per-page" className="text-sm text-gray-400 whitespace-nowrap">{t('networkScan.filters.results')}</label>
                                <select
                                    id="results-per-page"
                                    name="results-per-page"
                                    value={resultsPerPage === 'full' ? 'full' : resultsPerPage.toString()}
                                    onChange={(e) => handleResultsPerPageChange(e.target.value)}
                                    className="px-4 py-2.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                >
                                    <option value="20">20</option>
                                    <option value="50">50</option>
                                    <option value="full">{t('networkScan.filters.full')}</option>
                        </select>
                            </div>
                    </div>
                }
            >
                <div ref={tableContainerRef} className="overflow-x-auto">
                    <table className="w-full table-auto">
                        <colgroup>
                            <col className="min-w-[144px]" /><col className="min-w-[200px]" /><col className="min-w-[200px]" /><col className="min-w-[72px]" /><col className="min-w-[100px]" /><col className="min-w-[80px]" /><col className="min-w-[140px]" /><col className="min-w-[80px]" /><col className="min-w-[80px]" /><col className="min-w-[52px]" /><col className="min-w-[64px]" /><col className="min-w-[100px]" /><col className="min-w-[60px]" />
                        </colgroup>
                        <thead>
                            <tr className="border-b border-gray-800">
                                <th className="text-left py-3 px-4 text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition-colors" onClick={() => {
                                    if (sortBy === 'ip') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                    else { setSortBy('ip'); setSortOrder('asc'); }
                                }}>
                                    <div className="flex items-center gap-2">
                                        <span>{t('networkScan.table.headers.ip')}</span>
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
                                        <span>{t('networkScan.table.headers.hostname')}</span>
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
                                        <span>{t('networkScan.table.headers.vendor')}</span>
                                        {sortBy === 'vendor' && (
                                            sortOrder === 'asc' ? <ArrowDown size={14} className="text-blue-400" /> : <ArrowUp size={14} className="text-blue-400" />
                                        )}
                                    </div>
                                </th>
                                <th className="text-left py-3 px-2 text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition-colors whitespace-nowrap" onClick={() => {
                                    if (sortBy === 'mac') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                    else { setSortBy('mac'); setSortOrder('asc'); }
                                }}>
                                    <div className="flex items-center gap-0.5">
                                        <span>{t('networkScan.table.headers.mac')}</span>
                                        {sortBy === 'mac' && (
                                            sortOrder === 'asc' ? <ArrowDown size={12} className="text-blue-400" /> : <ArrowUp size={12} className="text-blue-400" />
                                        )}
                                    </div>
                                </th>
                                <th className="text-left py-3 px-2 text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition-colors w-16" onClick={() => {
                                    if (sortBy === 'status') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                    else { setSortBy('status'); setSortOrder('asc'); }
                                }}>
                                    <div className="flex items-center gap-2">
                                        <span>{t('networkScan.table.headers.status')}</span>
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
                                        <span>{t('networkScan.table.headers.latency')}</span>
                                        {sortBy === 'ping_latency' && (
                                            sortOrder === 'asc' ? <ArrowUp size={14} className="text-blue-400" /> : <ArrowDown size={14} className="text-blue-400" />
                                        )}
                                    </div>
                                </th>
                                <th className="text-left py-3 px-4 text-sm text-gray-400">
                                    <div className="flex items-center gap-2">
                                        {portScanProgress?.active ? (
                                            <>
                                                <span title={t('networkScan.tooltips.portScanInProgress')}><Loader2 size={14} className="text-amber-400 animate-spin flex-shrink-0" /></span>
                                                <span>{t('networkScan.table.headers.openPorts')}</span>
                                                <span className="text-amber-400/90 text-xs font-normal" title={`${portScanProgress.current}/${portScanProgress.total} IP(s)`}>
                                                    ({portScanProgress.current}/{portScanProgress.total})
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={handleStopPortScan}
                                                    disabled={portScanStopping}
                                                    className="p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title={t('networkScan.tooltips.stopPortScan')}
                                                >
                                                    {portScanStopping ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} fill="currentColor" />}
                                                </button>
                                            </>
                                        ) : (
                                            <span>{t('networkScan.table.headers.openPorts')}</span>
                                        )}
                                    </div>
                                </th>
                                <th className="text-left py-3 px-4 text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition-colors" onClick={() => {
                                    if (sortBy === 'avg1h') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                    else { setSortBy('avg1h'); setSortOrder('asc'); }
                                }}>
                                    <div className="flex items-center gap-2">
                                        <span>{t('networkScan.table.headers.avg1h')}</span>
                                        {sortBy === 'avg1h' && (
                                            sortOrder === 'asc' ? <ArrowUp size={14} className="text-blue-400" /> : <ArrowDown size={14} className="text-blue-400" />
                                        )}
                                    </div>
                                </th>
                                <th className="text-left py-3 px-4 text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition-colors" onClick={() => {
                                    if (sortBy === 'max') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                    else { setSortBy('max'); setSortOrder('asc'); }
                                }}>
                                    <div className="flex items-center gap-2">
                                        <span>{t('networkScan.table.headers.max')}</span>
                                        {sortBy === 'max' && (
                                            sortOrder === 'asc' ? <ArrowUp size={14} className="text-blue-400" /> : <ArrowDown size={14} className="text-blue-400" />
                                        )}
                                    </div>
                                </th>
                                <th className="text-left py-3 px-2 text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition-colors whitespace-nowrap" title={t('networkScan.tooltips.latencyMonitoring')} onClick={() => {
                                    if (sortBy === 'monitoring') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                    else { setSortBy('monitoring'); setSortOrder('asc'); }
                                }}>
                                    <div className="flex items-center gap-0.5">
                                        <span>{t('networkScan.table.headers.monitoring')}</span>
                                        {sortBy === 'monitoring' && (
                                            sortOrder === 'asc' ? <ArrowUp size={12} className="text-blue-400" /> : <ArrowDown size={12} className="text-blue-400" />
                                        )}
                                    </div>
                                </th>
                                <th className="text-left py-3 px-2 text-sm text-gray-400 cursor-pointer hover:text-gray-300 transition-colors whitespace-nowrap" title={t('networkScan.tooltips.firstDetection')} onClick={() => {
                                    if (sortBy === 'first_seen') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                    else { setSortBy('first_seen'); setSortOrder('desc'); }
                                }}>
                                    <div className="flex items-center gap-0.5">
                                        <span>{t('networkScan.table.headers.firstDetection')}</span>
                                        {sortBy === 'first_seen' && (
                                            sortOrder === 'asc' ? <ArrowUp size={12} className="text-blue-400" /> : <ArrowDown size={12} className="text-blue-400" />
                                        )}
                                    </div>
                                </th>
                                <th className="text-right py-3 pr-2 pl-0 text-sm text-gray-400 w-1 whitespace-nowrap">{t('networkScan.table.headers.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredScans.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="text-center py-8 text-gray-500">
                                        {isScanning || isRefreshing ? (
                                            <div className="flex items-center justify-center gap-2">
                                                <RefreshCw size={16} className="animate-spin text-blue-400" />
                                                <span>{t('networkScan.status.scanInProgress')}</span>
                                            </div>
                                        ) : (
                                            t('networkScan.table.noResults')
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
                                        <td
                                            className={`py-3 px-4 text-sm font-mono break-words cursor-default ${scan.status === 'offline' ? 'text-gray-500' : ''}`}
                                            onMouseEnter={(e) => {
                                                cancelTooltipHide();
                                                setFirstSeenTooltip(null);
                                                setMacTooltip(null);
                                                setPortsTooltip(null);
                                                setStatusTooltip(null);
                                                setLatencyTooltip(null);
                                                setHostnameTooltip(null);
                                                setVendorTooltip(null);
                                                setActionsTooltip(null);
                                                setMonitoringTooltip(null);
                                                setScatterIconTooltip(null);
                                                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                setIpTooltip({ label: t('networkScan.table.headers.ip'), text: t('networkScan.tooltips.clickToKnowMoreIp'), rect: { left: r.left, top: r.top, bottom: r.bottom, right: r.right } });
                                            }}
                                            onMouseLeave={() => scheduleTooltipHide()}
                                        >
                                            {onNavigateToSearch ? (
                                                <button
                                                    onClick={() => {
                                                        // Update URL with search parameter 's' instead of using sessionStorage
                                                        const urlParams = new URLSearchParams(window.location.search);
                                                        urlParams.set('s', scan.ip);
                                                        const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
                                                        window.history.pushState(null, '', newUrl);
                                                        // Navigate to search page (App.tsx will detect the 's' parameter)
                                                        onNavigateToSearch(scan.ip);
                                                    }}
                                                    className="text-left hover:text-cyan-400 transition-colors cursor-pointer inline-flex items-baseline gap-0.5"
                                                    style={scan.status !== 'offline' ? { color: 'rgb(152, 181, 238)' } : {}}
                                                    title={t('networkScan.tooltips.searchIp', { ip: scan.ip })}
                                                >
                                                    <span>{scan.ip}</span>
                                                    <Link2 size={9} className="opacity-50 relative top-[-2px]" />
                                                </button>
                                            ) : (
                                                <span style={scan.status !== 'offline' ? { color: 'rgb(152, 181, 238)' } : {}} title={scan.ip}>
                                                    {scan.ip}
                                                </span>
                                            )}
                                        </td>
                                        <td
                                            className="py-3 px-4 text-sm text-gray-300 cursor-default"
                                            onMouseEnter={(e) => {
                                                cancelTooltipHide();
                                                setFirstSeenTooltip(null);
                                                setMacTooltip(null);
                                                setPortsTooltip(null);
                                                setStatusTooltip(null);
                                                setLatencyTooltip(null);
                                                setVendorTooltip(null);
                                                setActionsTooltip(null);
                                                setMonitoringTooltip(null);
                                                setScatterIconTooltip(null);
                                                setIpTooltip(null);
                                                const badge = scan.hostnameSource ? getSourceBadge(scan.hostnameSource, 'hostname') : null;
                                                let text = scan.hostname || '--';
                                                if (badge) text += '\n' + t('networkScan.tooltips.source', { source: badge.label });
                                                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                setHostnameTooltip({ label: t('networkScan.table.headers.hostname'), text, rect: { left: r.left, top: r.top, bottom: r.bottom, right: r.right } });
                                            }}
                                            onMouseLeave={() => scheduleTooltipHide()}
                                        >
                                            {editingHostname === scan.ip ? (
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <input
                                                        id={`hostname-edit-${scan.ip}`}
                                                        name={`hostname-edit-${scan.ip}`}
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
                                                        title={t('networkScan.tooltips.save')}
                                                    >
                                                        <Save size={14} />
                                                    </button>
                                                    <button
                                                        onClick={handleCancelEditHostname}
                                                        className="p-1 hover:bg-red-500/10 text-red-400 rounded transition-colors flex-shrink-0"
                                                        title={t('networkScan.tooltips.cancel')}
                                                    >
                                                        <XIcon size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-start gap-2 group flex-wrap">
                                                    <span className="break-words whitespace-normal">{scan.hostname || '--'}</span>
                                                    {scan.hostnameSource && (() => {
                                                        const badge = getSourceBadge(scan.hostnameSource, 'hostname');
                                                        return badge ? (
                                                            <span className={`px-1.5 py-0.5 text-xs rounded ${badge.bgColor} ${badge.color} whitespace-nowrap flex-shrink-0`}>
                                                                {badge.label}
                                                            </span>
                                                        ) : null;
                                                    })()}
                                                    <button
                                                        onClick={() => handleStartEditHostname(scan.ip, scan.hostname || '')}
                                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-500/10 text-blue-400 rounded transition-all flex-shrink-0"
                                                        title={t('networkScan.tooltips.rename')}
                                                    >
                                                        <Edit2 size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                        <td
                                            className="py-3 px-4 text-sm text-gray-300 cursor-default"
                                            onMouseEnter={(e) => {
                                                cancelTooltipHide();
                                                setFirstSeenTooltip(null);
                                                setMacTooltip(null);
                                                setPortsTooltip(null);
                                                setStatusTooltip(null);
                                                setLatencyTooltip(null);
                                                setHostnameTooltip(null);
                                                setActionsTooltip(null);
                                                setMonitoringTooltip(null);
                                                setScatterIconTooltip(null);
                                                setIpTooltip(null);
                                                const badge = scan.vendorSource ? getSourceBadge(scan.vendorSource, 'vendor') : null;
                                                let text = scan.vendor || '--';
                                                if (badge) text += '\n' + t('networkScan.tooltips.source', { source: badge.label });
                                                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                setVendorTooltip({ label: t('networkScan.table.headers.vendor'), text, rect: { left: r.left, top: r.top, bottom: r.bottom, right: r.right } });
                                            }}
                                            onMouseLeave={() => scheduleTooltipHide()}
                                        >
                                            <div className="flex items-start gap-2 flex-wrap">
                                                <span className="break-words whitespace-normal">{scan.vendor || '--'}</span>
                                                {scan.vendorSource && (() => {
                                                    const badge = getSourceBadge(scan.vendorSource, 'vendor');
                                                    return badge ? (
                                                        <span className={`px-1.5 py-0.5 text-xs rounded ${badge.bgColor} ${badge.color} whitespace-nowrap flex-shrink-0`}>
                                                            {badge.label}
                                                        </span>
                                                    ) : null;
                                                })()}
                                            </div>
                                        </td>
                                        <td
                                            className="py-3 px-2 text-sm font-mono text-gray-400 whitespace-nowrap cursor-default"
                                            onMouseEnter={(e) => {
                                                cancelTooltipHide();
                                                setFirstSeenTooltip(null);
                                                setPortsTooltip(null);
                                                setStatusTooltip(null);
                                                setLatencyTooltip(null);
                                                setHostnameTooltip(null);
                                                setVendorTooltip(null);
                                                setActionsTooltip(null);
                                                setMonitoringTooltip(null);
                                                setScatterIconTooltip(null);
                                                setIpTooltip(null);
                                                const mac = scan.mac?.trim() || '--';
                                                if (mac === '--') return;
                                                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                setMacTooltip({ mac, rect: { left: r.left, top: r.top, bottom: r.bottom, right: r.right } });
                                            }}
                                            onMouseLeave={() => scheduleTooltipHide()}
                                        >
                                            {(() => {
                                                const mac = scan.mac?.trim() || '--';
                                                if (mac === '--' || mac.length <= 8) return mac;
                                                return mac.slice(0, 8) + '…';
                                            })()}
                                        </td>
                                        <td
                                            className="py-3 px-2 w-16 cursor-default"
                                            onMouseEnter={(e) => {
                                                cancelTooltipHide();
                                                setFirstSeenTooltip(null);
                                                setMacTooltip(null);
                                                setPortsTooltip(null);
                                                setLatencyTooltip(null);
                                                setHostnameTooltip(null);
                                                setVendorTooltip(null);
                                                setActionsTooltip(null);
                                                setMonitoringTooltip(null);
                                                setScatterIconTooltip(null);
                                                setIpTooltip(null);
                                                const text = scan.status === 'online' ? t('networkScan.tooltips.online') : scan.status === 'offline' ? t('networkScan.tooltips.offline') : t('networkScan.tooltips.unknown');
                                                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                setStatusTooltip({ label: t('networkScan.table.headers.status'), text, rect: { left: r.left, top: r.top, bottom: r.bottom, right: r.right } });
                                            }}
                                            onMouseLeave={() => scheduleTooltipHide()}
                                        >
                                            {scan.status === 'online' ? (
                                                <span><CheckCircle size={16} className="text-emerald-400 flex-shrink-0 mx-auto" /></span>
                                            ) : scan.status === 'offline' ? (
                                                <span><XCircle size={16} className="text-red-400 flex-shrink-0 mx-auto" /></span>
                                            ) : (
                                                <span><Clock size={16} className="text-gray-400 flex-shrink-0 mx-auto" /></span>
                                            )}
                                        </td>
                                        <td
                                            className="py-3 px-4 cursor-default"
                                            onMouseEnter={(e) => {
                                                cancelTooltipHide();
                                                setFirstSeenTooltip(null);
                                                setMacTooltip(null);
                                                setPortsTooltip(null);
                                                setStatusTooltip(null);
                                                setHostnameTooltip(null);
                                                setVendorTooltip(null);
                                                setActionsTooltip(null);
                                                setMonitoringTooltip(null);
                                                setScatterIconTooltip(null);
                                                setIpTooltip(null);
                                                const text = scan.status === 'offline'
                                                    ? t('networkScan.tooltips.offSince', { date: formatDate(scan.lastSeen) })
                                                    : t('networkScan.tooltips.lastPing', { date: formatDate(scan.lastSeen), latency: formatLatency(scan.pingLatency) });
                                                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                setLatencyTooltip({ label: t('networkScan.table.headers.latency'), text, rect: { left: r.left, top: r.top, bottom: r.bottom, right: r.right } });
                                            }}
                                            onMouseLeave={() => scheduleTooltipHide()}
                                        >
                                            {scan.status === 'offline' ? (
                                                <span className="text-sm text-gray-500 whitespace-nowrap">
                                                    {formatDate(scan.lastSeen)}
                                                </span>
                                            ) : (
                                                <span className={`text-sm font-medium break-words whitespace-normal ${getLatencyColor(scan.pingLatency)}`}>
                                                    {formatLatency(scan.pingLatency)}
                                                </span>
                                            )}
                                        </td>
                                        <td
                                            className="py-3 px-4 text-sm text-gray-400 font-mono cursor-default"
                                            onMouseEnter={(e) => {
                                                cancelTooltipHide();
                                                setFirstSeenTooltip(null);
                                                setMacTooltip(null);
                                                setStatusTooltip(null);
                                                setLatencyTooltip(null);
                                                setHostnameTooltip(null);
                                                setVendorTooltip(null);
                                                setActionsTooltip(null);
                                                setMonitoringTooltip(null);
                                                setScatterIconTooltip(null);
                                                setIpTooltip(null);
                                                const addInfo = scan.additionalInfo as { openPorts?: { port: number; protocol?: string }[]; lastPortScan?: string } | undefined;
                                                const openPorts = addInfo?.openPorts;
                                                const lastPortScan = addInfo?.lastPortScan;
                                                const hasPorts = Array.isArray(openPorts) && openPorts.length > 0;
                                                if (!hasPorts && !lastPortScan) return;
                                                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                setPortsTooltip({
                                                    ip: scan.ip,
                                                    openPorts: (openPorts ?? []).map((p) => ({ port: p.port, protocol: (p as { protocol?: string }).protocol })),
                                                    lastPortScan,
                                                    rect: { left: r.left, top: r.top, bottom: r.bottom, right: r.right }
                                                });
                                            }}
                                            onMouseLeave={() => scheduleTooltipHide()}
                                        >
                                            {(() => {
                                                const addInfo = scan.additionalInfo as { openPorts?: { port: number }[]; lastPortScan?: string } | undefined;
                                                const openPorts = addInfo?.openPorts;
                                                const lastPortScan = addInfo?.lastPortScan;
                                                const hasPorts = Array.isArray(openPorts) && openPorts.length > 0;
                                                if (portScanProgress?.active) {
                                                    if (portScanProgress.currentIp === scan.ip) {
                                                        return <span className="text-amber-400">{t('networkScan.status.inProgress')}</span>;
                                                    }
                                                    if (scan.status === 'online' && !lastPortScan) {
                                                        return <span className="text-gray-500">{t('networkScan.status.pending')}</span>;
                                                    }
                                                }
                                                if (hasPorts) {
                                                    return (openPorts as { port: number }[])
                                                        .map((p) => p.port)
                                                        .sort((a, b) => a - b)
                                                        .join(', ');
                                                }
                                                if (lastPortScan) {
                                                    return <span className="text-gray-500">{t('networkScan.status.none')}</span>;
                                                }
                                                return <span className="text-gray-500">{t('networkScan.status.notScanned')}</span>;
                                            })()}
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
                                        <td
                                            className="py-3 px-2 whitespace-nowrap cursor-default"
                                            onMouseEnter={(e) => {
                                                cancelTooltipHide();
                                                setFirstSeenTooltip(null);
                                                setMacTooltip(null);
                                                setPortsTooltip(null);
                                                setStatusTooltip(null);
                                                setLatencyTooltip(null);
                                                setHostnameTooltip(null);
                                                setVendorTooltip(null);
                                                setActionsTooltip(null);
                                                setScatterIconTooltip(null);
                                                setIpTooltip(null);
                                                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                const isActive = monitoringStatus[scan.ip];
                                                const text = isActive ? t('networkScan.tooltips.monitoringShortOn') : t('networkScan.tooltips.monitoringShortOff');
                                                const linkText = isActive ? t('networkScan.tooltips.monitoringOpenScatter') : undefined;
                                                setMonitoringTooltip({ label: t('networkScan.table.headers.monitoring'), text, linkText, rect: { left: r.left, top: r.top, bottom: r.bottom, right: r.right } });
                                            }}
                                            onMouseLeave={() => scheduleTooltipHide()}
                                        >
                                            <div className="flex items-center gap-0.5">
                                                <button
                                                    onClick={() => handleToggleMonitoring(scan.ip, !monitoringStatus[scan.ip])}
                                                    className="p-0.5 hover:bg-blue-500/10 rounded transition-colors"
                                                    title={monitoringStatus[scan.ip] ? t('networkScan.tooltips.disableMonitoring') : t('networkScan.tooltips.enableMonitoring')}
                                                >
                                                    {monitoringStatus[scan.ip] ? (
                                                        <ToggleRight size={16} className="text-blue-400" />
                                                    ) : (
                                                        <ToggleLeft size={16} className="text-gray-500" />
                                                    )}
                                                </button>
                                                {monitoringStatus[scan.ip] && (
                                                    <button
                                                        onClick={() => handleOpenLatencyGraph(scan.ip)}
                                                        className="p-0.5 hover:bg-green-500/10 text-green-400 rounded transition-colors"
                                                        aria-label={t('networkScan.tooltips.openScatterTable')}
                                                        onMouseEnter={(e) => {
                                                            cancelTooltipHide();
                                                            setFirstSeenTooltip(null);
                                                            setMacTooltip(null);
                                                            setPortsTooltip(null);
                                                            setStatusTooltip(null);
                                                            setLatencyTooltip(null);
                                                            setHostnameTooltip(null);
                                                            setVendorTooltip(null);
                                                            setActionsTooltip(null);
                                                            setMonitoringTooltip(null);
                                                            setIpTooltip(null);
                                                            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                            setScatterIconTooltip({ rect: { left: r.left, top: r.top, bottom: r.bottom, right: r.right } });
                                                        }}
                                                        onMouseLeave={() => scheduleTooltipHide()}
                                                    >
                                                        <BarChart2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td
                                            className="py-3 px-2 text-sm text-gray-400 whitespace-nowrap cursor-default"
                                            onMouseEnter={(e) => {
                                                cancelTooltipHide();
                                                setFirstSeenTooltip(null);
                                                setMacTooltip(null);
                                                setPortsTooltip(null);
                                                setStatusTooltip(null);
                                                setLatencyTooltip(null);
                                                setHostnameTooltip(null);
                                                setVendorTooltip(null);
                                                setActionsTooltip(null);
                                                setMonitoringTooltip(null);
                                                setScatterIconTooltip(null);
                                                setIpTooltip(null);
                                                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                setFirstSeenTooltip({
                                                    fullDate: formatDate(scan.firstSeen),
                                                    rect: { left: r.left, top: r.top, bottom: r.bottom, right: r.right }
                                                });
                                            }}
                                            onMouseLeave={() => scheduleTooltipHide()}
                                        >
                                            {formatFirstDetectionShort(scan.firstSeen)}
                                        </td>
                                        <td className="py-3 pr-2 pl-0 text-right w-1 whitespace-nowrap">
                                            <div className="flex items-center gap-1 justify-end">
                                                <button
                                                    onClick={() => handleRescan(scan.ip, scan.status)}
                                                    disabled={rescanningIp === scan.ip || scan.status === 'offline'}
                                                    className="p-1 hover:bg-yellow-500/10 text-yellow-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title={scan.status === 'offline' ? t('networkScan.tooltips.rescanOfflineDisabled') : t('networkScan.tooltips.rescan')}
                                                    onMouseEnter={(e) => {
                                                        cancelTooltipHide();
                                                        setFirstSeenTooltip(null);
                                                        setMacTooltip(null);
                                                        setPortsTooltip(null);
                                                        setStatusTooltip(null);
                                                        setLatencyTooltip(null);
                                                        setHostnameTooltip(null);
                                                        setVendorTooltip(null);
                                                        setMonitoringTooltip(null);
                                                        setScatterIconTooltip(null);
                                                        setIpTooltip(null);
                                                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                        const actionText = scan.status === 'offline' ? t('networkScan.tooltips.rescanOfflineDisabled') : t('networkScan.tooltips.rescan');
                                                        setActionsTooltip({ label: t('networkScan.table.headers.actions'), text: actionText, rect: { left: r.left, top: r.top, bottom: r.bottom, right: r.right } });
                                                    }}
                                                    onMouseLeave={() => scheduleTooltipHide()}
                                                >
                                                    {rescanSuccessIp === scan.ip ? (
                                                        <CheckCircle size={16} className="text-emerald-400" />
                                                    ) : rescanningIp === scan.ip ? (
                                                        <Loader2 size={16} className="animate-spin" />
                                                    ) : (
                                                        <RefreshCw size={16} />
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => handleBan(scan.ip)}
                                                    className="p-1 hover:bg-orange-500/10 text-orange-400 rounded transition-colors"
                                                    title={t('networkScan.tooltips.banIp')}
                                                    onMouseEnter={(e) => {
                                                        cancelTooltipHide();
                                                        setFirstSeenTooltip(null);
                                                        setMacTooltip(null);
                                                        setPortsTooltip(null);
                                                        setStatusTooltip(null);
                                                        setLatencyTooltip(null);
                                                        setHostnameTooltip(null);
                                                        setVendorTooltip(null);
                                                        setMonitoringTooltip(null);
                                                        setScatterIconTooltip(null);
                                                        setIpTooltip(null);
                                                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                        setActionsTooltip({ label: t('networkScan.table.headers.actions'), text: t('networkScan.tooltips.banIp'), rect: { left: r.left, top: r.top, bottom: r.bottom, right: r.right } });
                                                    }}
                                                    onMouseLeave={() => scheduleTooltipHide()}
                                                >
                                                    <ShieldX size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(scan.ip)}
                                                    className="p-1 hover:bg-red-500/10 text-red-400 rounded transition-colors"
                                                    title={t('networkScan.tooltips.delete')}
                                                    onMouseEnter={(e) => {
                                                        cancelTooltipHide();
                                                        setFirstSeenTooltip(null);
                                                        setMacTooltip(null);
                                                        setPortsTooltip(null);
                                                        setStatusTooltip(null);
                                                        setLatencyTooltip(null);
                                                        setHostnameTooltip(null);
                                                        setVendorTooltip(null);
                                                        setMonitoringTooltip(null);
                                                        setScatterIconTooltip(null);
                                                        setIpTooltip(null);
                                                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                        setActionsTooltip({ label: t('networkScan.table.headers.actions'), text: t('networkScan.tooltips.delete'), rect: { left: r.left, top: r.top, bottom: r.bottom, right: r.right } });
                                                    }}
                                                    onMouseLeave={() => scheduleTooltipHide()}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Hover tooltips tableau - au-dessus/en dessous de la ligne, horizontalement dans le tableau */}
            {macTooltip && (() => {
                const tr = tableContainerRef.current?.getBoundingClientRect();
                const pos = getTooltipPosition(macTooltip.rect, TOOLTIP_MAC_W, TOOLTIP_MAC_H, tr ? { tableRect: { left: tr.left, right: tr.right } } : undefined);
                return (
                    <div
                        className="fixed z-[100] rounded-xl border border-gray-600/80 bg-[#141414] shadow-2xl shadow-black/50 backdrop-blur-sm py-4 px-5 w-[min(340px,calc(100vw-32px))]"
                        style={{ left: pos.left, top: pos.top }}
                    onMouseEnter={cancelTooltipHide}
                    onMouseLeave={hideAllTooltips}
                    >
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{t('networkScan.tooltips.macAddress')}</div>
                        <div className="text-xl font-mono text-gray-100 break-all leading-relaxed">{macTooltip.mac}</div>
                    </div>
                );
            })()}

            {statusTooltip && (() => {
                const tr = tableContainerRef.current?.getBoundingClientRect();
                const pos = getTooltipPosition(statusTooltip.rect, 260, 72, tr ? { tableRect: { left: tr.left, right: tr.right } } : undefined);
                return (
                    <div
                        className="fixed z-[100] rounded-xl border border-gray-600/80 bg-[#141414] shadow-2xl shadow-black/50 backdrop-blur-sm py-4 px-5"
                        style={{ left: pos.left, top: pos.top }}
                        onMouseEnter={cancelTooltipHide}
                        onMouseLeave={hideAllTooltips}
                    >
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{statusTooltip.label}</div>
                        <div className="text-sm text-gray-100">{statusTooltip.text}</div>
                    </div>
                );
            })()}

            {latencyTooltip && (() => {
                const tr = tableContainerRef.current?.getBoundingClientRect();
                const pos = getTooltipPosition(latencyTooltip.rect, 280, 72, tr ? { tableRect: { left: tr.left, right: tr.right } } : undefined);
                return (
                    <div
                        className="fixed z-[100] rounded-xl border border-gray-600/80 bg-[#141414] shadow-2xl shadow-black/50 backdrop-blur-sm py-4 px-5"
                        style={{ left: pos.left, top: pos.top }}
                        onMouseEnter={cancelTooltipHide}
                        onMouseLeave={hideAllTooltips}
                    >
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{latencyTooltip.label}</div>
                        <div className="text-sm text-gray-100">{latencyTooltip.text}</div>
                    </div>
                );
            })()}

            {hostnameTooltip && (() => {
                const tr = tableContainerRef.current?.getBoundingClientRect();
                const pos = getTooltipPosition(hostnameTooltip.rect, 280, 72, tr ? { tableRect: { left: tr.left, right: tr.right } } : undefined);
                return (
                    <div
                        className="fixed z-[100] rounded-xl border border-gray-600/80 bg-[#141414] shadow-2xl shadow-black/50 backdrop-blur-sm py-4 px-5"
                        style={{ left: pos.left, top: pos.top }}
                        onMouseEnter={cancelTooltipHide}
                        onMouseLeave={hideAllTooltips}
                    >
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{hostnameTooltip.label}</div>
                        <div className="text-sm text-gray-100 whitespace-pre-line">{hostnameTooltip.text}</div>
                    </div>
                );
            })()}

            {vendorTooltip && (() => {
                const tr = tableContainerRef.current?.getBoundingClientRect();
                const pos = getTooltipPosition(vendorTooltip.rect, 280, 72, tr ? { tableRect: { left: tr.left, right: tr.right } } : undefined);
                return (
                    <div
                        className="fixed z-[100] rounded-xl border border-gray-600/80 bg-[#141414] shadow-2xl shadow-black/50 backdrop-blur-sm py-4 px-5"
                        style={{ left: pos.left, top: pos.top }}
                        onMouseEnter={cancelTooltipHide}
                        onMouseLeave={hideAllTooltips}
                    >
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{vendorTooltip.label}</div>
                        <div className="text-sm text-gray-100 whitespace-pre-line">{vendorTooltip.text}</div>
                    </div>
                );
            })()}

            {actionsTooltip && (() => {
                const tr = tableContainerRef.current?.getBoundingClientRect();
                const pos = getTooltipPosition(actionsTooltip.rect, 280, 88, tr ? { tableRect: { left: tr.left, right: tr.right } } : undefined);
                return (
                    <div
                        className="fixed z-[100] rounded-xl border border-gray-600/80 bg-[#141414] shadow-2xl shadow-black/50 backdrop-blur-sm py-4 px-5"
                        style={{ left: pos.left, top: pos.top }}
                        onMouseEnter={cancelTooltipHide}
                        onMouseLeave={hideAllTooltips}
                    >
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{actionsTooltip.label}</div>
                        <div className="text-sm text-gray-100 whitespace-pre-line">{actionsTooltip.text}</div>
                    </div>
                );
            })()}

            {monitoringTooltip && (() => {
                const tr = tableContainerRef.current?.getBoundingClientRect();
                const pos = getTooltipPosition(monitoringTooltip.rect, 260, 72, tr ? { preferAbove: true, offsetX: 140, offsetY: 24, tableRect: { left: tr.left, right: tr.right } } : { preferAbove: true, offsetX: 140, offsetY: 24 });
                return (
                    <div
                        className="fixed z-[100] rounded-xl border border-gray-600/80 bg-[#141414] shadow-2xl shadow-black/50 backdrop-blur-sm py-3 px-4"
                        style={{ left: pos.left, top: pos.top }}
                        onMouseEnter={cancelTooltipHide}
                        onMouseLeave={hideAllTooltips}
                    >
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">{monitoringTooltip.label}</div>
                        <div className="text-sm text-gray-100">{monitoringTooltip.text}</div>
                        {monitoringTooltip.linkText && (
                            <div className="text-sm text-cyan-400 mt-1 font-medium">{monitoringTooltip.linkText}</div>
                        )}
                    </div>
                );
            })()}

            {scatterIconTooltip && (() => {
                const tr = tableContainerRef.current?.getBoundingClientRect();
                const pos = getTooltipPosition(scatterIconTooltip.rect, 260, 70, tr ? { tableRect: { left: tr.left, right: tr.right } } : undefined);
                return (
                    <div
                        className="fixed z-[100] rounded-xl border border-gray-600/80 bg-[#141414] shadow-2xl shadow-black/50 backdrop-blur-sm py-4 px-5"
                        style={{ left: pos.left, top: pos.top }}
                        onMouseEnter={cancelTooltipHide}
                        onMouseLeave={hideAllTooltips}
                    >
                        <div className="text-sm text-gray-100 whitespace-pre-line">{t('networkScan.tooltips.openScatterTable')}{'\n'}{t('networkScan.tooltips.clickToOpenScatter')}</div>
                    </div>
                );
            })()}

            {ipTooltip && (() => {
                const tr = tableContainerRef.current?.getBoundingClientRect();
                const pos = getTooltipPosition(ipTooltip.rect, 280, 88, tr ? { tableRect: { left: tr.left, right: tr.right } } : undefined);
                return (
                    <div
                        className="fixed z-[100] rounded-xl border border-gray-600/80 bg-[#141414] shadow-2xl shadow-black/50 backdrop-blur-sm py-4 px-5"
                        style={{ left: pos.left, top: pos.top }}
                        onMouseEnter={cancelTooltipHide}
                        onMouseLeave={hideAllTooltips}
                    >
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{ipTooltip.label}</div>
                        <div className="text-sm text-gray-100 whitespace-pre-line">{ipTooltip.text}</div>
                    </div>
                );
            })()}

            {firstSeenTooltip && (() => {
                const tr = tableContainerRef.current?.getBoundingClientRect();
                const pos = getTooltipPosition(firstSeenTooltip.rect, 260, 72, tr ? { tableRect: { left: tr.left, right: tr.right } } : undefined);
                return (
                    <div
                        className="fixed z-[100] rounded-xl border border-gray-600/80 bg-[#141414] shadow-2xl shadow-black/50 backdrop-blur-sm py-4 px-5"
                        style={{ left: pos.left, top: pos.top }}
                        onMouseEnter={cancelTooltipHide}
                        onMouseLeave={hideAllTooltips}
                    >
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{t('networkScan.table.headers.firstDetection')}</div>
                        <div className="text-sm text-gray-100">{firstSeenTooltip.fullDate}</div>
                    </div>
                );
            })()}

            {portsTooltip && (() => {
                const tr = tableContainerRef.current?.getBoundingClientRect();
                const portsMaxH = typeof window !== 'undefined' ? Math.min(TOOLTIP_PORTS_H, Math.floor(window.innerHeight * 0.7)) : TOOLTIP_PORTS_H;
                const pos = getTooltipPosition(portsTooltip.rect, TOOLTIP_PORTS_W, portsMaxH, tr ? { tableRect: { left: tr.left, right: tr.right } } : undefined);
                const sorted = [...portsTooltip.openPorts].sort((a, b) => a.port - b.port);
                const byCategory = sorted.reduce<Record<string, { port: number; protocol?: string }[]>>((acc, p) => {
                    const cat = getPortCategory(p.port);
                    if (!acc[cat]) acc[cat] = [];
                    acc[cat].push(p);
                    return acc;
                }, {});
                const categoryOrder = ['web', 'databases', 'mail', 'system', 'remoteAccess', 'docker', 'other'];
                const orderedCategories = categoryOrder.filter((c) => byCategory[c]?.length).concat(Object.keys(byCategory).filter((c) => !categoryOrder.includes(c)));
                return (
                    <div
                        className="fixed z-[100] rounded-xl border border-gray-600/80 bg-[#141414] shadow-2xl shadow-black/50 backdrop-blur-sm py-4 px-5 w-[min(420px,calc(100vw-32px))] overflow-y-auto"
                        style={{ left: pos.left, top: pos.top, maxHeight: portsMaxH }}
                        onMouseEnter={cancelTooltipHide}
                        onMouseLeave={hideAllTooltips}
                    >
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">{portsTooltip.ip}</div>
                        {sorted.length > 0 ? (
                            <div className="space-y-3">
                                {orderedCategories.map((cat) => {
                                    const colors = getPortCategoryColor(cat);
                                    return (
                                        <div key={cat}>
                                            <div className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${colors.label}`}>{t(`networkScan.portCategories.${cat}`)}</div>
                                            <div className="grid grid-cols-3 gap-x-3 gap-y-1">
                                                {byCategory[cat].map((p) => {
                                                    const Icon = getPortIcon(p.port);
                                                    return (
                                                        <div key={p.port} className={`flex items-center gap-2 py-1.5 px-2 rounded-lg border ${colors.cell}`}>
                                                            <Icon size={14} className={`${colors.icon} flex-shrink-0`} />
                                                            <span className="font-mono text-sm">{p.port}</span>
                                                            {WELL_KNOWN_PORTS[p.port] ? <span className="text-xs opacity-90 truncate" title={WELL_KNOWN_PORTS[p.port]}>{WELL_KNOWN_PORTS[p.port]}</span> : null}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-sm text-gray-500 py-1">{t('networkScan.ports.noOpenPorts')}</div>
                        )}
                        {portsTooltip.lastPortScan && (
                            <div className="mt-3 pt-3 border-t border-gray-700/80 text-xs text-gray-500">
                                Scan : {new Date(portsTooltip.lastPortScan).toLocaleString(currentLocale)}
                            </div>
                        )}
                    </div>
                );
            })()}

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
                        // Clear local state IMMEDIATELY (before API calls)
                        setScans([]);
                        setStats(null);
                        setStatsHistory([]);
                        setLastScanSummary(null);
                        setScanProgress(null);
                        setCurrentScanRange('');
                        
                        // Reload all data when scans are cleared
                        try {
                            await Promise.all([
                                fetchHistory(),
                                fetchStats(),
                                fetchStatsHistory(),
                                fetchWiresharkVendorStats()
                            ]);
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
                                <label htmlFor="manual-ip" className="block text-sm font-medium text-theme-secondary mb-2">
                                    Adresse IP <span className="text-red-400">*</span>
                                </label>
                                <input
                                    id="manual-ip"
                                    name="manual-ip"
                                    type="text"
                                    value={manualIp}
                                    onChange={(e) => setManualIp(e.target.value)}
                                    placeholder="192.168.1.100"
                                    className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    disabled={isAddingIp}
                                />
                            </div>
                            
                            <div>
                                <label htmlFor="manual-mac" className="block text-sm font-medium text-theme-secondary mb-2">
                                    MAC (optionnel)
                                </label>
                                <input
                                    id="manual-mac"
                                    name="manual-mac"
                                    type="text"
                                    value={manualMac}
                                    onChange={(e) => setManualMac(e.target.value)}
                                    placeholder="aa:bb:cc:dd:ee:ff"
                                    className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    disabled={isAddingIp}
                                />
                            </div>
                            
                            <div>
                                <label htmlFor="manual-hostname" className="block text-sm font-medium text-theme-secondary mb-2">
                                    Hostname (optionnel)
                                </label>
                                <input
                                    id="manual-hostname"
                                    name="manual-hostname"
                                    type="text"
                                    value={manualHostname}
                                    onChange={(e) => setManualHostname(e.target.value)}
                                    placeholder="Mon-PC"
                                    className="w-full px-4 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    disabled={isAddingIp}
                                />
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

            <ToastContainer toasts={toasts} onClose={removeToast} />
        </div>
    );
};

