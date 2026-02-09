/**
 * UniFi Page
 * 
 * Dedicated page for UniFi Controller management
 * Follows Freebox aesthetic
 */

import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Wifi, Users, Activity, Server, AlertCircle, RefreshCw, CheckCircle, XCircle, TrendingUp, Network, Link2, Router } from 'lucide-react';
import { Card } from '../components/widgets/Card';
import { PluginSummaryCard } from '../components/widgets/PluginSummaryCard';
import { NetworkEventsWidget } from '../components/widgets/NetworkEventsWidget';
import { usePluginStore } from '../stores/pluginStore';
import { usePolling } from '../hooks/usePolling';
import { POLLING_INTERVALS, formatSpeed } from '../utils/constants';
import { api } from '../api/client';

interface UniFiPageProps {
    onBack: () => void;
    onNavigateToSearch?: (ip: string) => void;
}

type TabType = 'overview' | 'nat' | 'analyse' | 'clients' | 'traffic' | 'events' | 'debug' | 'switches';

export const UniFiPage: React.FC<UniFiPageProps> = ({ onBack, onNavigateToSearch }) => {
    const { t } = useTranslation();
    const { plugins, pluginStats, fetchPlugins, fetchPluginStats } = usePluginStore();
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [isRefreshing, setIsRefreshing] = useState(false);
    // Sorting state for Clients tab (must be top-level hooks, not inside render branches)
    type ClientSortKey = 'name' | 'ip' | 'mac' | 'switch' | 'port' | 'speed' | 'ap' | 'ssid' | 'type';
    const [clientSortKey, setClientSortKey] = useState<ClientSortKey>('ip');
    const [clientSortDir, setClientSortDir] = useState<'asc' | 'desc'>('asc');
    const [clientSearch, setClientSearch] = useState<string>('');
    const [clientStatusFilter, setClientStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
    const [clientConnectionFilter, setClientConnectionFilter] = useState<'wireless' | 'wired' | 'all'>('wireless');
    // Filters for Alerts Réseau (overview tab)
    type AlertFilter = 'all' | 'info' | 'warning' | 'critical';
    const [alertsFilter, setAlertsFilter] = useState<AlertFilter>('all');

    // Filters for Events tab
    type EventFilter = 'all' | 'alerts' | 'system' | 'connections';
    const [eventFilter, setEventFilter] = useState<EventFilter>('all');

    // WAN traffic rate estimation (instantaneous, based on UniFiPlugin.network totals)
    const [wanRate, setWanRate] = useState<{ downBps: number; upBps: number } | null>(null);
    const wanLastSampleRef = useRef<{ timestamp: number; downBytes: number; upBytes: number } | null>(null);

    // Traffic tab: toggle between "top N" and "all clients by throughput"
    const [showAllTrafficClients, setShowAllTrafficClients] = useState<boolean>(false);

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

    // Compute approximate WAN bitrates from cumulative WAN bytes
    useEffect(() => {
        const network = (unifiStats as any)?.network as { totalDownload?: number; totalUpload?: number } | undefined;
        if (!network) {
            return;
        }
        const now = Date.now();
        const downBytes = typeof network.totalDownload === 'number' ? network.totalDownload : (network as any).download || 0;
        const upBytes = typeof network.totalUpload === 'number' ? network.totalUpload : (network as any).upload || 0;

        const last = wanLastSampleRef.current;
        if (last) {
            const dtSeconds = (now - last.timestamp) / 1000;
            if (dtSeconds > 0.5 && downBytes >= last.downBytes && upBytes >= last.upBytes) {
                const downBps = ((downBytes - last.downBytes) * 8) / dtSeconds;
                const upBps = ((upBytes - last.upBytes) * 8) / dtSeconds;
                setWanRate({ downBps, upBps });
            }
        }

        wanLastSampleRef.current = { timestamp: now, downBytes, upBytes };
    }, [unifiStats]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await fetchPlugins();
        if (isActive) {
            await fetchPluginStats('unifi');
        }
        setTimeout(() => setIsRefreshing(false), 1000);
    };

    // Helper function to render clickable IP addresses
    const renderClickableIp = (ip: string | null | undefined, className: string = '', size: number = 9) => {
        if (!ip || ip === '-' || ip === 'N/A') {
            return <span className={className}>{ip || '-'}</span>;
        }

        if (onNavigateToSearch) {
            return (
                <button
                    onClick={() => {
                        const urlParams = new URLSearchParams(window.location.search);
                        urlParams.set('s', ip);
                        const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
                        window.history.pushState(null, '', newUrl);
                        onNavigateToSearch(ip);
                    }}
                    className={`text-left hover:text-cyan-400 transition-colors cursor-pointer inline-flex items-baseline gap-0.5 ${className}`}
                    title={`Rechercher ${ip} dans la page de recherche`}
                >
                    <span>{ip}</span>
                    <Link2 size={size} className="opacity-50 relative top-[-2px]" />
                </button>
            );
        }

        return <span className={className}>{ip}</span>;
    };

    const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
        { id: 'overview', label: t('unifi.tabs.overview'), icon: Activity },
        { id: 'nat', label: t('unifi.tabs.nat'), icon: Router },
        { id: 'clients', label: t('unifi.tabs.clients'), icon: Users },
        { id: 'switches', label: t('unifi.tabs.switches'), icon: Network },
        { id: 'analyse', label: t('unifi.tabs.analyse'), icon: Activity },
        { id: 'traffic', label: t('unifi.tabs.traffic'), icon: TrendingUp },
        { id: 'events', label: t('unifi.tabs.events'), icon: AlertCircle },
        { id: 'debug', label: t('unifi.tabs.debug'), icon: AlertCircle }
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
                    {/* Overview Tab */}
                    {activeTab === 'overview' && (
                        <>
                            {(() => {
                                const devices = (unifiStats?.devices || []) as any[];
                                const nonClientDevices = devices.filter(d => (d.type || '').toString().toLowerCase() !== 'client');
                                const controller = (unifiStats?.system || {}) as any;

                                const classifyUpdateStatus = (d: any): 'ok' | 'update' | 'critical' => {
                                    // If UniFi marks device as unsupported, consider it critical
                                    if (d.unsupported === true || d.unsupported_reason) return 'critical';
                                    
                                    // More precise check: upgradable must be explicitly true
                                    // OR upgrade_to_firmware must exist and be different from current version
                                    const hasUpgradeToFirmware = !!d.upgrade_to_firmware && 
                                                                  d.upgrade_to_firmware !== d.version &&
                                                                  d.upgrade_to_firmware !== d.firmware_version;
                                    const isUpgradable = d.upgradable === true || hasUpgradeToFirmware;
                                    
                                    // required_version alone is not enough - it just indicates minimum required version
                                    // Only count as update if upgradable is true or upgrade_to_firmware is different
                                    if (!isUpgradable) return 'ok';
                                    return 'update';
                                };

                                let upToDateCount = 0;
                                let updateAvailableCount = 0;
                                let criticalCount = 0;

                                for (const d of nonClientDevices) {
                                    const status = classifyUpdateStatus(d);
                                    if (status === 'ok') upToDateCount += 1;
                                    else if (status === 'update') updateAvailableCount += 1;
                                    else if (status === 'critical') criticalCount += 1;
                                }

                                // Use controller info as an additional flag if update is available
                                // Only count if there are actually devices with updates OR if controller explicitly says update is available
                                // Note: controller.updateAvailable can be true even if update is just downloaded, so we're conservative
                                if (controller.updateAvailable === true && updateAvailableCount === 0) {
                                    // Only add if no devices have updates - this means controller itself has an update
                                    // But we verify it's not just a downloaded update that's pending installation
                                    if (controller.updateDownloaded !== true) {
                                        updateAvailableCount = 1;
                                    }
                                }

                                const totalEquipments = nonClientDevices.length;

                                // Precompute some simple alert info used below
                                const offlineDevices = nonClientDevices.filter(d => d.active === false);

                                // Expose values via local variables used in JSX below
                                (overviewComputed as any).upToDateCount = upToDateCount;
                                (overviewComputed as any).updateAvailableCount = updateAvailableCount;
                                (overviewComputed as any).criticalCount = criticalCount + (controller.unsupportedDeviceCount || 0);
                                (overviewComputed as any).totalEquipments = totalEquipments;
                                (overviewComputed as any).offlineDevices = offlineDevices;
                                (overviewComputed as any).controller = controller;

                                return null;
                            })()}

                            {/* Alertes & Événements - layout inspiré du dashboard UniFi officiel */}
                            <div className="space-y-6">
                                {/* Ligne 1 : Info Système / Alertes Réseau */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <Card
                                        title={t('unifi.infoSystem')}
                                        className="bg-unifi-card border border-gray-800 rounded-xl"
                                    >
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-gray-300">
                                            {/* Colonne 1 - Système */}
                                            <div className="space-y-1">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-400">{t('unifi.uptimeController')}</span>
                                                    <span>
                                                        {(() => {
                                                            const uptime = (overviewComputed as any).controller?.uptime as number | undefined;
                                                            if (!uptime || uptime <= 0) return 'N/A';
                                                            const hours = Math.floor(uptime / 3600);
                                                            const days = Math.floor(hours / 24);
                                                            if (days > 0) return `${days} j ${hours % 24} h`;
                                                            return `${hours} h`;
                                                        })()}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-400">{t('unifi.equipments')}</span>
                                                    <span>{(overviewComputed as any).totalEquipments ?? 0}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-400">{t('unifi.clientsLabel')}</span>
                                                    <span>{(unifiStats?.devices || []).filter((d: any) => (d.type || '').toLowerCase() === 'client').length}</span>
                                                </div>
                                            </div>

                                            {/* Colonne 2 - DHCP */}
                                            <div className="space-y-1">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-400">DHCP:</span>
                                                    <span className={systemInfo?.dhcpEnabled ? 'text-green-400' : 'text-gray-500'}>
                                                        {systemInfo?.dhcpEnabled ? t('unifi.active') : t('unifi.inactive')}
                                                    </span>
                                                </div>
                                                {systemInfo?.dhcpEnabled && systemInfo?.dhcpRange && (
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-400">{t('unifi.dhcpRangeLabel')}</span>
                                                        <span className="text-white font-mono text-xs">{systemInfo.dhcpRange}</span>
                                                    </div>
                                                )}
                                                {systemInfo?.dhcpEnabled && (() => {
                                                    const clientsCount = (unifiStats?.devices || []).filter((d: any) => 
                                                        (d.type || '').toLowerCase() === 'client' && d.ip && /^\d+\.\d+\.\d+\.\d+$/.test(String(d.ip))
                                                    ).length;
                                                    return clientsCount > 0 ? (
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-400">{t('unifi.ipsUsed')}</span>
                                                            <span className="text-orange-400">{clientsCount}</span>
                                                        </div>
                                                    ) : null;
                                                })()}
                                            </div>

                                            {/* Colonne 3 - NAT (Gateway, WAN/LAN ports, règles) */}
                                            <div className="space-y-1">
                                                {(() => {
                                                    const sys = unifiStats?.system as any;
                                                    const gSummary = sys?.gatewaySummary;
                                                    const natRulesCount = typeof sys?.natRulesCount === 'number' ? sys.natRulesCount : 0;
                                                    const natActive = !!(gSummary?.ip || devicesArr.find((d: any) => {
                                                        const t = (d.type || '').toString().toLowerCase();
                                                        const m = (d.model || '').toString().toLowerCase();
                                                        return t.includes('ugw') || t.includes('udm') || t.includes('ucg') || t.includes('gateway') || m.includes('gateway');
                                                    })?.ip);
                                                    const wanPorts = gSummary?.wanPorts || [];
                                                    const lanPorts = gSummary?.lanPorts || [];
                                                    const portCount = gSummary?.portCount;
                                                    return (
                                                        <>
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-400">NAT:</span>
                                                                <span className={natActive ? 'text-green-400' : 'text-gray-500'}>
                                                                    {natActive ? 'Actif' : 'Inactif'}
                                                                </span>
                                                            </div>
                                                            {natActive && gSummary?.ip && (
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-400">Gateway IP:</span>
                                                                    <span className="text-white font-mono text-xs">{gSummary.ip}</span>
                                                                </div>
                                                            )}
                                                            {natActive && gSummary?.name && gSummary.name !== gSummary?.ip && (
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-400">Gateway:</span>
                                                                    <span className="text-white text-xs truncate" title={gSummary.name}>{gSummary.name}</span>
                                                                </div>
                                                            )}
                                                            {natActive && wanPorts.length > 0 && (
                                                                <div className="flex flex-col gap-0.5 mt-0.5">
                                                                    <span className="text-gray-400 text-[11px]">WAN:</span>
                                                                    {wanPorts.map((p: { name: string; ip?: string; up?: boolean }, i: number) => (
                                                                        <div key={i} className="flex justify-between text-xs">
                                                                            <span className="text-cyan-400/90">{p.name}</span>
                                                                            <span className="text-white font-mono truncate ml-1" title={p.ip || ''}>
                                                                                {p.ip ? (p.ip.length > 12 ? `${p.ip.slice(0, 10)}…` : p.ip) : (p.up ? 'OK' : '—')}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {natActive && (lanPorts.length > 0 || portCount != null) && (
                                                                <div className="flex flex-col gap-0.5 mt-0.5">
                                                                    <span className="text-gray-400 text-[11px]">LAN:</span>
                                                                    {lanPorts.length > 0 ? lanPorts.map((p: { name: string; ip?: string }, i: number) => (
                                                                        <div key={i} className="flex justify-between text-xs">
                                                                            <span className="text-emerald-400/90">{p.name}</span>
                                                                            {p.ip && <span className="text-white font-mono text-[11px] truncate">{p.ip}</span>}
                                                                        </div>
                                                                    )) : (
                                                                        <span className="text-white text-xs">{portCount != null ? `${portCount} port(s)` : '—'}</span>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {natActive && (
                                                                <div className="flex justify-between mt-0.5 pt-0.5 border-t border-gray-700/50">
                                                                    <span className="text-gray-400 text-[11px]">{t('unifi.natRulesLabel')}</span>
                                                                    <span className="text-purple-300 text-xs font-mono">{natRulesCount}</span>
                                                                </div>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </div>

                                            {/* Colonne 4 - Controller */}
                                            <div className="space-y-1">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-400">URL:</span>
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
                                                                        className="text-white font-mono text-xs hover:text-cyan-400 transition-colors underline decoration-dotted underline-offset-2 truncate"
                                                                        title={url}
                                                                    >
                                                                        {urlObj.hostname}
                                                                    </a>
                                                                );
                                                            } catch {
                                                                return <span className="text-white font-mono text-xs">N/A</span>;
                                                            }
                                                        }
                                                        return <span className="text-white font-mono text-xs">N/A</span>;
                                                    })()}
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-400">Port:</span>
                                                    <span className="text-white font-mono text-xs">
                                                        {(() => {
                                                            const url = unifiPlugin.settings?.url as string;
                                                            if (url) {
                                                                try {
                                                                    const urlObj = new URL(url);
                                                                    return urlObj.port || (urlObj.protocol === 'https:' ? '8443' : '8080');
                                                                } catch {
                                                                    const port = url.split(':').pop()?.split('/')[0];
                                                                    return port || 'N/A';
                                                                }
                                                            }
                                                            return 'N/A';
                                                        })()}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-400">{t('unifi.siteLabel')}</span>
                                                    <span className="text-white text-xs">
                                                        {(() => {
                                                            const statsName =
                                                                (unifiStats?.system as any)?.name ||
                                                                (unifiStats?.system as any)?.siteName;
                                                            if (statsName && typeof statsName === 'string') {
                                                                return statsName;
                                                            }
                                                            return (unifiPlugin.settings?.site as string) || 'default';
                                                        })()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                    <Card
                                        title={t('unifi.alertsNetwork')}
                                        className="bg-unifi-card border border-gray-800 rounded-xl"
                                    >
                                        <div className="flex flex-col justify-center text-sm text-gray-300 space-y-3">
                                            {/* Filtres de niveau */}
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-gray-400">{t('unifi.filterLevel')}</span>
                                                <div className="flex gap-1">
                                                    {([
                                                        { id: 'all', labelKey: 'unifi.filterAll' as const },
                                                        { id: 'info', labelKey: 'unifi.filterInfo' as const },
                                                        { id: 'warning', labelKey: 'unifi.filterWarning' as const },
                                                        { id: 'critical', labelKey: 'unifi.filterCritical' as const }
                                                    ] as const).map(btn => {
                                                        const active = alertsFilter === btn.id;
                                                        let activeClasses = 'bg-sky-500/20 border-sky-400 text-sky-200';
                                                        if (btn.id === 'warning') {
                                                            activeClasses = 'bg-amber-500/20 border-amber-400 text-amber-100';
                                                        } else if (btn.id === 'critical') {
                                                            activeClasses = 'bg-red-600/20 border-red-500 text-red-200';
                                                        } else if (btn.id === 'all') {
                                                            activeClasses = 'bg-purple-500/20 border-purple-400 text-purple-100';
                                                        }
                                                        return (
                                                            <button
                                                                key={btn.id}
                                                                type="button"
                                                                onClick={() => setAlertsFilter(btn.id)}
                                                                className={`px-2 py-0.5 rounded-full text-[10px] border ${
                                                                    active
                                                                        ? activeClasses
                                                                        : 'bg-transparent border-gray-700 text-gray-400 hover:bg-gray-800'
                                                                }`}
                                                            >
                                                                {t(btn.labelKey)}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            {(() => {
                                                const offlineDevices = (overviewComputed as any).offlineDevices as any[];
                                                const updateAvailableCount = (overviewComputed as any).updateAvailableCount as number;
                                                const criticalCount = (overviewComputed as any).criticalCount as number;

                                                const alerts: Array<{ label: string; value: number; level: 'info' | 'warning' | 'critical' }> = [];

                                                if (offlineDevices && offlineDevices.length > 0) {
                                                    alerts.push({
                                                        label: t('unifi.offlineDevices'),
                                                        value: offlineDevices.length,
                                                        level: 'warning'
                                                    });
                                                }
                                                if (updateAvailableCount > 0) {
                                                    alerts.push({
                                                        label: t('unifi.updatesAvailableLabel'),
                                                        value: updateAvailableCount,
                                                        level: 'warning'
                                                    });
                                                }
                                                if (criticalCount > 0) {
                                                    alerts.push({
                                                        label: t('unifi.updatesCriticalLabel'),
                                                        value: criticalCount,
                                                        level: 'critical'
                                                    });
                                                }

                                        const visibleAlerts = alerts.filter(alert => {
                                                    if (alertsFilter === 'all') return true;
                                                    return alert.level === alertsFilter;
                                                });

                                                if (alerts.length === 0) {
                                                    return (
                                                        <span className="text-xs text-gray-500">
                                                            {t('unifi.noActiveAlert')}
                                                        </span>
                                                    );
                                                }

                                                if (visibleAlerts.length === 0) {
                                                    return (
                                                        <span className="text-xs text-gray-500">
                                                            {t('unifi.noAlertForFilter')}
                                                        </span>
                                                    );
                                                }

                                                return (
                                                    <div className="space-y-2">
                                                        {visibleAlerts.map(alert => (
                                                            <div
                                                                key={alert.label}
                                                                className="flex items-center justify-between text-xs"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <span
                                                                        className={`w-2 h-2 rounded-full ${
                                                                            alert.level === 'critical'
                                                                                ? 'bg-red-500'
                                                                                : alert.level === 'warning'
                                                                                ? 'bg-amber-400'
                                                                                : 'bg-sky-400'
                                                                        }`}
                                                                    />
                                                                    <span className="text-gray-400">{alert.label}</span>
                                        </div>
                                                                <span
                                                                    className={
                                                                        alert.level === 'critical'
                                                                            ? 'text-red-400'
                                                                            : alert.level === 'warning'
                                                                            ? 'text-amber-400'
                                                                            : 'text-sky-300'
                                                                    }
                                                                >
                                                                    {alert.value}
                                                                </span>
                                        </div>
                                                        ))}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </Card>
                                </div>

                                {/* Ligne 2 : Statistiques synthétiques (À jour / MAJ dispo / MAJ critique / Total équipements) */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                                    <Card title="" className="bg-unifi-card border border-gray-800 rounded-xl">
                                        <div className="flex flex-col items-center justify-center py-4 gap-2">
                                            <div className="w-8 h-8 rounded-full bg-emerald-900/40 border border-emerald-500 flex items-center justify-center text-emerald-400">
                                                <CheckCircle size={18} />
                                            </div>
                                    <div className="text-2xl font-semibold text-white">
                                                {(overviewComputed as any).upToDateCount ?? 0}
                                    </div>
                                            <div className="text-xs text-gray-400">{t('unifi.upToDate')}</div>
                                        </div>
                                    </Card>
                                    <Card title="" className="bg-unifi-card border border-gray-800 rounded-xl">
                                        <div className="flex flex-col items-center justify-center py-4 gap-2">
                                            <div className="w-8 h-8 rounded-full bg-amber-900/40 border border-amber-500 flex items-center justify-center text-amber-400">
                                                <span className="text-lg leading-none">🕒</span>
                                        </div>
                                            <div className="text-2xl font-semibold text-white">
                                                {(overviewComputed as any).updateAvailableCount ?? 0}
                                            </div>
                                            <div className="text-xs text-gray-400">{t('unifi.updateAvailable')}</div>
                                    </div>
                                </Card>
                                    <Card title="" className="bg-unifi-card border border-gray-800 rounded-xl">
                                        <div className="flex flex-col items-center justify-center py-4 gap-2">
                                            <div className="w-8 h-8 rounded-full bg-red-900/40 border border-red-500 flex items-center justify-center text-red-400">
                                                <AlertCircle size={18} />
                                            </div>
                                            <div className="text-2xl font-semibold text-white">
                                                {(overviewComputed as any).criticalCount ?? 0}
                                            </div>
                                            <div className="text-xs text-gray-400">{t('unifi.updateCritical')}</div>
                                        </div>
                                    </Card>
                                    <Card title="" className="bg-unifi-card border border-gray-800 rounded-xl">
                                        <div className="flex flex-col items-center justify-center py-4 gap-2">
                                            <div className="w-8 h-8 rounded-full bg-sky-900/40 border border-sky-500 flex items-center justify-center text-sky-400">
                                                <span className="text-lg leading-none">i</span>
                                            </div>
                                            <div className="text-2xl font-semibold text-white">
                                                {(overviewComputed as any).totalEquipments ?? (unifiStats?.devices ? unifiStats.devices.length : 0)}
                                            </div>
                                            <div className="text-xs text-gray-400">{t('unifi.totalEquipments')}</div>
                                        </div>
                                    </Card>
                                </div>

                                {/* Sites, Access Points & Switches Section */}
                        <div className="col-span-full space-y-6">
                            {/* Sites Section */}
                            <Card title={t('unifi.sitesTitle')}>
                                {(() => {
                                    const sites = (unifiStats as any)?.sites as Array<any> | undefined;
                                    if (!sites || sites.length === 0) {
                                        return (
                                <div className="text-center py-8 text-gray-500">
                                    <Server size={32} className="mx-auto mb-2" />
                                                <p>{t('unifi.noSiteDetected')}</p>
                                </div>
                                        );
                                    }

                                    return (
                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                            {sites.map((site, index) => (
                                                <div
                                                    key={site.id || index}
                                                    className="bg-unifi-card rounded-xl px-4 py-3 border border-gray-800 flex flex-col gap-2 relative"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-2 h-2 rounded-full bg-gray-300" />
                                                            <span className="text-sm font-semibold text-white truncate">
                                                                {site.name || site.id || t('unifi.siteFallback')}
                                                            </span>
                                                        </div>
                                                        <span
                                                            className={`w-2 h-2 rounded-full ${
                                                                site.status === 'online' ? 'bg-emerald-400' : 'bg-gray-500'
                                                            }`}
                                                        />
                                                    </div>
                                                    <div className="text-xs space-y-0.5 mt-1 flex-1">
                                                        {site.hostname && (
                                                            <div>
                                                                <span className="text-gray-500">Hostname:&nbsp;</span>
                                                                <span className="text-gray-300">
                                                                    {site.hostname}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {site.devices && (
                                                                <div>
                                                                    <span className="text-gray-500">{t('unifi.equipments')}&nbsp;</span>
                                                                    <span className="text-gray-300">
                                                                        {site.devices.total ?? 0}
                                                                    </span>
                                                                </div>
                                                        )}
                                                                </div>
                                                    {/* Badges en bas à droite */}
                                                    {site.devices && (
                                                        <div className="flex items-center justify-end gap-2 mt-auto pt-2">
                                                            {site.devices.clients !== undefined && (
                                                                <span className="px-2.5 py-1 rounded-lg bg-purple-500/20 border border-purple-500/50 text-purple-300 font-semibold text-sm">
                                                                    {site.devices.clients ?? 0} {t('unifi.clients')}
                                                                    </span>
                                                            )}
                                                            {site.devices.aps !== undefined && (
                                                                <span className="px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 font-semibold text-sm">
                                                                    {site.devices.aps ?? 0} APs
                                                                    </span>
                                                            )}
                                                            {site.devices.switches !== undefined && (
                                                                <span className="px-2.5 py-1 rounded-lg bg-blue-500/20 border border-blue-500/50 text-blue-300 font-semibold text-sm">
                                                                    {site.devices.switches ?? 0} Switches
                                                                </span>
                                                            )}
                                                                </div>
                                                        )}
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </Card>

                            {/* Access Points Section */}
                            <Card title={t('unifi.pointsAccess')} className="bg-unifi-card border border-gray-800 rounded-xl">
                                {unifiStats?.devices ? (
                                    (() => {
                                        const accessPoints = unifiStats.devices.filter((d: any) => {
                                            // UniFi devices can have type: 'uap', 'uap-ac', 'uap-ac-lite', etc.
                                            // Or model names containing 'UAP', 'AP', 'accesspoint'
                                            // Exclude clients (type === 'client')
                                            const type = (d.type || '').toLowerCase();
                                            const model = (d.model || '').toLowerCase();
                                            return (type === 'uap' || 
                                                    type.includes('uap') || 
                                                    type === 'accesspoint' || 
                                                    type === 'ap' ||
                                                    model.includes('uap') ||
                                                    model.includes('ap')) &&
                                                   type !== 'client';
                                        });
                                        
                                        if (accessPoints.length === 0) {
                                            return (
                                                <div className="text-center py-8 text-gray-500">
                                                    <Wifi size={32} className="mx-auto mb-2" />
                                                    <p>{t('unifi.noApDetected')}</p>
                                                    <p className="text-xs mt-2 text-gray-600">
                                                        Total devices: {unifiStats.devices.length}
                                                        {unifiStats.devices.length > 0 && (
                                                            <span className="block mt-1">
                                                                Types: {Array.from(new Set(unifiStats.devices.map((d: any) => d.type || 'unknown'))).join(', ')}
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                            );
                                        }
                                        
                                        const clients = unifiStats.devices.filter((d: any) => {
                                            const type = (d.type || '').toLowerCase();
                                            return type === 'client';
                                        });

                                        const getWifiType = (device: any): string => {
                                            const model = (device.model || '').toString().toLowerCase();
                                            if (model.includes('be') || model.includes('wifi 7') || model.includes('wi-fi 7')) return 'Wi‑Fi 7';
                                            if (model.includes('6e')) return 'Wi‑Fi 6E';
                                            if (model.includes('6') || model.includes('ax')) return 'Wi‑Fi 6';
                                            if (model.includes('ac')) return 'Wi‑Fi 5';
                                            if (model.includes('n')) return 'Wi‑Fi 4';
                                            return 'Wi‑Fi';
                                        };

                                        const getUnifiBands = (device: any): string[] => {
                                            const bands: string[] = [];
                                            // Check radio_table (most common UniFi API structure)
                                            if (device.radio_table && Array.isArray(device.radio_table)) {
                                                device.radio_table.forEach((radio: any) => {
                                                    const band = radio.radio || radio.name || '';
                                                    if (band) {
                                                        const bandLower = band.toLowerCase();
                                                        if (bandLower.includes('ng') || bandLower.includes('2.4') || bandLower === '2g') {
                                                            if (!bands.includes('2.4GHz')) bands.push('2.4GHz');
                                                        } else if (bandLower.includes('na') || bandLower.includes('5') || bandLower === '5g') {
                                                            if (!bands.includes('5GHz')) bands.push('5GHz');
                                                        } else if (bandLower.includes('6') || bandLower === '6g') {
                                                            if (!bands.includes('6GHz')) bands.push('6GHz');
                                                        }
                                                    }
                                                });
                                            }
                                            // Fallback: check radio fields directly
                                            if (bands.length === 0) {
                                                if (device.radio_ng || device.radio_2g) bands.push('2.4GHz');
                                                if (device.radio_na || device.radio_5g) bands.push('5GHz');
                                                if (device.radio_6g) bands.push('6GHz');
                                            }
                                            return bands.length > 0 ? bands : ['N/A'];
                                        };

                                        const getClientsForAp = (ap: any): number => {
                                            const apName = (ap.name || ap.model || '').toString();
                                            const apMac = (ap.mac || '').toString().toLowerCase();
                                            return clients.filter((client: any) => {
                                                const lastUplinkName = (client.last_uplink_name || client.uplink_name || '') as string;
                                                const lastUplinkMac = (client.last_uplink_mac || client.sw_mac || '') as string;
                                        return (
                                                    lastUplinkName === apName ||
                                                    lastUplinkMac.toLowerCase() === apMac
                                                );
                                            }).length;
                                        };

                                        const formatUptime = (seconds: number | undefined): string => {
                                            if (!seconds || seconds <= 0) return 'N/A';
                                            const days = Math.floor(seconds / 86400);
                                            const hours = Math.floor((seconds % 86400) / 3600);
                                            const minutes = Math.floor((seconds % 3600) / 60);
                                            if (days > 0) return `${days}j ${hours}h`;
                                            if (hours > 0) return `${hours}h ${minutes}min`;
                                            return `${minutes}min`;
                                        };

                                        return (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                                                {accessPoints.map((device: any) => {
                                                    const clientsCount = getClientsForAp(device);
                                                    const wifiType = getWifiType(device);
                                                    const firmware = (device.firmware_version || device.version || device.firmware) as string | undefined;
                                                    const bands = getUnifiBands(device);
                                                    const uptime = device.uptime as number | undefined;
                                                    const cpuUsage = device.cpu_usage || device.cpu?.usage || device.proc_usage as number | undefined;
                                                    const power = device.power || device.watt || device.poe_power as number | undefined;

                                                    return (
                                                <div
                                                    key={device.id}
                                                            className={`bg-unifi-card rounded-xl px-4 py-3 border border-gray-800 flex flex-col gap-2 ${
                                                                device.active === false ? 'opacity-60' : ''
                                                            }`}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="w-2 h-2 rounded-full bg-gray-300" />
                                                                    <span className="text-sm font-semibold text-white truncate">
                                                                        {device.name || device.model || device.id}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <span
                                                                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                                                            device.active === false
                                                                                ? 'bg-gray-900 text-gray-400 border-gray-700'
                                                                                : 'bg-emerald-900/60 text-emerald-300 border-emerald-600/70'
                                                                        }`}
                                                                    >
                                                                        {device.active === false ? t('unifi.offlineStatus') : t('unifi.onlineStatus')}
                                                                    </span>
                                                                    <span
                                                                        className={`w-2 h-2 rounded-full ${
                                                                            device.active !== false ? 'bg-emerald-400' : 'bg-gray-500'
                                                                        }`}
                                                                        title={
                                                                            device.active !== false
                                                                                ? t('unifi.apOnline')
                                                                                : t('unifi.apOffline')
                                                                        }
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2 text-xs">
                                                                {/* Colonne gauche - Informations système */}
                                                                <div className="space-y-1">
                                                        {device.ip && (
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-gray-500">IP</span>
                                                                            {renderClickableIp(device.ip, 'text-gray-300 font-mono text-[10px]', 8)}
                                                                    </div>
                                                        )}
                                                                    {uptime !== undefined && (
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-gray-500">Uptime</span>
                                                                            <span className="text-gray-300">{formatUptime(uptime)}</span>
                                                                        </div>
                                                                    )}
                                                                    {firmware && (
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-gray-500">Firmware</span>
                                                                            <span className="text-gray-300">v{firmware}</span>
                                                                        </div>
                                                                    )}
                                                                    {cpuUsage !== undefined && (
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-gray-500">CPU</span>
                                                                            <span className="text-gray-300">{cpuUsage}%</span>
                                                                        </div>
                                                                    )}
                                                                    {power !== undefined && (
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-gray-500">Puissance</span>
                                                                            <span className="text-gray-300">{power}W</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                
                                                                {/* Colonne droite - Informations réseau */}
                                                                <div className="space-y-1">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-gray-500">Type Wi‑Fi</span>
                                                                    <span className="text-gray-300">{wifiType}</span>
                                                    </div>
                                                                    <div className="flex flex-col gap-1">
                                                                        <span className="text-gray-500">Bandes</span>
                                                                        <div className="flex flex-wrap gap-1">
                                                                        {bands.map((band, bandIndex) => (
                                                                            <span
                                                                                key={`band-${bandIndex}`}
                                                                                className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-900/40 border border-cyan-700/50 text-cyan-300"
                                                                            >
                                                                                {band}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-gray-500">{t('unifi.clients')}</span>
                                                                        <span className="text-gray-300 font-semibold">{clientsCount}</span>
                                                                </div>
                                                                    </div>
                                                </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()
                                ) : (
                                    <div className="text-center py-8 text-gray-500">
                                        <Wifi size={32} className="mx-auto mb-2" />
                                        <p>{t('unifi.noDataAvailable')}</p>
                                    </div>
                                )}
                            </Card>

                            {/* Switches Section */}
                            <Card title={t('unifi.switches')} className="bg-unifi-card border border-gray-800 rounded-xl">
                                {unifiStats?.devices ? (
                                    (() => {
                                        const switches = unifiStats.devices.filter((d: any) => {
                                            const type = (d.type || '').toLowerCase();
                                            return type.startsWith('usw');
                                        });

                                        if (switches.length === 0) {
                                            return (
                                                <div className="text-center py-8 text-gray-500">
                                                    <Server size={32} className="mx-auto mb-2" />
                                                    <p>{t('unifi.noSwitchDetected')}</p>
                                                    <p className="text-xs mt-2 text-gray-600">
                                                        Total devices: {unifiStats.devices.length}
                                                    </p>
                                                </div>
                                            );
                                        }

                                        const clients = unifiStats.devices.filter((d: any) => {
                                            const type = (d.type || '').toLowerCase();
                                            return type === 'client';
                                        });

                                        const getPortsSummary = (device: any): { active: number; total: number } => {
                                            const rawPorts =
                                                (device as any).port_table ||
                                                (device as any).eth_port_table ||
                                                (device as any).ports ||
                                                (device as any).port_overrides ||
                                                [];
                                            const ports = Array.isArray(rawPorts) ? (rawPorts as any[]) : [];
                                            let total = ports.length;
                                            if (total === 0 && typeof device.num_port === 'number') {
                                                total = device.num_port as number;
                                            }
                                            const active = ports.filter((p: any) => {
                                                const upFlag = p.up === true || p.enable === true;
                                                const linkUp = p.link_state === 'up' || p.media === 'GE' || p.media === '10GE';
                                                const speedUp = typeof p.speed === 'number' && p.speed > 0;
                                                return upFlag || linkUp || speedUp;
                                            }).length;
                                            return { active, total };
                                        };

                                        const getClientsForSwitch = (sw: any): number => {
                                            const swName = (sw.name || sw.model || '').toString();
                                            const swMac = (sw.mac || '').toString().toLowerCase();
                                            return clients.filter((client: any) => {
                                                const lastUplinkName = (client.last_uplink_name || client.uplink_name || '') as string;
                                                const lastUplinkMac = (client.last_uplink_mac || client.sw_mac || '') as string;
                                                return (
                                                    lastUplinkName === swName ||
                                                    lastUplinkMac.toLowerCase() === swMac
                                                );
                                            }).length;
                                        };

                                        const formatUptime = (seconds: number | undefined): string => {
                                            if (!seconds || seconds <= 0) return 'N/A';
                                            const days = Math.floor(seconds / 86400);
                                            const hours = Math.floor((seconds % 86400) / 3600);
                                            const minutes = Math.floor((seconds % 3600) / 60);
                                            if (days > 0) return `${days}j ${hours}h`;
                                            if (hours > 0) return `${hours}h ${minutes}min`;
                                            return `${minutes}min`;
                                        };

                                        return (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                                                {switches.map((device: any) => {
                                                    const { active, total } = getPortsSummary(device);
                                                    const clientsCount = getClientsForSwitch(device);
                                                    const firmware = (device.firmware_version || device.version || device.firmware) as string | undefined;
                                                    const uptime = device.uptime as number | undefined;
                                                    const cpuUsage = device.cpu_usage || device.cpu?.usage || device.proc_usage as number | undefined;
                                                    const power = device.power || device.watt || device.poe_power as number | undefined;

                                                    return (
                                                        <div
                                                            key={device.id}
                                                            className={`bg-unifi-card rounded-xl px-3 py-2.5 border border-gray-800 flex flex-col ${
                                                                device.active === false ? 'opacity-60' : ''
                                                            }`}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="w-2 h-2 rounded-full bg-gray-300" />
                                                                    <span className="text-sm font-semibold text-white truncate">
                                                                        {device.name || device.model || device.id}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <span
                                                                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                                                            device.active === false
                                                                                ? 'bg-gray-900 text-gray-400 border-gray-700'
                                                                                : 'bg-emerald-900/60 text-emerald-300 border-emerald-600/70'
                                                                        }`}
                                                                    >
                                                                        {device.active === false ? t('unifi.offlineStatus') : t('unifi.onlineStatus')}
                                                                    </span>
                                                                    <span
                                                                        className={`w-2 h-2 rounded-full ${
                                                                            device.active !== false ? 'bg-emerald-400' : 'bg-gray-500'
                                                                        }`}
                                                                        title={
                                                                            device.active !== false
                                                                                ? t('unifi.switchOnline')
                                                                                : 'Switch hors ligne'
                                                                        }
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2 text-xs">
                                                                {/* Colonne gauche - Informations système */}
                                                                <div className="space-y-1">
                                                                {device.ip && (
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-gray-500">IP</span>
                                                                            {renderClickableIp(device.ip, 'text-gray-300 font-mono text-[10px]', 8)}
                                                                    </div>
                                                                )}
                                                                    {uptime !== undefined && (
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-gray-500">Uptime</span>
                                                                            <span className="text-gray-300">{formatUptime(uptime)}</span>
                                                                </div>
                                                                    )}
                                                                {firmware && (
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-gray-500">Firmware</span>
                                                                        <span className="text-gray-300">v{firmware}</span>
                                                                    </div>
                                                                )}
                                                                    {cpuUsage !== undefined && (
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-gray-500">CPU</span>
                                                                            <span className="text-gray-300">{cpuUsage}%</span>
                                                                        </div>
                                                                    )}
                                                                    {power !== undefined && (
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-gray-500">Puissance</span>
                                                                            <span className="text-gray-300">{power}W</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                
                                                                {/* Colonne droite - Informations réseau */}
                                                                <div className="space-y-1">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-gray-500">Ports actifs</span>
                                                                        <span className="text-gray-300 font-semibold">
                                                                            {total > 0 ? `${active} / ${total}` : '-'}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-gray-500">{t('unifi.clients')}</span>
                                                                        <span className="text-gray-300 font-semibold">{clientsCount}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()
                                ) : (
                                    <div className="text-center py-8 text-gray-500">
                                        <Server size={32} className="mx-auto mb-2" />
                                        <p>{t('unifi.noDataAvailable')}</p>
                                    </div>
                                )}
                            </Card>
                        </div>
                        </div>
                        </>
                    )}

                    {/* Switches Tab - REMOVED (now combined with Sites & APs) */}
                    {false && activeTab === 'switches' && (
                        <div className="col-span-full">
                            <Card title={t('unifi.pointsAccess')} className="bg-unifi-card border border-gray-800 rounded-xl">
                                {unifiStats?.devices ? (
                                    (() => {
                                        const accessPoints = unifiStats.devices.filter((d: any) => {
                                            // UniFi devices can have type: 'uap', 'uap-ac', 'uap-ac-lite', etc.
                                            // Or model names containing 'UAP', 'AP', 'accesspoint'
                                            // Exclude clients (type === 'client')
                                            const type = (d.type || '').toLowerCase();
                                            const model = (d.model || '').toLowerCase();
                                            return (type === 'uap' || 
                                                    type.includes('uap') || 
                                                    type === 'accesspoint' || 
                                                    type === 'ap' ||
                                                    model.includes('uap') ||
                                                    model.includes('ap')) &&
                                                   type !== 'client';
                                        });
                                        
                                        if (accessPoints.length === 0) {
                                            return (
                                                <div className="text-center py-8 text-gray-500">
                                                    <Wifi size={32} className="mx-auto mb-2" />
                                                    <p>{t('unifi.noApDetected')}</p>
                                                    <p className="text-xs mt-2 text-gray-600">
                                                        Total devices: {unifiStats.devices.length}
                                                        {unifiStats.devices.length > 0 && (
                                                            <span className="block mt-1">
                                                                Types: {Array.from(new Set(unifiStats.devices.map((d: any) => d.type || 'unknown'))).join(', ')}
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                            );
                                        }
                                        
                                        const clients = unifiStats.devices.filter((d: any) => {
                                            const type = (d.type || '').toLowerCase();
                                            return type === 'client';
                                        });

                                        const getWifiType = (device: any): string => {
                                            const model = (device.model || '').toString().toLowerCase();
                                            if (model.includes('be') || model.includes('wifi 7') || model.includes('wi-fi 7')) return 'Wi‑Fi 7';
                                            if (model.includes('6e')) return 'Wi‑Fi 6E';
                                            if (model.includes('6') || model.includes('ax')) return 'Wi‑Fi 6';
                                            if (model.includes('ac')) return 'Wi‑Fi 5';
                                            if (model.includes('n')) return 'Wi‑Fi 4';
                                            return 'Wi‑Fi';
                                        };

                                        const getUnifiBands = (device: any): string[] => {
                                            const bands: string[] = [];
                                            // Check radio_table (most common UniFi API structure)
                                            if (device.radio_table && Array.isArray(device.radio_table)) {
                                                device.radio_table.forEach((radio: any) => {
                                                    const band = radio.radio || radio.name || '';
                                                    if (band) {
                                                        const bandLower = band.toLowerCase();
                                                        if (bandLower.includes('ng') || bandLower.includes('2.4') || bandLower === '2g') {
                                                            if (!bands.includes('2.4GHz')) bands.push('2.4GHz');
                                                        } else if (bandLower.includes('na') || bandLower.includes('5') || bandLower === '5g') {
                                                            if (!bands.includes('5GHz')) bands.push('5GHz');
                                                        } else if (bandLower.includes('6') || bandLower === '6g') {
                                                            if (!bands.includes('6GHz')) bands.push('6GHz');
                                                        }
                                                    }
                                                });
                                            }
                                            // Fallback: check radio fields directly
                                            if (bands.length === 0) {
                                                if (device.radio_ng || device.radio_2g) bands.push('2.4GHz');
                                                if (device.radio_na || device.radio_5g) bands.push('5GHz');
                                                if (device.radio_6g) bands.push('6GHz');
                                            }
                                            return bands.length > 0 ? bands : ['N/A'];
                                        };

                                        const getClientsForAp = (ap: any): number => {
                                            const apName = (ap.name || ap.model || '').toString();
                                            const apMac = (ap.mac || '').toString().toLowerCase();
                                            return clients.filter((client: any) => {
                                                const lastUplinkName = (client.last_uplink_name || client.uplink_name || '') as string;
                                                const lastUplinkMac = (client.last_uplink_mac || client.sw_mac || '') as string;
                                        return (
                                                    lastUplinkName === apName ||
                                                    lastUplinkMac.toLowerCase() === apMac
                                                );
                                            }).length;
                                        };

                                        return (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                                                {accessPoints.map((device: any) => {
                                                    const clientsCount = getClientsForAp(device);
                                                    const wifiType = getWifiType(device);
                                                    const firmware = (device.firmware_version || device.version || device.firmware) as string | undefined;
                                                    const bands = getUnifiBands(device);

                                                    return (
                                                <div
                                                    key={device.id}
                                                            className={`bg-unifi-card rounded-xl px-4 py-3 border border-gray-800 flex flex-col gap-2 ${
                                                                device.active === false ? 'opacity-60' : ''
                                                            }`}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="w-2 h-2 rounded-full bg-gray-300" />
                                                                    <span className="text-sm font-semibold text-white truncate">
                                                                        {device.name || device.model || device.id}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <span
                                                                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                                                            device.active === false
                                                                                ? 'bg-gray-900 text-gray-400 border-gray-700'
                                                                                : 'bg-emerald-900/60 text-emerald-300 border-emerald-600/70'
                                                                        }`}
                                                                    >
                                                                        {device.active === false ? t('unifi.offlineStatus') : t('unifi.onlineStatus')}
                                                                    </span>
                                                                    <span
                                                                        className={`w-2 h-2 rounded-full ${
                                                                            device.active !== false ? 'bg-emerald-400' : 'bg-gray-500'
                                                                        }`}
                                                                        title={
                                                                            device.active !== false
                                                                                ? t('unifi.apOnline')
                                                                                : t('unifi.apOffline')
                                                                        }
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="text-xs space-y-0.5 mt-1">
                                                        {device.ip && (
                                                                    <div>
                                                                        <span className="text-gray-500">IP:&nbsp;</span>
                                                                        {renderClickableIp(device.ip, 'text-gray-300', 8)}
                                                                    </div>
                                                        )}
                                                                <div>
                                                                    <span className="text-gray-500">Type Wi‑Fi:&nbsp;</span>
                                                                    <span className="text-gray-300">{wifiType}</span>
                                                    </div>
                                                                <div>
                                                                    <span className="text-gray-500">Bandes:&nbsp;</span>
                                                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                                                        {bands.map((band, bandIndex) => (
                                                                            <span
                                                                                key={`band-${bandIndex}`}
                                                                                className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-900/40 border border-cyan-700/50 text-cyan-300"
                                                                            >
                                                                                {band}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <span className="text-gray-500">{t('unifi.clientsLabel')}&nbsp;</span>
                                                                    <span className="text-gray-300">{clientsCount}</span>
                                                                </div>
                                                                {firmware && (
                                                                    <div>
                                                                        <span className="text-gray-500">Firmware:&nbsp;</span>
                                                                        <span className="text-gray-300">v{firmware}</span>
                                                                    </div>
                                                    )}
                                                </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()
                                ) : (
                                    <div className="text-center py-8 text-gray-500">
                                        <Wifi size={32} className="mx-auto mb-2" />
                                        <p>{t('unifi.noDataAvailable')}</p>
                                    </div>
                                )}
                            </Card>
                        </div>
                    )}

                    {/* Switch Tab */}
                    {activeTab === 'switches' && (
                        <div className="col-span-full space-y-6">
                            <Card title={t('unifi.switchPortsTitle')} className="bg-unifi-card border border-gray-800 rounded-xl">
                                {unifiStats?.devices ? (
                                    (() => {
                                        // Filter switches (type starts with 'usw' or model contains 'switch')
                                        const switches = devicesArr.filter((d: any) => {
                                            const type = (d.type || '').toString().toLowerCase();
                                            const model = (d.model || '').toString().toLowerCase();
                                            return type.startsWith('usw') || 
                                                   type.includes('switch') ||
                                                   model.includes('usw') ||
                                                   model.includes('switch');
                                        });


                                        if (switches.length === 0) {
                                            return (
                                                <div className="text-center py-8 text-gray-500">
                                                    <Network size={32} className="mx-auto mb-2" />
                                                    <p>{t('unifi.noSwitchDetected')}</p>
                                                    <p className="text-xs mt-2 text-gray-600">
                                                        Total devices: {devicesArr.length}
                                                        {devicesArr.length > 0 && (
                                                            <span className="block mt-1">
                                                                Types: {Array.from(new Set(devicesArr.map((d: any) => d.type || 'unknown'))).join(', ')}
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                            );
                                        }

                                        // Build port rows for all switches
                                        interface PortRow {
                                            switchName: string;
                                            switchIp: string;
                                            port: number;
                                            speed: number | null;
                                            poe: string;
                                            errors: string;
                                            portName: string;
                                        }

                                        const portRows: PortRow[] = [];

                                        switches.forEach((switchDevice: any) => {
                                            const switchName = switchDevice.name || switchDevice.model || 'Switch';
                                            const switchIp = switchDevice.ip || 'N/A';

                                            // Get ports from various possible fields
                                            const rawPorts =
                                                switchDevice.eth_port_table ||
                                                switchDevice.port_table ||
                                                switchDevice.ports ||
                                                switchDevice.port_overrides ||
                                                [];

                                            const ports = Array.isArray(rawPorts) ? rawPorts : [];


                                            // If no ports array but num_port is defined, create placeholder entries
                                            if (ports.length === 0 && typeof switchDevice.num_port === 'number' && switchDevice.num_port > 0) {
                                                for (let i = 1; i <= switchDevice.num_port; i++) {
                                                    portRows.push({
                                                        switchName,
                                                        switchIp,
                                                        port: i,
                                                        speed: null,
                                                        poe: 'N/A',
                                                        errors: 'N/A',
                                                        portName: 'n/a'
                                                    });
                                                }
                                            } else if (ports.length > 0) {
                                                ports.forEach((port: any, index: number) => {
                                                    // Port number: prefer port_idx, then portnum, then index + 1
                                                    const portNum = port.port_idx !== undefined ? port.port_idx : 
                                                                   (port.portnum !== undefined ? port.portnum : 
                                                                    (index + 1));

                                                    // Speed: prefer speed, then current_speed, then link_speed, then media type
                                                    let speed: number | null = null;
                                                    if (typeof port.speed === 'number' && port.speed > 0) {
                                                        speed = port.speed;
                                                    } else if (typeof port.current_speed === 'number' && port.current_speed > 0) {
                                                        speed = port.current_speed;
                                                    } else if (typeof port.link_speed === 'number' && port.link_speed > 0) {
                                                        speed = port.link_speed;
                                                    } else if (port.media) {
                                                        // Try to extract speed from media type (e.g., "GE" = 1000, "10GE" = 10000)
                                                        const mediaStr = port.media.toString().toUpperCase();
                                                        if (mediaStr.includes('10GE') || mediaStr.includes('10G')) {
                                                            speed = 10000;
                                                        } else if (mediaStr.includes('2.5GE') || mediaStr.includes('2.5G')) {
                                                            speed = 2500;
                                                        } else if (mediaStr.includes('GE') || mediaStr.includes('1G')) {
                                                            speed = 1000;
                                                        } else if (mediaStr.includes('100M') || mediaStr.includes('100')) {
                                                            speed = 100;
                                                        } else if (mediaStr.includes('10M') || mediaStr.includes('10')) {
                                                            speed = 10;
                                                        }
                                                    }

                                                    // PoE: check poe_enable, poe_caps, poe_mode, poe_power
                                                    let poe = 'off';
                                                    if (port.poe_enable === true || port.poe_enable === 'auto') {
                                                        poe = 'auto';
                                                    } else if (port.poe_mode && port.poe_mode !== 'off') {
                                                        poe = port.poe_mode.toString().toLowerCase();
                                                    } else if (port.poe_caps && port.poe_caps > 0) {
                                                        poe = 'auto';
                                                    } else if (typeof port.poe_power === 'number' && port.poe_power > 0) {
                                                        poe = 'auto';
                                                    } else if (port.poe_class) {
                                                        poe = 'auto';
                                                    }

                                                    // Errors: combine rx_errors and tx_errors
                                                    let errors = 'N/A';
                                                    const rxErrors = typeof port.rx_errors === 'number' ? port.rx_errors : 0;
                                                    const txErrors = typeof port.tx_errors === 'number' ? port.tx_errors : 0;
                                                    const totalErrors = rxErrors + txErrors;
                                                    if (totalErrors > 0) {
                                                        errors = totalErrors.toString();
                                                    }

                                                    // Port name
                                                    const portName = port.name || port.port_name || 'n/a';

                                                    portRows.push({
                                                        switchName,
                                                        switchIp,
                                                        port: portNum,
                                                        speed,
                                                        poe,
                                                        errors,
                                                        portName
                                                    });
                                                });
                                            } else {
                                                // If no ports data and no num_port, create at least one placeholder entry
                                                // This ensures we show something for the switch even if port data is missing
                                                portRows.push({
                                                    switchName,
                                                    switchIp,
                                                    port: 1,
                                                    speed: null,
                                                    poe: 'N/A',
                                                    errors: 'N/A',
                                                    portName: t('unifi.portNameUnavailable')
                                                });
                                            }
                                        });

                                        // Sort by switch name, then by port number
                                        portRows.sort((a, b) => {
                                            if (a.switchName !== b.switchName) {
                                                return a.switchName.localeCompare(b.switchName);
                                            }
                                            return a.port - b.port;
                                        });


                                        if (portRows.length === 0) {
                                            return (
                                                <div className="text-center py-8 text-gray-500">
                                                    <Network size={32} className="mx-auto mb-2" />
                                                    <p>{t('unifi.noPortData')}</p>
                                                    <p className="text-xs mt-2 text-gray-600">
                                                        {t('unifi.switchesDetectedNoPortsCount', { count: switches.length })}
                                                    </p>
                                                    {import.meta.env.DEV && (
                                                        <p className="text-xs mt-1 text-gray-500">
                                                            {t('unifi.debugCheckConsoleDetails')}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        }

                                        return (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm table-fixed">
                                                    <thead className="bg-[#0a1929] text-gray-300">
                                                        <tr>
                                                            <th className="px-4 py-3 text-left font-semibold" style={{ width: '20%' }}>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="flex gap-0.5">
                                                                        <div className="w-2.5 h-2.5 bg-gray-400 rounded-sm"></div>
                                                                        <div className="w-2.5 h-2.5 bg-gray-400 rounded-sm"></div>
                                                                    </div>
                                                                    <span>SWITCH</span>
                                                                </div>
                                                            </th>
                                                            <th className="px-4 py-3 text-left font-semibold" style={{ width: '15%' }}>
                                                                <div className="flex items-center gap-2">
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                                                    </svg>
                                                                    <span>IP</span>
                                                                </div>
                                                            </th>
                                                            <th className="px-4 py-3 text-left font-semibold" style={{ width: '12%' }}>
                                                                <div className="flex items-center gap-2">
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                                                    </svg>
                                                                    <span>VITESSE</span>
                                                                </div>
                                                            </th>
                                                            <th className="px-4 py-3 text-left font-semibold" style={{ width: '10%' }}>
                                                                <div className="flex items-center gap-2">
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                                    </svg>
                                                                    <span>POE</span>
                                                                </div>
                                                            </th>
                                                            <th className="px-4 py-3 text-left font-semibold" style={{ width: '8%' }}>
                                                                <div className="flex items-center gap-2">
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                                    </svg>
                                                                    <span>PORT</span>
                                                                </div>
                                                            </th>
                                                            <th className="px-4 py-3 text-left font-semibold" style={{ width: '10%' }}>
                                                                <div className="flex items-center gap-2">
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                                    </svg>
                                                                    <span>ERREURS</span>
                                                                </div>
                                                            </th>
                                                            <th className="px-4 py-3 text-left font-semibold" style={{ width: '25%' }}>
                                                                <div className="flex items-center gap-2">
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                                    </svg>
                                                                    <span>NOM PORT</span>
                                                                </div>
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {portRows.map((row, index) => (
                                                            <tr
                                                                key={`${row.switchName}-${row.port}-${index}`}
                                                                className={index % 2 === 0 ? 'bg-[#0f1729]' : 'bg-[#1a1f2e]'}
                                                            >
                                                                <td className="px-4 py-3">
                                                                    <span className="text-cyan-400 font-semibold">{row.switchName}</span>
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    {renderClickableIp(row.switchIp, 'text-blue-400 font-mono', 9)}
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    {row.speed !== null ? (
                                                                        <span className="text-emerald-400">
                                                                            {row.speed >= 1000 ? `${row.speed / 1000}G` : `${row.speed}`}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-gray-500">-</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    <span className={
                                                                        row.poe === 'auto' || row.poe === 'passthrough' || row.poe === '24v' 
                                                                            ? 'text-yellow-400' 
                                                                            : row.poe === 'off' || row.poe === 'N/A'
                                                                            ? 'text-gray-500'
                                                                            : 'text-yellow-300'
                                                                    }>
                                                                        {row.poe === 'N/A' ? 'N/A' : row.poe}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3 text-white">{row.port}</td>
                                                                <td className="px-4 py-3">
                                                                    <span className={row.errors !== 'N/A' && parseInt(row.errors) > 0 ? 'text-red-400' : 'text-emerald-400'}>
                                                                        {row.errors}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    <span className="text-yellow-400">{row.portName}</span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        );
                                    })()
                                ) : (
                                    <div className="text-center py-8 text-gray-500">
                                        <Network size={32} className="mx-auto mb-2" />
                                        <p>{t('unifi.noDataAvailable')}</p>
                                    </div>
                                )}
                            </Card>
                        </div>
                    )}

                    {/* Analyse Tab */}
                    {activeTab === 'analyse' && (
                        <div className="col-span-full space-y-6">
                            <PluginSummaryCard 
                                pluginId="unifi" 
                                onViewDetails={undefined}
                                hideController={true}
                                cardClassName="bg-unifi-card border border-gray-800 rounded-xl"
                                showDeviceTables={true}
                                onNavigateToSearch={onNavigateToSearch}
                            />
                            <NetworkEventsWidget 
                                twoColumns={true}
                                cardClassName="bg-unifi-card border border-gray-800 rounded-xl"
                                onNavigateToSearch={onNavigateToSearch}
                            />
                        </div>
                    )}

                    {/* Clients Tab */}
                    {activeTab === 'clients' && (
                        <div className="col-span-full">
                            <Card title={t('unifi.clients')} className="bg-unifi-card border border-gray-800 rounded-xl">
                                {unifiStats?.devices ? (
                                    (() => {
                                        const clients = unifiStats.devices.filter((d: any) => {
                                            const type = (d.type || '').toLowerCase();
                                            return type === 'client';
                                        });
                                        
                                        if (clients.length === 0) {
                                            return (
                                                <div className="text-center py-8 text-gray-500">
                                                    <Users size={32} className="mx-auto mb-2" />
                                                    <p>{t('unifi.noClientDetected')}</p>
                                                    <p className="text-xs mt-2 text-gray-600">
                                                        Total devices: {unifiStats.devices.length}
                                                    </p>
                                                </div>
                                            );
                                        }
                                        
                                        const parseIp = (ip: string | undefined): number => {
                                            if (!ip) return 0;
                                            const parts = ip.split('.').map(p => parseInt(p, 10));
                                            if (parts.length !== 4 || parts.some(isNaN)) return 0;
                                            return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
                                        };

                                        const getSpeed = (c: any): number => {
                                            // Try different fields that can represent client or port speed
                                            // UniFi clients expose various combinations depending on firmware:
                                            // - tx_rate / rx_rate
                                            // - phy_tx_rate / phy_rx_rate
                                            // - sw_tx_rate / sw_rx_rate
                                            // - current_speed / speed (wired ports)
                                            const rate =
                                                c.tx_rate ||
                                                c.rx_rate ||
                                                c.phy_tx_rate ||
                                                c.phy_rx_rate ||
                                                c.sw_tx_rate ||
                                                c.sw_rx_rate ||
                                                c.current_speed ||
                                                c.speed ||
                                                0;
                                            return typeof rate === 'number' ? rate : 0;
                                        };

                                        const getTypeLabel = (c: any): string => {
                                            if (c.is_wired === true) return 'WIRED';
                                            return 'WIRELESS';
                                        };

                                        const getSignalInfo = (c: any): { rssi?: number; quality?: string } => {
                                            // UniFi expose généralement un champ "signal" ou "rssi" (dBm, négatif).
                                            const raw = (typeof c.signal === 'number' ? c.signal : c.rssi) as number | undefined;
                                            if (raw == null || Number.isNaN(raw)) return {};

                                            let quality: string;
                                            if (raw >= -50) quality = t('unifi.excellent');
                                            else if (raw >= -60) quality = t('unifi.veryGood');
                                            else if (raw >= -70) quality = t('unifi.good');
                                            else if (raw >= -80) quality = t('unifi.average');
                                            else quality = t('unifi.weak');

                                            return { rssi: raw, quality };
                                        };

                                        const getSwitchLabel = (c: any): string => {
                                            return (c.sw_mac || c.last_uplink_mac || '-') as string;
                                        };

                                        const getApLabel = (c: any): string => {
                                            return (c.ap_name || c.last_uplink_name || 'n/a') as string;
                                        };

                                        const getPortLabel = (c: any): string => {
                                            const raw = (c.sw_port || c.sw_port_idx || '-') as string | number;
                                            return raw.toString();
                                        };

                                        // Status-based filter (active / inactive / all)
                                        const nowSec = Date.now() / 1000;
                                        const isClientActive = (c: any): boolean => {
                                            if (typeof c.is_online === 'boolean') return c.is_online;
                                            if (typeof c.active === 'boolean') return c.active;
                                            if (typeof c.last_seen === 'number') {
                                                return nowSec - c.last_seen < 300; // 5 minutes
                                            }
                                            return true;
                                        };

                                        // Filter by connection type (wired/wireless)
                                        const connectionFilteredClients = 
                                            clientConnectionFilter === 'all'
                                                ? clients
                                                : clients.filter((c: any) => {
                                                      const isWired = c.is_wired === true;
                                                      return clientConnectionFilter === 'wired' ? isWired : !isWired;
                                                  });

                                        // Filter by status (active/inactive)
                                        const baseClients =
                                            clientStatusFilter === 'all'
                                                ? connectionFilteredClients
                                                : connectionFilteredClients.filter((c: any) =>
                                                      clientStatusFilter === 'active' ? isClientActive(c) : !isClientActive(c)
                                                  );

                                        // Apply search filter before sorting
                                        const searchLower = clientSearch.trim().toLowerCase();
                                        const filteredClients = searchLower
                                            ? baseClients.filter((c: any) => {
                                                const name = (c.name || c.hostname || '').toString().toLowerCase();
                                                const ip = (c.ip || '').toString().toLowerCase();
                                                const mac = (c.mac || '').toString().toLowerCase();
                                                const ssid = (c.ssid || c.essid || '').toString().toLowerCase();
                                                const ap = (c.ap_name || c.last_uplink_name || '').toString().toLowerCase();
                                        return (
                                                    name.includes(searchLower) ||
                                                    ip.includes(searchLower) ||
                                                    mac.includes(searchLower) ||
                                                    ssid.includes(searchLower) ||
                                                    ap.includes(searchLower)
                                                );
                                            })
                                            : baseClients;

                                        const sortedClients = [...filteredClients].sort((a: any, b: any) => {
                                            let av: any;
                                            let bv: any;

                                            switch (clientSortKey) {
                                                case 'ip':
                                                    av = parseIp(a.ip);
                                                    bv = parseIp(b.ip);
                                                    break;
                                                case 'name':
                                                    av = (a.name || a.hostname || '').toString().toLowerCase();
                                                    bv = (b.name || b.hostname || '').toString().toLowerCase();
                                                    break;
                                                case 'mac':
                                                    av = (a.mac || '').toString().toLowerCase();
                                                    bv = (b.mac || '').toString().toLowerCase();
                                                    break;
                                                case 'switch':
                                                    av = getSwitchLabel(a).toLowerCase();
                                                    bv = getSwitchLabel(b).toLowerCase();
                                                    break;
                                                case 'port':
                                                    av = parseInt(getPortLabel(a), 10) || 0;
                                                    bv = parseInt(getPortLabel(b), 10) || 0;
                                                    break;
                                                case 'speed':
                                                    av = getSpeed(a);
                                                    bv = getSpeed(b);
                                                    break;
                                                case 'ap':
                                                    av = getApLabel(a).toLowerCase();
                                                    bv = getApLabel(b).toLowerCase();
                                                    break;
                                                case 'ssid':
                                                    av = (a.ssid || a.essid || '').toString().toLowerCase();
                                                    bv = (b.ssid || b.essid || '').toString().toLowerCase();
                                                    break;
                                                case 'type':
                                                    av = getTypeLabel(a);
                                                    bv = getTypeLabel(b);
                                                    break;
                                                default:
                                                    av = 0;
                                                    bv = 0;
                                            }

                                            if (av < bv) return clientSortDir === 'asc' ? -1 : 1;
                                            if (av > bv) return clientSortDir === 'asc' ? 1 : -1;
                                            return 0;
                                        });

                                        const handleSort = (key: ClientSortKey) => {
                                            if (clientSortKey === key) {
                                                setClientSortDir(clientSortDir === 'asc' ? 'desc' : 'asc');
                                            } else {
                                                setClientSortKey(key);
                                                setClientSortDir('asc');
                                            }
                                        };

                                        const renderSortHeader = (label: string, key: ClientSortKey, align: 'left' | 'right' = 'left') => (
                                            <button
                                                type="button"
                                                onClick={() => handleSort(key)}
                                                className={`w-full flex items-center ${align === 'right' ? 'justify-end' : 'justify-start'} gap-1 text-xs text-gray-300 hover:text-white`}
                                            >
                                                <span>{label}</span>
                                                {clientSortKey === key && (
                                                    <span className="text-[10px]">
                                                        {clientSortDir === 'asc' ? '▲' : '▼'}
                                                    </span>
                                                )}
                                            </button>
                                        );

                                        const formatSpeedDisplay = (c: any): string => {
                                            const s = getSpeed(c);
                                            if (!s || s <= 0) return '-';
                                            // Heuristic human‑readable conversion (assume kb/s or similar)
                                            if (s >= 1_000_000) {
                                                return `${(s / 1_000_000).toFixed(2)} Gb/s`;
                                            }
                                            if (s >= 1_000) {
                                            return `${(s / 1_000).toFixed(2)} Mb/s`;
                                            }
                                            return `${s} kb/s`;
                                        };

                                        const getSsidBadgeClass = (ssid: string): string => {
                                            if (!ssid || ssid === '-') return 'text-gray-300';
                                            // Simple hash to spread colors
                                            let hash = 0;
                                            for (let i = 0; i < ssid.length; i++) {
                                                hash = ((hash << 5) - hash) + ssid.charCodeAt(i);
                                                hash |= 0;
                                            }
                                            const palette = [
                                                'text-sky-300',
                                                'text-purple-300',
                                                'text-emerald-300',
                                                'text-amber-300',
                                                'text-pink-300',
                                                'text-lime-300',
                                                'text-cyan-300'
                                            ];
                                            const idx = Math.abs(hash) % palette.length;
                                            return palette[idx];
                                        };

                                        return (
                                            <div className="overflow-auto">
                                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs">
                                                    <span className="text-gray-500">
                                                        {t('unifi.clientsShownCount', { count: filteredClients.length, total: clients.length })}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-[11px] text-gray-500 mr-1">{t('unifi.connectionFilterLabel')}</span>
                                                            {(['wireless', 'wired', 'all'] as const).map((mode) => (
                                                                <button
                                                                    key={mode}
                                                                    type="button"
                                                                    onClick={() => setClientConnectionFilter(mode)}
                                                                    className={`px-2 py-0.5 rounded-full border text-[11px] transition-colors ${
                                                                        clientConnectionFilter === mode
                                                                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                                                                            : 'bg-transparent border-gray-700 text-gray-400 hover:bg-gray-800'
                                                                    }`}
                                                                    title={
                                                                        mode === 'wireless'
                                                                            ? t('unifi.showWirelessOnly')
                                                                            : mode === 'wired'
                                                                            ? t('unifi.showWiredOnly')
                                                                            : t('unifi.showAllClientsFilter')
                                                                    }
                                                                >
                                                                    {mode === 'wireless'
                                                                        ? t('unifi.wireless')
                                                                        : mode === 'wired'
                                                                        ? t('unifi.wired')
                                                                        : t('unifi.filterAll')}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-[11px] text-gray-500 mr-1">{t('unifi.statusFilterLabel')}</span>
                                                            {(['active', 'inactive', 'all'] as const).map((mode) => (
                                                                <button
                                                                    key={mode}
                                                                    type="button"
                                                                    onClick={() => setClientStatusFilter(mode)}
                                                                    className={`px-2 py-0.5 rounded-full border text-[11px] transition-colors ${
                                                                        clientStatusFilter === mode
                                                                            ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                                                                            : 'bg-transparent border-gray-700 text-gray-400 hover:bg-gray-800'
                                                                    }`}
                                                                    title={
                                                                        mode === 'active'
                                                                            ? t('unifi.showActiveOnly')
                                                                            : mode === 'inactive'
                                                                            ? t('unifi.showInactiveOnly')
                                                                            : t('unifi.showAllClientsFilter')
                                                                    }
                                                                >
                                                                    {mode === 'active'
                                                                        ? t('unifi.activeCount')
                                                                        : mode === 'inactive'
                                                                        ? t('unifi.inactiveFilter')
                                                                        : t('unifi.filterAll')}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={clientSearch}
                                                        onChange={(e) => setClientSearch(e.target.value)}
                                                        placeholder={t('unifi.searchPlaceholderClients')}
                                                        className="bg-theme-card border border-gray-700 rounded px-2 py-1 text-[12px] text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 w-64"
                                                    />
                                                    </div>
                                                <table className="min-w-[1200px] w-full text-[14px] text-gray-200">
                                                                <thead className="bg-theme-card text-gray-200 text-sm">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left sticky top-0 bg-theme-card">
                                                                {renderSortHeader(t('unifi.tableName'), 'name', 'left')}
                                                            </th>
                                                            <th className="px-3 py-2 text-left sticky top-0 bg-theme-card">
                                                                {renderSortHeader('IP', 'ip', 'left')}
                                                            </th>
                                                            <th className="px-3 py-2 text-left sticky top-0 bg-theme-card">
                                                                {renderSortHeader('MAC', 'mac', 'left')}
                                                            </th>
                                                            <th className="px-3 py-2 text-left sticky top-0 bg-theme-card">
                                                                {renderSortHeader('Switch', 'switch', 'left')}
                                                            </th>
                                                            <th className="px-3 py-2 text-right sticky top-0 bg-theme-card">
                                                                {renderSortHeader(t('unifi.speed'), 'speed', 'right')}
                                                            </th>
                                                            <th className="px-3 py-2 text-left sticky top-0 bg-theme-card">
                                                                {renderSortHeader('AP', 'ap', 'left')}
                                                            </th>
                                                            <th className="px-3 py-2 text-left sticky top-0 bg-theme-card">
                                                                {renderSortHeader(t('unifi.ssidPorts'), 'ssid', 'left')}
                                                            </th>
                                                            <th className="px-3 py-2 text-left sticky top-0 bg-theme-card">
                                                                {renderSortHeader(t('unifi.typeLabel').replace(/\s*:\s*$/, ''), 'type', 'left')}
                                                            </th>
                                                            <th className="px-3 py-2 text-left sticky top-0 bg-theme-card">
                                                                <span className="text-xs text-gray-300">{t('unifi.signalPort')}</span>
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {sortedClients.map((c: any, index: number) => (
                                                            <tr
                                                                key={c.id || c.mac || index}
                                                                className={index % 2 === 0 ? 'bg-unifi-card/30' : 'bg-unifi-card/20'}
                                                            >
                                                                <td className="px-3 py-1.5 text-left font-semibold text-[13px] text-gray-300">
                                                                    {(() => {
                                                                        const rawName = (c.name || c.hostname || '').toString().trim();
                                                                        if (!rawName) {
                                                                            const ip = (c.ip || '').toString();
                                                                            const mac = (c.mac || '').toString();
                                                                            if (ip) return renderClickableIp(ip, 'text-gray-300', 9);
                                                                            if (mac) return mac;
                                                                            return '-';
                                                                        }
                                                                        // Capitaliser la première lettre pour un rendu plus propre
                                                                        return rawName.charAt(0).toUpperCase() + rawName.slice(1);
                                                                    })()}
                                                                </td>
                                                                <td className="px-3 py-1.5 text-left text-sky-300 font-mono text-[12px]">
                                                                    {renderClickableIp(c.ip, 'text-sky-300 font-mono text-[12px]', 9)}
                                                                </td>
                                                                <td className="px-3 py-1.5 text-left font-mono text-[11px]">
                                                                    {c.mac || '-'}
                                                                </td>
                                                                <td className="px-3 py-1.5 text-left font-mono text-[11px] text-gray-400">
                                                                    {getSwitchLabel(c)}
                                                                </td>
                                                                <td className="px-3 py-1.5 text-right">
                                                                    {formatSpeedDisplay(c)}
                                                                </td>
                                                                <td className="px-3 py-1.5 text-left">
                                                                    {getApLabel(c)}
                                                                </td>
                                                                <td className="px-3 py-1.5 text-left">
                                                                    {(() => {
                                                                        const ssidRaw = (c.ssid || c.essid || '') as string;
                                                                        const ssid = ssidRaw.trim() || '-';
                                                                        const portLabel = getPortLabel(c);
                                                                        const hasSsid = ssid !== '-';
                                                                        const hasPort = portLabel !== '-';

                                                                        if (!hasSsid && !hasPort) {
                                                                            return <span className="text-[11px] text-gray-500">-</span>;
                                                                        }

                                                                        const badgeClass = getSsidBadgeClass(ssid);

                                                                        return (
                                                                            <div className="flex flex-col gap-1">
                                                                                {hasSsid && (
                                                                                    <span className={`text-[11px] font-medium ${badgeClass}`}>
                                                                                        {ssid}
                                                                                    </span>
                                                                                )}
                                                                                {hasPort && (
                                                                                    <span className="text-[11px] text-gray-400">
                                                                                        Port:&nbsp;
                                                                                        <span className="text-gray-200">
                                                                                            {portLabel}
                                                                                        </span>
                                                                                    </span>
                                                    )}
                                                </div>
                                                                        );
                                                                    })()}
                                                                </td>
                                                                <td className="px-3 py-1.5 text-left">
                                                                    {(() => {
                                                                        const typeLabel = getTypeLabel(c);
                                                                        const isWired = typeLabel === 'WIRED';
                                                                        const badgeClass = isWired
                                                                            ? 'bg-emerald-900/40 border-emerald-500 text-emerald-300'
                                                                            : 'bg-sky-900/40 border-sky-500 text-sky-300';
                                                                        const icon = isWired ? '⟷' : '📶';
                                                                        return (
                                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${badgeClass}`}>
                                                                                <span>{icon}</span>
                                                                                <span>{typeLabel}</span>
                                                                            </span>
                                                                        );
                                                                    })()}
                                                                </td>
                                                                <td className="px-3 py-1.5 text-left">
                                                                    {(() => {
                                                                        const typeLabel = getTypeLabel(c);
                                                                        const isWired = typeLabel === 'WIRED';
                                                                        if (isWired) {
                                                                            const s = getSpeed(c);
                                                                            const speedLabel = formatSpeedDisplay(c);
                                                                            if (!s || s <= 0) {
                                                                                return <span className="text-[11px] text-gray-500">{t('unifi.speedPort')} -</span>;
                                                                            }
                                                                            return (
                                                                                <span className="text-[11px] text-gray-400">
                                                                                    {t('unifi.speedPort')}&nbsp;
                                                                                    <span className="text-gray-200">{speedLabel}</span>
                                                                                </span>
                                                                            );
                                                                        }

                                                                        const signal = getSignalInfo(c);
                                                                        if (signal.rssi == null) {
                                                                            return <span className="text-[11px] text-gray-500">RSSI: -</span>;
                                                                        }

                                                                        let colorClass = 'bg-red-500';
                                                                        if (signal.rssi >= -60) {
                                                                            colorClass = 'bg-emerald-400';
                                                                        } else if (signal.rssi >= -70) {
                                                                            colorClass = 'bg-amber-400';
                                                                        } else if (signal.rssi >= -80) {
                                                                            colorClass = 'bg-orange-500';
                                                                        }

                                                                        return (
                                                                            <span className="text-[11px] text-gray-400 flex items-center gap-1">
                                                                                <span className={`w-2 h-2 rounded-full ${colorClass}`} />
                                                                                <span>
                                                                                    RSSI:&nbsp;
                                                                                    <span className="text-gray-200">
                                                                                        {signal.rssi} dBm
                                                                                    </span>
                                                                                    {signal.quality && (
                                                                                        <span className="ml-1 text-gray-500">
                                                                                            ({signal.quality})
                                                                                        </span>
                                                                                    )}
                                                                                </span>
                                                                            </span>
                                                                        );
                                                                    })()}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        );
                                    })()
                                ) : (
                                    <div className="text-center py-8 text-gray-500">
                                        <Users size={32} className="mx-auto mb-2" />
                                        <p>{t('unifi.noDataAvailable')}</p>
                                    </div>
                                )}
                            </Card>
                        </div>
                    )}

                    {/* Traffic Tab */}
                    {activeTab === 'traffic' && (
                        <div className="col-span-full">
                            <Card title={t('unifi.trafficNetwork')} className="bg-unifi-card border border-gray-800 rounded-xl">
                                {unifiStats?.devices ? (
                                    (() => {
                                        const devices = unifiStats.devices as any[];
                                        const clients = devices.filter((d: any) => (d.type || '').toLowerCase() === 'client');
                                        const nonClientDevices = devices.filter((d: any) => (d.type || '').toLowerCase() !== 'client');

                                        const getSpeed = (c: any): number => {
                                            const rate =
                                                c.tx_rate ||
                                                c.rx_rate ||
                                                c.phy_tx_rate ||
                                                c.phy_rx_rate ||
                                                c.sw_tx_rate ||
                                                c.sw_rx_rate ||
                                                c.current_speed ||
                                                c.speed ||
                                                0;
                                            return typeof rate === 'number' ? rate : 0;
                                        };

                                        const formatBitsPerSecond = (bps: number | null | undefined): string => {
                                            if (!bps || bps <= 0) return '-';
                                            const kbps = bps / 1_000;
                                            const mbps = bps / 1_000_000;
                                            const gbps = bps / 1_000_000_000;
                                            if (gbps >= 1) return `${gbps.toFixed(2)} Gb/s`;
                                            if (mbps >= 1) return `${mbps.toFixed(2)} Mb/s`;
                                            if (kbps >= 1) return `${kbps.toFixed(0)} kb/s`;
                                            return `${bps.toFixed(0)} b/s`;
                                        };

                                        const formatSpeedDisplay = (c: any): string => {
                                            const s = getSpeed(c);
                                            if (!s || s <= 0) return '-';
                                            if (s >= 1_000_000) {
                                                return `${(s / 1_000_000).toFixed(2)} Gb/s`;
                                            }
                                            if (s >= 1_000) {
                                                return `${(s / 1_000).toFixed(2)} Mb/s`;
                                            }
                                            return `${s} kb/s`;
                                        };

                                        const getApNameForClient = (c: any): string => {
                                            return (c.ap_name || c.last_uplink_name || '').toString();
                                        };

                                        const getSignalInfoTraffic = (c: any): { rssi?: number; quality?: string } => {
                                            const raw = (typeof c.signal === 'number' ? c.signal : c.rssi) as number | undefined;
                                            if (raw == null || Number.isNaN(raw)) return {};

                                            let quality: string;
                                            if (raw >= -50) quality = t('unifi.excellent');
                                            else if (raw >= -60) quality = t('unifi.veryGood');
                                            else if (raw >= -70) quality = t('unifi.good');
                                            else if (raw >= -80) quality = t('unifi.average');
                                            else quality = t('unifi.weak');

                                            return { rssi: raw, quality };
                                        };

                                        // Clients triés par vitesse instantanée (pour Traffic tab)
                                        const sortedTrafficClients = [...clients].sort(
                                            (a, b) => getSpeed(b) - getSpeed(a)
                                        );
                                        const topClients = showAllTrafficClients
                                            ? sortedTrafficClients
                                            : sortedTrafficClients.slice(0, 16);

                                        // Agrégation par AP / Switch (nom)
                                        const trafficByDevice = new Map<string, { down: number; up: number; ref: any }>();
                                        for (const c of clients) {
                                            const speed = getSpeed(c);
                                            if (!speed || speed <= 0) continue;
                                            const apName = getApNameForClient(c) || 'Inconnu';
                                            const key = apName;
                                            const current = trafficByDevice.get(key) || { down: 0, up: 0, ref: null };
                                            // On considère le débit comme descendant (download depuis le point de vue client)
                                            current.down += speed;
                                            current.ref = current.ref || c;
                                            trafficByDevice.set(key, current);
                                        }

                                        const topDevices = Array.from(trafficByDevice.entries())
                                            .sort((a, b) => b[1].down - a[1].down)
                                            .slice(0, 8);

                                        const activeClientsCount = clients.length;

                                        return (
                                            <div className="space-y-6">
                                                {/* Ligne 1 : cartes synthétiques */}
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="bg-unifi-card rounded-xl px-4 py-3 border border-gray-800 flex flex-col gap-2">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-xs text-gray-400">{t('unifi.currentWanRate')}</span>
                                                            <Activity size={16} className="text-sky-400" />
                                                        </div>
                                                        <div className="mt-1 space-y-1 text-sm">
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-400">Descendant:</span>
                                                                <span className="text-sky-300 font-semibold">
                                                                    {formatBitsPerSecond(wanRate?.downBps)}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-400">Montant:</span>
                                                                <span className="text-emerald-300 font-semibold">
                                                                    {formatBitsPerSecond(wanRate?.upBps)}
                                                                </span>
                                                            </div>
                                                            <p className="text-[11px] text-gray-500 mt-1">
                                                                {t('unifi.wanRateDescription')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="bg-unifi-card rounded-xl px-4 py-3 border border-gray-800 flex flex-col gap-2">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-xs text-gray-400">{t('unifi.activeClientsUniFi')}</span>
                                                            <Users size={16} className="text-purple-400" />
                                                        </div>
                                                        <div className="mt-1 text-3xl font-semibold text-white">
                                                            {activeClientsCount}
                                                        </div>
                                                        <p className="text-[11px] text-gray-500">
                                                            {t('unifi.clientsCountDescription')}
                                                        </p>
                                                    </div>
                                                    <div className="bg-unifi-card rounded-xl px-4 py-3 border border-gray-800 flex flex-col gap-2">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-xs text-gray-400">{t('unifi.mainSources')}</span>
                                                            <Server size={16} className="text-amber-400" />
                                                        </div>
                                                        <div className="mt-1 space-y-1 text-sm">
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-400">{t('unifi.apSwitchTracked')}</span>
                                                                <span className="text-gray-200 font-semibold">
                                                                    {topDevices.length}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-400">{t('unifi.topClientsListed')}</span>
                                                                <span className="text-gray-200 font-semibold">
                                                                    {topClients.length}
                                                                </span>
                                                            </div>
                                                            <p className="text-[11px] text-gray-500 mt-1">
                                                                {t('unifi.basedOnInstantSpeed')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Ligne 2 : Top clients / Trafic par AP */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="bg-unifi-card rounded-xl px-4 py-3 border border-gray-800">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex flex-col">
                                                                <h3 className="text-sm font-semibold text-white">
                                                                    {t('unifi.clientsByThroughput')}
                                                                </h3>
                                                                <span className="text-[11px] text-gray-500">
                                                                    {t('unifi.sortedByInstantSpeed')}
                                                                </span>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowAllTrafficClients(!showAllTrafficClients)}
                                                                className="px-3 py-1 rounded-full border border-gray-700 text-[11px] text-gray-200 hover:bg-gray-800 transition-colors"
                                                            >
                                                                {showAllTrafficClients
                                                                    ? t('unifi.showTop16')
                                                                    : t('unifi.seeAllClients')}
                                                            </button>
                                                        </div>
                                                        {topClients.length === 0 ? (
                                                            <p className="text-xs text-gray-500">
                                                                {t('unifi.noClientWithThroughput')}
                                                            </p>
                                                        ) : (
                                                            <table className="min-w-full text-[12px] text-gray-200">
                                                                <thead className="bg-theme-card text-gray-300 text-xs">
                                                                    <tr>
                                                                        <th className="px-2 py-1 text-left">{t('unifi.tableName')}</th>
                                                                        <th className="px-2 py-1 text-left">IP</th>
                                                                        <th className="px-2 py-1 text-left">AP</th>
                                                                        <th className="px-2 py-1 text-right">{t('unifi.speed')}</th>
                                                                        <th className="px-2 py-1 text-left">{t('unifi.signalPort').split(' / ')[0]}</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {topClients.map((c: any, idx: number) => (
                                                                        <tr
                                                                            key={c.id || c.mac || idx}
                                                                            className={idx % 2 === 0 ? 'bg-unifi-card/30' : 'bg-unifi-card/20'}
                                                                        >
                                                                            <td className="px-2 py-1 text-left text-sm font-medium text-gray-200">
                                                                                {(() => {
                                                                                    const name = (c.name || c.hostname || '').toString().trim();
                                                                                    if (name) return name;
                                                                                    const ip = (c.ip || '').toString();
                                                                                    const mac = (c.mac || '').toString();
                                                                                    if (ip) return renderClickableIp(ip, 'text-gray-200', 8);
                                                                                    if (mac) return mac;
                                                                                    return '-';
                                                                                })()}
                                                                            </td>
                                                                            <td className="px-2 py-1 text-left text-xs font-mono text-sky-300">
                                                                                {renderClickableIp(c.ip, 'text-sky-300 font-mono text-xs', 8)}
                                                                            </td>
                                                                            <td className="px-2 py-1 text-left text-xs text-gray-400">
                                                                                {getApNameForClient(c) || '-'}
                                                                            </td>
                                                                            <td className="px-2 py-1 text-right text-xs font-mono">
                                                                                {formatSpeedDisplay(c)}
                                                                            </td>
                                                                            <td className="px-2 py-1 text-left text-xs text-gray-400">
                                                                                {(() => {
                                                                                    const signal = getSignalInfoTraffic(c);
                                                                                    if (signal.rssi == null) {
                                                                                        return 'RSSI: -';
                                                                                    }

                                                                                    let colorClass = 'bg-red-500';
                                                                                    if (signal.rssi >= -60) {
                                                                                        colorClass = 'bg-emerald-400';
                                                                                    } else if (signal.rssi >= -70) {
                                                                                        colorClass = 'bg-amber-400';
                                                                                    } else if (signal.rssi >= -80) {
                                                                                        colorClass = 'bg-orange-500';
                                                                                    }

                                                                                    return (
                                                                                        <span className="flex items-center gap-1">
                                                                                            <span className={`w-2 h-2 rounded-full ${colorClass}`} />
                                                                                            <span>
                                                                                                RSSI:&nbsp;
                                                                                                <span className="text-gray-200">
                                                                                                    {signal.rssi} dBm
                                                                                                </span>
                                                                                                {signal.quality && (
                                                                                                    <span className="ml-1 text-gray-500">
                                                                                                        ({signal.quality})
                                                                                                    </span>
                                                                                                )}
                                                                                            </span>
                                                                                        </span>
                                                                                    );
                                                                                })()}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        )}
                                                    </div>

                                                    <div className="bg-unifi-card rounded-xl px-4 py-3 border border-gray-800">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <h3 className="text-sm font-semibold text-white">
                                                                {t('unifi.trafficByAp')}
                                                            </h3>
                                                            <span className="text-[11px] text-gray-500">
                                                                {t('unifi.aggregatedFromClients')}
                                                            </span>
                                                        </div>
                                                        {topDevices.length === 0 ? (
                                                            <p className="text-xs text-gray-500">
                                                                {t('unifi.noMeasurableTraffic')}
                                                            </p>
                                                        ) : (
                                                            <table className="min-w-full text-[12px] text-gray-200">
                                                                <thead className="bg-theme-card text-gray-300 text-xs">
                                                                    <tr>
                                                                        <th className="px-2 py-1 text-left">{t('unifi.apSwitchCol')}</th>
                                                                        <th className="px-2 py-1 text-right">{t('unifi.totalThroughput')}</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {topDevices.map(([name, info], idx) => (
                                                                        <tr
                                                                            key={name}
                                                                            className={idx % 2 === 0 ? 'bg-unifi-card/30' : 'bg-unifi-card/20'}
                                                                        >
                                                                            <td className="px-2 py-1 text-left text-sm font-medium text-gray-200">
                                                                                {name}
                                                                            </td>
                                                                            <td className="px-2 py-1 text-right text-xs font-mono">
                                                                                {formatBitsPerSecond(info.down * 1_000)} {/* approx bits/s */}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()
                                ) : (
                                <div className="text-center py-8 text-gray-500">
                                    <Activity size={32} className="mx-auto mb-2" />
                                        <p>{t('unifi.noTrafficData')}</p>
                                </div>
                                )}
                            </Card>
                        </div>
                    )}

                    {/* Events Tab */}
                    {activeTab === 'events' && (
                        <div className="col-span-full">
                            <Card title={t('unifi.events')} className="bg-unifi-card border border-gray-800 rounded-xl">
                                {unifiStats?.devices ? (
                                    (() => {
                                        const devices = unifiStats.devices as any[];
                                        const nonClientDevices = devices.filter(
                                            (d: any) => (d.type || '').toLowerCase() !== 'client'
                                        );
                                        const clients = devices.filter(
                                            (d: any) => (d.type || '').toLowerCase() === 'client'
                                        );
                                        const system = (unifiStats.system || {}) as any;

                                        const events: {
                                            id: string;
                                            category: 'alert' | 'system' | 'connection';
                                            level: 'info' | 'warning' | 'critical';
                                            title: string;
                                            message: string;
                                            time: Date;
                                        }[] = [];

                                        const now = new Date();

                                        // Alertes: équipements hors ligne
                                        const offlineDevices = nonClientDevices.filter((d: any) => d.active === false);
                                        if (offlineDevices.length > 0) {
                                            events.push({
                                                id: 'offline-devices',
                                                category: 'alert',
                                                level: 'warning',
                                                title: t('unifi.offlineDevices'),
                                                message: t('unifi.offlineDevicesMessage', { count: offlineDevices.length }),
                                                time: now
                                            });
                                        }

                                        // Alertes: mise à jour contrôleur disponible
                                        if (system.updateAvailable === true) {
                                            events.push({
                                                id: 'controller-update',
                                                category: 'alert',
                                                level: 'warning',
                                                title: t('unifi.controllerUpdateTitle'),
                                                message: `Version actuelle: ${system.version || 'inconnue'}. Une nouvelle version est disponible.`,
                                                time: now
                                            });
                                        }

                                        // Alertes: appareils non supportés
                                        if ((system.unsupportedDeviceCount || 0) > 0) {
                                            events.push({
                                                id: 'unsupported-devices',
                                                category: 'alert',
                                                level: 'critical',
                                                title: t('unifi.unsupportedDevicesTitle'),
                                                message: t('unifi.unsupportedDevicesMessage', { count: system.unsupportedDeviceCount }),
                                                time: now
                                            });
                                        }

                                        // Événements système: contrôleur opérationnel
                                        events.push({
                                            id: 'controller-ok',
                                            category: 'system',
                                            level: 'info',
                                            title: t('unifi.controllerOperational'),
                                            message: t('unifi.controllerOnlineMessage', { name: system.name || 'UniFi', hostname: system.hostname || t('unifi.unknown') }),
                                            time: now
                                        });

                                        // Événements connexion: nombre de clients connectés
                                        if (clients.length > 0) {
                                            events.push({
                                                id: 'clients-count',
                                                category: 'connection',
                                                level: 'info',
                                                title: t('unifi.clientsConnectedEvent'),
                                                message: t('unifi.clientsFollowedMessage', { count: clients.length }),
                                                time: now
                                            });
                                        }

                                        const filteredEvents = events.filter((evt) => {
                                            if (eventFilter === 'all') return true;
                                            if (eventFilter === 'alerts') return evt.category === 'alert';
                                            if (eventFilter === 'system') return evt.category === 'system';
                                            if (eventFilter === 'connections') return evt.category === 'connection';
                                            return true;
                                        });

                                        const formatTime = (d: Date) =>
                                            d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                                        const levelBadgeClass = (level: 'info' | 'warning' | 'critical') => {
                                            // Color scale:
                                            // - Info    => bleu (neutre)
                                            // - Warning => ambre (attention)
                                            // - Critical=> rouge (grave)
                                            if (level === 'critical') {
                                                return 'bg-red-600/20 border-red-500 text-red-300 shadow-[0_0_12px_rgba(248,113,113,0.35)]';
                                            }
                                            if (level === 'warning') {
                                                return 'bg-amber-500/15 border-amber-400 text-amber-200';
                                            }
                                            return 'bg-sky-500/15 border-sky-400 text-sky-200';
                                        };

                                        const categoryLabel = (category: 'alert' | 'system' | 'connection') => {
                                            if (category === 'alert') return t('unifi.alertLabel');
                                            if (category === 'system') return t('unifi.systemLabel');
                                            return t('unifi.connection');
                                        };

                                        return (
                                            <div className="space-y-4">
                                                {/* Filtres */}
                                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-2">
                                                    <span className="text-gray-500">
                                                        {t('unifi.eventsShownCount', { count: filteredEvents.length, total: events.length })}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[11px] text-gray-500 mr-1">{t('unifi.typeLabel')}</span>
                                                        {(['alerts', 'system', 'connections', 'all'] as const).map((mode) => {
                                                            const active = eventFilter === mode;
                                                            let activeClasses = 'bg-sky-500/20 border-sky-400 text-sky-200';
                                                            if (mode === 'alerts') {
                                                                activeClasses = 'bg-amber-500/20 border-amber-400 text-amber-100';
                                                            } else if (mode === 'system') {
                                                                activeClasses = 'bg-sky-500/20 border-sky-400 text-sky-200';
                                                            } else if (mode === 'connections') {
                                                                activeClasses = 'bg-emerald-500/20 border-emerald-400 text-emerald-100';
                                                            } else if (mode === 'all') {
                                                                activeClasses = 'bg-purple-500/20 border-purple-400 text-purple-100';
                                                            }
                                                            return (
                                                                <button
                                                                    key={mode}
                                                                    type="button"
                                                                    onClick={() => setEventFilter(mode)}
                                                                    className={`px-2 py-0.5 rounded-full border text-[11px] transition-colors ${
                                                                        active
                                                                            ? activeClasses
                                                                            : 'bg-transparent border-gray-700 text-gray-400 hover:bg-gray-800'
                                                                    }`}
                                                                >
                                                                    {mode === 'alerts'
                                                                        ? t('unifi.alerts')
                                                                        : mode === 'system'
                                                                        ? t('unifi.systemLabel')
                                                                        : mode === 'connections'
                                                                        ? t('unifi.connectionsLabel')
                                                                        : t('unifi.filterAll')}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {events.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    <AlertCircle size={32} className="mx-auto mb-2" />
                                                        <p>{t('unifi.noEventDetected')} n’a été détecté pour l’instant.</p>
                                </div>
                                                ) : filteredEvents.length === 0 ? (
                                                    <div className="text-center py-8 text-gray-500 text-xs">
                                                        {t('unifi.noEventForFilter')}
                                                    </div>
                                                ) : (
                                                    <div className="divide-y divide-gray-800 border border-gray-800 rounded-lg bg-theme-card">
                                                        {filteredEvents.map((evt) => (
                                                            <div key={evt.id} className="px-4 py-3 flex items-start justify-between gap-3">
                                                                <div className="flex items-start gap-3">
                                                                    <span
                                                                        className={`mt-1 inline-flex items-center justify-center w-6 h-6 rounded-full border text-[10px] ${levelBadgeClass(
                                                                            evt.level
                                                                        )}`}
                                                                    >
                                                                        {evt.level === 'critical'
                                                                            ? '!'
                                                                            : evt.level === 'warning'
                                                                            ? '!'
                                                                            : 'i'}
                                                                    </span>
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-sm font-semibold text-white">
                                                                                {evt.title}
                                                                            </span>
                                                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-900 border border-gray-700 text-gray-300">
                                                                                {categoryLabel(evt.category)}
                                                                            </span>
                                                                        </div>
                                                                        <p className="text-xs text-gray-400 mt-1">{evt.message}</p>
                                                                    </div>
                                                                </div>
                                                                <div className="text-[11px] text-gray-500 whitespace-nowrap ml-2">
                                                                    {formatTime(evt.time)}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()
                                ) : (
                                    <div className="text-center py-8 text-gray-500">
                                        <AlertCircle size={32} className="mx-auto mb-2" />
                                        <p>{t('unifi.noUnifiDataForEvents')}</p>
                                    </div>
                                )}
                            </Card>
                        </div>
                    )}

                    {/* NAT Tab */}
                    {activeTab === 'nat' && (
                        <NatTabContent isActive={activeTab === 'nat'} systemStats={unifiStats?.system as any} />
                    )}

                    {/* Debug Tab */}
                    {activeTab === 'debug' && (
                        <div className="col-span-full space-y-6">
                            {/* Plugin Info */}
                            <Card title={t('unifi.pluginInfo')} className="bg-unifi-card border border-gray-800 rounded-xl">
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-400">Plugin ID:</span>
                                        <span className="text-sm text-white font-mono">{unifiPlugin.id}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-400">Nom:</span>
                                        <span className="text-sm text-white">{unifiPlugin.name}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-400">Version:</span>
                                        <span className="text-sm text-white">{unifiPlugin.version}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-400">{t('unifi.enabledLabel')}</span>
                                        <span className={`text-sm ${unifiPlugin.enabled ? 'text-green-400' : 'text-red-400'}`}>
                                            {unifiPlugin.enabled ? 'Oui' : 'Non'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-400">{t('unifi.connectedLabel')}</span>
                                        <span className={`text-sm ${unifiPlugin.connectionStatus ? 'text-green-400' : 'text-red-400'}`}>
                                            {unifiPlugin.connectionStatus ? 'Oui' : 'Non'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-400">isActive:</span>
                                        <span className={`text-sm ${isActive ? 'text-green-400' : 'text-red-400'}`}>
                                            {isActive ? 'Oui' : 'Non'}
                                        </span>
                                    </div>
                                </div>
                            </Card>

                            {/* Settings */}
                            <Card title={t('unifi.configuration')} className="bg-unifi-card border border-gray-800 rounded-xl">
                                <pre className="text-xs bg-unifi-card/50 p-4 rounded-lg overflow-auto max-h-96 text-gray-300">
                                    {JSON.stringify(unifiPlugin.settings, null, 2)}
                                </pre>
                            </Card>

                            {/* Stats Raw Data */}
                            <Card title={t('unifi.rawStatsDebug')} className="bg-unifi-card border border-gray-800 rounded-xl">
                                {unifiStats ? (
                                    <pre className="text-xs bg-[#050505] p-4 rounded-lg overflow-auto max-h-96 text-gray-300">
                                        {JSON.stringify(unifiStats, null, 2)}
                                    </pre>
                                ) : (
                                    <div className="text-center py-8 text-gray-500">
                                        <AlertCircle size={32} className="mx-auto mb-2" />
                                        <p>{t('unifi.noStatsData')}</p>
                                        <p className="text-xs mt-2 text-gray-600">
                                            {t('unifi.statsFetchedDescription')}
                                        </p>
                                        <div className="mt-4 text-left text-xs bg-[#050505] p-3 rounded-lg">
                                            <p className="text-gray-400 mb-2">{t('unifi.debugInfo')}</p>
                                            <p className="text-gray-500">Plugin enabled: {unifiPlugin?.enabled ? t('unifi.yes') : t('unifi.no')}</p>
                                            <p className="text-gray-500">Connection status: {unifiPlugin?.connectionStatus ? t('unifi.yes') : t('unifi.no')}</p>
                                            <p className="text-gray-500">isActive: {isActive ? t('unifi.yes') : t('unifi.no')}</p>
                                            <p className="text-gray-500">pluginStats keys: {Object.keys(pluginStats).join(', ')}</p>
                                            <p className="text-gray-500">unifiStats type: {typeof unifiStats}</p>
                                        </div>
                                    </div>
                                )}
                            </Card>

                            {/* Devices Analysis */}
                            {unifiStats?.devices && (
                                <Card title={t('unifi.deviceAnalysis')} className="bg-unifi-card border border-gray-800 rounded-xl">
                                    <div className="space-y-4">
                                        <div>
                                            <span className="text-sm text-gray-400">Nombre total de devices:</span>
                                            <span className="ml-2 text-white font-semibold">{unifiStats.devices.length}</span>
                                        </div>
                                        <div>
                                            <span className="text-sm text-gray-400">Types uniques:</span>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {Array.from(new Set(unifiStats.devices.map((d: any) => d.type || 'unknown'))).map((type: string) => (
                                                    <span key={type} className="px-2 py-1 bg-[#050505] rounded text-xs text-gray-300">
                                                        {type} ({unifiStats.devices.filter((d: any) => (d.type || 'unknown') === type).length})
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-sm text-gray-400">{t('unifi.uniqueModels')}</span>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {Array.from(new Set(unifiStats.devices.map((d: any) => d.model || 'unknown').filter((m: string) => m !== 'unknown'))).map((model: string) => (
                                                    <span key={model} className="px-2 py-1 bg-[#050505] rounded text-xs text-gray-300">
                                                        {model} ({unifiStats.devices.filter((d: any) => (d.model || 'unknown') === model).length})
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-sm text-gray-400">Devices actifs:</span>
                                            <span className="ml-2 text-white font-semibold">
                                                {unifiStats.devices.filter((d: any) => d.active !== false).length}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-sm text-gray-400">{t('unifi.firmwareSummary')}</span>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {(() => {
                                                    const firmwareCounts = new Map<string, number>();
                                                    for (const d of unifiStats.devices as any[]) {
                                                        const type = ((d as any).type || '').toString().toLowerCase();
                                                        if (type === 'client') continue;
                                                        const rawFw =
                                                            (d as any).firmware_version ||
                                                            (d as any).version ||
                                                            (d as any).firmware ||
                                                            (d as any).cfgversion ||
                                                            (d as any).stable_version;
                                                        const fwStr = rawFw != null ? String(rawFw).trim() : '';
                                                        if (!fwStr || fwStr === 'undefined' || fwStr === 'null') continue;
                                                        firmwareCounts.set(fwStr, (firmwareCounts.get(fwStr) || 0) + 1);
                                                    }
                                                    const entries = Array.from(firmwareCounts.entries());
                                                    if (entries.length === 0) {
                                                        return (
                                                            <span className="text-xs text-gray-500">
                                                                {t('unifi.noFirmwareInfo')}
                                                                <code className="ml-1">version</code>, <code>firmware</code> ou <code>firmware_version</code> dans les stats brutes).
                                                            </span>
                                                        );
                                                    }
                                                    return entries.map(([fw, count]) => (
                                                        <span
                                                            key={fw}
                                                            className="px-2 py-1 bg-[#1a1a1a] rounded text-xs text-gray-200"
                                                        >
                                                            v{fw} ({count})
                                                        </span>
                                                    ));
                                                })()}
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-sm text-gray-400">Exemple de device (premier):</span>
                                            {unifiStats.devices.length > 0 && (
                                                <pre className="text-xs bg-[#1a1a1a] p-4 rounded-lg overflow-auto max-h-64 text-gray-300 mt-2">
                                                    {JSON.stringify(unifiStats.devices[0], null, 2)}
                                                </pre>
                                            )}
                                        </div>
                                    </div>
                                </Card>
                            )}

                            {/* Network Stats Analysis */}
                            {unifiStats?.network && (
                                <Card title={t('unifi.statsAnalysis')} className="bg-unifi-card border border-gray-800 rounded-xl">
                                    <pre className="text-xs bg-unifi-card/50 p-4 rounded-lg overflow-auto max-h-64 text-gray-300">
                                        {JSON.stringify(unifiStats.network, null, 2)}
                                    </pre>
                                </Card>
                            )}

                            {/* System Stats Analysis */}
                            {unifiStats?.system && (
                                <Card title={t('unifi.systemStatsAnalysis')} className="bg-unifi-card border border-gray-800 rounded-xl">
                                    <pre className="text-xs bg-unifi-card/50 p-4 rounded-lg overflow-auto max-h-64 text-gray-300">
                                        {JSON.stringify(unifiStats.system, null, 2)}
                                    </pre>
                                </Card>
                            )}

                            {/* Actions */}
                            <Card title={t('unifi.debugActions')} className="bg-unifi-card border border-gray-800 rounded-xl">
                                <div className="space-y-3">
                                    <button
                                        onClick={handleRefresh}
                                        disabled={isRefreshing}
                                        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                                    >
                                        <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                                        {t('unifi.forceRefreshStats')}
                                    </button>
                                    <div className="text-xs text-gray-500 space-y-1">
                                        <p>• Le polling automatique se fait toutes les 30 secondes si le plugin est actif</p>
                                        <p>• {t('unifi.debugCheckConsole')}</p>
                                        <p>• {t('unifi.debugCheckBackend')}</p>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// NAT Tab Component
interface NatTabContentProps {
    isActive: boolean;
    systemStats?: {
        gatewaySummary?: {
            ip?: string;
            name?: string;
            model?: string;
            wanPorts: Array<{ name: string; type?: string; ip?: string; up?: boolean }>;
            lanPorts: Array<{ name: string; type?: string; ip?: string }>;
            portCount?: number;
        } | null;
        natRulesCount?: number;
    };
}

type NatRuleItem = {
    id: string;
    name?: string;
    enabled: boolean;
    protocol: string;
    dst_port?: string;
    fwd_port?: string;
    fwd_host?: string;
    src?: string;
    comment?: string;
};

const NatTabContent: React.FC<NatTabContentProps> = ({ isActive, systemStats }) => {
    const { t } = useTranslation();
    const [natRules, setNatRules] = useState<NatRuleItem[]>([]);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<'all' | 'active'>('all');

    const fetchNatRules = async (isRefresh = false) => {
        try {
            if (isRefresh) {
                setIsRefreshing(true);
            } else {
                setIsInitialLoading(true);
            }
            setError(null);
            const res = await api.get<NatRuleItem[]>('/api/plugins/unifi/nat');
            if (res.success && res.result) {
                setNatRules(res.result);
            } else {
                setError(t('unifi.natRulesLoadError'));
            }
        } catch (err) {
            setError(t('unifi.natRulesFetchError'));
            console.error('NAT rules error:', err);
        } finally {
            setIsInitialLoading(false);
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        if (isActive) {
            fetchNatRules(false);
        }
    }, [isActive]);

    usePolling(() => {
        if (isActive) {
            fetchNatRules(true);
        }
    }, {
        enabled: isActive,
        interval: POLLING_INTERVALS.system
    });

    const filteredRules = filterStatus === 'active' 
        ? natRules.filter(rule => rule.enabled)
        : natRules;

    const gSummary = systemStats?.gatewaySummary;
    const natRulesCount = typeof systemStats?.natRulesCount === 'number' ? systemStats.natRulesCount : null;
    const hasGatewaySummary = gSummary && (gSummary.ip || gSummary.wanPorts?.length || gSummary.lanPorts?.length || gSummary.portCount != null);

    return (
        <div className="col-span-full space-y-6">
            {/* Gateway & WAN/LAN ports summary */}
            {hasGatewaySummary && (
                <Card title={t('unifi.gatewayAndPorts')} className="bg-unifi-card border border-gray-800 rounded-xl">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-cyan-400 text-sm font-medium">
                                <Network size={16} />
                                {t('unifi.wan')}
                            </div>
                            {gSummary.wanPorts && gSummary.wanPorts.length > 0 ? (
                                <ul className="space-y-1.5">
                                    {gSummary.wanPorts.map((p: { name: string; ip?: string; up?: boolean }, i: number) => (
                                        <li key={i} className="flex items-center justify-between text-xs bg-gray-800/50 rounded px-2 py-1.5">
                                            <span className="text-gray-300">{p.name}</span>
                                            <span className="font-mono text-cyan-300 truncate max-w-[140px]" title={p.ip || ''}>
                                                {p.ip || (p.up ? t('network.connected') : '—')}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-xs text-gray-500">{t('unifi.noWanInfo')}</p>
                            )}
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                                <Link2 size={16} />
                                {t('unifi.lan')}
                            </div>
                            {gSummary.lanPorts && gSummary.lanPorts.length > 0 ? (
                                <ul className="space-y-1.5">
                                    {gSummary.lanPorts.map((p: { name: string; ip?: string }, i: number) => (
                                        <li key={i} className="flex items-center justify-between text-xs bg-gray-800/50 rounded px-2 py-1.5">
                                            <span className="text-gray-300">{p.name}</span>
                                            {p.ip && <span className="font-mono text-emerald-300 truncate max-w-[140px]">{p.ip}</span>}
                                        </li>
                                    ))}
                                </ul>
                            ) : gSummary.portCount != null ? (
                                <p className="text-xs text-gray-300">{t('unifi.portCountEthernet', { count: gSummary.portCount })}</p>
                            ) : gSummary.ip ? (
                                <p className="text-xs text-gray-300 font-mono">{gSummary.ip} (gateway)</p>
                            ) : (
                                <p className="text-xs text-gray-500">{t('unifi.noLanInfo')}</p>
                            )}
                        </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-800 flex flex-wrap items-center gap-4 text-xs">
                        {gSummary.ip && (
                            <span className="text-gray-400">
                                {t('unifi.gatewayLabel')} <span className="text-white font-mono">{gSummary.ip}</span>
                            </span>
                        )}
                        {gSummary.name && gSummary.name !== gSummary.ip && (
                            <span className="text-gray-400">
                                {t('unifi.tableName')} : <span className="text-white">{gSummary.name}</span>
                            </span>
                        )}
                        {natRulesCount != null && (
                            <span className="text-gray-400">
                                {t('unifi.natRules')}: <span className="text-purple-300 font-mono">{natRulesCount}</span>
                            </span>
                        )}
                    </div>
                </Card>
            )}

            <Card 
                title={t('unifi.natRules')}
                actions={
                    isRefreshing && !isInitialLoading ? (
                        <RefreshCw size={14} className="text-gray-400 animate-spin" />
                    ) : null
                }
                className="bg-unifi-card border border-gray-800 rounded-xl"
            >
                {isInitialLoading ? (
                    <div className="text-center py-8 text-gray-500">
                        <RefreshCw size={24} className="mx-auto mb-2 animate-spin" />
                        <p className="text-sm">{t('unifi.natRulesLoading')}</p>
                    </div>
                ) : error ? (
                    <div className="text-center py-8 text-red-500">
                        <AlertCircle size={24} className="mx-auto mb-2" />
                        <p className="text-sm">{error}</p>
                    </div>
                ) : natRules.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        <Router size={32} className="mx-auto mb-2" />
                        <p className="text-sm">{t('unifi.noNatRuleConfigured')}</p>
                        <p className="text-xs text-gray-600 mt-1">{t('unifi.natRulesManagedByGateway')}</p>
                    </div>
                ) : (
                    <>
                        {/* Filtres */}
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-4 pb-3 border-b border-gray-800">
                            <span className="text-gray-500">
                                {t('unifi.rulesShownCount', { shown: filteredRules.length, total: natRules.length })}
                            </span>
                            <div className="flex items-center gap-1">
                                <span className="text-[11px] text-gray-500 mr-1">{t('network.status')}:</span>
                                {(['all', 'active'] as const).map((mode) => {
                                    const active = filterStatus === mode;
                                    const activeClasses = mode === 'all' 
                                        ? 'bg-purple-500/20 border-purple-400 text-purple-100'
                                        : 'bg-green-500/20 border-green-400 text-green-200';
                                    return (
                                        <button
                                            key={mode}
                                            type="button"
                                            onClick={() => setFilterStatus(mode)}
                                            className={`px-2 py-0.5 rounded-full border text-[11px] transition-colors ${
                                                active
                                                    ? activeClasses
                                                    : 'bg-transparent border-gray-700 text-gray-400 hover:bg-gray-800'
                                            }`}
                                        >
                                            {mode === 'all' ? t('unifi.filterAll') : t('unifi.activeRules')}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        {filteredRules.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 text-xs">
                                {t('unifi.noRuleForFilter')}
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-800">
                                {filteredRules.map((rule) => (
                            <div
                                key={rule.id}
                                className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-gray-900/50 transition-colors"
                            >
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                    <div className={`mt-1 shrink-0 ${rule.enabled ? 'text-green-400' : 'text-gray-500'}`}>
                                        {rule.enabled ? (
                                            <CheckCircle size={16} />
                                        ) : (
                                            <XCircle size={16} />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-semibold text-white">
                                                {rule.name || rule.comment || t('unifi.ruleFallback', { id: rule.id.substring(0, 8) })}
                                            </span>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                                                rule.enabled 
                                                    ? 'bg-green-500/20 border border-green-500/50 text-green-300' 
                                                    : 'bg-gray-500/20 border border-gray-500/50 text-gray-400'
                                            }`}>
                                                {rule.enabled ? 'Actif' : 'Inactif'}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-400 space-y-0.5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-500">Protocole:</span>
                                                <span className="text-gray-300 font-mono uppercase">{rule.protocol || 'TCP'}</span>
                                            </div>
                                            {rule.dst_port && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-gray-500">Port destination:</span>
                                                    <span className="text-gray-300 font-mono">{rule.dst_port}</span>
                                                </div>
                                            )}
                                            {rule.fwd_host && rule.fwd_port && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-gray-500">Redirection:</span>
                                                    <span className="text-gray-300 font-mono">
                                                        {rule.fwd_host}:{rule.fwd_port}
                                                    </span>
                                                </div>
                                            )}
                                            {rule.src && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-gray-500">Source:</span>
                                                    <span className="text-gray-300 font-mono">{rule.src}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                            </div>
                        )}
                    </>
                )}
            </Card>
        </div>
    );
};
