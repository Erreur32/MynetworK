/**
 * Search Results Page
 * 
 * Displays search results from all active plugins
 * with filtering, sorting, and pagination
 */

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight, Loader2, X, CheckCircle, AlertCircle, Server, Wifi, RotateCw, Power, Info, Network, Globe, Home, Router, Cable, Radio, Activity, Clock, Signal, Zap, Link2, ArrowUpDown as ArrowUpDownIcon, BarChart2, History, FolderInput, Terminal, Mail, Lock, Share2, Database, Monitor, Container } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '../components/widgets/Card';
import { api } from '../api/client';
import { usePluginStore } from '../stores/pluginStore';
import { SearchOptionsInfoModal } from '../components/modals/SearchOptionsInfoModal';
import { LatencyMonitoringModal } from '../components/modals/LatencyMonitoringModal';
import { SearchHistoryModal, type SearchHistoryEntry } from '../components/modals/SearchHistoryModal';
import logoFreebox from '../icons/logo_ultra.svg';
import logoUnifi from '../icons/logo_unifi.svg';

/** Ports connus : numéro → nom du service (comme sur la page Scan) */
const WELL_KNOWN_PORTS: Record<number, string> = {
    20: 'FTP-DATA', 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3',
    143: 'IMAP', 443: 'HTTPS', 445: 'SMB', 993: 'IMAPS', 995: 'POP3S', 1433: 'SQL Server', 3306: 'MySQL',
    3389: 'RDP', 5432: 'PostgreSQL', 5900: 'VNC', 6379: 'Redis', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt', 9000: 'PhpMyAdmin',
    2375: 'Docker', 2376: 'Docker TLS'
};

const PORT_ICONS: Record<number, LucideIcon> = {
    20: FolderInput, 21: FolderInput, 22: Terminal, 23: Terminal, 25: Mail, 53: Globe, 80: Globe,
    110: Mail, 143: Mail, 443: Lock, 445: Share2, 993: Mail, 995: Mail, 1433: Database, 3306: Database,
    3389: Monitor, 5432: Database, 5900: Monitor, 6379: Database, 8080: Globe, 8443: Lock, 9000: Server,
    2375: Container, 2376: Container
};
function getPortIcon(port: number): LucideIcon {
    return PORT_ICONS[port] ?? Server;
}

const PORT_CATEGORIES: Record<string, number[]> = {
    'Web': [80, 443, 8080, 8443, 9000],
    'Bases de données': [3306, 5432, 6379, 1433],
    'Mail': [25, 110, 143, 993, 995],
    'Système': [20, 21, 22, 23, 53, 445],
    'Accès distant': [3389, 5900],
    'Docker': [2375, 2376] // Docker daemon (à prévoir pour détection)
};
function getPortCategory(port: number): string {
    for (const [cat, ports] of Object.entries(PORT_CATEGORIES)) {
        if (ports.includes(port)) return cat;
    }
    return 'Autres';
}

/** Couleur par catégorie : Système = orange, Docker = indigo, reste = cyan */
function getPortCategoryColor(cat: string): { label: string; badge: string; icon: string } {
    switch (cat) {
        case 'Système':
            return { label: 'text-amber-400', badge: 'bg-amber-500/30 border-amber-500/50 text-amber-300', icon: 'text-amber-400/90' };
        case 'Docker':
            return { label: 'text-indigo-400', badge: 'bg-indigo-500/30 border-indigo-500/50 text-indigo-300', icon: 'text-indigo-400/90' };
        default:
            return { label: 'text-cyan-400', badge: 'bg-cyan-500/30 border-cyan-500/50 text-cyan-300', icon: 'text-cyan-400/90' };
    }
}

/** Position du tooltip ports pour rester dans la fenêtre */
function getPortsTooltipPosition(rect: { left: number; top: number; bottom: number; right: number }, w: number, h: number): { left: number; top: number } {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 300;
    const margin = 16;
    let left = rect.left;
    if (left + w > vw - margin) left = vw - w - margin;
    if (left < margin) left = margin;
    let top = rect.bottom + 6;
    if (top + h > vh - margin) top = rect.top - h - 8;
    if (top < margin) top = margin;
    return { left, top };
}

interface SearchResult {
    pluginId: string;
    pluginName: string;
    type: 'device' | 'dhcp' | 'port-forward' | 'client' | 'ap' | 'switch';
    id: string;
    name: string;
    ip?: string;
    mac?: string;
    port?: number | string;
    hostname?: string;
    active?: boolean;
    lastSeen?: string;
    additionalData?: Record<string, any>;
}

interface SearchResultData {
    query: string;
    count: number;
    results: SearchResult[];
}

interface IpDetailsResponse {
    ip: string;
    freebox?: {
        name?: string;
        mac?: string;
        dhcp?: {
            static?: boolean;
            hostname?: string;
            mac?: string;
            ip?: string;
            expires?: number;
            lease_time?: number;
            comment?: string;
        };
        portForwarding?: Array<{
            id?: string | number;
            wan_port_start: number;
            wan_port_end?: number;
            lan_port: number;
            lan_ip: string;
            ip_proto?: string;
            protocol?: string;
            enabled?: boolean;
            comment?: string;
            src_ip?: string;
        }>;
    };
    unifi?: {
        client?: {
            name?: string;
            mac?: string;
            hostname?: string;
            ip?: string;
            is_wired?: boolean;
            is_wireless?: boolean;
            ssid?: string;
            essid?: string;
            ap_name?: string;
            ap_mac?: string;
            sw_port?: number | string;
            sw_port_idx?: number;
            sw_mac?: string;
            sw_name?: string;
            rssi?: number;
            signal?: number;
            tx_rate?: number;
            rx_rate?: number;
        };
        ap?: {
            name?: string;
            mac?: string;
            ip?: string;
            model?: string;
            ssids?: string[];
        };
        switch?: {
            name?: string;
            mac?: string;
            ip?: string;
            model?: string;
        };
    };
    scanner?: {
        mac?: string;
        hostname?: string;
        vendor?: string;
        status?: string;
        pingLatency?: number;
        lastSeen?: string;
        additionalInfo?: {
            openPorts?: { port: number; protocol?: string }[];
            lastPortScan?: string;
        };
    };
}

const ITEMS_PER_PAGE = 20;

interface SearchPageProps {
    onBack?: () => void;
}

export const SearchPage: React.FC<SearchPageProps> = ({ onBack }) => {
    const { plugins } = usePluginStore();
    
    // Get query from URL parameter 's' (priority) or sessionStorage (fallback)
    const [searchQuery, setSearchQuery] = useState<string>(() => {
        // First, try to get from URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        const urlQuery = urlParams.get('s');
        if (urlQuery) {
            return urlQuery;
        }
        // Fallback to sessionStorage
        const query = sessionStorage.getItem('searchQuery') || '';
        if (sessionStorage.getItem('searchQuery')) {
            sessionStorage.removeItem('searchQuery');
        }
        return query;
    });
    
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false); // Track if a search has been performed
    const [ipDetails, setIpDetails] = useState<any | null>(null); // Aggregated IP details
    const [isExactIpSearch, setIsExactIpSearch] = useState(false); // Track if search is an exact IP
    
    // Search options
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [showOnlyActive, setShowOnlyActive] = useState(true); // Filter by default to show only active devices
    const [pingEnabled, setPingEnabled] = useState(false);
    const [pingResults, setPingResults] = useState<Record<string, { success: boolean; time?: number; error?: string }>>({});
    const [pingingIps, setPingingIps] = useState<Set<string>>(new Set());
    const [showOptionsInfoModal, setShowOptionsInfoModal] = useState(false);
    
    // Latency monitoring state
    const [monitoringStatus, setMonitoringStatus] = useState<Record<string, boolean>>({});
    const [selectedIpForLatencyGraph, setSelectedIpForLatencyGraph] = useState<string | null>(null);
    const [showLatencyModal, setShowLatencyModal] = useState(false);

    // Tooltip ports (recherche groupée) — comme sur la page Scan
    const [portsTooltip, setPortsTooltip] = useState<{
        ip: string;
        openPorts: { port: number; protocol?: string }[];
        lastPortScan?: string;
        rect: { left: number; top: number; bottom: number; right: number };
    } | null>(null);
    const PORTS_TOOLTIP_W = 420;
    const PORTS_TOOLTIP_H = 320;
    const tooltipHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hideAllTooltips = useCallback(() => setPortsTooltip(null), []);
    const scheduleTooltipHide = useCallback((ms = 80) => {
        if (tooltipHideTimeoutRef.current) clearTimeout(tooltipHideTimeoutRef.current);
        tooltipHideTimeoutRef.current = setTimeout(() => {
            setPortsTooltip(null);
            tooltipHideTimeoutRef.current = null;
        }, ms);
    }, []);
    const cancelTooltipHide = useCallback(() => {
        if (tooltipHideTimeoutRef.current) {
            clearTimeout(tooltipHideTimeoutRef.current);
            tooltipHideTimeoutRef.current = null;
        }
    }, []);

    // Search history (localStorage)
    const SEARCH_HISTORY_KEY = 'searchHistory';
    const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>(() => {
        try {
            const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    // Most used search terms (localStorage), top 5 as badges
    const SEARCH_TERM_COUNTS_KEY = 'searchTermCounts';
    const [searchTermCounts, setSearchTermCounts] = useState<Record<string, number>>(() => {
        try {
            const raw = localStorage.getItem(SEARCH_TERM_COUNTS_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    });
    const topSearchTerms = useMemo(() => {
        const entries = Object.entries(searchTermCounts) as [string, number][];
        const withCount = entries.filter(([, count]) => count > 0);
        withCount.sort((a, b) => b[1] - a[1]);
        return withCount.slice(0, 5).map(([term]) => term);
    }, [searchTermCounts]);

    const addToSearchHistory = (query: string, opts: { caseSensitive: boolean; showOnlyActive: boolean }) => {
        const trimmed = query.trim();
        const entry: SearchHistoryEntry = {
            query: trimmed,
            timestamp: Date.now(),
            caseSensitive: opts.caseSensitive,
            showOnlyActive: opts.showOnlyActive
        };
        setSearchHistory(prev => {
            const filtered = prev.filter(e => !(e.query === entry.query && e.caseSensitive === entry.caseSensitive && e.showOnlyActive === entry.showOnlyActive));
            const next = [entry, ...filtered].slice(0, 100);
            try {
                localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
            } catch { /* ignore */ }
            return next;
        });
        // Comptage des termes les plus recherchés (pour les badges)
        if (trimmed) {
            setSearchTermCounts(prev => {
                const next = { ...prev, [trimmed]: (prev[trimmed] ?? 0) + 1 };
                try {
                    localStorage.setItem(SEARCH_TERM_COUNTS_KEY, JSON.stringify(next));
                } catch { /* ignore */ }
                return next;
            });
        }
    };

    const removeFromSearchHistory = (index: number) => {
        setSearchHistory(prev => {
            const next = prev.filter((_, i) => i !== index);
            try {
                localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
            } catch { /* ignore */ }
            return next;
        });
    };

    const clearAllSearchHistory = () => {
        setSearchHistory([]);
        try {
            localStorage.removeItem(SEARCH_HISTORY_KEY);
        } catch { /* ignore */ }
    };

    // Utility function to get latency color based on value
    const getLatencyColor = (latency: number): string => {
        if (latency < 10) return 'text-emerald-400';
        if (latency < 30) return 'text-emerald-300';
        if (latency < 50) return 'text-yellow-400';
        if (latency < 100) return 'text-orange-400';
        return 'text-red-400';
    };

    // Utility function to get latency background color based on value
    const getLatencyBgColor = (latency: number): string => {
        if (latency < 10) return 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400';
        if (latency < 30) return 'bg-emerald-400/20 border border-emerald-400/50 text-emerald-300';
        if (latency < 50) return 'bg-yellow-500/20 border border-yellow-500/50 text-yellow-400';
        if (latency < 100) return 'bg-orange-500/20 border border-orange-500/50 text-orange-400';
        return 'bg-red-500/20 border border-red-500/50 text-red-400';
    };

    // Utility function to get WiFi signal badge color based on RSSI value (similar to latency)
    const getSignalBadgeColor = (rssi: number | null | undefined): string => {
        if (rssi === null || rssi === undefined || isNaN(rssi)) {
            return 'bg-gray-500/20 border border-gray-500/50 text-gray-400';
        }
        if (rssi >= -50) return 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400';
        if (rssi >= -60) return 'bg-emerald-400/20 border border-emerald-400/50 text-emerald-300';
        if (rssi >= -70) return 'bg-yellow-500/20 border border-yellow-500/50 text-yellow-400';
        if (rssi >= -80) return 'bg-orange-500/20 border border-orange-500/50 text-orange-400';
        return 'bg-red-500/20 border border-red-500/50 text-red-400';
    };
    
    // Get active plugins
    // For scan-réseau, connectionStatus is always true if enabled (no external connection needed)
    const activePlugins = useMemo(() => {
        return plugins.filter(p => {
            if (!p.enabled) return false;
            // Scan-réseau doesn't need external connection, so if enabled, it's "connected"
            if (p.id === 'scan-reseau') return true;
            return p.connectionStatus;
        });
    }, [plugins]);

    // Filters - Initialize with all active plugins by default
    const [selectedPlugins, setSelectedPlugins] = useState<string[]>([]);
    
    // Sorting
    const [sortField, setSortField] = useState<'name' | 'plugin' | 'ip' | 'mac'>('name');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);

    // Initialize selectedPlugins with all active plugins by default
    useEffect(() => {
        const activePluginIds = activePlugins.map(p => p.id);
        if (activePluginIds.length > 0 && selectedPlugins.length === 0) {
            // First load: select all active plugins
            setSelectedPlugins(activePluginIds);
        } else if (activePluginIds.length > 0) {
            // Keep only active plugins that are still available
            setSelectedPlugins(prev => prev.filter(id => activePluginIds.includes(id)));
        }
    }, [activePlugins, selectedPlugins.length]);

    // Check if IP is IPv4 and local (private range)
    const isLocalIPv4 = (ip?: string): boolean => {
        if (!ip) return false;
        // IPv4 regex
        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipv4Regex.test(ip)) return false;
        
        // Check if it's a private/local IP range
        const parts = ip.split('.').map(Number);
        if (parts.length !== 4 || parts.some(p => p < 0 || p > 255)) return false;
        
        // Private IP ranges:
        // 10.0.0.0/8
        // 172.16.0.0/12
        // 192.168.0.0/16
        // 127.0.0.0/8 (localhost)
        return (
            (parts[0] === 10) ||
            (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
            (parts[0] === 192 && parts[1] === 168) ||
            (parts[0] === 127)
        );
    };

    // Check if query is an exact IP address
    const isExactIp = (query: string): boolean => {
        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipv4Regex.test(query.trim())) return false;
        const parts = query.trim().split('.').map(Number);
        return parts.length === 4 && parts.every(p => p >= 0 && p <= 255);
    };

    // Check if query is an IP range (CIDR notation or range notation)
    const isIpRange = (query: string): boolean => {
        const trimmed = query.trim();
        // CIDR notation: 192.168.1.0/24
        if (trimmed.includes('/')) {
            const [network, cidrStr] = trimmed.split('/');
            const cidr = parseInt(cidrStr, 10);
            if (isNaN(cidr) || cidr < 0 || cidr > 32) return false;
            const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
            if (!ipv4Regex.test(network)) return false;
            const parts = network.split('.').map(Number);
            return parts.length === 4 && parts.every(p => p >= 0 && p <= 255);
        }
        // Range notation: 192.168.1.1-254 or 192.168.1.1-192.168.1.254
        if (trimmed.includes('-')) {
            const parts = trimmed.split('-');
            if (parts.length === 2) {
                const start = parts[0].trim();
                const end = parts[1].trim();
                const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
                // Check if start is a valid IP
                if (!ipv4Regex.test(start)) return false;
                const startParts = start.split('.').map(Number);
                if (startParts.length !== 4 || startParts.some(p => p < 0 || p > 255)) return false;
                // Check if end is a valid IP or just a number (last octet)
                if (ipv4Regex.test(end)) {
                    const endParts = end.split('.').map(Number);
                    return endParts.length === 4 && endParts.every(p => p >= 0 && p <= 255);
                } else {
                    // Just a number for the last octet
                    const endNum = parseInt(end, 10);
                    return !isNaN(endNum) && endNum >= 0 && endNum <= 255;
                }
            }
        }
        return false;
    };

    // Check if string is a valid IP (IPv4) or domain name
    const isValidIpOrDomain = (target?: string): boolean => {
        if (!target) return false;
        
        // Check if it's an IPv4 address
        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (ipv4Regex.test(target)) {
            const parts = target.split('.').map(Number);
            return parts.length === 4 && parts.every(p => p >= 0 && p <= 255);
        }
        
        // Check if it's a valid domain name (basic validation)
        // Domain regex: allows letters, numbers, dots, hyphens
        const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
        return domainRegex.test(target) || target === 'localhost';
    };

    // Ping an IP address or domain
    const pingIp = async (target: string, forceExternal: boolean = false): Promise<{ success: boolean; time?: number; error?: string }> => {
        // Check if target is valid
        if (!isValidIpOrDomain(target)) {
            return { success: false, error: 'Adresse IP ou domaine invalide' };
        }

        // For automatic ping, only ping local IPs (for security)
        // For manual ping (forceExternal=true), allow any IP/domain
        const isLocal = isLocalIPv4(target);
        if (!isLocal && !forceExternal) {
            // In automatic ping mode, skip external IPs for security
            return { success: false, error: 'Ping exterieur ignoré en mode automatique. Utilisez le bouton "Ping direct" pour pinger des IP externes.' };
        }

        try {
            // Fast ping: use count=1 for quick UP/DOWN check, but still store latency for display in results table
            const response = await api.get<{ success: boolean; result?: { latency: number } }>(`/api/speedtest/ping?target=${encodeURIComponent(target)}&count=1`);
            if (response.success && response.result && 'latency' in response.result && typeof response.result.latency === 'number') {
                // Store latency for display in results table
                const latency = Math.round(response.result.latency);
                return { success: true, time: latency > 0 ? latency : 1 };
            } else {
                return { success: false, error: 'Ping échoué' };
            }
        } catch (err: any) {
            // Handle socket errors gracefully
            const errorMessage = err.message || 'Erreur lors du ping';
            if (errorMessage.includes('socket') || errorMessage.includes('ended') || errorMessage.includes('ECONNRESET')) {
                return { success: false, error: 'Connexion interrompue' };
            }
            return { success: false, error: errorMessage };
        }
    };

    // Ping a single IP/domain manually
    const pingSingleTarget = async (target: string) => {
        if (!target) return;
        
        // Add to pinging set
        setPingingIps(prev => new Set(prev).add(target));
        
        try {
            // Force external ping if it's not local (for manual ping button)
            // This allows pinging external IPs/domains even if allowExternalPing toggle is off
            const isLocal = isLocalIPv4(target);
            const result = await pingIp(target, !isLocal);
            setPingResults(prev => ({ ...prev, [target]: result }));
        } catch (err) {
            setPingResults(prev => ({ ...prev, [target]: { success: false, error: 'Erreur' } }));
        } finally {
            setPingingIps(prev => {
                const newSet = new Set(prev);
                newSet.delete(target);
                return newSet;
            });
        }
    };

    // Ping all local IPs in current results (non-blocking)
    const pingAllResults = async (resultsToPing: SearchResult[]) => {
        if (!pingEnabled || resultsToPing.length === 0) return;

        // Ping all local IP addresses in results
        const ipsToPing = resultsToPing
            .filter(r => {
                if (!r.ip) return false;
                return isLocalIPv4(r.ip); // Only local IPs in automatic ping
            })
            .map(r => r.ip!)
            .filter((ip, index, self) => self.indexOf(ip) === index); // Unique IPs

        if (ipsToPing.length === 0) return;

        // Set pinging state immediately to show animation
        setPingingIps(new Set(ipsToPing));

        // Ping each IP sequentially to avoid overwhelming the server
        // This runs in the background, results are displayed as they come
        for (let i = 0; i < ipsToPing.length; i++) {
            const ip = ipsToPing[i];
            try {
                const result = await pingIp(ip);
                setPingResults(prev => ({ ...prev, [ip]: result }));
            } catch (err) {
                // Handle errors silently for individual pings
                setPingResults(prev => ({ ...prev, [ip]: { success: false, error: 'Erreur' } }));
            }

            // Remove from pinging set once done
            setPingingIps(prev => {
                const newSet = new Set(prev);
                newSet.delete(ip);
                return newSet;
            });

            // Small delay between pings to avoid overwhelming the server
            if (i < ipsToPing.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
    };

    // Parse IP range to array of IPs (client-side implementation)
    const parseIpRange = (range: string): string[] => {
        const ips: string[] = [];
        const trimmed = range.trim();
        
        // CIDR notation: 192.168.1.0/24
        if (trimmed.includes('/')) {
            const [network, cidrStr] = trimmed.split('/');
            const cidr = parseInt(cidrStr, 10);
            if (isNaN(cidr) || cidr < 0 || cidr > 32) return [];
            
            const networkParts = network.split('.').map(Number);
            if (networkParts.length !== 4 || networkParts.some(p => isNaN(p) || p < 0 || p > 255)) return [];
            
            // Calculate IP range from CIDR
            const hostBits = 32 - cidr;
            const numHosts = Math.pow(2, hostBits);
            
            // Limit to reasonable size (max 254 IPs for ping)
            const maxIps = Math.min(254, numHosts - 2);
            
            // Calculate network address as integer
            const networkAddr = (networkParts[0] << 24) + (networkParts[1] << 16) + (networkParts[2] << 8) + networkParts[3];
            
            // Generate IPs (skip .0 and .255)
            for (let i = 1; i <= maxIps && i < numHosts - 1; i++) {
                const ipAddr = networkAddr + i;
                const ip = [
                    (ipAddr >>> 24) & 0xFF,
                    (ipAddr >>> 16) & 0xFF,
                    (ipAddr >>> 8) & 0xFF,
                    ipAddr & 0xFF
                ].join('.');
                ips.push(ip);
            }
        }
        // Range notation: 192.168.1.1-254 or 192.168.1.1-192.168.1.254
        else if (trimmed.includes('-')) {
            const parts = trimmed.split('-');
            if (parts.length === 2) {
                const start = parts[0].trim();
                const end = parts[1].trim();
                const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
                
                if (ipv4Regex.test(start)) {
                    const startParts = start.split('.').map(Number);
                    if (startParts.length === 4 && startParts.every(p => p >= 0 && p <= 255)) {
                        if (ipv4Regex.test(end)) {
                            // Full IP range: 192.168.1.1-192.168.1.254
                            const endParts = end.split('.').map(Number);
                            if (endParts.length === 4 && endParts.every(p => p >= 0 && p <= 255)) {
                                // Generate IPs between start and end
                                let current = [...startParts];
                                const endIp = [...endParts];
                                
                                while (current[0] <= endIp[0] && 
                                       current[1] <= endIp[1] && 
                                       current[2] <= endIp[2] && 
                                       current[3] <= endIp[3] && 
                                       ips.length < 254) {
                                    ips.push(current.join('.'));
                                    
                                    // Increment IP
                                    current[3]++;
                                    if (current[3] > 255) {
                                        current[3] = 0;
                                        current[2]++;
                                        if (current[2] > 255) {
                                            current[2] = 0;
                                            current[1]++;
                                            if (current[1] > 255) {
                                                current[1] = 0;
                                                current[0]++;
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            // Last octet range: 192.168.1.1-254
                            const endNum = parseInt(end, 10);
                            if (!isNaN(endNum) && endNum >= 0 && endNum <= 255) {
                                const startOctet = startParts[3];
                                const endOctet = Math.min(endNum, 255);
                                
                                for (let i = startOctet; i <= endOctet && ips.length < 254; i++) {
                                    ips.push([startParts[0], startParts[1], startParts[2], i].join('.'));
                                }
                            }
                        }
                    }
                }
            }
        }
        
        return ips;
    };

    // Ping the search query directly (from input field)
    const pingSearchQuery = async (query: string) => {
        if (!query.trim()) return;
        
        const target = query.trim();
        
        // Check if it's an IP range (only in extended mode when ping is enabled)
        if (pingEnabled && isIpRange(target)) {
            // Parse and ping a range of IPs
            const ipsToPing = parseIpRange(target);
            if (ipsToPing.length > 0) {
                setPingingIps(new Set(ipsToPing));
                for (const ip of ipsToPing) {
                    try {
                        const result = await pingIp(ip, true);
                        setPingResults(prev => ({ ...prev, [ip]: result }));
                    } catch (err) {
                        setPingResults(prev => ({ ...prev, [ip]: { success: false, error: 'Erreur' } }));
                    }
                    // Small delay between pings
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
                setPingingIps(new Set());
            } else {
                // If range parsing fails, try as single IP
        if (isValidIpOrDomain(target)) {
                    await pingSingleTarget(target);
                }
            }
        } else if (isValidIpOrDomain(target)) {
            // Single IP or domain ping
            await pingSingleTarget(target);
        }
    };

    // Perform search (overrides allow applying options from history)
    const performSearch = async (query: string, overrides?: { caseSensitive?: boolean; showOnlyActive?: boolean }) => {
        if (!query.trim()) {
            setResults([]);
            setHasSearched(false);
            setIpDetails(null);
            setIsExactIpSearch(false);
            return;
        }

        const useCase = overrides?.caseSensitive ?? caseSensitive;
        const useActive = overrides?.showOnlyActive ?? showOnlyActive;

        setIsLoading(true);
        setError(null);
        setHasSearched(true);
        setIpDetails(null);
        setIsExactIpSearch(false);

        const trimmedQuery = query.trim();
        const isSingleExactIp = isExactIp(trimmedQuery);

        try {
            if (isSingleExactIp) {
                setIsExactIpSearch(true);
                try {
                    const ipDetailsResponse = await api.get<IpDetailsResponse>(`/api/search/ip-details/${trimmedQuery}`);
                    if (ipDetailsResponse.success && ipDetailsResponse.result) {
                        if (ipDetailsResponse.result.unifi?.client) {
                            console.log('UniFi client data:', {
                                name: ipDetailsResponse.result.unifi.client.name,
                                is_wired: ipDetailsResponse.result.unifi.client.is_wired,
                                is_wireless: ipDetailsResponse.result.unifi.client.is_wireless,
                                ssid: ipDetailsResponse.result.unifi.client.ssid,
                                essid: ipDetailsResponse.result.unifi.client.essid,
                                sw_port: ipDetailsResponse.result.unifi.client.sw_port,
                                sw_port_idx: ipDetailsResponse.result.unifi.client.sw_port_idx,
                                ap_mac: ipDetailsResponse.result.unifi.client.ap_mac,
                                ap_name: ipDetailsResponse.result.unifi.client.ap_name,
                                sw_mac: ipDetailsResponse.result.unifi.client.sw_mac,
                                sw_name: ipDetailsResponse.result.unifi.client.sw_name,
                                rssi: ipDetailsResponse.result.unifi.client.rssi,
                                signal: ipDetailsResponse.result.unifi.client.signal,
                                tx_rate: ipDetailsResponse.result.unifi.client.tx_rate,
                                rx_rate: ipDetailsResponse.result.unifi.client.rx_rate,
                                allFields: Object.keys(ipDetailsResponse.result.unifi.client)
                            });
                        } else {
                            console.log('No UniFi client data found for IP:', ipDetailsResponse.result.ip);
                            console.log('UniFi data:', ipDetailsResponse.result.unifi);
                        }
                        setIpDetails(ipDetailsResponse.result);
                        const regularResponse = await api.post<SearchResultData>('/api/search', {
                            query: trimmedQuery,
                            pluginIds: selectedPlugins.length > 0 ? selectedPlugins : undefined,
                            caseSensitive: useCase
                        });
                        if (regularResponse.success && regularResponse.result?.results) {
                            setResults(regularResponse.result.results);
                            addToSearchHistory(trimmedQuery, { caseSensitive: useCase, showOnlyActive: useActive });
                        }
                    } else {
                        setIsExactIpSearch(false);
                        const response = await api.post<SearchResultData>('/api/search', {
                            query: trimmedQuery,
                            pluginIds: selectedPlugins.length > 0 ? selectedPlugins : undefined,
                            caseSensitive: useCase
                        });
                        if (response.success && response.result?.results) {
                            setResults(response.result.results);
                            addToSearchHistory(trimmedQuery, { caseSensitive: useCase, showOnlyActive: useActive });
                        } else {
                            const errorMsg = response.error?.message || 'Erreur lors de la recherche';
                            setError(errorMsg);
                            setResults([]);
                        }
                    }
                } catch (ipErr: any) {
                    console.warn('Search', `Failed to get IP details, falling back to regular search:`, ipErr);
                    setIsExactIpSearch(false);
                    const response = await api.post<SearchResultData>('/api/search', {
                        query: trimmedQuery,
                        pluginIds: selectedPlugins.length > 0 ? selectedPlugins : undefined,
                        caseSensitive: useCase
                    });
                    if (response.success && response.result?.results) {
                        setResults(response.result.results);
                        addToSearchHistory(trimmedQuery, { caseSensitive: useCase, showOnlyActive: useActive });
                    } else {
                        const errorMsg = response.error?.message || 'Erreur lors de la recherche';
                        setError(errorMsg);
                        setResults([]);
                    }
                }
            } else {
                const response = await api.post<SearchResultData>('/api/search', {
                    query: trimmedQuery,
                    pluginIds: selectedPlugins.length > 0 ? selectedPlugins : undefined,
                    caseSensitive: useCase
                });

                if (response.success && response.result?.results) {
                    setResults(response.result.results);
                    addToSearchHistory(trimmedQuery, { caseSensitive: useCase, showOnlyActive: useActive });
                    if (pingEnabled) {
                        pingAllResults(response.result.results);
                    }
                } else {
                    const errorMsg = response.error?.message || 'Erreur lors de la recherche';
                    setError(errorMsg);
                    setResults([]);
                }
            }
        } catch (err: any) {
            // Handle network/socket errors
            let errorMessage = 'Erreur lors de la recherche';
            
            if (err.message) {
                if (err.message.includes('socket') || err.message.includes('ended') || err.message.includes('ECONNRESET')) {
                    errorMessage = 'Connexion interrompue. Veuillez réessayer.';
                } else if (err.message.includes('timeout') || err.message.includes('TIMEOUT')) {
                    errorMessage = 'La recherche a expiré. Veuillez réessayer.';
                } else if (err.message.includes('aborted') || err.message.includes('ABORTED')) {
                    errorMessage = 'Recherche annulée.';
                } else {
                    errorMessage = err.message;
                }
            } else if (err.error?.message) {
                errorMessage = err.error.message;
            }
            
            setError(errorMessage);
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    };

    // Update URL when searchQuery changes (synchronize URL with search state)
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const currentUrlQuery = urlParams.get('s');
        
        if (searchQuery.trim()) {
            // Update URL if search query is different from current URL parameter
            if (currentUrlQuery !== searchQuery.trim()) {
                urlParams.set('s', searchQuery.trim());
                const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
                window.history.replaceState(null, '', newUrl);
            }
        } else {
            // Remove 's' parameter if search query is empty
            if (currentUrlQuery) {
                urlParams.delete('s');
                const newUrl = urlParams.toString() 
                    ? `${window.location.pathname}?${urlParams.toString()}`
                    : window.location.pathname;
                window.history.replaceState(null, '', newUrl);
            }
        }
    }, [searchQuery]);

    // Listen for URL changes (browser back/forward buttons)
    useEffect(() => {
        const handlePopState = () => {
            const urlParams = new URLSearchParams(window.location.search);
            const urlQuery = urlParams.get('s') || '';
            if (urlQuery !== searchQuery) {
                setSearchQuery(urlQuery);
            }
        };
        
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [searchQuery]);

    // Search on mount if query exists
    useEffect(() => {
        if (searchQuery) {
            performSearch(searchQuery);
        }
    }, []);

    // Re-search when filters change (only if a search has already been performed)
    useEffect(() => {
        if (searchQuery && hasSearched) {
            performSearch(searchQuery);
        }
    }, [selectedPlugins, caseSensitive, showOnlyActive]);

    // Scroll to port anchor when URL has #port-XXX and ipDetails (ports section) is rendered
    useEffect(() => {
        const hash = window.location.hash;
        if (!hash || !hash.startsWith('#port-') || !ipDetails?.scanner?.additionalInfo?.openPorts) return;
        const portId = hash.slice(1);
        const timer = setTimeout(() => {
            const el = document.getElementById(portId);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 300);
        return () => clearTimeout(timer);
    }, [ipDetails]);

    // Fetch latency monitoring status for results with IPs and ipDetails
    useEffect(() => {
        const fetchMonitoringStatus = async () => {
            // Get all unique IPs from results
            const ipsFromResults = results
                .filter(r => r.ip && isValidIpOrDomain(r.ip))
                .map(r => r.ip!)
                .filter((ip, index, self) => self.indexOf(ip) === index); // Remove duplicates
            
            // Also include IP from ipDetails if available
            const allIps = [...ipsFromResults];
            if (ipDetails?.ip && isValidIpOrDomain(ipDetails.ip) && !allIps.includes(ipDetails.ip)) {
                allIps.push(ipDetails.ip);
            }
            
            if (allIps.length === 0) {
                setMonitoringStatus({});
                return;
            }
            
            try {
                const response = await api.post<Record<string, boolean>>('/api/latency-monitoring/status/batch', { ips: allIps });
                if (response.success && response.result) {
                    setMonitoringStatus(response.result);
                    // Debug log
                    console.log('Monitoring status fetched:', response.result);
                } else {
                    console.warn('Failed to fetch monitoring status:', response.error);
                }
            } catch (error) {
                console.error('Failed to fetch monitoring status:', error);
            }
        };
        
        if (results.length > 0 || ipDetails?.ip) {
            fetchMonitoringStatus();
        }
    }, [results, ipDetails?.ip]);

    // Handle opening latency graph modal
    const handleOpenLatencyGraph = (ip: string) => {
        setSelectedIpForLatencyGraph(ip);
        setShowLatencyModal(true);
    };

    // Filtered and sorted results
    const filteredResults = useMemo(() => {
        let filtered = [...results];

        // Apply filters
        if (selectedPlugins.length > 0) {
            filtered = filtered.filter(r => selectedPlugins.includes(r.pluginId));
        }
        // Filter by active status (default: show only active)
        if (showOnlyActive) {
            filtered = filtered.filter(r => r.active === true);
        }

        // Apply sorting
        filtered.sort((a, b) => {
            let aValue: string | number | undefined;
            let bValue: string | number | undefined;

            switch (sortField) {
                case 'name':
                    aValue = a.name?.toLowerCase() || '';
                    bValue = b.name?.toLowerCase() || '';
                    break;
                case 'plugin':
                    aValue = a.pluginName?.toLowerCase() || '';
                    bValue = b.pluginName?.toLowerCase() || '';
                    break;
                case 'ip':
                    aValue = a.ip || '';
                    bValue = b.ip || '';
                    break;
                case 'mac':
                    aValue = a.mac?.toLowerCase() || '';
                    bValue = b.mac?.toLowerCase() || '';
                    break;
                default:
                    return 0;
            }

            if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [results, selectedPlugins, showOnlyActive, sortField, sortDirection]);

    // Paginated results
    const totalPages = Math.ceil(filteredResults.length / ITEMS_PER_PAGE);
    const paginatedResults = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredResults.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredResults, currentPage]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedPlugins, showOnlyActive, sortField, sortDirection]);

    // Format MAC address
    const formatMac = (mac?: string): string => {
        if (!mac) return '--';
        return mac.toUpperCase().replace(/(.{2})/g, '$1:').slice(0, -1);
    };

    // Format date
    const formatDate = (dateStr?: string): string => {
        if (!dateStr) return '--';
        try {
            const date = new Date(dateStr);
            return date.toLocaleString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return '--';
        }
    };

    const handleSearch = () => {
        if (searchQuery.trim()) {
            performSearch(searchQuery);
        } else {
            setHasSearched(false);
            setResults([]);
        }
    };

    const togglePlugin = (pluginId: string) => {
        setSelectedPlugins(prev =>
            prev.includes(pluginId)
                ? prev.filter(id => id !== pluginId)
                : [...prev, pluginId]
        );
    };

    const handleSort = (field: 'name' | 'plugin' | 'ip' | 'mac') => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };
    
    const handleRefresh = () => {
        // Reset all search state
        setSearchQuery('');
        setResults([]);
        setError(null);
        setHasSearched(false);
        setSelectedPlugins([]);
        setCaseSensitive(false);
        setShowOnlyActive(true);
        setPingEnabled(false);
        setPingResults({});
        setPingingIps(new Set());
        setCurrentPage(1);
        setSortField('name');
        setSortDirection('asc');
    };

    return (
        <div className="min-h-screen bg-theme-primary_">
            <div className="max-w-[1920px] mx-auto pt-0 px-4 pb-4 md:px-6 md:pb-6 space-y-6">
                {/* Two columns layout: Search bar and Options/Filters */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                    {/* Left column: Search bar */}
                    <div className="flex">
                        <Card title="" className="!p-3 sm:!p-4 flex-1">
                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <div className="relative">
                                            <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-accent-primary opacity-80 pointer-events-none" />
                                            <input
                                                type="text"
                                                value={searchQuery}
                                                onChange={(e) => {
                                                    setSearchQuery(e.target.value);
                                                    if (hasSearched) setHasSearched(false);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleSearch();
                                                        if (pingEnabled && searchQuery.trim() && (isValidIpOrDomain(searchQuery.trim()) || isIpRange(searchQuery.trim()))) {
                                                            pingSearchQuery(searchQuery.trim());
                                                        }
                                                    }
                                                }}
                                                placeholder="IP, MAC, 192.168.32.*, 192.168.32.1-32, ou texte (hostname, vendor…)"
                                                className="w-full pl-11 pr-3 py-2.5 text-sm bg-theme-secondary border border-theme rounded-lg text-theme-primary placeholder-theme-tertiary focus:outline-none transition-all"
                                            />
                                        </div>
                                        <p className="text-[10px] text-theme-tertiary mt-1 ml-1">
                                            * = plusieurs IP/MAC ; 1-32 = plage. Sinon recherche dans hostname, vendor, commentaire.
                                        </p>
                                    </div>
                                    {!pingEnabled && (
                                    <button
                                        onClick={handleSearch}
                                        disabled={isLoading || !searchQuery.trim()}
                                        className="px-4 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 text-sm font-medium shadow shadow-gray-600/20 self-start"
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 size={16} className="animate-spin" />
                                                Recherche...
                                            </>
                                        ) : (
                                            <>
                                                <Search size={16} />
                                                Rechercher
                                            </>
                                        )}
                                    </button>
                                    )}
                                    {/* Ping direct button - for direct IP/domain ping without search results */}
                                    {/* Ping direct button - Only visible when ping switch is enabled */}
                                    {pingEnabled && searchQuery.trim() && isValidIpOrDomain(searchQuery.trim()) && (
                                        <button
                                            onClick={() => pingSingleTarget(searchQuery.trim())}
                                            disabled={pingingIps.has(searchQuery.trim())}
                                            className={`px-4 py-3 rounded-lg transition-all flex items-center gap-2 font-medium ${
                                                pingingIps.has(searchQuery.trim())
                                                    ? 'bg-theme-tertiary text-theme-secondary cursor-not-allowed'
                                                    : 'bg-cyan-500 text-white hover:bg-cyan-600 shadow-lg shadow-cyan-500/20'
                                            }`}
                                            title={`Pinger directement ${searchQuery.trim()} (sans recherche dans les résultats)`}
                                        >
                                            {pingingIps.has(searchQuery.trim()) ? (
                                                <>
                                                    <Loader2 size={18} className="animate-spin" />
                                                    Ping...
                                                </>
                                            ) : (
                                                <>
                                                    <Network size={18} />
                                                    Ping direct
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                                {/* Termes les plus recherchés (top 5) et Historique */}
                                <div className="flex flex-wrap items-center gap-2 justify-between">
                                    {topSearchTerms.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-xs text-theme-tertiary">Recherches fréquentes :</span>
                                            {topSearchTerms.map((term) => (
                                                <button
                                                    key={term}
                                                    type="button"
                                                    onClick={() => {
                                                        setSearchQuery(term);
                                                        performSearch(term);
                                                    }}
                                                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-theme-secondary border border-theme text-theme-primary hover:bg-theme-tertiary hover:border-theme-hover transition-colors"
                                                >
                                                    {term}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <button
                                        onClick={() => setShowHistoryModal(true)}
                                        className="p-1.5 hover:bg-theme-tertiary rounded-lg transition-colors text-amber-400/90 hover:text-amber-400 flex items-center gap-1.5"
                                        title="Historique des recherches"
                                    >
                                        <History size={18} />
                                        <span className="text-sm">Historique</span>
                                    </button>
                                </div>
                                {/* Display ping result for search query if it's an IP/domain */}
                                {searchQuery.trim() && isValidIpOrDomain(searchQuery.trim()) && pingResults[searchQuery.trim()] && (
                                    <div className={`p-4 rounded-lg border ${
                                        pingResults[searchQuery.trim()].success
                                            ? 'bg-emerald-500/10 border-emerald-500/30'
                                            : 'bg-red-500/10 border-red-500/30'
                                    }`}>
                                        <div className="flex items-center gap-3">
                                            {pingResults[searchQuery.trim()].success ? (
                                                <>
                                                    <CheckCircle size={24} className="text-emerald-400" />
                                                    <div>
                                                        <div className="text-2xl font-bold text-emerald-400">UP</div>
                                                        <div className="text-xs text-theme-tertiary mt-0.5">{searchQuery.trim()}</div>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <X size={24} className="text-red-400" />
                                                    <div className="flex-1">
                                                        <div className="text-2xl font-bold text-red-400">DOWN</div>
                                                        <div className="text-xs text-theme-tertiary mt-0.5">{searchQuery.trim()}</div>
                                                        {pingResults[searchQuery.trim()].error && (
                                                            <div className="text-xs text-red-400/80 mt-1">{pingResults[searchQuery.trim()].error}</div>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}

                            </div>
                        </Card>
                    </div>

                    {/* Right column: Search options and filters */}
                    <div className="flex">
                        <Card 
                            title="Filtres"
                            className="!p-3 sm:!p-4 flex-1"
                            actions={
                                <button
                                    onClick={() => setShowOptionsInfoModal(true)}
                                    className="p-1.5 hover:bg-theme-tertiary rounded-lg transition-colors text-cyan-400/90 hover:text-cyan-400"
                                    title="Aide sur les options de recherche"
                                >
                                    <Info size={18} />
                                </button>
                            }
                        >
                    <div className="space-y-3">
                        {/* Search options - Toggle buttons */}
                        <div className="flex flex-wrap gap-3 items-center text-sm">
                            <button
                                onClick={() => {
                                    if (!pingEnabled) {
                                        setShowOnlyActive(!showOnlyActive);
                                    }
                                }}
                                disabled={pingEnabled}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all duration-200 font-medium ${
                                    pingEnabled
                                        ? 'opacity-50 cursor-not-allowed bg-theme-secondary border-theme text-theme-tertiary'
                                        : showOnlyActive
                                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-lg shadow-emerald-500/10'
                                            : 'bg-theme-secondary border-theme text-theme-secondary hover:bg-theme-tertiary hover:border-theme-hover'
                                }`}
                            >
                                <div className={`relative w-10 h-5 rounded-full transition-all duration-200 ${
                                    showOnlyActive ? 'bg-emerald-500' : 'bg-theme-tertiary'
                                }`}>
                                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all duration-200 shadow-md ${
                                        showOnlyActive ? 'translate-x-5' : 'translate-x-0'
                                    }`} />
                                </div>
                                <span>IP Actif</span>
                                <CheckCircle size={12} className={showOnlyActive ? 'text-emerald-400' : 'text-theme-tertiary'} />
                            </button>
                            {false && (
                            <button
                                onClick={() => {}}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all duration-200 font-medium ${
                                    false
                                            ? 'bg-accent-primary/20 border-accent-primary text-accent-primary shadow-lg shadow-accent-primary/10'
                                            : 'bg-theme-secondary border-theme text-theme-secondary hover:bg-theme-tertiary hover:border-theme-hover'
                                }`}
                            >
                                <div className={`relative w-10 h-5 rounded-full transition-all duration-200 ${
                                    false ? 'bg-blue-500' : 'bg-theme-tertiary'
                                }`}>
                                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all duration-200 shadow-md ${
                                        false ? 'translate-x-5' : 'translate-x-0'
                                    }`} />
                                </div>
                                <span className="sr-only">Étendu (retiré)</span>
                            </button>
                            )}
                            {false && (
                                <span className="text-[10px] text-theme-tertiary ml-0.5" title="Mode strict : recherche exacte avec IP, nom, MAC, port, hostname. La fiche détaillée (ports, UniFi) s’affiche uniquement pour une recherche par IP.">
                                    (strict : IP, nom, MAC…)
                                </span>
                            )}
                            
                            <button
                                onClick={() => {
                                    if (!pingEnabled) {
                                        setCaseSensitive(!caseSensitive);
                                    }
                                }}
                                disabled={pingEnabled}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all duration-200 font-medium ${
                                    pingEnabled
                                        ? 'opacity-50 cursor-not-allowed bg-theme-secondary border-theme text-theme-tertiary'
                                        : caseSensitive
                                            ? 'bg-accent-primary/20 border-accent-primary text-accent-primary shadow-lg shadow-accent-primary/10'
                                            : 'bg-theme-secondary border-theme text-theme-secondary hover:bg-theme-tertiary hover:border-theme-hover'
                                }`}
                            >
                                <div className={`relative w-10 h-5 rounded-full transition-all duration-200 ${
                                    caseSensitive ? 'bg-purple-500' : 'bg-theme-tertiary'
                                }`}>
                                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all duration-200 shadow-md ${
                                        caseSensitive ? 'translate-x-5' : 'translate-x-0'
                                    }`} />
                                </div>
                                <span>Case sensitive </span>
                            </button>
                            
                            <button
                                onClick={async () => {
                                    const enabled = !pingEnabled;
                                    setPingEnabled(enabled);
                                    
                                    if (enabled) {
                                        setCaseSensitive(false);
                                        setShowOnlyActive(false);
                                        
                                        // If we have search results, ping them
                                        // Otherwise, ping the search query directly (from input field)
                                        if (results.length > 0) {
                                            await pingAllResults(filteredResults);
                                        } else if (searchQuery.trim() && (isValidIpOrDomain(searchQuery.trim()) || isIpRange(searchQuery.trim()))) {
                                            // Ping the search query directly without doing a search
                                            await pingSearchQuery(searchQuery.trim());
                                        }
                                    } else {
                                        setPingResults({});
                                        setPingingIps(new Set());
                                    }
                                }}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all duration-200 font-medium ${
                                    pingEnabled
                                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 shadow-lg shadow-cyan-500/10'
                                        : 'bg-theme-secondary border-theme text-theme-secondary hover:bg-theme-tertiary hover:border-theme-hover'
                                }`}
                            >
                                <div className={`relative w-10 h-5 rounded-full transition-all duration-200 ${
                                    pingEnabled ? 'bg-cyan-500' : 'bg-theme-tertiary'
                                }`}>
                                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all duration-200 shadow-md ${
                                        pingEnabled ? 'translate-x-5' : 'translate-x-0'
                                    }`} />
                                </div>
                                <span>Ping</span>
                            </button>
                        </div>

                        {/* Ping help info - Show when ping is enabled */}
                        {pingEnabled && (
                            <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                                <div className="flex items-start gap-2">
                                    <Info size={16} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 text-xs text-theme-secondary">
                                        <p className="font-medium text-cyan-400 mb-1">Mode Ping activé</p>
                                        <div className="space-y-1">
                                            <p>• Ping de ranges d'IP autorisé</p>
                                            <p>• Formats supportés :</p>
                                            <p className="ml-2 text-cyan-400 font-mono">• 192.168.1.0/24 (notation CIDR)</p>
                                            <p className="ml-2 text-cyan-400 font-mono">• 192.168.1.1-254 (plage simple)</p>
                                            <p className="ml-2 text-cyan-400 font-mono">• 192.168.1.1-192.168.1.254 (plage complète)</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                        </Card>
                    </div>
                </div>

                {/* Results */}
                {isLoading ? (
                    <Card>
                        <div className="flex items-center justify-center py-12">
                            <Loader2 size={32} className="animate-spin text-accent-primary" />
                            <span className="ml-3 text-theme-secondary">Recherche en cours...</span>
                        </div>
                    </Card>
                ) : error ? (
                    <Card>
                        <div className="flex items-center justify-center py-12 text-accent-error">
                            <AlertCircle size={24} className="mr-2" />
                            <span>{error}</span>
                        </div>
                    </Card>
                ) : results.length === 0 && searchQuery && hasSearched && !isLoading ? (
                    <Card>
                        <div className="flex items-center justify-center py-12 text-theme-secondary">
                            <AlertCircle size={24} className="mr-2" />
                            <div className="text-center space-y-2">
                                <span className="block">Aucun résultat trouvé pour "{searchQuery}"</span>
                                <span className="block text-sm text-theme-tertiary">
                                    La recherche fonctionne uniquement dans les données locales des plugins (appareils, clients, DHCP, etc.)
                                </span>
                                {isValidIpOrDomain(searchQuery) && !isLocalIPv4(searchQuery) && (
                                    <span className="block text-sm text-cyan-400 mt-2">
                                        💡 Astuce : Utilisez le bouton de ping pour tester la connectivité de "{searchQuery}"
                                    </span>
                                )}
                            </div>
                        </div>
                    </Card>
                ) : filteredResults.length === 0 && hasSearched && !isLoading ? (
                    <Card>
                        <div className="flex items-center justify-center py-12 text-theme-secondary">
                            <span>Aucun résultat ne correspond aux filtres sélectionnés</span>
                        </div>
                    </Card>
                ) : isExactIpSearch && ipDetails ? (
                    // Display aggregated IP details in a single unified card - Structured like UniFi table
                    <Card>
                        <div className="space-y-6">
                            {/* Header Section */}
                            <div className="flex items-start justify-between gap-4 pb-4 border-b border-theme">
                                <div className="flex-1">
                                    <h2 className="text-2xl font-bold text-theme-primary mb-2">{ipDetails.ip}</h2>
                                    {(ipDetails.unifi?.client?.name || ipDetails.unifi?.client?.hostname || ipDetails.freebox?.name || ipDetails.scanner?.hostname) && (
                                        <p className="text-lg text-theme-secondary font-medium">
                                            {ipDetails.unifi?.client?.name || ipDetails.unifi?.client?.hostname || ipDetails.freebox?.name || ipDetails.scanner?.hostname}
                                        </p>
                                    )}
                                    {/* Badges Row */}
                                    <div className="flex flex-wrap items-center gap-2 mt-3">
                                        {/* Status Badge - EN PREMIER */}
                                        {ipDetails.scanner?.status && (
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                                                ipDetails.scanner.status === 'online'
                                                    ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                                                    : 'bg-red-500/20 border border-red-500/50 text-red-400'
                                            }`}>
                                                {ipDetails.scanner.status === 'online' ? (
                                                    <>
                                                        <CheckCircle size={14} />
                                                        En ligne
                                                    </>
                                                ) : (
                                                    <>
                                                        <AlertCircle size={14} />
                                                        Hors ligne
                                                    </>
                                                )}
                                            </span>
                                        )}
                                        
                                        {/* Connection Type Badge */}
                                        {ipDetails.unifi?.client && (() => {
                                            const isWireless = ipDetails.unifi.client.is_wireless || 
                                                (!!ipDetails.unifi.client.ssid || !!ipDetails.unifi.client.ap_mac || !!ipDetails.unifi.client.ap_name);
                                            
                                            if (isWireless) {
                                                // RSSI valide uniquement → badge WiFi coloré ; sinon on affiche Filaire (pas de badge WiFi grisé)
                                                let rssi = ipDetails.unifi.client.rssi;
                                                if (rssi === undefined || rssi === null) {
                                                    const signal = ipDetails.unifi.client.signal;
                                                    if (signal !== undefined && signal !== null) {
                                                        if (typeof signal === 'number' && signal < 0) {
                                                            rssi = signal;
                                                        } else if (typeof signal === 'number' && signal <= 100 && signal > 0) {
                                                            rssi = -30 - ((100 - signal) * 0.7);
                                                        }
                                                    }
                                                }
                                                if (rssi === undefined || rssi === null) {
                                                    rssi = ipDetails.unifi.client.signal_strength;
                                                }
                                                const hasValidRssi = rssi != null && !isNaN(rssi);
                                                if (hasValidRssi) {
                                                    return (
                                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${getSignalBadgeColor(rssi)}`}>
                                                            <Radio size={14} />
                                                            WiFi
                                                        </span>
                                                    );
                                                }
                                            }
                                            // Pas WiFi avec signal valide, ou filaire → afficher Filaire (badge bleu), jamais le badge WiFi grisé
                                            return (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/20 border border-blue-500/50 text-blue-400">
                                                    <Cable size={14} />
                                                    Filaire
                                                </span>
                                            );
                                        })()}
                                        
                                        {/* DHCP Badge — Freebox (violet) ou UniFi (bleu), tooltip au survol */}
                                        {(ipDetails.freebox?.dhcp || ipDetails.unifi?.client) ? (
                                            <span
                                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                                                    ipDetails.freebox?.dhcp
                                                        ? ipDetails.freebox.dhcp.static
                                                            ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                                                            : 'bg-purple-500/20 border border-purple-500/50 text-purple-400'
                                                        : 'bg-blue-500/20 border border-blue-500/50 text-blue-400'
                                                }`}
                                                title={ipDetails.freebox?.dhcp ? 'DHCP géré par Freebox' : 'DHCP géré par UniFi'}
                                            >
                                                <Home size={14} />
                                                {ipDetails.freebox?.dhcp
                                                    ? (ipDetails.freebox.dhcp.static ? 'DHCP off (Réservation)' : 'DHCP on')
                                                    : 'DHCP on'}
                                            </span>
                                        ) : (
                                            <span
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-theme-secondary/50 border border-theme text-theme-tertiary"
                                                title="Aucun DHCP réglé pour cette IP"
                                            >
                                                <Home size={14} />
                                                DHCP
                                            </span>
                                        )}
                                        
                                        {/* Port Forwarding Badge */}
                                        {ipDetails.freebox?.portForwarding && Array.isArray(ipDetails.freebox.portForwarding) && ipDetails.freebox.portForwarding.length > 0 && (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/20 border border-purple-500/50 text-purple-400">
                                                <Router size={14} />
                                                PORT ({ipDetails.freebox.portForwarding.length})
                                            </span>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Ping Section */}
                                <div className="flex items-center gap-3 flex-wrap">
                                    {/* Latency scatter badge - show if monitoring is enabled */}
                                    {ipDetails.ip && monitoringStatus[ipDetails.ip] === true && (
                                        <button
                                            onClick={() => handleOpenLatencyGraph(ipDetails.ip)}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
                                            title="Voir le graphique de latence scatter"
                                        >
                                            <BarChart2 size={16} />
                                            Latency scatter
                                        </button>
                                    )}
                                    {pingEnabled && ipDetails.ip && (
                                        <button
                                            onClick={() => pingSingleTarget(ipDetails.ip)}
                                            disabled={pingingIps.has(ipDetails.ip)}
                                            className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 font-medium ${
                                                pingingIps.has(ipDetails.ip)
                                                    ? 'bg-theme-tertiary text-theme-secondary cursor-not-allowed'
                                                    : 'bg-cyan-500 text-white hover:bg-cyan-600 shadow-lg shadow-cyan-500/20'
                                            }`}
                                        >
                                            {pingingIps.has(ipDetails.ip) ? (
                                                <>
                                                    <Loader2 size={18} className="animate-spin" />
                                                    Ping...
                                                </>
                                            ) : (
                                                <>
                                                    <Network size={18} />
                                                    Ping
                                                </>
                                            )}
                                        </button>
                                    )}
                                    {pingResults[ipDetails.ip] && (
                                        <div className={`px-6 py-3 rounded-lg ${
                                            pingResults[ipDetails.ip].success
                                                ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                                                : 'bg-red-500/20 border border-red-500/50 text-red-400'
                                        }`}>
                                            {pingResults[ipDetails.ip].success ? (
                                                <span className="text-xl font-bold">UP</span>
                                            ) : (
                                                <div>
                                                    <span className="text-xl font-bold block">DOWN</span>
                                                    {pingResults[ipDetails.ip].error && (
                                                        <span className="text-xs opacity-80 mt-1 block">{pingResults[ipDetails.ip].error}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* SECTION 1: INFORMATIONS PRINCIPALES - En haut, priorité */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                                {/* IP Card */}
                                <div className="bg-theme-secondary/30 rounded-lg border border-theme p-4 hover:bg-theme-secondary/40 transition-colors">
                                    <div className="text-xs font-semibold text-theme-tertiary uppercase mb-2 flex items-center gap-1.5">
                                        <Network size={14} className="text-cyan-400" />
                                        IP
                                    </div>
                                    <div className="text-theme-primary font-mono font-medium text-lg">{ipDetails.ip}</div>
                                </div>

                                {/* MAC Card */}
                                {(ipDetails.unifi?.client?.mac || ipDetails.freebox?.mac || ipDetails.scanner?.mac) && (
                                    <div className="bg-theme-secondary/30 rounded-lg border border-theme p-4 hover:bg-theme-secondary/40 transition-colors">
                                        <div className="text-xs font-semibold text-theme-tertiary uppercase mb-2 flex items-center gap-1.5">
                                            <Link2 size={14} className="text-blue-400" />
                                            MAC
                                        </div>
                                        <div className="text-theme-primary font-mono font-medium text-lg">
                                            {formatMac(ipDetails.unifi?.client?.mac || ipDetails.freebox?.mac || ipDetails.scanner?.mac)}
                                        </div>
                                    </div>
                                )}

                                {/* DHCP Card */}
                                {(ipDetails.freebox?.dhcp || ipDetails.unifi?.client) && (
                                    <div className="bg-theme-secondary/30 rounded-lg border border-theme p-4 hover:bg-theme-secondary/40 transition-colors">
                                        <div className="text-xs font-semibold text-theme-tertiary uppercase mb-2 flex items-center gap-1.5">
                                            {ipDetails.freebox?.dhcp ? (
                                                <img src={logoFreebox} alt="Freebox" className="w-4 h-4 object-contain flex-shrink-0" />
                                            ) : ipDetails.unifi?.client ? (
                                                <img src={logoUnifi} alt="UniFi" className="w-4 h-4 object-contain flex-shrink-0" />
                                            ) : null}
                                            DHCP
                                        </div>
                                        <div className="text-theme-primary font-medium text-lg">
                                            {ipDetails.freebox?.dhcp ? (
                                                ipDetails.freebox.dhcp.static ? 'Réservation statique' : 'DHCP actif'
                                            ) : ipDetails.unifi?.client ? (
                                                'DHCP actif'
                                            ) : '--'}
                                        </div>
                                    </div>
                                )}

                                {/* Vitesse Card */}
                                {ipDetails.unifi?.client && (ipDetails.unifi.client.tx_rate || ipDetails.unifi.client.rx_rate) && (() => {
                                    const formatSpeed = (bytes: number) => {
                                        if (!bytes || bytes === 0) return '--';
                                        if (bytes >= 1000000000) return `${(bytes / 1000000000).toFixed(1)} Gbps`;
                                        if (bytes >= 1000000) return `${(bytes / 1000000).toFixed(1)} Mbps`;
                                        if (bytes >= 1000) return `${(bytes / 1000).toFixed(1)} Kbps`;
                                        return `${bytes} bps`;
                                    };
                                    const tx = ipDetails.unifi.client.tx_rate || 0;
                                    const rx = ipDetails.unifi.client.rx_rate || 0;
                                    if (tx > 0 || rx > 0) {
                                        return (
                                            <div className="bg-theme-secondary/30 rounded-lg border border-theme p-4 hover:bg-theme-secondary/40 transition-colors">
                                                <div className="text-xs font-semibold text-theme-tertiary uppercase mb-2 flex items-center gap-1.5">
                                                    <Activity size={14} className="text-emerald-400" />
                                                    Vitesse
                                                </div>
                                                <div className="flex flex-col gap-1.5">
                                                    {tx > 0 && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-emerald-400 font-medium">↑</span>
                                                            <span className="text-theme-primary font-medium">{formatSpeed(tx)}</span>
                                                        </div>
                                                    )}
                                                    {rx > 0 && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-blue-400 font-medium">↓</span>
                                                            <span className="text-theme-primary font-medium">{formatSpeed(rx)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}

                                {/* Signal Card (WiFi only) */}
                                {ipDetails.unifi?.client && ipDetails.unifi.client.is_wireless && (
                                    <div className="bg-theme-secondary/30 rounded-lg border border-theme p-4 hover:bg-theme-secondary/40 transition-colors">
                                        <div className="text-xs font-semibold text-theme-tertiary uppercase mb-2 flex items-center gap-1.5">
                                            <Signal size={14} className="text-purple-400" />
                                            Signal
                                        </div>
                                        {(() => {
                                            let rssi = ipDetails.unifi.client.rssi;
                                            let signal = ipDetails.unifi.client.signal;
                                            
                                            if (rssi === undefined || rssi === null) {
                                                if (signal !== undefined && signal !== null) {
                                                    if (typeof signal === 'number' && signal < 0) {
                                                        rssi = signal;
                                                    } else if (typeof signal === 'number' && signal <= 100 && signal > 0) {
                                                        rssi = -30 - ((100 - signal) * 0.7);
                                                    }
                                                }
                                            }
                                            
                                            if ((rssi === undefined || rssi === null) && ipDetails.unifi.client.signal_strength !== undefined) {
                                                rssi = ipDetails.unifi.client.signal_strength;
                                            }
                                            
                                            if (rssi === undefined || rssi === null || (rssi === 0 && signal === 0)) {
                                                return <span className="text-theme-tertiary">--</span>;
                                            }
                                            
                                            rssi = typeof rssi === 'number' ? rssi : parseFloat(rssi);
                                            if (isNaN(rssi)) {
                                                return <span className="text-theme-tertiary">--</span>;
                                            }
                                            
                                            let quality = '';
                                            let qualityColor = '';
                                            if (rssi >= -50) {
                                                quality = 'Excellent';
                                                qualityColor = 'text-emerald-400';
                                            } else if (rssi >= -60) {
                                                quality = 'Très bon';
                                                qualityColor = 'text-emerald-300';
                                            } else if (rssi >= -70) {
                                                quality = 'Bon';
                                                qualityColor = 'text-yellow-400';
                                            } else if (rssi >= -80) {
                                                quality = 'Moyen';
                                                qualityColor = 'text-orange-400';
                                            } else {
                                                quality = 'Faible';
                                                qualityColor = 'text-red-400';
                                            }
                                            
                                            const signalPercent = Math.max(0, Math.min(100, ((rssi + 100) / 70) * 100));
                                            
                                            return (
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono font-medium text-lg">{rssi} dBm</span>
                                                        <span className={`text-xs ${qualityColor}`}>({quality})</span>
                                                    </div>
                                                    <div className="w-full bg-gray-700 rounded-full h-2.5">
                                                        <div 
                                                            className={`h-2.5 rounded-full transition-all ${
                                                                rssi >= -50 ? 'bg-emerald-500' :
                                                                rssi >= -60 ? 'bg-emerald-400' :
                                                                rssi >= -70 ? 'bg-yellow-500' :
                                                                rssi >= -80 ? 'bg-orange-500' :
                                                                'bg-red-500'
                                                            }`}
                                                            style={{ width: `${signalPercent}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}

                                {/* Latency Card - Show scanner latency or ping status */}
                                {(ipDetails.scanner?.pingLatency !== undefined && 
                                 ipDetails.scanner?.pingLatency !== null &&
                                 typeof ipDetails.scanner.pingLatency === 'number' &&
                                 ipDetails.scanner.pingLatency >= 0) || pingResults[ipDetails.ip] ? (
                                    <div className="bg-theme-secondary/30 rounded-lg border border-theme p-4 hover:bg-theme-secondary/40 transition-colors">
                                        <div className="text-xs font-semibold text-theme-tertiary uppercase mb-2 flex items-center gap-1.5">
                                            <Clock size={14} className="text-yellow-400" />
                                            {pingResults[ipDetails.ip] ? 'Ping' : 'Latence'}
                                        </div>
                                        {pingResults[ipDetails.ip] ? (
                                            // Fast ping: show latency with color
                                        <div className={`text-lg font-medium ${getLatencyColor(
                                                pingResults[ipDetails.ip].time || 0
                                        )}`}>
                                                {pingResults[ipDetails.ip].success 
                                                    ? (pingResults[ipDetails.ip].time !== undefined 
                                                        ? `${pingResults[ipDetails.ip].time}ms`
                                                        : 'UP')
                                                    : 'DOWN'
                                                }
                                        </div>
                                        ) : (
                                            // Scanner latency: show actual latency
                                            <div className={`text-lg font-medium ${getLatencyColor(
                                                ipDetails.scanner?.pingLatency || 0
                                            )}`}>
                                                {ipDetails.scanner?.pingLatency || '--'}ms
                                            </div>
                                        )}
                                    </div>
                                ) : null}

                                {/* Ports ouverts (machine) - cadre pleine largeur, boutons qui ne se coupent pas */}
                                {ipDetails.scanner && (
                                    <div className="bg-theme-secondary/30 rounded-lg border border-theme p-5 hover:bg-theme-secondary/40 transition-colors lg:col-span-5 min-w-0 overflow-visible">
                                        <div className="text-xs font-semibold text-theme-tertiary uppercase mb-3 flex items-center gap-1.5">
                                            <Activity size={14} className="text-amber-400" />
                                            Ports ouverts (machine)
                                            <span className="ml-1.5 font-mono text-amber-400/90">
                                                ({Array.isArray(ipDetails.scanner.additionalInfo?.openPorts) ? ipDetails.scanner.additionalInfo.openPorts.length : 0})
                                            </span>
                                        </div>
                                        {Array.isArray(ipDetails.scanner.additionalInfo?.openPorts) && ipDetails.scanner.additionalInfo.openPorts.length > 0 ? (
                                            (() => {
                                                const openPorts = ipDetails.scanner.additionalInfo.openPorts as { port: number; protocol?: string }[];
                                                const sorted = [...openPorts].sort((a, b) => a.port - b.port);
                                                const byCategory = sorted.reduce<Record<string, { port: number; protocol?: string }[]>>((acc, p) => {
                                                    const cat = getPortCategory(p.port);
                                                    if (!acc[cat]) acc[cat] = [];
                                                    acc[cat].push(p);
                                                    return acc;
                                                }, {});
                                                const categoryOrder = ['Web', 'Bases de données', 'Mail', 'Système', 'Accès distant', 'Docker', 'Autres'];
                                                const orderedCategories = categoryOrder.filter((c) => byCategory[c]?.length).concat(Object.keys(byCategory).filter((c) => !categoryOrder.includes(c)));
                                                return (
                                                    <>
                                                        <div className="space-y-4">
                                                            {orderedCategories.map((cat) => {
                                                                const colors = getPortCategoryColor(cat);
                                                                return (
                                                                    <div key={cat} className="min-w-0">
                                                                        <div className={`text-[11px] font-semibold uppercase tracking-wider mb-2 ${colors.label}`}>{cat}</div>
                                                                        <div className="flex flex-wrap gap-2">
                                                                            {byCategory[cat].map((p) => {
                                                                                const Icon = getPortIcon(p.port);
                                                                                const protocol = p.port === 443 ? 'https' : 'http';
                                                                                const portHref = `${protocol}://${ipDetails.ip}:${p.port}`;
                                                                                return (
                                                                                    <a
                                                                                        key={p.port}
                                                                                        id={`port-${p.port}`}
                                                                                        href={portHref}
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        className={`flex items-center gap-2 py-2.5 px-4 rounded-lg border min-w-[7rem] shrink-0 ${colors.badge} hover:opacity-90 transition-opacity`}
                                                                                        title={`Ouvrir ${ipDetails.ip}:${p.port}`}
                                                                                    >
                                                                                        <Icon size={18} className={`${colors.icon} flex-shrink-0`} />
                                                                                        <span className="font-mono text-sm font-medium">{p.port}</span>
                                                                                        {WELL_KNOWN_PORTS[p.port] ? <span className="text-xs opacity-90 whitespace-nowrap">{WELL_KNOWN_PORTS[p.port]}</span> : null}
                                                                                    </a>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        {ipDetails.scanner.additionalInfo?.lastPortScan && (
                                                            <div className="text-xs text-theme-tertiary mt-3 pt-3 border-t border-theme/50">
                                                                Scan : {new Date(ipDetails.scanner.additionalInfo.lastPortScan).toLocaleString('fr-FR')}
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })()
                                        ) : ipDetails.scanner.additionalInfo?.lastPortScan ? (
                                            <div className="text-theme-tertiary">Aucun port ouvert</div>
                                        ) : (
                                            <div className="text-theme-tertiary">Non scanné</div>
                                        )}
                                    </div>
                                )}

                            </div>

                            {/* SECTION 2: SCHÉMA CONNEXION UNIFI - trait vers port numéroté */}
                            {ipDetails.unifi?.client && (
                                <div className="bg-blue-500/10 rounded-lg border border-blue-500/50 p-6 hover:bg-blue-500/15 transition-colors mb-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <img src={logoUnifi} alt="UniFi" className="w-6 h-6 object-contain flex-shrink-0" />
                                        <h3 className="text-lg font-semibold text-blue-400 uppercase">Connexion UniFi</h3>
                                    </div>

                                    {/* Schéma : [ Appareil ] ——trait——> [ Équipement | Port N ] */}
                                    <div className="flex flex-col md:flex-row items-stretch gap-0 md:gap-4">
                                        {/* Bloc gauche : appareil (IP / nom, type) */}
                                        <div className="flex flex-col justify-center rounded-lg bg-blue-500/20 border border-blue-500/50 p-4 min-w-[180px]">
                                            <div className="text-[10px] font-semibold text-blue-300 uppercase tracking-wider mb-1">Appareil</div>
                                            <div className="font-medium text-theme-primary text-sm truncate" title={ipDetails.ip}>
                                                {ipDetails.unifi?.client?.name || ipDetails.unifi?.client?.hostname || ipDetails.ip}
                                            </div>
                                            <div className="text-xs text-theme-tertiary font-mono mt-0.5">{ipDetails.ip}</div>
                                            <span className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-md text-xs font-medium w-fit ${
                                                ipDetails.unifi.client.is_wireless
                                                    ? (() => {
                                                        let rssi = ipDetails.unifi.client.rssi;
                                                        if (rssi === undefined || rssi === null) {
                                                            const signal = ipDetails.unifi.client.signal;
                                                            if (signal !== undefined && signal !== null) {
                                                                if (typeof signal === 'number' && signal < 0) {
                                                                    rssi = signal;
                                                                } else if (typeof signal === 'number' && signal <= 100 && signal > 0) {
                                                                    rssi = -30 - ((100 - signal) * 0.7);
                                                                }
                                                            }
                                                        }
                                                        if (rssi === undefined || rssi === null) {
                                                            rssi = ipDetails.unifi.client.signal_strength;
                                                        }
                                                        return getSignalBadgeColor(rssi);
                                                    })()
                                                    : 'bg-blue-500/20 border border-blue-500/50 text-blue-400'
                                            }`}>
                                                {ipDetails.unifi.client.is_wireless ? (
                                                    <><Radio size={12} /> WiFi</>
                                                ) : (
                                                    <><Cable size={12} /> Filaire</>
                                                )}
                                            </span>
                                        </div>

                                        {/* Trait de connexion : WiFi = ondes, Filaire = câble horizontal avec petits ovales */}
                                        {ipDetails.unifi.client.is_wireless ? (
                                            <>
                                                <div className="hidden md:flex flex-row justify-center items-center shrink-0 py-4 gap-1">
                                                    <span className="w-4 h-1.5 bg-blue-400/50 rounded-full" aria-hidden />
                                                    <span className="w-3 h-1.5 bg-blue-400/40 rounded-full" aria-hidden />
                                                    <Wifi size={22} className="text-blue-400/90 mx-0.5" />
                                                    <span className="w-3 h-1.5 bg-blue-400/40 rounded-full" aria-hidden />
                                                    <span className="w-4 h-1.5 bg-blue-400/50 rounded-full" aria-hidden />
                                                </div>
                                                <div className="flex md:hidden flex-row justify-center items-center py-2 gap-1">
                                                    <span className="w-3 h-1 bg-blue-400/50 rounded-full" />
                                                    <Wifi size={18} className="text-blue-400/90" />
                                                    <span className="w-3 h-1 bg-blue-400/50 rounded-full" />
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="hidden md:flex flex-row justify-center items-center shrink-0 py-4 gap-0.5">
                                                    <span className="w-2 h-1 bg-blue-400/60 rounded-full" aria-hidden />
                                                    <span className="w-2 h-1 bg-blue-400/60 rounded-full" aria-hidden />
                                                    <span className="w-2 h-1 bg-blue-400/60 rounded-full" aria-hidden />
                                                    <Cable size={18} className="text-blue-400/80 mx-0.5" />
                                                    <span className="w-2 h-1 bg-blue-400/60 rounded-full" aria-hidden />
                                                    <span className="w-2 h-1 bg-blue-400/60 rounded-full" aria-hidden />
                                                    <span className="w-2 h-1 bg-blue-400/60 rounded-full" aria-hidden />
                                                </div>
                                                <div className="flex md:hidden flex-row justify-center items-center py-2 gap-0.5">
                                                    <span className="w-1.5 h-1 bg-blue-400/60 rounded-full" />
                                                    <span className="w-1.5 h-1 bg-blue-400/60 rounded-full" />
                                                    <Cable size={16} className="text-blue-400/80" />
                                                    <span className="w-1.5 h-1 bg-blue-400/60 rounded-full" />
                                                    <span className="w-1.5 h-1 bg-blue-400/60 rounded-full" />
                                                </div>
                                            </>
                                        )}

                                        {/* Bloc droit : équipement + ports (port actif mis en avant) */}
                                        <div className="flex-1 rounded-lg bg-blue-500/10 border border-blue-500/40 p-4 min-w-0">
                                            <div className="text-[10px] font-semibold text-blue-300 uppercase tracking-wider mb-2">Équipement connecté</div>
                                            {(() => {
                                                const eqName = ipDetails.unifi.client.is_wireless && ipDetails.unifi.ap
                                                    ? ipDetails.unifi.ap.name
                                                    : ipDetails.unifi.client.is_wireless && ipDetails.unifi.client.ap_name
                                                    ? ipDetails.unifi.client.ap_name
                                                    : ipDetails.unifi.client.is_wired && ipDetails.unifi.switch
                                                    ? ipDetails.unifi.switch.name
                                                    : ipDetails.unifi.client.is_wired && ipDetails.unifi.client.sw_name
                                                    ? ipDetails.unifi.client.sw_name
                                                    : '--';
                                                const eqDetail = ipDetails.unifi.switch?.ip || ipDetails.unifi.switch?.model || ipDetails.unifi.ap?.ip || ipDetails.unifi.ap?.model;
                                                const swPort = ipDetails.unifi.client.is_wired ? ipDetails.unifi.client.sw_port : null;
                                                const portNum = swPort != null ? Number(swPort) : null;
                                                const maxPorts = 8;
                                                return (
                                                    <>
                                                        <div className="font-medium text-theme-primary text-sm truncate">{eqName}</div>
                                                        {eqDetail && <div className="text-xs text-theme-tertiary font-mono">{eqDetail}</div>}
                                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                                            <span className="text-[10px] text-blue-300/80 uppercase mr-1">Port</span>
                                                            {portNum != null ? (
                                                                <>
                                                                    {Array.from({ length: maxPorts }, (_, i) => i + 1).map((p) => (
                                                                        <div
                                                                            key={p}
                                                                            className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-mono font-semibold border-2 transition-colors ${
                                                                                p === portNum
                                                                                    ? 'bg-blue-500/30 border-blue-400 text-blue-200 shadow-md shadow-blue-500/20'
                                                                                    : 'bg-theme-secondary/50 border-theme/40 text-theme-tertiary'
                                                                            }`}
                                                                            title={p === portNum ? `Connecté (port ${p})` : `Port ${p}`}
                                                                        >
                                                                            {p}
                                                                        </div>
                                                                    ))}
                                                                    <span className="text-xs text-blue-400 ml-1">← connecté</span>
                                                                </>
                                                            ) : ipDetails.unifi.client.is_wireless ? (
                                                                (() => {
                                                                    const ssid = ipDetails.unifi.client.ssid || ipDetails.unifi.client.essid || ipDetails.unifi.client.wifi_ssid || ipDetails.unifi.client.wlan_ssid;
                                                                    return ssid ? (
                                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-500/20 border border-blue-500/50 text-blue-300">
                                                                            <Wifi size={14} /> {ssid}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-theme-tertiary text-sm">--</span>
                                                                    );
                                                                })()
                                                            ) : (
                                                                <span className="text-theme-tertiary text-sm">--</span>
                                                            )}
                                                        </div>
                                                        {ipDetails.unifi.client.last_seen && (
                                                            <div className="text-xs text-theme-tertiary mt-2 flex items-center gap-1">
                                                                <Clock size={12} />
                                                                Dernière vue : {formatDate(new Date(ipDetails.unifi.client.last_seen * 1000).toISOString())}
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* SECTION 3: BLOC FREEBOX */}
                            {ipDetails.freebox?.dhcp && (
                                <div className="bg-purple-500/10 rounded-lg border border-purple-500/50 p-6 hover:bg-purple-500/15 transition-colors mb-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Home size={18} className="text-purple-400" />
                                        <h3 className="text-lg font-semibold text-purple-400 uppercase">Configuration DHCP Freebox</h3>
                                    </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                            <div className="flex items-center gap-2">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                                                    ipDetails.freebox.dhcp.static
                                                        ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                                                        : 'bg-purple-500/20 border border-purple-500/50 text-purple-400'
                                                }`}>
                                                    <Home size={14} />
                                                    {ipDetails.freebox.dhcp.static ? 'RÉSERVATION STATIQUE' : 'DHCP DYNAMIQUE'}
                                                </span>
                                            </div>
                                            {ipDetails.freebox.dhcp.hostname && (
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-xs font-semibold text-theme-tertiary uppercase">Hostname</span>
                                                    <span className="text-sm font-medium text-theme-primary">{ipDetails.freebox.dhcp.hostname}</span>
                                                </div>
                                            )}
                                            {ipDetails.freebox.dhcp.mac && (
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-xs font-semibold text-theme-tertiary uppercase">MAC</span>
                                                    <span className="text-sm font-mono text-theme-primary">{formatMac(ipDetails.freebox.dhcp.mac)}</span>
                                                </div>
                                            )}
                                            {ipDetails.freebox.dhcp.ip && (
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-xs font-semibold text-theme-tertiary uppercase">IP</span>
                                                    <span className="text-sm font-mono text-theme-primary">{ipDetails.freebox.dhcp.ip}</span>
                                                </div>
                                            )}
                                            {ipDetails.freebox.dhcp.comment && (
                                                <div className="flex flex-col gap-1 md:col-span-2 lg:col-span-1">
                                                    <span className="text-xs font-semibold text-theme-tertiary uppercase">Commentaire</span>
                                                    <span className="text-sm text-theme-secondary">{ipDetails.freebox.dhcp.comment}</span>
                                                </div>
                                            )}
                                            {ipDetails.freebox.dhcp.expires && (
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-xs font-semibold text-theme-tertiary uppercase">Expire le</span>
                                                    <span className="text-sm text-theme-secondary">
                                                        {formatDate(new Date(ipDetails.freebox.dhcp.expires * 1000).toISOString())}
                                                    </span>
                                                </div>
                                            )}
                                            {ipDetails.freebox.dhcp.lease_time && (
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-xs font-semibold text-theme-tertiary uppercase">Durée du bail</span>
                                                    <span className="text-sm text-theme-secondary">
                                                        {ipDetails.freebox.dhcp.lease_time} secondes ({Math.floor(ipDetails.freebox.dhcp.lease_time / 3600)}h)
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                </div>
                            )}

                            {/* Port Forwarding - Individual Cards */}
                            {ipDetails.freebox?.portForwarding && Array.isArray(ipDetails.freebox.portForwarding) && ipDetails.freebox.portForwarding.length > 0 && (
                                <div className="bg-purple-500/10 rounded-lg border border-purple-500/50 p-6 hover:bg-purple-500/15 transition-colors mb-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Router size={18} className="text-purple-400" />
                                        <h3 className="text-lg font-semibold text-purple-400 uppercase">Redirections de Port ({ipDetails.freebox.portForwarding.length})</h3>
                                    </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {ipDetails.freebox.portForwarding.map((rule: any, idx: number) => {
                                                const protocol = (rule.ip_proto || rule.protocol || 'TCP').toUpperCase();
                                                const wanPortEnd = rule.wan_port_end && rule.wan_port_end !== rule.wan_port_start 
                                                    ? `-${rule.wan_port_end}` 
                                                    : '';
                                                const isEnabled = rule.enabled !== false;
                                                
                                                return (
                                                    <div 
                                                        key={rule.id || idx} 
                                                        className={`bg-theme-secondary/30 rounded-lg border p-4 hover:bg-theme-secondary/40 transition-all ${
                                                            isEnabled
                                                                ? 'border-purple-500/50 shadow-lg shadow-purple-500/10'
                                                                : 'border-gray-500/30 opacity-60'
                                                        }`}
                                                    >
                                                        {/* Header */}
                                                        <div className="flex items-start justify-between gap-2 mb-3">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                                                                    isEnabled
                                                                        ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                                                                        : 'bg-gray-500/20 border border-gray-500/50 text-gray-400'
                                                                }`}>
                                                                    {isEnabled ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                                                                    {isEnabled ? 'Actif' : 'Inactif'}
                                                                </span>
                                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                                                    protocol === 'TCP' 
                                                                        ? 'bg-blue-500/20 border border-blue-500/50 text-blue-400'
                                                                        : protocol === 'UDP'
                                                                        ? 'bg-purple-500/20 border border-purple-500/50 text-purple-400'
                                                                        : 'bg-theme-secondary border border-theme text-theme-secondary'
                                                                }`}>
                                                                    {protocol}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        
                                                        {/* Port Mapping - Visual Flow */}
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <div className="flex-1 bg-blue-500/10 border border-blue-500/30 rounded px-3 py-2">
                                                                    <div className="text-xs text-theme-tertiary uppercase mb-0.5">WAN</div>
                                                                    <div className="text-sm font-mono font-semibold text-blue-400">
                                                                        {rule.wan_port_start}{wanPortEnd}
                                                                    </div>
                                                                </div>
                                                                <ArrowUpDown size={18} className="text-purple-400 flex-shrink-0" />
                                                                <div className="flex-1 bg-green-500/10 border border-green-500/30 rounded px-3 py-2">
                                                                    <div className="text-xs text-theme-tertiary uppercase mb-0.5">LAN</div>
                                                                    <div className="text-sm font-mono font-semibold text-green-400">
                                                                        {ipDetails.ip}:{rule.lan_port}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        
                                                        {/* Comment and Source IP */}
                                                        {(rule.comment || rule.src_ip) && (
                                                            <div className="mt-3 pt-3 border-t border-theme/30 space-y-1.5">
                                                                {rule.comment && (
                                                                    <div className="text-xs text-theme-secondary">
                                                                        <span className="text-theme-tertiary">Commentaire: </span>
                                                                        <span className="text-theme-primary">{rule.comment}</span>
                                                                    </div>
                                                                )}
                                                                {rule.src_ip && (
                                                                    <div className="text-xs text-theme-secondary">
                                                                        <span className="text-theme-tertiary">Source IP: </span>
                                                                        <span className="font-mono text-theme-primary">{rule.src_ip}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                </div>
                            )}
                        </div>
                    </Card>
                ) : (
                    <Card 
                        title={`Résultats (${filteredResults.length})`}
                        actions={
                            <div className="flex items-center gap-2 text-sm text-theme-secondary">
                                <span>Page {currentPage} sur {totalPages}</span>
                            </div>
                        }
                    >
                        {/* Table */}
                        <div className="overflow-x-auto rounded-lg border border-theme">
                            <table className="w-full text-sm">
                                <thead className="bg-theme-secondary/50">
                                    <tr>
                                        <th className="text-left py-3 px-4 font-semibold text-theme-primary">
                                            <button
                                                onClick={() => handleSort('plugin')}
                                                className="flex items-center gap-1.5 hover:text-accent-primary transition-colors group"
                                            >
                                                <span>Plugin</span>
                                                <ArrowUpDown size={14} className={sortField === 'plugin' ? 'text-accent-primary' : 'text-theme-tertiary group-hover:text-theme-secondary'} />
                                            </button>
                                        </th>
                                        <th className="text-left py-3 px-4 font-semibold text-theme-primary">
                                            <button
                                                onClick={() => handleSort('ip')}
                                                className="flex items-center gap-1.5 hover:text-accent-primary transition-colors group"
                                            >
                                                <span>IP</span>
                                                <ArrowUpDown size={14} className={sortField === 'ip' ? 'text-accent-primary' : 'text-theme-tertiary group-hover:text-theme-secondary'} />
                                            </button>
                                        </th>
                                        <th className="text-left py-3 px-4 font-semibold text-theme-primary">
                                            <button
                                                onClick={() => handleSort('name')}
                                                className="flex items-center gap-1.5 hover:text-accent-primary transition-colors group"
                                            >
                                                <span>Nom</span>
                                                <ArrowUpDown size={14} className={sortField === 'name' ? 'text-accent-primary' : 'text-theme-tertiary group-hover:text-theme-secondary'} />
                                            </button>
                                        </th>
                                        <th className="text-left py-3 px-4 font-semibold text-theme-primary">AP / Switch</th>
                                        <th className="text-left py-3 px-4 font-semibold text-theme-primary">
                                            <button
                                                onClick={() => handleSort('mac')}
                                                className="flex items-center gap-1.5 hover:text-accent-primary transition-colors group"
                                            >
                                                <span>MAC</span>
                                                <ArrowUpDown size={14} className={sortField === 'mac' ? 'text-accent-primary' : 'text-theme-tertiary group-hover:text-theme-secondary'} />
                                            </button>
                                        </th>
                                        <th className="text-left py-3 px-4 font-semibold text-theme-primary">Ports</th>
                                        <th className="text-left py-3 px-4 font-semibold text-theme-primary">Statut</th>
                                        <th className="text-left py-3 px-4 font-semibold text-theme-primary">Dernière vue</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedResults.map((result, index) => {
                                        const sources = (result.additionalData as { sources?: string[] } | undefined)?.sources;
                                        const isMerged = Array.isArray(sources) && sources.length > 1;
                                        const isFreebox = result.pluginId === 'freebox' || (isMerged && sources?.includes('Freebox'));
                                        const isUnifi = result.pluginId === 'unifi' || (isMerged && sources?.some(s => s.toLowerCase().includes('unifi')));
                                        const isScan = result.pluginId === 'scan-reseau' || (isMerged && sources?.some(s => s.includes('Scan')));
                                        const dhcpFrom = (result.additionalData as { dhcpFrom?: 'freebox' | 'unifi' } | undefined)?.dhcpFrom;
                                        const openPortsCount = (result.additionalData as { openPortsCount?: number } | undefined)?.openPortsCount ?? 0;
                                        const adPorts = result.additionalData as { openPorts?: { port: number; protocol?: string }[]; lastPortScan?: string } | undefined;
                                        const openPortsList = Array.isArray(adPorts?.openPorts) ? adPorts.openPorts : [];
                                        const lastPortScan = adPorts?.lastPortScan;
                                        return (
                                            <tr
                                                key={`${result.pluginId}-${result.id}-${index}`}
                                                className="border-b border-theme hover:bg-theme-secondary/50 transition-colors"
                                            >
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {isFreebox && (
                                                            <img src={logoFreebox} alt="Freebox" className="w-4 h-4 object-contain flex-shrink-0" title="Freebox : appareils, DHCP, redirections de port" />
                                                        )}
                                                        {isUnifi && (
                                                            <img src={logoUnifi} alt="UniFi" className="w-4 h-4 object-contain flex-shrink-0" title="UniFi : clients, points d'accès" />
                                                        )}
                                                        {isScan && (
                                                            <Activity size={16} className="text-cyan-400 flex-shrink-0" title="Scan Réseau : découverte, ports ouverts" />
                                                        )}
                                                        {dhcpFrom && (
                                                            <span
                                                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                                    dhcpFrom === 'freebox' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                                                                }`}
                                                                title={dhcpFrom === 'freebox' ? 'DHCP géré par Freebox' : 'DHCP géré par UniFi'}
                                                            >
                                                                <Router size={12} />
                                                                DHCP
                                                            </span>
                                                        )}
                                                        {(() => {
                                                            const ad = result.additionalData as { is_wired?: boolean; is_wireless?: boolean } | undefined;
                                                            if (ad?.is_wired) return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-500/20 text-slate-300" title="Filaire"><Cable size={12} /> Filaire</span>;
                                                            if (ad?.is_wireless) return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-300" title="WiFi"><Radio size={12} /> WiFi</span>;
                                                            return null;
                                                        })()}
                                                    </div>
                                                </td>
                                            <td className="py-3 px-4">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {result.ip ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const urlParams = new URLSearchParams(window.location.search);
                                                                    urlParams.set('s', result.ip!);
                                                                    const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
                                                                    window.history.pushState(null, '', newUrl);
                                                                    setSearchQuery(result.ip!);
                                                                    performSearch(result.ip!);
                                                                }}
                                                                className={`text-left font-mono hover:text-cyan-400 transition-colors cursor-pointer inline-flex items-baseline gap-0.5 ${result.active === false ? 'text-gray-500' : ''}`}
                                                                style={result.active !== false ? { color: 'rgb(152, 181, 238)' } : undefined}
                                                                title={`Rechercher ${result.ip} dans la page de recherche`}
                                                            >
                                                                <span>{result.ip}</span>
                                                                <Link2 size={9} className="opacity-50 relative top-[-2px]" />
                                                            </button>
                                                        ) : (
                                                            <span className="font-mono text-theme-secondary">--</span>
                                                        )}
                                                        {/* Latency scatter badge - show if monitoring is enabled */}
                                                        {result.ip && monitoringStatus[result.ip] === true && (
                                                            <button
                                                                onClick={() => handleOpenLatencyGraph(result.ip!)}
                                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
                                                                title="Voir le graphique de latence scatter"
                                                            >
                                                                <BarChart2 size={12} />
                                                                Latency scatter
                                                            </button>
                                                        )}
                                                        {/* Manual ping button - visible when ping is enabled */}
                                                        {pingEnabled && result.ip && isValidIpOrDomain(result.ip) && (
                                                            <button
                                                                onClick={() => pingSingleTarget(result.ip!)}
                                                                disabled={pingingIps.has(result.ip)}
                                                                className={`p-1 rounded transition-colors ${
                                                                    pingingIps.has(result.ip)
                                                                        ? 'text-theme-tertiary cursor-not-allowed'
                                                                        : 'text-theme-secondary hover:text-cyan-400 hover:bg-cyan-500/10'
                                                                }`}
                                                                title={pingingIps.has(result.ip) ? 'Ping en cours...' : `Pinger ${result.ip}`}
                                                            >
                                                                {pingingIps.has(result.ip) ? (
                                                                    <Loader2 size={14} className="animate-spin" />
                                                                ) : (
                                                                    <Network size={14} />
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                    {/* Ping result display - Show animation while pinging, result when done */}
                                                    {pingEnabled && result.ip && isLocalIPv4(result.ip) && (
                                                        <div className="flex items-center gap-2">
                                                            {pingingIps.has(result.ip) ? (
                                                                <span className="text-xs text-theme-tertiary flex items-center gap-1">
                                                                    <Loader2 size={10} className="animate-spin" />
                                                                    Ping...
                                                                </span>
                                                            ) : pingResults[result.ip] ? (
                                                                pingResults[result.ip].success ? (
                                                                    <span className={`text-xs font-medium ${getLatencyColor(pingResults[result.ip].time || 0)}`}>
                                                                        {pingResults[result.ip].time !== undefined 
                                                                            ? `${pingResults[result.ip].time}ms`
                                                                            : 'UP'}
                                                                    </span>
                                                                ) : (
                                                                    <div className="flex flex-col">
                                                                        <span className="text-xs font-medium text-red-400">DOWN</span>
                                                                        {pingResults[result.ip].error && (
                                                                            <span className="text-xs text-red-400/80" title={pingResults[result.ip].error}>
                                                                                {pingResults[result.ip].error}
                                                                    </span>
                                                                        )}
                                                                    </div>
                                                                )
                                                            ) : null}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex flex-col">
                                                    <span className="text-theme-primary font-medium">
                                                        {result.name}
                                                    </span>
                                                    {result.hostname && result.hostname !== result.name && (
                                                        <span className="text-xs text-theme-tertiary">
                                                            {result.hostname}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                {(() => {
                                                    const ad = result.additionalData as { is_wired?: boolean; is_wireless?: boolean; ap_name?: string; sw_name?: string; ssid?: string } | undefined;
                                                    const hasAp = !!(ad?.ap_name || ad?.ssid);
                                                    const hasSw = !!ad?.sw_name;
                                                    if (ad?.is_wireless || (hasAp && !hasSw)) {
                                                        const label = ad?.ap_name || ad?.ssid || 'WiFi';
                                                        return (
                                                            <span className="text-xs text-theme-secondary flex items-center gap-1" title={ad?.ap_name || ad?.ssid ? 'Point d\'accès WiFi' : 'WiFi'}>
                                                                <Radio size={12} className="text-blue-400/80" />
                                                                {label}
                                                            </span>
                                                        );
                                                    }
                                                    if (ad?.is_wired || hasSw) {
                                                        const label = ad?.sw_name || 'Filaire';
                                                        return (
                                                            <span className="text-xs text-theme-secondary flex items-center gap-1" title={ad?.sw_name ? 'Switch connecté' : 'Filaire'}>
                                                                <Cable size={12} className="text-slate-400/80" />
                                                                {label}
                                                            </span>
                                                        );
                                                    }
                                                    return <span className="text-theme-tertiary">--</span>;
                                                })()}
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="font-mono text-theme-secondary">
                                                    {formatMac(result.mac)}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                {openPortsCount > 0 ? (
                                                    <span
                                                        className="font-mono text-sm text-cyan-400 cursor-default"
                                                        title={openPortsList.length > 0 ? undefined : `${openPortsCount} port(s) ouvert(s)`}
                                                        onMouseEnter={(e) => {
                                                            if (openPortsList.length === 0 || !result.ip) return;
                                                            cancelTooltipHide();
                                                            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                            setPortsTooltip({
                                                                ip: result.ip,
                                                                openPorts: openPortsList.map((p) => ({ port: p.port, protocol: p.protocol })),
                                                                lastPortScan,
                                                                rect: { left: r.left, top: r.top, bottom: r.bottom, right: r.right }
                                                            });
                                                        }}
                                                        onMouseLeave={() => scheduleTooltipHide()}
                                                    >
                                                        {openPortsCount}
                                                    </span>
                                                ) : (
                                                    <span className="text-theme-tertiary">--</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4">
                                                {result.active !== undefined ? (
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                                                        result.active
                                                            ? 'bg-emerald-900/30 border border-emerald-700 text-emerald-400'
                                                            : 'bg-gray-800/50 border border-gray-700 text-gray-500'
                                                    }`}>
                                                        {result.active ? (
                                                            <>
                                                                <CheckCircle size={12} />
                                                                Actif
                                                            </>
                                                        ) : (
                                                            <>
                                                                <X size={12} />
                                                                Inactif
                                                            </>
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span className="text-theme-tertiary">--</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="text-xs text-theme-tertiary">
                                                    {formatDate(result.lastSeen)}
                                                </span>
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-4 pt-4 border-t border-theme">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="flex items-center gap-2 px-4 py-2 bg-theme-secondary border border-theme rounded-lg text-theme-primary hover:bg-theme-tertiary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft size={16} />
                                    Précédent
                                </button>
                                <span className="text-sm text-theme-secondary">
                                    Page {currentPage} sur {totalPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="flex items-center gap-2 px-4 py-2 bg-theme-secondary border border-theme rounded-lg text-theme-primary hover:bg-theme-tertiary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    Suivant
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        )}
                    </Card>
                )}
            </div>

            {/* Search Options Info Modal */}
            <SearchOptionsInfoModal
                isOpen={showOptionsInfoModal}
                onClose={() => setShowOptionsInfoModal(false)}
            />

            {/* Hover tooltip Ports (recherche groupée) - comme page Scan */}
            {portsTooltip && (() => {
                const pos = getPortsTooltipPosition(portsTooltip.rect, PORTS_TOOLTIP_W, PORTS_TOOLTIP_H);
                const sorted = [...portsTooltip.openPorts].sort((a, b) => a.port - b.port);
                const byCategory = sorted.reduce<Record<string, { port: number; protocol?: string }[]>>((acc, p) => {
                    const cat = getPortCategory(p.port);
                    if (!acc[cat]) acc[cat] = [];
                    acc[cat].push(p);
                    return acc;
                }, {});
                const categoryOrder = ['Web', 'Bases de données', 'Mail', 'Système', 'Accès distant', 'Docker', 'Autres'];
                const orderedCategories = categoryOrder.filter((c) => byCategory[c]?.length).concat(Object.keys(byCategory).filter((c) => !categoryOrder.includes(c)));
                return (
                    <div
                        className="fixed z-[100] rounded-xl border border-gray-600/80 bg-[#141414] shadow-2xl shadow-black/50 backdrop-blur-sm py-4 px-5 w-[min(420px,calc(100vw-32px))]"
                        style={{ left: pos.left, top: pos.top }}
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
                                            <div className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${colors.label}`}>{cat}</div>
                                            <div className="grid grid-cols-3 gap-x-3 gap-y-1">
                                                {byCategory[cat].map((p) => {
                                                    const Icon = getPortIcon(p.port);
                                                    return (
                                                        <div key={p.port} className={`flex items-center gap-2 py-1.5 px-2 rounded-lg border ${colors.badge}`}>
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
                            <div className="text-sm text-gray-500 py-1">Aucun port ouvert</div>
                        )}
                        {portsTooltip.lastPortScan && (
                            <div className="mt-3 pt-3 border-t border-gray-700/80 text-xs text-gray-500">
                                Scan : {new Date(portsTooltip.lastPortScan).toLocaleString('fr-FR')}
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Search History Modal */}
            <SearchHistoryModal
                isOpen={showHistoryModal}
                onClose={() => setShowHistoryModal(false)}
                history={searchHistory}
                onSelect={(entry) => {
                    setSearchQuery(entry.query);
                    setCaseSensitive(entry.caseSensitive);
                    setShowOnlyActive(entry.showOnlyActive);
                    setShowHistoryModal(false);
                    performSearch(entry.query, {
                        caseSensitive: entry.caseSensitive,
                        showOnlyActive: entry.showOnlyActive
                    });
                }}
                onDelete={removeFromSearchHistory}
                onClearAll={clearAllSearchHistory}
            />
            
            {/* Latency Monitoring Modal */}
            {showLatencyModal && selectedIpForLatencyGraph && (
                <LatencyMonitoringModal
                    isOpen={showLatencyModal}
                    onClose={() => {
                        setShowLatencyModal(false);
                        setSelectedIpForLatencyGraph(null);
                    }}
                    ip={selectedIpForLatencyGraph}
                />
            )}
        </div>
    );
};

