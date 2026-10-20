import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, AlertCircle, Link2 } from 'lucide-react';
import { Card } from '../../components/widgets/Card';
import { RichTooltip } from '../../components/ui/RichTooltip';
import { NatTab } from './NatTab';
import { DebugTab } from './DebugTab';
import { CardTab } from './CardTab';
import { DeviceDetails } from './DeviceDetails';
import { AlertFilter, EventFilter } from './types';

export type OverviewSubTab = 'info' | 'events' | 'nat' | 'debug';

interface OverviewTabProps {
    unifiPlugin: any;
    unifiStats: any;
    systemInfo: any;
    devicesArr: any[];
    overviewSubTab: OverviewSubTab;
    setOverviewSubTab: (v: OverviewSubTab) => void;
    alertsFilter: AlertFilter;
    setAlertsFilter: (v: AlertFilter) => void;
    eventFilter: EventFilter;
    setEventFilter: (v: EventFilter) => void;
    onNavigateToSearch?: (ip: string) => void;
    isActive?: boolean;
    pluginStats: Record<string, any>;
    isRefreshing: boolean;
    handleRefresh: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
    unifiPlugin,
    unifiStats,
    systemInfo,
    devicesArr,
    overviewSubTab,
    setOverviewSubTab,
    alertsFilter,
    setAlertsFilter,
    eventFilter,
    setEventFilter,
    onNavigateToSearch,
    isActive,
    pluginStats,
    isRefreshing,
    handleRefresh,
}) => {
    const { t } = useTranslation();

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

    // Compute overview metrics
    const devices = (unifiStats?.devices || []) as any[];
    const nonClientDevices = devices.filter(d => (d.type || '').toString().toLowerCase() !== 'client');
    const controller = (unifiStats?.system || {}) as any;

    const classifyUpdateStatus = (d: any): 'ok' | 'update' | 'critical' => {
        if (d.unsupported === true || d.unsupported_reason) return 'critical';
        const hasUpgradeToFirmware = !!d.upgrade_to_firmware &&
            d.upgrade_to_firmware !== d.version &&
            d.upgrade_to_firmware !== d.firmware_version;
        const isUpgradable = d.upgradable === true || hasUpgradeToFirmware;
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

    if (controller.updateAvailable === true && updateAvailableCount === 0) {
        if (controller.updateDownloaded !== true) {
            updateAvailableCount = 1;
        }
    }

    const totalEquipments = nonClientDevices.length;
    const offlineDevices = nonClientDevices.filter(d => d.active === false);
    const finalCriticalCount = criticalCount + (controller.unsupportedDeviceCount || 0);

    // Client / AP / switch totals across the controller's sites, shown as tags on the devices card.
    const siteCounts = (() => {
        const sites = ((unifiStats as any)?.sites || []) as Array<any>;
        const total = (key: 'clients' | 'aps' | 'switches') => {
            const values = sites.map((site) => site.devices?.[key]).filter((v) => typeof v === 'number') as number[];
            return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) : undefined;
        };
        const counts = { clients: total('clients'), aps: total('aps'), switches: total('switches') };
        return Object.values(counts).some((v) => v !== undefined) ? counts : null;
    })();

    const clientsArr = devicesArr.filter(d => (d.type || '').toString().toLowerCase() === 'client');

    return (
        <>
            {/* Overview sub-tab navigation */}
            <div className="flex gap-1 border-b border-gray-800 mb-4">
                {([
                    { id: 'info' as const, label: t('unifi.tabs.overview') },
                    { id: 'events' as const, label: t('unifi.tabs.events') },
                    { id: 'nat' as const, label: t('unifi.tabs.nat') },
                    ...(import.meta.env.DEV ? [{ id: 'debug' as const, label: t('unifi.tabs.debug') }] : [])
                ]).map(sub => (
                    <button
                        key={sub.id}
                        type="button"
                        onClick={() => setOverviewSubTab(sub.id)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                            overviewSubTab === sub.id
                                ? 'border-blue-500 text-white'
                                : 'border-transparent text-gray-400 hover:text-gray-200'
                        }`}
                    >
                        {sub.label}
                    </button>
                ))}
            </div>

            {/* Info sub-tab */}
            <div className={`space-y-6 ${overviewSubTab !== 'info' ? 'hidden' : ''}`}>
                {/* Ligne 1 : Info Système / Alertes Réseau */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                    <Card
                        title={
                            <span className="flex items-center gap-1.5">
                                {t('unifi.infoSystem')}
                                <RichTooltip
                                    title="Informations système"
                                    description="Résumé de l'état du contrôleur UniFi et du réseau."
                                    rows={[
                                        { label: 'Uptime', value: 'Temps depuis le dernier redémarrage', color: 'sky', dot: true },
                                        { label: 'Équipements', value: 'APs, switches, gateway (hors clients)', color: 'emerald', dot: true },
                                        { label: 'Clients', value: 'Appareils connectés au réseau WiFi/filaire', color: 'blue', dot: true },
                                        { label: 'Firmware', value: 'Version du contrôleur UniFiOS', color: 'gray', dot: true },
                                    ]}
                                    position="bottom"
                                    width={400}
                                />
                            </span>
                        }
                        className="bg-unifi-card border border-gray-800 rounded-xl"
                    >
                        {/* Update status, grouped with the system info */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                            {([
                                { count: upToDateCount, label: t('unifi.upToDate'), tone: 'bg-emerald-900/40 border-emerald-500 text-emerald-400', icon: <CheckCircle size={14} /> },
                                { count: updateAvailableCount, label: t('unifi.updateAvailable'), tone: 'bg-amber-900/40 border-amber-500 text-amber-400', icon: <span className="text-xs leading-none">🕒</span> },
                                { count: finalCriticalCount, label: t('unifi.updateCritical'), tone: 'bg-red-900/40 border-red-500 text-red-400', icon: <AlertCircle size={14} /> },
                                { count: totalEquipments, label: t('unifi.totalEquipments'), tone: 'bg-sky-900/40 border-sky-500 text-sky-400', icon: <span className="text-xs leading-none">i</span> },
                            ]).map((st) => (
                                <div key={st.label} className="flex items-center gap-2 rounded-lg border border-gray-800 px-2 py-1.5 min-w-0">
                                    <div className={`w-6 h-6 shrink-0 rounded-full border flex items-center justify-center ${st.tone}`}>{st.icon}</div>
                                    <div className="min-w-0">
                                        <div className="text-base font-semibold text-white leading-none">{st.count ?? 0}</div>
                                        <div className="text-[10px] text-gray-400 leading-tight truncate" title={st.label}>{st.label}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 content-start text-xs text-gray-300">
                            {/* Colonne 1 - Système */}
                            <div className="space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">{t('unifi.uptimeController')}</span>
                                    <span>
                                        {(() => {
                                            const uptime = controller?.uptime as number | undefined;
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
                                    <span>{totalEquipments ?? 0}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">{t('unifi.clientsLabel')}</span>
                                    <span>{clientsArr.length}</span>
                                </div>
                            </div>

                            {/* Colonne 1b - Deployment type */}
                            {(() => {
                                const deploymentType = (controller?.deploymentType as string) || 'unknown';
                                const caps = controller?.capabilities as any;
                                const badge = deploymentType === 'unifios'
                                    ? { label: 'UniFiOS', color: 'text-blue-300 bg-blue-900/30 border-blue-700/50' }
                                    : deploymentType === 'controller'
                                    ? { label: 'Network App', color: 'text-emerald-300 bg-emerald-900/30 border-emerald-700/50' }
                                    : deploymentType === 'cloud'
                                    ? { label: 'Cloud', color: 'text-purple-300 bg-purple-900/30 border-purple-700/50' }
                                    : { label: '...', color: 'text-gray-400 bg-gray-800/30 border-gray-700/50' };
                                return (
                                    <div className="col-span-2 pt-1 border-t border-gray-800/60">
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-400 text-xs">{t('unifi.deploymentTypeLabel')}</span>
                                            <RichTooltip
                                                title={t(`unifi.tooltip.deployment.${deploymentType}.title`)}
                                                description={t(`unifi.tooltip.deployment.${deploymentType}.desc`)}
                                                rows={caps ? [
                                                    { label: 'API v2 traffic-flows', color: caps.trafficFlowsV2 ? 'emerald' : 'red', dot: true, value: caps.trafficFlowsV2 ? '✓' : '✗' },
                                                    { label: 'IPS events', color: caps.ipsEvents ? 'emerald' : 'red', dot: true, value: caps.ipsEvents ? '✓' : '✗' },
                                                    { label: 'Port forwarding', color: caps.portForwarding ? 'emerald' : 'red', dot: true, value: caps.portForwarding ? '✓' : '✗' },
                                                ] : undefined}
                                                position="top" width={280}
                                            >
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium cursor-help ${badge.color}`}>
                                                    {badge.label}
                                                </span>
                                            </RichTooltip>
                                        </div>
                                    </div>
                                );
                            })()}

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
                                        const tp = (d.type || '').toString().toLowerCase();
                                        const m = (d.model || '').toString().toLowerCase();
                                        return tp.includes('ugw') || tp.includes('udm') || tp.includes('ucg') || tp.includes('gateway') || m.includes('gateway');
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
                                                                {p.ip ? (p.ip.length > 12 ? `${p.ip.slice(0, 10)}…` : p.ip) : (p.up ? 'OK' : '-')}
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
                                                        <span className="text-white text-xs">{portCount != null ? `${portCount} port(s)` : '-'}</span>
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
                        title={
                            <span className="flex items-center gap-1.5">
                                {t('unifi.alertsNetwork')}
                                <RichTooltip
                                    title="Alertes réseau"
                                    description="Alertes générées par l'état des équipements et du contrôleur."
                                    rows={[
                                        { label: 'Info', value: 'Informatif, aucune action requise', color: 'blue', dot: true },
                                        { label: 'Warning', value: 'Attention : équipement hors ligne ou mise à jour', color: 'amber', dot: true },
                                        { label: 'Critical', value: 'Problème sérieux : équipement non supporté', color: 'red', dot: true },
                                    ]}
                                    footer="Mis à jour à chaque polling (30s)"
                                    position="bottom"
                                />
                            </span>
                        }
                        className="bg-unifi-card border border-gray-800 rounded-xl"
                    >
                        <div className="flex flex-1 flex-col justify-start text-xs text-gray-300 space-y-3">
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
                                if (finalCriticalCount > 0) {
                                    alerts.push({
                                        label: t('unifi.updatesCriticalLabel'),
                                        value: finalCriticalCount,
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

                {/* Devices section */}
                <div className="col-span-full space-y-6">
                    {/* Devices: live front-panel cards with system / network info */}
                    <Card
                        title={t('unifi.devicesTitle')}
                        actions={siteCounts && (
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                {siteCounts.clients !== undefined && (
                                    <span className="px-2.5 py-1 rounded-lg bg-purple-500/20 border border-purple-500/50 text-purple-300 font-semibold text-sm">
                                        {siteCounts.clients} {t('unifi.clients')}
                                    </span>
                                )}
                                {siteCounts.aps !== undefined && (
                                    <span className="px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 font-semibold text-sm">
                                        {siteCounts.aps} APs
                                    </span>
                                )}
                                {siteCounts.switches !== undefined && (
                                    <span className="px-2.5 py-1 rounded-lg bg-blue-500/20 border border-blue-500/50 text-blue-300 font-semibold text-sm">
                                        {siteCounts.switches} Switches
                                    </span>
                                )}
                            </div>
                        )}
                        className="bg-unifi-card border border-gray-800 rounded-xl"
                    >
                        {/* Mounted only on this sub-tab: the cards run their own 5 s stats poll */}
                        {overviewSubTab === 'info' && <CardTab
                            devicesArr={devicesArr}
                            renderDetails={(device, kind) => (
                                <DeviceDetails
                                    device={device}
                                    kind={kind}
                                    clients={clientsArr}
                                    renderClickableIp={renderClickableIp}
                                />
                            )}
                        />}
                    </Card>
                </div>
            </div>

            {/* Events sub-tab */}
            {overviewSubTab === 'events' && (
                <div className="col-span-full">
                    <Card title={t('unifi.events')} className="bg-unifi-card border border-gray-800 rounded-xl">
                        {unifiStats?.devices ? (
                            (() => {
                                const evtDevices = unifiStats.devices as any[];
                                const nonClientEvtDevices = evtDevices.filter(
                                    (d: any) => (d.type || '').toLowerCase() !== 'client'
                                );
                                const evtClients = evtDevices.filter(
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

                                const offlineEvtDevices = nonClientEvtDevices.filter((d: any) => d.active === false);
                                if (offlineEvtDevices.length > 0) {
                                    events.push({
                                        id: 'offline-devices',
                                        category: 'alert',
                                        level: 'warning',
                                        title: t('unifi.offlineDevices'),
                                        message: t('unifi.offlineDevicesMessage', { count: offlineEvtDevices.length }),
                                        time: now
                                    });
                                }

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

                                events.push({
                                    id: 'controller-ok',
                                    category: 'system',
                                    level: 'info',
                                    title: t('unifi.controllerOperational'),
                                    message: t('unifi.controllerOnlineMessage', { name: system.name || 'UniFi', hostname: system.hostname || t('unifi.unknown') }),
                                    time: now
                                });

                                if (evtClients.length > 0) {
                                    events.push({
                                        id: 'clients-count',
                                        category: 'connection',
                                        level: 'info',
                                        title: t('unifi.clientsConnectedEvent'),
                                        message: t('unifi.clientsFollowedMessage', { count: evtClients.length }),
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
                                                <p>{t('unifi.noEventDetected')} n'a été détecté pour l'instant.</p>
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

            {/* NAT sub-tab */}
            {overviewSubTab === 'nat' && (
                <NatTab isActive={!!isActive} systemStats={unifiStats?.system} />
            )}

            {/* Debug sub-tab (DEV only) */}
            {overviewSubTab === 'debug' && import.meta.env.DEV && (
                <DebugTab
                    unifiPlugin={unifiPlugin}
                    unifiStats={unifiStats}
                    pluginStats={pluginStats}
                    isActive={isActive}
                    isRefreshing={isRefreshing}
                    handleRefresh={handleRefresh}
                />
            )}
        </>
    );
};
