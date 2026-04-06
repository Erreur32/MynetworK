import React from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Link2 } from 'lucide-react';
import { Card } from '../../components/widgets/Card';
import { RichTooltip } from '../../components/ui/RichTooltip';
import { ClientSortKey } from './types';

interface ClientsTabProps {
    unifiStats: any;
    clientSortKey: ClientSortKey;
    setClientSortKey: (k: ClientSortKey) => void;
    clientSortDir: 'asc' | 'desc';
    setClientSortDir: (d: 'asc' | 'desc') => void;
    clientSearch: string;
    setClientSearch: (s: string) => void;
    clientStatusFilter: 'all' | 'active' | 'inactive';
    setClientStatusFilter: (f: 'all' | 'active' | 'inactive') => void;
    clientConnectionFilter: 'wireless' | 'wired' | 'all';
    setClientConnectionFilter: (f: 'wireless' | 'wired' | 'all') => void;
    onNavigateToSearch?: (ip: string) => void;
}

export const ClientsTab: React.FC<ClientsTabProps> = ({
    unifiStats,
    clientSortKey,
    setClientSortKey,
    clientSortDir,
    setClientSortDir,
    clientSearch,
    setClientSearch,
    clientStatusFilter,
    setClientStatusFilter,
    clientConnectionFilter,
    setClientConnectionFilter,
    onNavigateToSearch,
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

    return (
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

                        const nowSec = Date.now() / 1000;
                        const isClientActive = (c: any): boolean => {
                            if (typeof c.is_online === 'boolean') return c.is_online;
                            if (typeof c.active === 'boolean') return c.active;
                            if (typeof c.last_seen === 'number') {
                                return nowSec - c.last_seen < 300;
                            }
                            return true;
                        };

                        const connectionFilteredClients =
                            clientConnectionFilter === 'all'
                                ? clients
                                : clients.filter((c: any) => {
                                    const isWired = c.is_wired === true;
                                    return clientConnectionFilter === 'wired' ? isWired : !isWired;
                                });

                        const baseClients =
                            clientStatusFilter === 'all'
                                ? connectionFilteredClients
                                : connectionFilteredClients.filter((c: any) =>
                                    clientStatusFilter === 'active' ? isClientActive(c) : !isClientActive(c)
                                );

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
                                            <span className="text-[11px] text-gray-500 mr-1 flex items-center gap-1">
                                                {t('unifi.connectionFilterLabel')}
                                                <RichTooltip
                                                    title={t('unifi.tooltip.connectionFilter.title')}
                                                    rows={[
                                                        { label: 'Wireless', value: t('unifi.tooltip.connectionFilter.wirelessValue'), color: 'sky', dot: true },
                                                        { label: 'Wired', value: t('unifi.tooltip.connectionFilter.wiredValue'), color: 'emerald', dot: true },
                                                        { label: t('unifi.filterAll'), value: t('unifi.tooltip.connectionFilter.allValue'), color: 'gray', dot: true },
                                                    ]}
                                                    position="top" width={230} iconSize={11}
                                                />
                                            </span>
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
                                            <span className="text-[11px] text-gray-500 mr-1 flex items-center gap-1">
                                                {t('unifi.statusFilterLabel')}
                                                <RichTooltip
                                                    title={t('unifi.tooltip.statusFilter.title')}
                                                    description={t('unifi.tooltip.statusFilter.desc')}
                                                    rows={[
                                                        { label: t('unifi.active'), value: t('unifi.tooltip.statusFilter.activeValue'), color: 'green', dot: true },
                                                        { label: t('unifi.inactive'), value: t('unifi.tooltip.statusFilter.inactiveValue'), color: 'amber', dot: true },
                                                    ]}
                                                    position="top" width={240} iconSize={11}
                                                />
                                            </span>
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
    );
};
