/**
 * Search Results Page
 * 
 * Displays search results from all active plugins
 * with filtering, sorting, and pagination
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight, Loader2, X, CheckCircle, AlertCircle, Server, Wifi, RotateCw, Power, Info, Network, Globe, Home, Router, Cable, Radio, Activity, Clock, Signal, Zap, Link2, ArrowUpDown as ArrowUpDownIcon, BarChart2 } from 'lucide-react';
import { Card } from '../components/widgets/Card';
import { api } from '../api/client';
import { usePluginStore } from '../stores/pluginStore';
import { SearchOptionsInfoModal } from '../components/modals/SearchOptionsInfoModal';
import { LatencyMonitoringModal } from '../components/modals/LatencyMonitoringModal';

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
    const [exactMatch, setExactMatch] = useState(true); // Default to exact match mode
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
        if (pingEnabled && !exactMatch && isIpRange(target)) {
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
    }, [selectedPlugins, selectedTypes, exactMatch, caseSensitive, showOnlyActive]);

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
                                                    if (pingEnabled) {
                                                        // If ping is enabled, ping the query instead of searching
                                                        if (searchQuery.trim() && (isValidIpOrDomain(searchQuery.trim()) || isIpRange(searchQuery.trim()))) {
                                                            pingSearchQuery(searchQuery.trim());
                                                        }
                                                    } else {
                                                    handleSearch();
                                                    }
                                                }
                                            }}
                                            placeholder="Rechercher (nom, MAC, IP, port, hostname...)"
                                            className="w-full pl-14 pr-4 py-3 bg-theme-secondary border border-theme rounded-lg text-theme-primary placeholder-theme-tertiary focus:outline-none transition-all"
                                        />
                                    </div>
                                    {/* Hide search button when ping is enabled */}
                                    {!pingEnabled && (
                                    <button
                                        onClick={handleSearch}
                                        disabled={isLoading || !searchQuery.trim()}
                                        className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 font-medium shadow-lg shadow-gray-600/20"
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
                                                                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-400 shadow-lg shadow-purple-500/10'
                                                                    : isUnifi
                                                                        ? 'bg-blue-500/20 border-blue-500/50 text-blue-400 shadow-lg shadow-blue-500/10'
                                                                        : 'bg-accent-primary/20 border-accent-primary text-accent-primary'
                                                                : 'bg-theme-secondary border-theme text-theme-secondary hover:bg-theme-tertiary hover:border-theme-hover'
                                                        }`}
                                                    >
                                                        {isFreebox && <Server size={16} className={isSelected ? 'text-purple-400' : 'text-theme-tertiary'} />}
                                                        {isUnifi && <Wifi size={16} className={isSelected ? 'text-blue-400' : 'text-theme-tertiary'} />}
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
                                        setExactMatch(!exactMatch);
                                    // If ping is enabled and we're switching to extended mode, clear ping results
                                    if (pingEnabled && exactMatch) {
                                        setPingResults({});
                                        setPingingIps(new Set());
                                    }
                                }}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all duration-200 font-medium ${
                                    !exactMatch
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
                                        // Force exact match mode (strict mode) when ping is enabled
                                        // This ensures only 1 exact IP is pinged by default
                                        setExactMatch(true);
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
                                        {exactMatch ? (
                                            <div className="space-y-1">
                                                 <p className="text-theme-tertiary mt-2">💡 Activez le mode "Étendu" pour pinger des ranges d'IP (ex: 192.168.1.0/24 ou 192.168.1.1-254)</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-1">
                                                <p>• Mode <span className="text-cyan-400 font-medium">étendu</span> : Ping de ranges d'IP autorisé</p>
                                                <p>• Formats supportés :</p>
                                                <p className="ml-2 text-cyan-400 font-mono">• 192.168.1.0/24 (notation CIDR)</p>
                                                <p className="ml-2 text-cyan-400 font-mono">• 192.168.1.1-254 (plage simple)</p>
                                                <p className="ml-2 text-cyan-400 font-mono">• 192.168.1.1-192.168.1.254 (plage complète)</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

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
                                                        colorClass = 'bg-purple-500/20 border-purple-500/50 text-purple-400';
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
                                                // Get RSSI value for dynamic color
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
                                                
                                                return (
                                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${getSignalBadgeColor(rssi)}`}>
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
                                                {ipDetails.freebox.dhcp.static ? 'RÉSERVATION DHCP' : 'DHCP AUTOMATIQUE'}
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

                            </div>

                            {/* SECTION 2: BLOC CONNEXION UNIFI */}
                            {ipDetails.unifi?.client && (
                                <div className="bg-blue-500/10 rounded-lg border border-blue-500/50 p-6 hover:bg-blue-500/15 transition-colors mb-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Wifi size={18} className="text-blue-400" />
                                        <h3 className="text-lg font-semibold text-blue-400 uppercase">Connexion Unifi</h3>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {/* Type de connexion */}
                                        <div className="flex flex-col gap-1">
                                            <div className="text-xs font-semibold text-blue-300 uppercase mb-1 flex items-center gap-1.5">
                                                {ipDetails.unifi.client.is_wireless ? <Radio size={12} /> : <Cable size={12} />}
                                                Type
                                            </div>
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium w-fit ${
                                                ipDetails.unifi.client.is_wireless
                                                    ? (() => {
                                                        // Get RSSI value for dynamic color
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
                                                    : 'bg-gray-500/20 border border-gray-500/50 text-gray-400'
                                            }`}>
                                                {ipDetails.unifi.client.is_wireless ? (
                                                    <>
                                                        <Radio size={14} />
                                                        WiFi
                                                    </>
                                                ) : (
                                                    <>
                                                        <Cable size={14} />
                                                        Filaire
                                                    </>
                                                )}
                                            </span>
                                        </div>

                                        {/* Équipement connecté */}
                                        <div className="flex flex-col gap-1">
                                            <div className="text-xs font-semibold text-blue-300 uppercase mb-1 flex items-center gap-1.5">
                                                <Server size={12} />
                                                Équipement
                                            </div>
                                            {ipDetails.unifi.client.is_wireless && ipDetails.unifi.ap ? (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-medium text-theme-primary text-sm">{ipDetails.unifi.ap.name}</span>
                                                    {ipDetails.unifi.ap.model && (
                                                        <span className="text-xs text-theme-tertiary">{ipDetails.unifi.ap.model}</span>
                                                    )}
                                                    {ipDetails.unifi.ap.ip && (
                                                        <span className="text-xs text-theme-tertiary font-mono">{ipDetails.unifi.ap.ip}</span>
                                                    )}
                                                </div>
                                            ) : ipDetails.unifi.client.is_wireless && ipDetails.unifi.client.ap_name ? (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-medium text-theme-primary text-sm">{ipDetails.unifi.client.ap_name}</span>
                                                    {ipDetails.unifi.client.ap_mac && (
                                                        <span className="text-xs text-theme-tertiary font-mono">{formatMac(ipDetails.unifi.client.ap_mac)}</span>
                                                    )}
                                                </div>
                                            ) : ipDetails.unifi.client.is_wired && ipDetails.unifi.switch ? (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-medium text-theme-primary text-sm">{ipDetails.unifi.switch.name}</span>
                                                    {ipDetails.unifi.switch.model && (
                                                        <span className="text-xs text-theme-tertiary">{ipDetails.unifi.switch.model}</span>
                                                    )}
                                                    {ipDetails.unifi.switch.ip && (
                                                        <span className="text-xs text-theme-tertiary font-mono">{ipDetails.unifi.switch.ip}</span>
                                                    )}
                                                </div>
                                            ) : ipDetails.unifi.client.is_wired && ipDetails.unifi.client.sw_name ? (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-medium text-theme-primary text-sm">{ipDetails.unifi.client.sw_name}</span>
                                                </div>
                                            ) : (
                                                <span className="text-theme-tertiary text-sm">--</span>
                                            )}
                                        </div>

                                        {/* SSID / Port */}
                                        <div className="flex flex-col gap-1">
                                            <div className="text-xs font-semibold text-blue-300 uppercase mb-1 flex items-center gap-1.5">
                                                <Wifi size={12} />
                                                {ipDetails.unifi.client.is_wireless ? 'SSID' : 'Port'}
                                            </div>
                                            {ipDetails.unifi.client.is_wireless ? (
                                                (() => {
                                                    const ssid = ipDetails.unifi.client.ssid || ipDetails.unifi.client.essid || ipDetails.unifi.client.wifi_ssid || ipDetails.unifi.client.wlan_ssid;
                                                    return ssid ? (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-500/20 border border-blue-500/50 text-blue-300 w-fit">
                                                            <Wifi size={14} />
                                                            {ssid}
                                                        </span>
                                                    ) : (
                                                        <span className="text-theme-tertiary text-sm">--</span>
                                                    );
                                                })()
                                            ) : ipDetails.unifi.client.is_wired && ipDetails.unifi.client.sw_port ? (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-500/20 border border-blue-500/50 text-blue-300 w-fit">
                                                    <Cable size={14} />
                                                    Port {ipDetails.unifi.client.sw_port}
                                                </span>
                                            ) : (
                                                <span className="text-theme-tertiary text-sm">--</span>
                                            )}
                                        </div>

                                        {/* Dernière vue */}
                                        {ipDetails.unifi.client.last_seen && (
                                            <div className="flex flex-col gap-1">
                                                <div className="text-xs font-semibold text-blue-300 uppercase mb-1 flex items-center gap-1.5">
                                                    <Clock size={12} />
                                                    Dernière vue
                                                </div>
                                                <span className="text-sm text-theme-secondary">
                                                    {formatDate(new Date(ipDetails.unifi.client.last_seen * 1000).toISOString())}
                                                </span>
                                            </div>
                                        )}
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
                                                            ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
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
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-mono text-theme-secondary">
                                                            {result.ip || '--'}
                                                        </span>
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

