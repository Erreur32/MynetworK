/**
 * Search Results Page
 * 
 * Displays search results from all active plugins
 * with filtering, sorting, and pagination
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight, Loader2, X, CheckCircle, AlertCircle, Server, Wifi, RotateCw, Power, Info, Network, Globe, Home, Router, Cable, Radio } from 'lucide-react';
import { Card } from '../components/widgets/Card';
import { api } from '../api/client';
import { usePluginStore } from '../stores/pluginStore';
import { SearchOptionsInfoModal } from '../components/modals/SearchOptionsInfoModal';

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
    };
}

const ITEMS_PER_PAGE = 20;

interface SearchPageProps {
    onBack?: () => void;
}

export const SearchPage: React.FC<SearchPageProps> = ({ onBack }) => {
    const { plugins } = usePluginStore();
    
    // Get query from sessionStorage
    const [searchQuery, setSearchQuery] = useState<string>(() => {
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
    const [exactMatch, setExactMatch] = useState(true); // Default to exact match mode
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [showOnlyActive, setShowOnlyActive] = useState(true); // Filter by default to show only active devices
    const [pingEnabled, setPingEnabled] = useState(false);
    const [pingResults, setPingResults] = useState<Record<string, { success: boolean; time?: number; error?: string }>>({});
    const [pingingIps, setPingingIps] = useState<Set<string>>(new Set());
    const [showOptionsInfoModal, setShowOptionsInfoModal] = useState(false);

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
    
    // Get active plugins
    const activePlugins = useMemo(() => {
        return plugins.filter(p => p.enabled && p.connectionStatus);
    }, [plugins]);

    // Filters - Initialize with all active plugins by default
    const [selectedPlugins, setSelectedPlugins] = useState<string[]>([]);
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    
    // Sorting
    const [sortField, setSortField] = useState<'name' | 'plugin' | 'type' | 'ip' | 'mac'>('name');
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
            const response = await api.get<{ success: boolean; result?: { latency: number } }>(`/api/speedtest/ping?target=${encodeURIComponent(target)}&count=3`);
            if (response.success && response.result && 'latency' in response.result && typeof response.result.latency === 'number') {
                // Round to at least 1ms if result is 0ms (for display purposes)
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

    // Ping the search query directly (from input field)
    const pingSearchQuery = async (query: string) => {
        if (!query.trim() || !isValidIpOrDomain(query.trim())) return;
        
        const target = query.trim();
        const isLocal = isLocalIPv4(target);
        
        // Only ping if it's a valid IP/domain
        if (isValidIpOrDomain(target)) {
            await pingSingleTarget(target);
        }
    };

    // Perform search
    const performSearch = async (query: string) => {
        if (!query.trim()) {
            setResults([]);
            setHasSearched(false);
            setIpDetails(null);
            setIsExactIpSearch(false);
            return;
        }

        setIsLoading(true);
        setError(null);
        setHasSearched(true); // Mark that a search has been performed
        setIpDetails(null);
        setIsExactIpSearch(false);

        const trimmedQuery = query.trim();
        const isIp = isExactIp(trimmedQuery);

        try {
            // If it's an exact IP search, get aggregated details
            if (isIp && exactMatch) {
                setIsExactIpSearch(true);
                try {
                    const ipDetailsResponse = await api.get<IpDetailsResponse>(`/api/search/ip-details/${trimmedQuery}`);
                    if (ipDetailsResponse.success && ipDetailsResponse.result) {
                        // Debug: log UniFi client data
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
                        // Also perform regular search to get all results for this IP
                        const regularResponse = await api.post<SearchResultData>('/api/search', {
                            query: trimmedQuery,
                            pluginIds: selectedPlugins.length > 0 ? selectedPlugins : undefined,
                            types: selectedTypes.length > 0 ? selectedTypes : undefined,
                            exactMatch: true,
                            caseSensitive
                        });
                        if (regularResponse.success && regularResponse.result?.results) {
                            setResults(regularResponse.result.results);
                        }
                    } else {
                        // Fallback to regular search if IP details fail
                        setIsExactIpSearch(false);
                        const response = await api.post<SearchResultData>('/api/search', {
                            query: trimmedQuery,
                            pluginIds: selectedPlugins.length > 0 ? selectedPlugins : undefined,
                            types: selectedTypes.length > 0 ? selectedTypes : undefined,
                            exactMatch,
                            caseSensitive
                        });
                        if (response.success && response.result?.results) {
                            setResults(response.result.results);
                        } else {
                            const errorMsg = response.error?.message || 'Erreur lors de la recherche';
                            setError(errorMsg);
                            setResults([]);
                        }
                    }
                } catch (ipErr: any) {
                    // If IP details fail, fallback to regular search
                    console.warn('Search', `Failed to get IP details, falling back to regular search:`, ipErr);
                    setIsExactIpSearch(false);
                    const response = await api.post<SearchResultData>('/api/search', {
                        query: trimmedQuery,
                        pluginIds: selectedPlugins.length > 0 ? selectedPlugins : undefined,
                        types: selectedTypes.length > 0 ? selectedTypes : undefined,
                        exactMatch,
                        caseSensitive
                    });
                    if (response.success && response.result?.results) {
                        setResults(response.result.results);
                    } else {
                        const errorMsg = response.error?.message || 'Erreur lors de la recherche';
                        setError(errorMsg);
                        setResults([]);
                    }
                }
            } else {
                // Regular search
                const response = await api.post<SearchResultData>('/api/search', {
                    query: trimmedQuery,
                    pluginIds: selectedPlugins.length > 0 ? selectedPlugins : undefined,
                    types: selectedTypes.length > 0 ? selectedTypes : undefined,
                    exactMatch,
                    caseSensitive
                });

                if (response.success && response.result?.results) {
                    // Display results immediately
                    setResults(response.result.results);
                    
                    // If ping automatic is enabled, ping all local IPs in results (non-blocking)
                    // This runs in the background, results are already displayed
                    if (pingEnabled) {
                        // Don't await - let it run in background while results are displayed
                        pingAllResults(response.result.results);
                    }
                } else {
                    // Handle API error response
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
    }, [selectedPlugins, selectedTypes, exactMatch, caseSensitive, showOnlyActive]);

    // Filtered and sorted results
    const filteredResults = useMemo(() => {
        let filtered = [...results];

        // Apply filters
        if (selectedPlugins.length > 0) {
            filtered = filtered.filter(r => selectedPlugins.includes(r.pluginId));
        }
        if (selectedTypes.length > 0) {
            filtered = filtered.filter(r => selectedTypes.includes(r.type));
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
                case 'type':
                    aValue = a.type || '';
                    bValue = b.type || '';
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
    }, [results, selectedPlugins, selectedTypes, showOnlyActive, sortField, sortDirection]);

    // Paginated results
    const totalPages = Math.ceil(filteredResults.length / ITEMS_PER_PAGE);
    const paginatedResults = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredResults.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredResults, currentPage]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedPlugins, selectedTypes, showOnlyActive, sortField, sortDirection]);

    // Get unique types from results
    const availableTypes = useMemo(() => {
        const types = new Set<string>();
        results.forEach(r => types.add(r.type));
        return Array.from(types).sort();
    }, [results]);

    // Type labels
    const getTypeLabel = (type: string): string => {
        const labels: Record<string, string> = {
            'device': 'Appareil',
            'dhcp': 'DHCP',
            'port-forward': 'Redirection de port',
            'client': 'Client',
            'ap': 'Point d\'accès',
            'switch': 'Switch'
        };
        return labels[type] || type;
    };

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

    const toggleType = (type: string) => {
        setSelectedTypes(prev =>
            prev.includes(type)
                ? prev.filter(t => t !== type)
                : [...prev, type]
        );
    };

    const handleSort = (field: 'name' | 'plugin' | 'type' | 'ip' | 'mac') => {
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
        setSelectedTypes([]);
        setExactMatch(true);
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
        <div className="min-h-screen bg-theme-primary">
            <div className="max-w-[1920px] mx-auto p-4 md:p-6 space-y-6">
                {/* Header */}
                <div className="mb-6">
                    <p className="text-sm text-theme-secondary">
                        Recherche dans les plugins actifs (Freebox, UniFi)
                    </p>
                </div>

                {/* Two columns layout: Search bar and Options/Filters */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left column: Search bar */}
                    <div>
                        <Card title="Rechercher">
                            <div className="space-y-4">
                                <div className="flex gap-3">
                                    <div className="flex-1 relative">
                                        <Search size={24} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-accent-primary opacity-80" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => {
                                                setSearchQuery(e.target.value);
                                                // Reset hasSearched when user types to prevent showing "no results" message
                                                if (hasSearched) {
                                                    setHasSearched(false);
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    handleSearch();
                                                }
                                            }}
                                            placeholder="Rechercher (nom, MAC, IP, port, hostname...)"
                                            className="w-full pl-14 pr-4 py-3 bg-theme-secondary border border-theme rounded-lg text-theme-primary placeholder-theme-tertiary focus:outline-none transition-all"
                                        />
                                    </div>
                                    <button
                                        onClick={handleSearch}
                                        disabled={isLoading || !searchQuery.trim()}
                                        className="px-6 py-3 bg-accent-primary text-white rounded-lg hover:bg-accent-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 font-medium shadow-lg shadow-accent-primary/20"
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 size={18} className="animate-spin" />
                                                Recherche...
                                            </>
                                        ) : (
                                            <>
                                                <Search size={18} />
                                                Rechercher
                                            </>
                                        )}
                                    </button>
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
                                {/* Display ping result for search query if it's an IP/domain */}
                                {searchQuery.trim() && isValidIpOrDomain(searchQuery.trim()) && pingResults[searchQuery.trim()] && (
                                    <div className={`p-3 rounded-lg border ${
                                        pingResults[searchQuery.trim()].success
                                            ? 'bg-emerald-500/10 border-emerald-500/30'
                                            : 'bg-red-500/10 border-red-500/30'
                                    }`}>
                                        <div className="flex items-center gap-2">
                                            {pingResults[searchQuery.trim()].success ? (
                                                <>
                                                    <CheckCircle size={16} className="text-emerald-400" />
                                                    <span className="text-sm font-medium">
                                                        {searchQuery.trim()} répond en{' '}
                                                        <span className={getLatencyColor(pingResults[searchQuery.trim()].time || 0)}>
                                                            {pingResults[searchQuery.trim()].time}ms
                                                        </span>
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <X size={16} className="text-red-400" />
                                                    <span className="text-sm text-red-400">
                                                        {searchQuery.trim()} ne répond pas
                                                        {pingResults[searchQuery.trim()].error && ` (${pingResults[searchQuery.trim()].error})`}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Plugin filter - Under search bar */}
                                {activePlugins.length > 0 && (
                                    <div>
                                        <label className="text-sm font-medium text-theme-secondary mb-3 block">
                                            Plugins
                                        </label>
                                        <div className="flex flex-wrap gap-3">
                                            {activePlugins.map(plugin => {
                                                const isFreebox = plugin.id === 'freebox';
                                                const isUnifi = plugin.id === 'unifi';
                                                const isSelected = selectedPlugins.includes(plugin.id);
                                                
                                                return (
                                                    <button
                                                        key={plugin.id}
                                                        onClick={() => togglePlugin(plugin.id)}
                                                        className={`group relative px-4 py-2.5 rounded-lg text-sm font-medium border transition-all duration-200 flex items-center gap-2 ${
                                                            isSelected
                                                                ? isFreebox
                                                                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-400 shadow-lg shadow-blue-500/10'
                                                                    : isUnifi
                                                                        ? 'bg-purple-500/20 border-purple-500/50 text-purple-400 shadow-lg shadow-purple-500/10'
                                                                        : 'bg-accent-primary/20 border-accent-primary text-accent-primary'
                                                                : 'bg-theme-secondary border-theme text-theme-secondary hover:bg-theme-tertiary hover:border-theme-hover'
                                                        }`}
                                                    >
                                                        {isFreebox && <Server size={16} className={isSelected ? 'text-blue-400' : 'text-theme-tertiary'} />}
                                                        {isUnifi && <Wifi size={16} className={isSelected ? 'text-purple-400' : 'text-theme-tertiary'} />}
                                                        <span>{plugin.name}</span>
                                                        {isSelected && (
                                                            <span className="ml-1 text-xs opacity-70">
                                                                ({results.filter(r => r.pluginId === plugin.id).length})
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>

                    {/* Right column: Search options and filters */}
                    <div>
                        <Card 
                            title="Filtres"
                            actions={
                                <button
                                    onClick={() => setShowOptionsInfoModal(true)}
                                    className="p-1.5 hover:bg-theme-tertiary rounded-lg transition-colors text-theme-secondary hover:text-theme-primary"
                                    title="Aide sur les options de recherche"
                                >
                                    <Info size={18} />
                                </button>
                            }
                        >
                    <div className="space-y-4">
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
                            
                            <button
                                onClick={() => {
                                    if (!pingEnabled) {
                                        setExactMatch(!exactMatch);
                                    }
                                }}
                                disabled={pingEnabled}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all duration-200 font-medium ${
                                    pingEnabled
                                        ? 'opacity-50 cursor-not-allowed bg-theme-secondary border-theme text-theme-tertiary'
                                        : !exactMatch
                                            ? 'bg-accent-primary/20 border-accent-primary text-accent-primary shadow-lg shadow-accent-primary/10'
                                            : 'bg-theme-secondary border-theme text-theme-secondary hover:bg-theme-tertiary hover:border-theme-hover'
                                }`}
                            >
                                <div className={`relative w-10 h-5 rounded-full transition-all duration-200 ${
                                    !exactMatch ? 'bg-blue-500' : 'bg-theme-tertiary'
                                }`}>
                                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all duration-200 shadow-md ${
                                        !exactMatch ? 'translate-x-5' : 'translate-x-0'
                                    }`} />
                                </div>
                                <span>Étendu</span>
                            </button>
                            
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
                                        // Disable other options when ping is enabled
                                        setExactMatch(false);
                                        setCaseSensitive(false);
                                        setShowOnlyActive(false);
                                        
                                        // If we have search results, ping them
                                        // Otherwise, ping the search query directly (from input field)
                                        if (results.length > 0) {
                                            await pingAllResults(filteredResults);
                                        } else if (searchQuery.trim() && isValidIpOrDomain(searchQuery.trim())) {
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

                        {/* Filters - Type filter */}
                        {availableTypes.length > 0 && (
                            <div className="pt-3 border-t border-theme">
                                <div>
                                    <label className="text-sm font-medium text-theme-secondary mb-3 block">
                                        Types de résultats
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {availableTypes.map(type => {
                                            const isSelected = selectedTypes.includes(type);
                                            const count = filteredResults.filter(r => r.type === type).length;
                                            
                                            // Color coding by type
                                            let colorClass = '';
                                            if (isSelected) {
                                                switch (type) {
                                                    case 'device':
                                                    case 'client':
                                                        colorClass = 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400';
                                                        break;
                                                    case 'ap':
                                                    case 'switch':
                                                        colorClass = 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400';
                                                        break;
                                                    case 'dhcp':
                                                        colorClass = 'bg-amber-500/20 border-amber-500/50 text-amber-400';
                                                        break;
                                                    case 'port-forward':
                                                        colorClass = 'bg-orange-500/20 border-orange-500/50 text-orange-400';
                                                        break;
                                                    default:
                                                        colorClass = 'bg-accent-primary/20 border-accent-primary text-accent-primary';
                                                }
                                            } else {
                                                colorClass = 'bg-theme-secondary border-theme text-theme-secondary hover:bg-theme-tertiary';
                                            }
                                            
                                            return (
                                                <button
                                                    key={type}
                                                    onClick={() => toggleType(type)}
                                                    className={`px-3 py-1.5 rounded-lg text-sm border transition-all duration-200 font-medium ${colorClass}`}
                                                >
                                                    {getTypeLabel(type)}
                                                    {isSelected && count > 0 && (
                                                        <span className="ml-1.5 text-xs opacity-70">
                                                            ({count})
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
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
                                        {/* Connection Type Badge */}
                                        {ipDetails.unifi?.client && (() => {
                                            const isWireless = ipDetails.unifi.client.is_wireless || 
                                                (!!ipDetails.unifi.client.ssid || !!ipDetails.unifi.client.ap_mac || !!ipDetails.unifi.client.ap_name);
                                            const isWired = ipDetails.unifi.client.is_wired || 
                                                (!!ipDetails.unifi.client.sw_port && !isWireless);
                                            
                                            if (isWireless) {
                                                return (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-500/20 border border-orange-500/50 text-orange-400">
                                                        <Radio size={14} />
                                                        WiFi
                                                    </span>
                                                );
                                            } else if (isWired) {
                                                return (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-500/20 border border-gray-500/50 text-gray-400">
                                                        <Cable size={14} />
                                                        Filaire
                                                    </span>
                                                );
                                            }
                                            return null;
                                        })()}
                                        
                                        {/* Status Badge */}
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
                                        
                                        {/* DHCP Badge */}
                                        {ipDetails.freebox?.dhcp && (
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                                                ipDetails.freebox.dhcp.static
                                                    ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                                                    : 'bg-purple-500/20 border border-purple-500/50 text-purple-400'
                                            }`}>
                                                <Home size={14} />
                                                {ipDetails.freebox.dhcp.static ? 'RÉSERVATION' : 'DHCP'}
                                            </span>
                                        )}
                                        
                                        {/* Port Forwarding Badge */}
                                        {ipDetails.freebox?.portForwarding && Array.isArray(ipDetails.freebox.portForwarding) && ipDetails.freebox.portForwarding.length > 0 && (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-500/20 border border-orange-500/50 text-orange-400">
                                                <Router size={14} />
                                                PORT ({ipDetails.freebox.portForwarding.length})
                                            </span>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Ping Section */}
                                <div className="flex items-center gap-3">
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
                                        <div className={`px-4 py-2 rounded-lg ${
                                            pingResults[ipDetails.ip].success
                                                ? getLatencyBgColor(pingResults[ipDetails.ip].time || 0)
                                                : 'bg-red-500/20 border border-red-500/50 text-red-400'
                                        }`}>
                                            {pingResults[ipDetails.ip].success ? (
                                                <span className="font-medium">{pingResults[ipDetails.ip].time}ms</span>
                                            ) : (
                                                <span>Échec</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Modern Multi-Column Grid Display */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* IP Card */}
                                <div className="bg-theme-secondary/30 rounded-lg border border-theme p-4 hover:bg-theme-secondary/40 transition-colors">
                                    <div className="text-xs font-semibold text-theme-tertiary uppercase mb-1">IP</div>
                                    <div className="text-theme-primary font-mono font-medium text-lg mb-2">{ipDetails.ip}</div>
                                    {(ipDetails.unifi?.client?.mac || ipDetails.freebox?.mac || ipDetails.scanner?.mac) && (
                                        <div className="text-theme-tertiary font-mono text-sm">
                                            {formatMac(ipDetails.unifi?.client?.mac || ipDetails.freebox?.mac || ipDetails.scanner?.mac)}
                                        </div>
                                    )}
                                </div>

                                {/* Switch Card (for wired clients) */}
                                {ipDetails.unifi?.client?.is_wired && (
                                    <div className="bg-theme-secondary/30 rounded-lg border border-theme p-4 hover:bg-theme-secondary/40 transition-colors">
                                        <div className="text-xs font-semibold text-theme-tertiary uppercase mb-2 flex items-center gap-1.5">
                                            <Cable size={12} />
                                            Switch
                                        </div>
                                        {ipDetails.unifi.switch ? (
                                            <div className="flex flex-col gap-1">
                                                <span className="font-medium text-theme-primary">{ipDetails.unifi.switch.name}</span>
                                                {ipDetails.unifi.switch.model && (
                                                    <span className="text-xs text-theme-tertiary">{ipDetails.unifi.switch.model}</span>
                                                )}
                                                {ipDetails.unifi.switch.ip && (
                                                    <span className="text-xs text-theme-tertiary font-mono">{ipDetails.unifi.switch.ip}</span>
                                                )}
                                            </div>
                                        ) : ipDetails.unifi.client.sw_name ? (
                                            <div className="text-theme-primary font-medium">{ipDetails.unifi.client.sw_name}</div>
                                        ) : ipDetails.unifi.client.sw_mac ? (
                                            <div className="text-theme-tertiary font-mono text-sm">{formatMac(ipDetails.unifi.client.sw_mac)}</div>
                                        ) : (
                                            <div className="text-theme-tertiary">--</div>
                                        )}
                                    </div>
                                )}

                                {/* Vitesse Card */}
                                {ipDetails.unifi?.client && (ipDetails.unifi.client.tx_rate || ipDetails.unifi.client.rx_rate || ipDetails.unifi.client.tx_bytes || ipDetails.unifi.client.rx_bytes) && (
                                    <div className="bg-theme-secondary/30 rounded-lg border border-theme p-4 hover:bg-theme-secondary/40 transition-colors">
                                        <div className="text-xs font-semibold text-theme-tertiary uppercase mb-2">Vitesse</div>
                                        {(() => {
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
                                                    <div className="flex flex-col gap-1.5">
                                                        {tx > 0 && (
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-emerald-400 font-medium">↑</span>
                                                                <span className="text-theme-primary">{formatSpeed(tx)}</span>
                                                            </div>
                                                        )}
                                                        {rx > 0 && (
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-blue-400 font-medium">↓</span>
                                                                <span className="text-theme-primary">{formatSpeed(rx)}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            }
                                            return <span className="text-theme-tertiary">--</span>;
                                        })()}
                                    </div>
                                )}

                                {/* AP Card (for wireless clients) */}
                                {ipDetails.unifi?.client?.is_wireless && (
                                    <div className="bg-theme-secondary/30 rounded-lg border border-theme p-4 hover:bg-theme-secondary/40 transition-colors">
                                        <div className="text-xs font-semibold text-theme-tertiary uppercase mb-2 flex items-center gap-1.5">
                                            <Radio size={12} />
                                            AP
                                        </div>
                                        {ipDetails.unifi.ap ? (
                                            <div className="flex flex-col gap-1">
                                                <span className="font-medium text-theme-primary">{ipDetails.unifi.ap.name}</span>
                                                {ipDetails.unifi.ap.model && (
                                                    <span className="text-xs text-theme-tertiary">{ipDetails.unifi.ap.model}</span>
                                                )}
                                                {ipDetails.unifi.ap.ip && (
                                                    <span className="text-xs text-theme-tertiary font-mono">{ipDetails.unifi.ap.ip}</span>
                                                )}
                                            </div>
                                        ) : ipDetails.unifi.client.ap_name ? (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-theme-primary font-medium">{ipDetails.unifi.client.ap_name}</span>
                                                {ipDetails.unifi.client.ap_mac && (
                                                    <span className="text-xs text-theme-tertiary font-mono">{formatMac(ipDetails.unifi.client.ap_mac)}</span>
                                                )}
                                            </div>
                                        ) : ipDetails.unifi.client.ap_mac ? (
                                            <div className="text-theme-tertiary font-mono text-sm">{formatMac(ipDetails.unifi.client.ap_mac)}</div>
                                        ) : (
                                            <div className="text-theme-tertiary">--</div>
                                        )}
                                    </div>
                                )}

                                {/* SSID Card */}
                                {ipDetails.unifi?.client && (
                                    <div className="bg-theme-secondary/30 rounded-lg border border-theme p-4 hover:bg-theme-secondary/40 transition-colors">
                                        <div className="text-xs font-semibold text-theme-tertiary uppercase mb-2 flex items-center gap-1.5">
                                            <Wifi size={12} />
                                            SSID / Ports
                                        </div>
                                        {ipDetails.unifi.client.is_wireless ? (
                                            <div className="flex flex-col gap-2">
                                                {(() => {
                                                    const ssid = ipDetails.unifi.client.ssid || ipDetails.unifi.client.essid || ipDetails.unifi.client.wifi_ssid || ipDetails.unifi.client.wlan_ssid;
                                                    return ssid ? (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-pink-500/20 border border-pink-500/50 text-pink-400 w-fit">
                                                            <Wifi size={14} />
                                                            {ssid}
                                                        </span>
                                                    ) : (
                                                        <span className="text-theme-tertiary">--</span>
                                                    );
                                                })()}
                                                {ipDetails.unifi.ap?.ssids && Array.isArray(ipDetails.unifi.ap.ssids) && ipDetails.unifi.ap.ssids.length > 0 && (
                                                    <div className="flex flex-wrap items-center gap-2 mt-1">
                                                        <span className="text-xs text-theme-tertiary">SSIDs disponibles:</span>
                                                        {ipDetails.unifi.ap.ssids.map((ssid: any, idx: number) => (
                                                            <span key={idx} className="text-xs px-2 py-0.5 bg-pink-500/10 border border-pink-500/30 text-pink-300 rounded">
                                                                {ssid.name || ssid.ssid || ssid}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : ipDetails.unifi.client.is_wired ? (
                                            ipDetails.unifi.client.sw_port ? (
                                                <div className="flex flex-col gap-1">
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-500/20 border border-blue-500/50 text-blue-400 w-fit">
                                                        <Cable size={14} />
                                                        Port {ipDetails.unifi.client.sw_port}
                                                    </span>
                                                    {ipDetails.unifi.switch ? (
                                                        <span className="text-xs text-theme-tertiary mt-1">sur {ipDetails.unifi.switch.name}</span>
                                                    ) : ipDetails.unifi.client.sw_name ? (
                                                        <span className="text-xs text-theme-tertiary mt-1">sur {ipDetails.unifi.client.sw_name}</span>
                                                    ) : null}
                                                </div>
                                            ) : (
                                                <span className="text-theme-tertiary">--</span>
                                            )
                                        ) : (
                                            <span className="text-theme-tertiary">--</span>
                                        )}
                                    </div>
                                )}

                                {/* Signal Card */}
                                {ipDetails.unifi?.client && ipDetails.unifi.client.is_wireless && (
                                    <div className="bg-theme-secondary/30 rounded-lg border border-theme p-4 hover:bg-theme-secondary/40 transition-colors">
                                        <div className="text-xs font-semibold text-theme-tertiary uppercase mb-2">Signal</div>
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

                                {/* Vendor Card */}
                                {ipDetails.scanner?.vendor !== undefined && 
                                 ipDetails.scanner?.vendor !== null && 
                                 ipDetails.scanner?.vendor !== '' && 
                                 ipDetails.scanner?.vendor !== '0' &&
                                 ipDetails.scanner?.vendor?.trim() !== '' &&
                                 ipDetails.scanner?.vendor?.toLowerCase() !== 'unknown' && (
                                    <div className="bg-theme-secondary/30 rounded-lg border border-theme p-4 hover:bg-theme-secondary/40 transition-colors">
                                        <div className="text-xs font-semibold text-theme-tertiary uppercase mb-1">Vendor</div>
                                        <div className="text-theme-primary font-medium">{ipDetails.scanner.vendor}</div>
                                    </div>
                                )}

                                {/* Latency Card */}
                                {ipDetails.scanner?.pingLatency !== undefined && 
                                 ipDetails.scanner?.pingLatency !== null &&
                                 typeof ipDetails.scanner.pingLatency === 'number' &&
                                 ipDetails.scanner.pingLatency >= 0 && (
                                    <div className="bg-theme-secondary/30 rounded-lg border border-theme p-4 hover:bg-theme-secondary/40 transition-colors">
                                        <div className="text-xs font-semibold text-theme-tertiary uppercase mb-1">Latence</div>
                                        <div className={`text-lg font-medium ${getLatencyColor(ipDetails.scanner.pingLatency)}`}>
                                            {ipDetails.scanner.pingLatency}ms
                                        </div>
                                    </div>
                                )}

                                {/* Last Seen Card */}
                                {(ipDetails.scanner?.lastSeen || ipDetails.unifi?.client?.last_seen) && (
                                    <div className="bg-theme-secondary/30 rounded-lg border border-theme p-4 hover:bg-theme-secondary/40 transition-colors">
                                        <div className="text-xs font-semibold text-theme-tertiary uppercase mb-1">Dernière vue</div>
                                        <div className="text-theme-secondary text-sm">
                                            {formatDate(ipDetails.scanner?.lastSeen?.toString() || 
                                                      (ipDetails.unifi?.client?.last_seen ? new Date(ipDetails.unifi.client.last_seen * 1000).toISOString() : undefined))}
                                        </div>
                                    </div>
                                )}

                            </div>

                            {/* DHCP and Port Forwarding at the bottom */}
                            <div className="mt-6 space-y-4">
                                {/* DHCP Card - Full width */}
                                {ipDetails.freebox?.dhcp && (
                                    <div className="bg-theme-secondary/30 rounded-lg border border-theme p-5 hover:bg-theme-secondary/40 transition-colors">
                                        <div className="text-xs font-semibold text-theme-tertiary uppercase mb-4 flex items-center gap-1.5">
                                            <Home size={14} />
                                            Configuration DHCP Freebox
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
                                    <div>
                                        <div className="text-xs font-semibold text-theme-tertiary uppercase mb-3 flex items-center gap-2">
                                            <Router size={14} />
                                            Redirections de Port ({ipDetails.freebox.portForwarding.length})
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
                                                                ? 'border-orange-500/50 shadow-lg shadow-orange-500/10'
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
                                                                <ArrowUpDown size={18} className="text-orange-400 flex-shrink-0" />
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
                                                onClick={() => handleSort('type')}
                                                className="flex items-center gap-1.5 hover:text-accent-primary transition-colors group"
                                            >
                                                <span>Type</span>
                                                <ArrowUpDown size={14} className={sortField === 'type' ? 'text-accent-primary' : 'text-theme-tertiary group-hover:text-theme-secondary'} />
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
                                                onClick={() => handleSort('mac')}
                                                className="flex items-center gap-1.5 hover:text-accent-primary transition-colors group"
                                            >
                                                <span>MAC</span>
                                                <ArrowUpDown size={14} className={sortField === 'mac' ? 'text-accent-primary' : 'text-theme-tertiary group-hover:text-theme-secondary'} />
                                            </button>
                                        </th>
                                        <th className="text-left py-3 px-4 font-semibold text-theme-primary">Statut</th>
                                        <th className="text-left py-3 px-4 font-semibold text-theme-primary">Dernière vue</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedResults.map((result, index) => {
                                        const isFreebox = result.pluginId === 'freebox';
                                        const isUnifi = result.pluginId === 'unifi';
                                        
                                        return (
                                            <tr
                                                key={`${result.pluginId}-${result.id}-${index}`}
                                                className="border-b border-theme hover:bg-theme-secondary/50 transition-colors"
                                            >
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-2">
                                                        {isFreebox && <Server size={16} className="text-blue-400" />}
                                                        {isUnifi && <Wifi size={16} className="text-purple-400" />}
                                                        <span className={`font-medium ${
                                                            isFreebox ? 'text-blue-400' : isUnifi ? 'text-purple-400' : 'text-theme-primary'
                                                        }`}>
                                                            {result.pluginName}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${
                                                        result.type === 'device' || result.type === 'client'
                                                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                                                            : result.type === 'ap' || result.type === 'switch'
                                                            ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                                                            : result.type === 'dhcp'
                                                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                                                            : result.type === 'port-forward'
                                                            ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                                                            : 'bg-theme-secondary border-theme text-theme-secondary'
                                                    }`}>
                                                        {getTypeLabel(result.type)}
                                                    </span>
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
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-theme-secondary">
                                                            {result.ip || '--'}
                                                        </span>
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
                                                        <div className="flex items-center gap-1">
                                                            {pingingIps.has(result.ip) ? (
                                                                <span className="text-xs text-theme-tertiary flex items-center gap-1">
                                                                    <Loader2 size={10} className="animate-spin" />
                                                                    Ping...
                                                                </span>
                                                            ) : pingResults[result.ip] ? (
                                                                pingResults[result.ip].success ? (
                                                                    <span className={`text-xs font-medium ${getLatencyColor(pingResults[result.ip].time || 0)}`}>
                                                                        {pingResults[result.ip].time}ms
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-xs text-red-400" title={pingResults[result.ip].error}>
                                                                        Échec
                                                                    </span>
                                                                )
                                                            ) : null}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="font-mono text-theme-secondary">
                                                    {formatMac(result.mac)}
                                                </span>
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
        </div>
    );
};

