import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Download, Gauge, Router, Upload, X } from 'lucide-react';
import { api } from '../../api/client';
import { formatBytes, formatSpeed } from '../../utils/constants';
import { usePolling } from '../../hooks/usePolling';
import { useUnifiWebSocket } from '../../hooks/useUnifiWebSocket';
import { useUnifiRealtimeStore } from '../../stores/unifiRealtimeStore';
import { hasVendorIcon } from '../../utils/vendorBrand';
import { VendorIcon } from './VendorIcon';
import { TrafficPeriodToggle, type TrafficPeriod } from './TrafficPeriodToggle';

interface TrafficHistoryEntry {
    mac: string;
    name: string;
    ip?: string;
    vendor?: string | null;
    rxBytes: number;
    txBytes: number;
}

/** Normalized row: bytes for today/alltime, bytes/s for live (same columns, different unit). */
interface TrafficRow {
    mac: string;
    name: string;
    ip?: string;
    vendor?: string | null;
    download: number;
    upload: number;
}

type SortBy = 'name' | 'ip' | 'mac' | 'download' | 'upload' | 'total';

// Matches the server-side cap of /api/plugins/unifi/top-clients-history
const HISTORY_LIMIT = 500;

const ipToNumber = (ip?: string): number => {
    if (!ip) return -1;
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(Number.isNaN)) return -1;
    return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
};

/**
 * Full sortable per-device traffic table (UniFi only), shared by the dashboard
 * "Data volume" widget and the network-scan insights "view all" link. Owns its own
 * live/today/all-time period and data fetching, callers only open/close it.
 */
export const TopTrafficOverlay: React.FC<{
    initialPeriod?: TrafficPeriod;
    onClose: () => void;
    onSearch?: (query: string) => void;
    /** Open a UniFi WebSocket for live mode, only needed when the host page doesn't already run one. */
    ensureLiveSocket?: boolean;
}> = ({ initialPeriod = 'today', onClose, onSearch, ensureLiveSocket = false }) => {
    const { t } = useTranslation();
    const [period, setPeriod] = useState<TrafficPeriod>(initialPeriod);
    const [history, setHistory] = useState<TrafficHistoryEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [sortBy, setSortBy] = useState<SortBy>('total');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    useUnifiWebSocket({ enabled: ensureLiveSocket && period === 'live' });
    const liveTopClients = useUnifiRealtimeStore((s) => s.topClients);
    const liveConnected = useUnifiRealtimeStore((s) => s.isConnected);
    const isLive = period === 'live';

    const fetchHistory = useCallback(async () => {
        if (period === 'live') return;
        setLoading(true);
        try {
            const response = await api.get<TrafficHistoryEntry[]>(`/api/plugins/unifi/top-clients-history?period=${period}&limit=${HISTORY_LIMIT}`);
            if (response.success && response.result) setHistory(response.result);
        } catch {
            // ignore, keep the previous rows
        } finally {
            setLoading(false);
        }
    }, [period]);

    useEffect(() => {
        setHistory([]);
        fetchHistory();
    }, [fetchHistory]);

    usePolling(fetchHistory, { enabled: !isLive, interval: 30000, immediate: false });

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const rows: TrafficRow[] = useMemo(() => isLive
        // Live rates come in KB/s from the WebSocket, converted to bytes/s for formatSpeed()
        ? liveTopClients.map((c) => ({ mac: c.mac, name: c.name, ip: c.ip, vendor: c.vendor, download: c.download * 1024, upload: c.upload * 1024 }))
        : history.map((c) => ({ mac: c.mac, name: c.name, ip: c.ip, vendor: c.vendor, download: c.rxBytes, upload: c.txBytes })),
    [isLive, liveTopClients, history]);

    const sorted = useMemo(() => {
        const copy = [...rows];
        copy.sort((a, b) => {
            let cmp: number;
            switch (sortBy) {
                case 'name': cmp = (a.name || a.mac).localeCompare(b.name || b.mac); break;
                case 'ip': cmp = ipToNumber(a.ip) - ipToNumber(b.ip); break;
                case 'mac': cmp = a.mac.localeCompare(b.mac); break;
                case 'download': cmp = a.download - b.download; break;
                case 'upload': cmp = a.upload - b.upload; break;
                default: cmp = (a.download + a.upload) - (b.download + b.upload);
            }
            return sortOrder === 'asc' ? cmp : -cmp;
        });
        return copy;
    }, [rows, sortBy, sortOrder]);

    const toggleSort = (col: SortBy) => {
        if (sortBy === col) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        else { setSortBy(col); setSortOrder(col === 'name' || col === 'ip' || col === 'mac' ? 'asc' : 'desc'); }
    };

    const formatValue = isLive ? formatSpeed : formatBytes;

    const SortHeader: React.FC<{ col: SortBy; label: string; align?: 'left' | 'right'; icon?: React.ReactNode }> = ({ col, label, align = 'right', icon }) => (
        <th
            className={`py-2 px-3 text-xs text-gray-400 font-medium cursor-pointer hover:text-gray-300 transition-colors whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}
            onClick={() => toggleSort(col)}
        >
            <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
                {icon}
                <span>{label}</span>
                {sortBy === col && (
                    sortOrder === 'asc' ? <ArrowUp size={11} className="text-blue-400" /> : <ArrowDown size={11} className="text-blue-400" />
                )}
            </div>
        </th>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" role="presentation" onClick={onClose}>
            <div className="bg-[#121212] border border-gray-700 rounded-xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl" role="presentation" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-800">
                    <div className="flex items-center gap-2 text-white font-semibold min-w-0">
                        <Gauge size={16} className="text-cyan-400 flex-shrink-0" />
                        <span className="truncate">{t('networkScan.widget.topTraffic')}</span>
                        <span className="text-gray-500 text-sm font-normal flex-shrink-0">({rows.length})</span>
                        {isLive && (
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${liveConnected ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                        )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <TrafficPeriodToggle
                            period={period}
                            onChange={setPeriod}
                            labels={{
                                live: t('networkScan.widget.trafficLive'),
                                today: t('networkScan.widget.trafficToday'),
                                alltime: t('networkScan.widget.trafficAllTime')
                            }}
                        />
                        <button
                            onClick={onClose}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                            aria-label={t('networkScan.tooltips.close')}
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>
                {isLive && (
                    <div className="px-4 py-2 text-[11px] text-gray-500 border-b border-gray-800">{t('networkScan.widget.liveRateNote')}</div>
                )}
                <div className="flex-1 overflow-y-auto">
                    {rows.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm italic">
                            {loading ? t('networkScan.widget.loading') : t('networkScan.widget.noTrafficData')}
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-[#121212]">
                                <tr className="border-b border-gray-800">
                                    <th className="py-2 px-3 text-xs text-gray-500 font-medium text-right w-10">#</th>
                                    <SortHeader col="name" label={t('networkScan.table.headers.hostname')} align="left" />
                                    <SortHeader col="ip" label={t('networkScan.table.headers.ip')} align="left" />
                                    <SortHeader col="mac" label={t('networkScan.table.headers.mac')} align="left" />
                                    <SortHeader col="download" label={t('networkScan.table.headers.download')} icon={<Download size={12} className="text-blue-400/70" />} />
                                    <SortHeader col="upload" label={t('networkScan.table.headers.upload')} icon={<Upload size={12} className="text-emerald-400/70" />} />
                                    <SortHeader col="total" label={t('networkScan.stats.total')} />
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map((d, i) => {
                                    const label = d.name || d.vendor || d.mac;
                                    const query = d.ip || d.mac;
                                    return (
                                        <tr key={d.mac} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                            <td className="py-2 px-3 text-right text-gray-500">{i + 1}</td>
                                            <td className="py-2 px-3 max-w-[280px]">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {hasVendorIcon(d.vendor, d.name)
                                                        ? <VendorIcon vendor={d.vendor} label={d.name} size={14} />
                                                        : <Router size={14} className="text-gray-400 flex-shrink-0" />}
                                                    {onSearch ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => onSearch(query)}
                                                            className="truncate min-w-0 text-left text-gray-300 hover:text-cyan-400 transition-colors cursor-pointer"
                                                            title={t('networkScan.tooltips.searchIp', { ip: query })}
                                                        >
                                                            {label}
                                                        </button>
                                                    ) : (
                                                        <span className="truncate min-w-0 text-gray-300" title={label}>{label}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-2 px-3 font-mono text-xs text-gray-400 whitespace-nowrap">{d.ip || '--'}</td>
                                            <td className="py-2 px-3 font-mono text-xs text-gray-500 whitespace-nowrap">{d.mac}</td>
                                            <td className="py-2 px-3 text-right text-blue-300 whitespace-nowrap">{formatValue(d.download)}</td>
                                            <td className="py-2 px-3 text-right text-emerald-300 whitespace-nowrap">{formatValue(d.upload)}</td>
                                            <td className="py-2 px-3 text-right text-gray-300 whitespace-nowrap">{formatValue(d.download + d.upload)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};
