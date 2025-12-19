import React from 'react';
import { Activity, Wifi, AlertCircle } from 'lucide-react';
import { Card } from './Card';
import { usePluginStore } from '../../stores/pluginStore';
import { formatSpeed } from '../../utils/constants';

interface TrafficClient {
    id: string;
    name: string;
    ip?: string;
    ssid?: string;
    uploadKbps: number;
    downloadKbps: number;
    rssi?: number;
}

// Helper to compute a simple Wi‑Fi quality label from RSSI
function getWifiQuality(rssi?: number): string {
    if (typeof rssi !== 'number') return '-';
    if (rssi >= -60) return 'Excellent';
    if (rssi >= -70) return 'Bon';
    if (rssi >= -80) return 'Moyen';
    return 'Faible';
}

// Helper to get color class for Wi‑Fi signal quality indicator
function getWifiQualityColor(rssi?: number): string {
    if (typeof rssi !== 'number') return 'bg-gray-500';
    if (rssi >= -60) return 'bg-green-500';      // Excellent - green
    if (rssi >= -70) return 'bg-yellow-500';     // Bon - yellow
    if (rssi >= -80) return 'bg-orange-500';     // Moyen - orange
    return 'bg-red-500';                         // Faible - red
}

// Helper to pick a deterministic color class per SSID
function getSsidColorClass(ssid?: string): string {
    if (!ssid) return 'text-gray-500';
    const palette = [
        'text-emerald-300',
        'text-sky-300',
        'text-purple-300',
        'text-amber-300',
        'text-pink-300',
        'text-indigo-300'
    ];
    let hash = 0;
    for (let i = 0; i < ssid.length; i++) {
        hash = (hash * 31 + ssid.charCodeAt(i)) >>> 0;
    }
    const idx = hash % palette.length;
    return palette[idx];
}

export const NetworkEventsWidget: React.FC = () => {
    const { pluginStats } = usePluginStore();
    const unifiStats: any = pluginStats['unifi'];

    const clients: TrafficClient[] = React.useMemo(() => {
        const devices: any[] = Array.isArray(unifiStats?.devices) ? unifiStats.devices : [];
        const rawClients = devices.filter((d) => (d.type || '').toString().toLowerCase() === 'client');

        return rawClients.map((c) => {
            const ip = (c.ip || c.ipv4 || '') as string;
            const hostname = (c.hostname || c.name || c.friendly_name || '') as string;
            const ssid = (c.ssid || c.essid || '') as string;
            const mac = (c.mac || c._id || '') as string;

            const uploadKbps = typeof c.tx_rate === 'number' ? c.tx_rate : 0;
            const downloadKbps = typeof c.rx_rate === 'number' ? c.rx_rate : 0;
            let rssi: number | undefined = undefined;
            if (typeof c.rssi === 'number') {
                // Some controllers expose RSSI as positive value; normalize to negative dBm-style range.
                rssi = c.rssi > 0 ? -c.rssi : c.rssi;
            }

            return {
                id: mac || ip || `client-${ip}`,
                name: hostname || ip || 'Client réseau',
                ip,
                ssid,
                uploadKbps,
                downloadKbps,
                rssi
            };
        });
    }, [unifiStats]);

    const topUpload = React.useMemo(
        () => clients.filter(c => c.uploadKbps > 0).sort((a, b) => b.uploadKbps - a.uploadKbps).slice(0, 5),
        [clients]
    );

    const topDownload = React.useMemo(
        () => clients.filter(c => c.downloadKbps > 0).sort((a, b) => b.downloadKbps - a.downloadKbps).slice(0, 5),
        [clients]
    );

    const worstSignal = React.useMemo(
        () => clients.filter(c => typeof c.rssi === 'number').sort((a, b) => (a.rssi! - b.rssi!)).slice(0, 3),
        [clients]
    );

    const hasAnyData = topUpload.length > 0 || topDownload.length > 0 || worstSignal.length > 0;

    const formatRate = (kbps: number) => formatSpeed(kbps * 1024);

    return (
        <Card
            title={
                <div className="flex items-center gap-2">
                    <Activity size={16} className="text-accent-info" />
                    <span>Analyse rapide du trafic UniFi</span>
                </div>
            }
        >
            {!hasAnyData ? (
                <div className="flex flex-col items-center justify-center py-6 text-xs text-gray-500">
                    <AlertCircle size={20} className="mb-2 text-gray-600" />
                    <span>Aucune donnée de trafic disponible pour l’instant.</span>
                    <span className="mt-1 text-[11px] text-gray-600">
                        Les clients UniFi actifs apparaîtront ici avec leur trafic en temps réel.
                    </span>
                </div>
            ) : (
                <div className="space-y-4 text-xs">
                    {/* Top 5 upload */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-gray-400">Top 5 upload (clients)</span>
                        </div>
                        <div className="rounded border border-gray-800 overflow-hidden">
                            <table className="w-full text-[11px] text-gray-300">
                                <thead className="bg-[#181818] text-gray-400">
                                    <tr>
                                        <th className="px-2 py-1 text-left w-1/4">Client</th>
                                        <th className="px-2 py-1 text-left w-1/4">IP</th>
                                        <th className="px-2 py-1 text-left w-1/4">SSID</th>
                                        <th className="px-2 py-1 text-right w-1/4">Up</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topUpload.map((c, idx) => (
                                        <tr key={c.id} className={idx % 2 === 0 ? 'bg-[#101010]' : 'bg-[#141414]'}>
                                            <td className="px-2 py-1 text-gray-200 truncate">{c.name}</td>
                                            <td className="px-2 py-1 text-gray-400 truncate">
                                                {c.ip || '-'}
                                            </td>
                                            <td className="px-2 py-1 truncate">
                                                {c.ssid ? (
                                                    <span className={`text-[10px] ${getSsidColorClass(c.ssid)}`}>
                                                        {c.ssid}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-500">-</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-1 text-right text-emerald-300 font-semibold">
                                                {formatRate(c.uploadKbps)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Top 5 download */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-gray-400">Top 5 download (clients)</span>
                        </div>
                        <div className="rounded border border-gray-800 overflow-hidden">
                            <table className="w-full text-[11px] text-gray-300">
                                <thead className="bg-[#181818] text-gray-400">
                                    <tr>
                                        <th className="px-2 py-1 text-left w-1/4">Client</th>
                                        <th className="px-2 py-1 text-left w-1/4">IP</th>
                                        <th className="px-2 py-1 text-left w-1/4">SSID</th>
                                        <th className="px-2 py-1 text-right w-1/4">Down</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topDownload.map((c, idx) => (
                                        <tr key={c.id} className={idx % 2 === 0 ? 'bg-[#101010]' : 'bg-[#141414]'}>
                                            <td className="px-2 py-1 text-gray-200 truncate">{c.name}</td>
                                            <td className="px-2 py-1 text-gray-400 truncate">
                                                {c.ip || '-'}
                                            </td>
                                            <td className="px-2 py-1 truncate">
                                                {c.ssid ? (
                                                    <span className={`text-[10px] ${getSsidColorClass(c.ssid)}`}>
                                                        {c.ssid}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-500">-</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-1 text-right text-sky-300 font-semibold">
                                                {formatRate(c.downloadKbps)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 3 worst Wi‑Fi signals */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-gray-400">3 pires signaux Wi‑Fi (clients)</span>
                        </div>
                        <div className="rounded border border-gray-800 overflow-hidden">
                            <table className="w-full text-[11px] text-gray-300">
                                <thead className="bg-[#181818] text-gray-400">
                                    <tr>
                                        <th className="px-2 py-1 text-left w-1/4">Client</th>
                                        <th className="px-2 py-1 text-left w-1/4">IP</th>
                                        <th className="px-2 py-1 text-left w-1/4">SSID</th>
                                        <th className="px-2 py-1 text-right w-1/6">RSSI</th>
                                        <th className="px-2 py-1 text-right w-1/6">Qualité</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {worstSignal.map((c, idx) => (
                                        <tr key={c.id} className={idx % 2 === 0 ? 'bg-[#101010]' : 'bg-[#141414]'}>
                                            <td className="px-2 py-1 text-gray-200 truncate">{c.name}</td>
                                            <td className="px-2 py-1 text-gray-400 truncate">
                                                {c.ip || '-'}
                                            </td>
                                            <td className="px-2 py-1 truncate">
                                                {c.ssid ? (
                                                    <span className={`text-[10px] ${getSsidColorClass(c.ssid)}`}>
                                                        {c.ssid}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-500">-</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-1 text-right whitespace-nowrap">
                                                {typeof c.rssi === 'number' ? (
                                                    <span className="inline-flex items-center justify-end gap-1 text-[10px]">
                                                        <span className={`w-2 h-2 rounded-full ${getWifiQualityColor(c.rssi)}`} />
                                                        <span className="text-gray-200 font-medium">
                                                            {c.rssi} dBm
                                                        </span>
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-500">-</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-1 text-right text-[10px] text-gray-500 whitespace-nowrap">
                                                {typeof c.rssi === 'number' ? getWifiQuality(c.rssi) : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
}

