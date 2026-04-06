/**
 * UniFi Page
 * 
 * Dedicated page for UniFi Controller management
 * Follows Freebox aesthetic
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Activity, Users, TrendingUp, Network, AlertCircle, RefreshCw, CheckCircle, XCircle, Router, ShieldAlert } from 'lucide-react';
import { Card } from '../components/widgets/Card';
import { usePluginStore } from '../stores/pluginStore';
import { usePolling } from '../hooks/usePolling';
import { POLLING_INTERVALS } from '../utils/constants';
import { api } from '../api/client';
import { OverviewTab } from './unifi/OverviewTab';
import { SwitchesTab } from './unifi/SwitchesTab';
import { AnalyseTab } from './unifi/AnalyseTab';
import { ClientsTab } from './unifi/ClientsTab';
import { TrafficTab } from './unifi/TrafficTab';
import { ThreatsTab } from './unifi/ThreatsTab';
import { DebugTab } from './unifi/DebugTab';
import { NatTab } from './unifi/NatTab';
import type { BandwidthPoint, ThreatRange, ThreatSeverity, ThreatSortKey, ThreatData, ThreatDebug, AlertFilter, EventFilter, ClientSortKey, TabType } from './unifi/types';

interface UniFiPageProps {
    onBack: () => void;
    onNavigateToSearch?: (ip: string) => void;
}

export const UniFiPage: React.FC<UniFiPageProps> = ({ onBack, onNavigateToSearch }) => {
    const { t } = useTranslation();
    const { plugins, pluginStats, fetchPlugins, fetchPluginStats } = usePluginStore();
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [overviewSubTab, setOverviewSubTab] = useState<'info' | 'events'>('info');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [clientSortKey, setClientSortKey] = useState<ClientSortKey>('ip');
    const [clientSortDir, setClientSortDir] = useState<'asc' | 'desc'>('asc');
    const [clientSearch, setClientSearch] = useState<string>('');
    const [clientStatusFilter, setClientStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
    const [clientConnectionFilter, setClientConnectionFilter] = useState<'wireless' | 'wired' | 'all'>('wireless');
    const [alertsFilter, setAlertsFilter] = useState<AlertFilter>('all');
    const [eventFilter, setEventFilter] = useState<EventFilter>('all');
    const [showAllTrafficClients, setShowAllTrafficClients] = useState<boolean>(false);
    const [bandwidthHistory, setBandwidthHistory] = useState<BandwidthPoint[]>([]);
    const [isLoadingBandwidth, setIsLoadingBandwidth] = useState(false);
    const [wanInterfaces, setWanInterfaces] = useState<Array<{ id: string; name: string; ip?: string }>>([]);
    const [selectedWan, setSelectedWan] = useState('wan1');
    const [threatRange, setThreatRange] = useState<ThreatRange>(86400);
    const [threatSeverity, setThreatSeverity] = useState<ThreatSeverity>('ALL');
    const [threatIpSearch, setThreatIpSearch] = useState('');
    const [threatSort, setThreatSort] = useState<{ key: ThreatSortKey; dir: 'asc' | 'desc' }>({ key: 'timestamp', dir: 'desc' });
    const [threatData, setThreatData] = useState<ThreatData | null>(null);
    const [isLoadingThreats, setIsLoadingThreats] = useState(false);
    const [threatDebug, setThreatDebug] = useState<ThreatDebug | null>(null);

    const unifiPlugin = plugins.find(p => p.id === 'unifi');
    const unifiStats = pluginStats['unifi'];
    const isActive = unifiPlugin?.enabled && unifiPlugin?.connectionStatus;

    // Derived status flags for visual checks
    const hasConfig =
        !!(unifiPlugin &&
            (unifiPlugin.settings?.url as string | undefined) &&
            (unifiPlugin.settings?.username as string | undefined) &&
            (unifiPlugin.settings?.password as string | undefined));

    const systemInfo = (unifiStats as any)?.system as any | undefined;
    const devicesArr = ((unifiStats as any)?.devices || []) as any[];
    const clientsArr = devicesArr.filter(d => (d.type || '').toString().toLowerCase() === 'client');

    const siteNameFromStats =
        (systemInfo?.name as string | undefined) ||
        (systemInfo?.siteName as string | undefined);

    const connectionOk = !!isActive;
    const siteOk = !!(siteNameFromStats || (unifiPlugin?.settings?.site as string | undefined));
    const dataOk = devicesArr.length > 0 || clientsArr.length > 0;

    // Overview computed metrics container (simple object mutated in render helpers)
    const overviewComputed: {
        upToDateCount?: number;
        updateAvailableCount?: number;
        criticalCount?: number;
        totalEquipments?: number;
        offlineDevices?: any[];
        controller?: any;
    } = {};

    useEffect(() => {
        fetchPlugins();
    }, [fetchPlugins]);

    // Migrate old tab values to new combined tab (e.g. from URL or saved state)
    const legacyTabIds = ['sites', 'accesspoints', 'sites-aps', 'sites-aps-switches'] as const;
    useEffect(() => {
        if (legacyTabIds.includes(activeTab as (typeof legacyTabIds)[number])) {
            setActiveTab('overview');
        }
    }, [activeTab]);

    useEffect(() => {
        if (isActive) {
            fetchPluginStats('unifi');
        }
    }, [isActive, fetchPluginStats]);

    // Poll stats every 30 seconds if active
    usePolling(() => {
        if (isActive) {
            fetchPluginStats('unifi');
        }
    }, {
        enabled: isActive,
        interval: POLLING_INTERVALS.system
    });

    // Fetch WAN interfaces once when bandwidth tab becomes active
    const fetchWanInterfaces = async () => {
        if (!isActive) return;
        try {
            const res = await api.get<Array<{ id: string; name: string; ip?: string }>>('/api/plugins/unifi/wan-interfaces');
            if (res.success && Array.isArray(res.result) && res.result.length > 0) {
                setWanInterfaces(res.result);
                // Auto-select first WAN if current selection no longer exists
                if (!res.result.find(w => w.id === selectedWan)) {
                    setSelectedWan(res.result[0].id);
                }
            }
        } catch { /* ignore */ }
    };

    // Fetch bandwidth history from server
    const fetchBandwidthHistory = async () => {
        if (!isActive) return;
        setIsLoadingBandwidth(true);
        try {
            const res = await api.get<BandwidthPoint[]>(`/api/plugins/unifi/bandwidth-history?wanId=${selectedWan}`);
            if (res.success && Array.isArray(res.result)) {
                setBandwidthHistory(res.result);
            }
        } catch { /* ignore */ } finally {
            setIsLoadingBandwidth(false);
        }
    };

    useEffect(() => {
        if (isActive && activeTab === 'traffic') {
            fetchWanInterfaces();
            fetchBandwidthHistory();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive, activeTab]);

    // Re-fetch history when selected WAN changes
    useEffect(() => {
        if (isActive && activeTab === 'traffic') {
            fetchBandwidthHistory();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedWan]);

    usePolling(fetchBandwidthHistory, {
        enabled: isActive && activeTab === 'traffic',
        interval: POLLING_INTERVALS.system // 30s
    });

    // Threats tab: fetch flow insights
    const fetchThreats = async () => {
        if (!isActive) return;
        setIsLoadingThreats(true);
        try {
            const res = await api.get<any>(`/api/plugins/unifi/threats?range=${threatRange}`);
            if (res.success && res.result) {
                setThreatData(res.result);
            }
            if ((res as any)._debug) {
                setThreatDebug((res as any)._debug);
            }
        } catch { /* ignore */ } finally {
            setIsLoadingThreats(false);
        }
    };

    useEffect(() => {
        if (isActive && activeTab === 'threats') {
            fetchThreats();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive, activeTab, threatRange]);

    usePolling(fetchThreats, {
        enabled: isActive && activeTab === 'threats',
        interval: 120_000 // 2 min (threat data doesn't change fast)
    });

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await fetchPlugins();
        if (isActive) {
            await fetchPluginStats('unifi');
        }
        setTimeout(() => setIsRefreshing(false), 1000);
    };

    const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
        { id: 'overview', label: t('unifi.tabs.overview'), icon: Activity },
        { id: 'traffic', label: t('unifi.tabs.traffic'), icon: TrendingUp },
        { id: 'threats', label: t('unifi.tabs.threats'), icon: ShieldAlert },
        { id: 'analyse', label: t('unifi.tabs.analyse'), icon: Activity },
        { id: 'nat', label: t('unifi.tabs.nat'), icon: Router },
        { id: 'clients', label: t('unifi.tabs.clients'), icon: Users },
        { id: 'switches', label: t('unifi.tabs.switches'), icon: Network },
        ...(import.meta.env.DEV ? [{ id: 'debug' as TabType, label: t('unifi.tabs.debug'), icon: AlertCircle }] : [])
    ];

    if (!unifiPlugin) {
        return (
            <div className="text-gray-300">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center gap-4 mb-6">
                        <button
                            onClick={onBack}
                            className="p-2 hover:bg-[#1a1a1a] rounded transition-colors"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <h1 className="text-2xl font-semibold">{t('unifi.pageTitle')}</h1>
                    </div>
                    <Card title={t('unifi.pluginUnavailable')} className="bg-unifi-card border border-gray-800 rounded-xl">
                        <div className="text-center py-8 text-gray-500">
                            <AlertCircle size={32} className="mx-auto mb-2" />
                            <p>{t('unifi.pluginNotInstalled')}</p>
                        </div>
                    </Card>
                </div>
            </div>
        );
    }

    if (!isActive) {
        return (
            <div className="text-gray-300">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center gap-4 mb-6">
                        <button
                            onClick={onBack}
                            className="p-2 hover:bg-[#1a1a1a] rounded transition-colors"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <h1 className="text-2xl font-semibold">{t('unifi.pageTitle')}</h1>
                    </div>
                    <Card title={t('unifi.pluginNotConnected')} className="bg-unifi-card border border-gray-800 rounded-xl">
                        <div className="text-center py-8 text-gray-500">
                            <XCircle size={32} className="mx-auto mb-2 text-yellow-400" />
                            <p className="mb-2">{t('unifi.pluginNotConnectedDescription')}</p>
                            <p className="text-sm text-gray-600">
                                {t('unifi.configureFromPlugins')}
                            </p>
                        </div>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="text-gray-300">
            <div className="max-w-[96rem] mx-auto">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2 sm:gap-4">
                        <button
                            onClick={onBack}
                            className="p-2 hover:bg-[#1a1a1a] rounded transition-colors shrink-0"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2 sm:gap-3">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    className="w-5 h-5 sm:w-6 sm:h-6 shrink-0"
                                >
                                    <path
                                        fill="#1fb0ec"
                                        d="M5.343 4.222h1.099v1.1H5.343zm7.438 14.435a7.2 7.2 0 0 1-3.51-.988a6.5 6.5 0 0 0 2.947 3.936l.66.364c5.052-.337 8.009-3.6 8.009-7.863v-.924c-1.201 3.918-3.995 5.66-8.106 5.475m-4.107-2.291V8.355H7.562v4.1H6.448V10h-1.11v1.1H4.225V5.042H3.113v9.063c0 4.508 3.3 7.9 8.888 7.9a6.82 6.82 0 0 1-3.327-5.639M7.562 4.772h1.112v1.1H7.562zM3.113 2h1.112v1.111H3.113zm2.231 5.805h1.1v1.1h-1.1zm1.111-1.649h1.1v1.1h-1.1zm-.006-3.045h1.113V4.21H6.449zm8.876 2.677v10.577a9 9 0 0 1-.164 1.7c2.671-.486 4.414-2.137 5.3-5.014l.431-1.407V2.012c-5.042 0-5.567 1.931-5.567 3.776"
                                    />
                                </svg>
                                <span className="truncate">{t('unifi.pageTitle')}</span>
                            </h1>
                            <p className="text-xs sm:text-sm text-gray-500 mt-1 truncate">
                                {(() => {
                                    const url = (unifiPlugin.settings?.url as string) || null;
                                    if (url) {
                                        try {
                                            const urlObj = new URL(url);
                                            return (
                                                <a
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="hover:text-cyan-400 transition-colors underline decoration-dotted underline-offset-2"
                                                    title={url}
                                                >
                                                    {urlObj.hostname}
                                                </a>
                                            );
                                        } catch {
                                            return (
                                                <a
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="hover:text-cyan-400 transition-colors underline decoration-dotted underline-offset-2"
                                                    title={url}
                                                >
                                                    {url}
                                                </a>
                                            );
                                        }
                                    }
                                    return t('unifi.notConfigured');
                                })()}
                            </p>
                        </div>
                    </div>
                    {/* Visual step-by-step status for UniFi plugin - Better mobile integration */}
                    <div className="flex items-center justify-end sm:justify-start">
                        <div className="inline-flex flex-wrap items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 bg-[#050b14] border border-gray-800 rounded-lg text-[10px] sm:text-xs">
                            {/* Étape 1 : Connexion */}
                            <div className="flex items-center gap-0.5 sm:gap-1">
                                {connectionOk ? (
                                    <CheckCircle size={10} className="sm:w-3 sm:h-3 text-green-400 shrink-0" />
                                ) : hasConfig ? (
                                    <AlertCircle size={10} className="sm:w-3 sm:h-3 text-yellow-400 shrink-0" />
                                ) : (
                                    <XCircle size={10} className="sm:w-3 sm:h-3 text-red-400 shrink-0" />
                                )}
                                <span
                                    className={
                                        connectionOk
                                            ? 'text-green-400'
                                            : hasConfig
                                            ? 'text-yellow-400'
                                            : 'text-red-400'
                                    }
                                >
                                    {t('unifi.connection')}
                                </span>
                            </div>
                            <span className="text-gray-500 hidden sm:inline">•</span>
                            {/* Étape 2 : Site */}
                            <div className="flex items-center gap-0.5 sm:gap-1">
                                {siteOk ? (
                                    <CheckCircle size={10} className="sm:w-3 sm:h-3 text-green-400 shrink-0" />
                                ) : connectionOk ? (
                                    <AlertCircle size={10} className="sm:w-3 sm:h-3 text-yellow-400 shrink-0" />
                                ) : (
                                    <XCircle size={10} className="sm:w-3 sm:h-3 text-red-400 shrink-0" />
                                )}
                                <span
                                    className={
                                        siteOk
                                            ? 'text-green-400'
                                            : connectionOk
                                            ? 'text-yellow-400'
                                            : 'text-red-400'
                                    }
                                >
                                    {t('unifi.stepSite')}
                                </span>
                            </div>
                            <span className="text-gray-500 hidden sm:inline">•</span>
                            {/* Étape 3 : Données */}
                            <div className="flex items-center gap-0.5 sm:gap-1">
                                {dataOk ? (
                                    <CheckCircle size={10} className="sm:w-3 sm:h-3 text-green-400 shrink-0" />
                                ) : siteOk ? (
                                    <AlertCircle size={10} className="sm:w-3 sm:h-3 text-yellow-400 shrink-0" />
                                ) : (
                                    <XCircle size={10} className="sm:w-3 sm:h-3 text-red-400 shrink-0" />
                                )}
                                <span
                                    className={
                                        dataOk
                                            ? 'text-green-400'
                                            : siteOk
                                            ? 'text-yellow-400'
                                            : 'text-red-400'
                                    }
                                >
                                    {t('unifi.stepData')}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-800 mb-6 overflow-x-auto">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap border-b-2 ${
                                    isActive
                                        ? 'text-unifi-accent border-unifi-accent'
                                        : 'border-transparent text-gray-400 hover:text-white hover:border-unifi-accent'
                                }`}
                            >
                                <Icon size={16} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                <div className="space-y-6">
                    {activeTab === 'overview' && (
                        <OverviewTab
                            unifiPlugin={unifiPlugin}
                            unifiStats={unifiStats}
                            systemInfo={systemInfo}
                            devicesArr={devicesArr}
                            overviewSubTab={overviewSubTab}
                            setOverviewSubTab={setOverviewSubTab}
                            alertsFilter={alertsFilter}
                            setAlertsFilter={setAlertsFilter}
                            eventFilter={eventFilter}
                            setEventFilter={setEventFilter}
                            onNavigateToSearch={onNavigateToSearch}
                        />
                    )}

                    {activeTab === 'switches' && (
                        <SwitchesTab
                            unifiStats={unifiStats}
                            devicesArr={devicesArr}
                            onNavigateToSearch={onNavigateToSearch}
                        />
                    )}

                    {activeTab === 'analyse' && (
                        <AnalyseTab onNavigateToSearch={onNavigateToSearch} />
                    )}

                    {activeTab === 'clients' && (
                        <ClientsTab
                            unifiStats={unifiStats}
                            clientSortKey={clientSortKey}
                            setClientSortKey={setClientSortKey}
                            clientSortDir={clientSortDir}
                            setClientSortDir={setClientSortDir}
                            clientSearch={clientSearch}
                            setClientSearch={setClientSearch}
                            clientStatusFilter={clientStatusFilter}
                            setClientStatusFilter={setClientStatusFilter}
                            clientConnectionFilter={clientConnectionFilter}
                            setClientConnectionFilter={setClientConnectionFilter}
                            onNavigateToSearch={onNavigateToSearch}
                        />
                    )}

                    {activeTab === 'traffic' && (
                        <TrafficTab
                            unifiStats={unifiStats}
                            bandwidthHistory={bandwidthHistory}
                            isLoadingBandwidth={isLoadingBandwidth}
                            wanInterfaces={wanInterfaces}
                            selectedWan={selectedWan}
                            setSelectedWan={setSelectedWan}
                            fetchBandwidthHistory={fetchBandwidthHistory}
                            showAllTrafficClients={showAllTrafficClients}
                            setShowAllTrafficClients={setShowAllTrafficClients}
                            onNavigateToSearch={onNavigateToSearch}
                        />
                    )}

                    {activeTab === 'nat' && (
                        <NatTab isActive={activeTab === 'nat'} systemStats={unifiStats?.system as any} />
                    )}

                    {activeTab === 'threats' && (
                        <ThreatsTab
                            threatRange={threatRange}
                            setThreatRange={setThreatRange}
                            threatSeverity={threatSeverity}
                            setThreatSeverity={setThreatSeverity}
                            threatIpSearch={threatIpSearch}
                            setThreatIpSearch={setThreatIpSearch}
                            threatSort={threatSort}
                            setThreatSort={setThreatSort}
                            threatData={threatData}
                            isLoadingThreats={isLoadingThreats}
                            threatDebug={threatDebug}
                        />
                    )}

                    {activeTab === 'debug' && (
                        <DebugTab
                            unifiPlugin={unifiPlugin}
                            unifiStats={unifiStats}
                            pluginStats={pluginStats}
                            isActive={isActive}
                            isRefreshing={isRefreshing}
                            handleRefresh={handleRefresh}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
