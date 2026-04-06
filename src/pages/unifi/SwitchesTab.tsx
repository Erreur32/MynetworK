import React from 'react';
import { useTranslation } from 'react-i18next';
import { Network } from 'lucide-react';
import { Card } from '../../components/widgets/Card';
import { RichTooltip } from '../../components/ui/RichTooltip';

interface SwitchesTabProps {
    unifiStats: any;
    devicesArr: any[];
    onNavigateToSearch?: (ip: string) => void;
}

export const SwitchesTab: React.FC<SwitchesTabProps> = ({ unifiStats, devicesArr, onNavigateToSearch }) => {
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
                    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="opacity-50 relative top-[-2px]">
                        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                    </svg>
                </button>
            );
        }

        return <span className={className}>{ip}</span>;
    };

    interface PortRow {
        switchName: string;
        switchIp: string;
        port: number;
        speed: number | null;
        poe: string;
        errors: string;
        portName: string;
    }

    return (
        <div className="col-span-full space-y-6">
            <Card title={t('unifi.switchPortsTitle')} className="bg-unifi-card border border-gray-800 rounded-xl">
                {unifiStats?.devices ? (
                    (() => {
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

                        const portRows: PortRow[] = [];

                        switches.forEach((switchDevice: any) => {
                            const switchName = switchDevice.name || switchDevice.model || 'Switch';
                            const switchIp = switchDevice.ip || 'N/A';

                            const rawPorts =
                                switchDevice.eth_port_table ||
                                switchDevice.port_table ||
                                switchDevice.ports ||
                                switchDevice.port_overrides ||
                                [];

                            const ports = Array.isArray(rawPorts) ? rawPorts : [];

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
                                    const portNum = port.port_idx !== undefined ? port.port_idx :
                                        (port.portnum !== undefined ? port.portnum :
                                            (index + 1));

                                    let speed: number | null = null;
                                    if (typeof port.speed === 'number' && port.speed > 0) {
                                        speed = port.speed;
                                    } else if (typeof port.current_speed === 'number' && port.current_speed > 0) {
                                        speed = port.current_speed;
                                    } else if (typeof port.link_speed === 'number' && port.link_speed > 0) {
                                        speed = port.link_speed;
                                    } else if (port.media) {
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

                                    let errors = 'N/A';
                                    const rxErrors = typeof port.rx_errors === 'number' ? port.rx_errors : 0;
                                    const txErrors = typeof port.tx_errors === 'number' ? port.tx_errors : 0;
                                    const totalErrors = rxErrors + txErrors;
                                    if (totalErrors > 0) {
                                        errors = totalErrors.toString();
                                    }

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
                                                    <span className="flex items-center gap-1">
                                                        VITESSE
                                                        <RichTooltip
                                                            title="Vitesse du lien"
                                                            rows={[
                                                                { label: '10G', value: '10 000 Mbps — SFP+/DAC', color: 'purple', dot: true },
                                                                { label: '2.5G', value: '2 500 Mbps — multi-gig', color: 'sky', dot: true },
                                                                { label: '1G', value: '1 000 Mbps — Gigabit', color: 'emerald', dot: true },
                                                                { label: '100', value: '100 Mbps — Fast Ethernet', color: 'yellow', dot: true },
                                                                { label: '—', value: 'Port déconnecté ou inconnu', color: 'gray', dot: true },
                                                            ]}
                                                            position="top"
                                                            width={260}
                                                            iconSize={11}
                                                        />
                                                    </span>
                                                </div>
                                            </th>
                                            <th className="px-4 py-3 text-left font-semibold" style={{ width: '10%' }}>
                                                <div className="flex items-center gap-2">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                    </svg>
                                                    <span className="flex items-center gap-1">
                                                        POE
                                                        <RichTooltip
                                                            title="Power over Ethernet"
                                                            description="Alimentation électrique via le câble réseau — permet de brancher des appareils (AP, caméra, téléphone) sans adaptateur secteur."
                                                            rows={[
                                                                { label: 'auto', value: 'PoE 802.3af/at actif', color: 'yellow', dot: true },
                                                                { label: '24v', value: 'PoE passif 24V (propriétaire)', color: 'orange', dot: true },
                                                                { label: 'off', value: 'PoE désactivé', color: 'gray', dot: true },
                                                            ]}
                                                            position="top"
                                                            width={270}
                                                            iconSize={11}
                                                        />
                                                    </span>
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
                                                    <span className="flex items-center gap-1">
                                                        ERREURS
                                                        <RichTooltip
                                                            title="Erreurs réseau"
                                                            description="Total des erreurs RX (réception) + TX (émission) sur ce port depuis le dernier redémarrage du switch."
                                                            rows={[
                                                                { label: '0 / N/A', value: 'Pas d\'erreur détectée', color: 'emerald', dot: true },
                                                                { label: '> 0', value: 'Erreurs présentes — câble ou duplex mismatch ?', color: 'red', dot: true },
                                                            ]}
                                                            position="top"
                                                            width={280}
                                                            iconSize={11}
                                                        />
                                                    </span>
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
    );
};
