import React from 'react';
import { useTranslation } from 'react-i18next';

interface DeviceDetailsProps {
    device: any;
    kind: 'switch' | 'gateway' | 'access_point';
    clients: any[];
    renderClickableIp: (ip: string | null | undefined, className?: string, size?: number) => React.ReactNode;
}

const getPortsSummary = (device: any): { active: number; total: number } => {
    const rawPorts = device.port_table || device.eth_port_table || device.ports || device.port_overrides || [];
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

const getClientsCount = (device: any, clients: any[]): number => {
    const name = (device.name || device.model || '').toString();
    const mac = (device.mac || '').toString().toLowerCase();
    return clients.filter((client: any) => {
        const lastUplinkName = (client.last_uplink_name || client.uplink_name || '') as string;
        const lastUplinkMac = (client.last_uplink_mac || client.sw_mac || '') as string;
        return lastUplinkName === name || lastUplinkMac.toLowerCase() === mac;
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
    if (Array.isArray(device.radio_table)) {
        device.radio_table.forEach((radio: any) => {
            const band = radio.radio || radio.name || '';
            if (!band) return;
            const bandLower = band.toLowerCase();
            if (bandLower.includes('ng') || bandLower.includes('2.4') || bandLower === '2g') {
                if (!bands.includes('2.4GHz')) bands.push('2.4GHz');
            } else if (bandLower.includes('na') || bandLower.includes('5') || bandLower === '5g') {
                if (!bands.includes('5GHz')) bands.push('5GHz');
            } else if (bandLower.includes('6') || bandLower === '6g') {
                if (!bands.includes('6GHz')) bands.push('6GHz');
            }
        });
    }
    if (bands.length === 0) {
        if (device.radio_ng || device.radio_2g) bands.push('2.4GHz');
        if (device.radio_na || device.radio_5g) bands.push('5GHz');
        if (device.radio_6g) bands.push('6GHz');
    }
    return bands.length > 0 ? bands : ['N/A'];
};

// Status badge and the system / network info columns shown under a device card.
export const DeviceDetails: React.FC<DeviceDetailsProps> = ({ device, kind, clients, renderClickableIp }) => {
    const { t } = useTranslation();
    const offline = device.active === false;
    const firmware = (device.firmware_version || device.version || device.firmware) as string | undefined;
    const uptime = device.uptime as number | undefined;
    const cpuUsage = device.cpu_usage || device.cpu?.usage || (device.proc_usage as number | undefined);
    const power = device.power || device.watt || (device.poe_power as number | undefined);
    const clientsCount = getClientsCount(device, clients);

    const row = (label: string, value: React.ReactNode, valueClass = 'text-gray-300') => (
        <div className="flex items-center justify-between">
            <span className="text-gray-500">{label}</span>
            <span className={valueClass}>{value}</span>
        </div>
    );

    return (
        <div className={`mt-3 pt-3 border-t border-gray-800 ${offline ? 'opacity-60' : ''}`}>
            <div className="flex items-center justify-end gap-2">
                <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        offline
                            ? 'bg-gray-900 text-gray-400 border-gray-700'
                            : 'bg-emerald-900/60 text-emerald-300 border-emerald-600/70'
                    }`}
                >
                    {offline ? t('unifi.offlineStatus') : t('unifi.onlineStatus')}
                </span>
                <span className={`w-2 h-2 rounded-full ${offline ? 'bg-gray-500' : 'bg-emerald-400'}`} />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2 text-xs">
                {/* System information */}
                <div className="space-y-1">
                    {device.ip && (
                        <div className="flex items-center justify-between">
                            <span className="text-gray-500">IP</span>
                            {renderClickableIp(device.ip, 'text-gray-300 font-mono text-[10px]', 8)}
                        </div>
                    )}
                    {uptime !== undefined && row('Uptime', formatUptime(uptime))}
                    {firmware && row('Firmware', `v${firmware}`)}
                    {cpuUsage !== undefined && row('CPU', `${cpuUsage}%`)}
                    {power !== undefined && row('Puissance', `${power}W`)}
                </div>

                {/* Network information */}
                <div className="space-y-1">
                    {kind === 'access_point' ? (
                        <>
                            {row('Type Wi‑Fi', getWifiType(device))}
                            <div className="flex flex-col gap-1">
                                <span className="text-gray-500">Bandes</span>
                                <div className="flex flex-wrap gap-1">
                                    {getUnifiBands(device).map((band) => (
                                        <span
                                            key={band}
                                            className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-900/40 border border-cyan-700/50 text-cyan-300"
                                        >
                                            {band}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </>
                    ) : (() => {
                        const { active, total } = getPortsSummary(device);
                        return row('Ports actifs', total > 0 ? `${active} / ${total}` : '-', 'text-gray-300 font-semibold');
                    })()}
                    {kind !== 'gateway' && row(t('unifi.clients'), clientsCount, 'text-gray-300 font-semibold')}
                </div>
            </div>
        </div>
    );
};
