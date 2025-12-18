/**
 * Search Results Page
 * 
 * Displays search results from all active plugins
 * with filtering, sorting, and pagination
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight, Loader2, X, CheckCircle, AlertCircle, Server, Wifi, RotateCw, Power } from 'lucide-react';
import { Card } from '../components/widgets/Card';
import { api } from '../api/client';
import { usePluginStore } from '../stores/pluginStore';

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
    
    // Search options
    const [exactMatch, setExactMatch] = useState(false);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [showOnlyActive, setShowOnlyActive] = useState(true); // Filter by default to show only active devices
    const [pingEnabled, setPingEnabled] = useState(false);
    const [pingResults, setPingResults] = useState<Record<string, { success: boolean; time?: number; error?: string }>>({});
    const [pingingIps, setPingingIps] = useState<Set<string>>(new Set());
    
    // Filters
    const [selectedPlugins, setSelectedPlugins] = useState<string[]>([]);
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    
    // Sorting
    const [sortField, setSortField] = useState<'name' | 'plugin' | 'type' | 'ip' | 'mac'>('name');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);

    // Get active plugins
    const activePlugins = useMemo(() => {
        return plugins.filter(p => p.enabled && p.connectionStatus);
    }, [plugins]);

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

    // Ping an IP address (local IPv4 only)
    const pingIp = async (ip: string): Promise<{ success: boolean; time?: number; error?: string }> => {
        if (!isLocalIPv4(ip)) {
            return { success: false, error: 'Seules les adresses IPv4 locales sont autorisées' };
        }

        try {
            const response = await api.get<{ success: boolean; result?: { latency: number } }>(`/api/speedtest/ping?target=${encodeURIComponent(ip)}&count=3`);
            if (response.success && response.result && 'latency' in response.result && typeof response.result.latency === 'number') {
                return { success: true, time: Math.round(response.result.latency) };
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

    // Perform search
    const performSearch = async (query: string) => {
        if (!query.trim()) {
            setResults([]);
            setHasSearched(false);
            return;
        }

        setIsLoading(true);
        setError(null);
        setHasSearched(true); // Mark that a search has been performed

        try {
            const response = await api.post<SearchResultData>('/api/search', {
                query: query.trim(),
                pluginIds: selectedPlugins.length > 0 ? selectedPlugins : undefined,
                types: selectedTypes.length > 0 ? selectedTypes : undefined,
                exactMatch,
                caseSensitive
            });

            if (response.success && response.result?.results) {
                setResults(response.result.results);
            } else {
                // Handle API error response
                const errorMsg = response.error?.message || 'Erreur lors de la recherche';
                setError(errorMsg);
                setResults([]);
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
        setExactMatch(false);
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
            <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                         
                        <p className="text-sm text-theme-secondary">
                            Recherche dans les plugins actifs (Freebox, UniFi)
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRefresh}
                            className="px-4 py-2 bg-theme-secondary border border-theme rounded-lg text-theme-primary hover:bg-theme-tertiary transition-colors flex items-center gap-2"
                            title="Réinitialiser la recherche"
                        >
                            <RotateCw size={18} />
                            Actualiser
                        </button>
                        {onBack && (
                            <button
                                onClick={onBack}
                                className="px-4 py-2 bg-theme-secondary border border-theme rounded-lg text-theme-primary hover:bg-theme-tertiary transition-colors flex items-center gap-2"
                            >
                                <ChevronLeft size={18} />
                                Retour
                            </button>
                        )}
                    </div>
                </div>

                {/* Search bar */}
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
                                    className="w-full pl-14 pr-4 py-3 bg-theme-secondary border border-theme rounded-lg text-theme-primary placeholder-theme-tertiary focus:outline-none focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 transition-all"
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
                        </div>
                    </div>
                </Card>

                {/* Search options and filters */}
                <Card title="Options et filtres">
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
                                <span>Actif seulement</span>
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
                                        : exactMatch
                                            ? 'bg-accent-primary/20 border-accent-primary text-accent-primary shadow-lg shadow-accent-primary/10'
                                            : 'bg-theme-secondary border-theme text-theme-secondary hover:bg-theme-tertiary hover:border-theme-hover'
                                }`}
                            >
                                <div className={`relative w-10 h-5 rounded-full transition-all duration-200 ${
                                    exactMatch ? 'bg-blue-500' : 'bg-theme-tertiary'
                                }`}>
                                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all duration-200 shadow-md ${
                                        exactMatch ? 'translate-x-5' : 'translate-x-0'
                                    }`} />
                                </div>
                                <span>Exacte</span>
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
                                        
                                        // Ping all local IPv4 addresses in current filtered results
                                        const localIps = filteredResults
                                            .filter(r => r.ip && isLocalIPv4(r.ip))
                                            .map(r => r.ip!)
                                            .filter((ip, index, self) => self.indexOf(ip) === index); // Unique IPs
                                        
                                        setPingResults({});
                                        setPingingIps(new Set(localIps));
                                        
                                        // Ping each IP sequentially to avoid overwhelming the server
                                        // Add delay between pings to prevent socket issues
                                        for (let i = 0; i < localIps.length; i++) {
                                            const ip = localIps[i];
                                            try {
                                                const result = await pingIp(ip);
                                                setPingResults(prev => ({ ...prev, [ip]: result }));
                                            } catch (err) {
                                                // Handle errors silently for individual pings
                                                setPingResults(prev => ({ ...prev, [ip]: { success: false, error: 'Erreur' } }));
                                            }
                                            
                                            // Small delay between pings to avoid overwhelming the server
                                            if (i < localIps.length - 1) {
                                                await new Promise(resolve => setTimeout(resolve, 200));
                                            }
                                        }
                                        
                                        setPingingIps(new Set());
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
                                <span>Ping IP locales (IPv4)</span>
                            </button>
                        </div>

                        {/* Filters - Plugin and Type in two columns */}
                        {(activePlugins.length > 0 || availableTypes.length > 0) && (
                            <div className="pt-3 border-t border-theme">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Plugin filter - Freebox and UniFi specific */}
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

                                    {/* Type filter */}
                                    {availableTypes.length > 0 && (
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
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </Card>

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
                            <span>Aucun résultat trouvé pour "{searchQuery}"</span>
                        </div>
                    </Card>
                ) : filteredResults.length === 0 && hasSearched && !isLoading ? (
                    <Card>
                        <div className="flex items-center justify-center py-12 text-theme-secondary">
                            <span>Aucun résultat ne correspond aux filtres sélectionnés</span>
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
                                                    <span className="font-mono text-theme-secondary">
                                                        {result.ip || '--'}
                                                    </span>
                                                    {pingEnabled && result.ip && isLocalIPv4(result.ip) && (
                                                        <div className="flex items-center gap-1">
                                                            {pingingIps.has(result.ip) ? (
                                                                <span className="text-xs text-theme-tertiary flex items-center gap-1">
                                                                    <Loader2 size={10} className="animate-spin" />
                                                                    Ping...
                                                                </span>
                                                            ) : pingResults[result.ip] ? (
                                                                pingResults[result.ip].success ? (
                                                                    <span className="text-xs text-emerald-400 font-medium">
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
        </div>
    );
};

