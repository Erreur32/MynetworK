import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, RefreshCw, CheckCircle } from 'lucide-react';
import { Card } from '../../components/widgets/Card';
import { RichTooltip } from '../../components/ui/RichTooltip';
import { ThreatRange, ThreatSeverity, ThreatSortKey, ThreatData, ThreatDebug } from './types';

interface ThreatsTabProps {
    threatRange: ThreatRange;
    setThreatRange: (v: ThreatRange) => void;
    threatSeverity: ThreatSeverity;
    setThreatSeverity: (v: ThreatSeverity) => void;
    threatIpSearch: string;
    setThreatIpSearch: (v: string) => void;
    threatSort: { key: ThreatSortKey; dir: 'asc' | 'desc' };
    setThreatSort: (v: { key: ThreatSortKey; dir: 'asc' | 'desc' }) => void;
    threatData: ThreatData | null;
    isLoadingThreats: boolean;
    threatDebug: ThreatDebug | null;
}

export const ThreatsTab: React.FC<ThreatsTabProps> = ({
    threatRange,
    setThreatRange,
    threatSeverity,
    setThreatSeverity,
    threatIpSearch,
    setThreatIpSearch,
    threatSort,
    setThreatSort,
    threatData,
    isLoadingThreats,
    threatDebug,
}) => {
    const { t } = useTranslation();

    return (
        <div className="col-span-full space-y-4">
            {/* Range + severity selectors */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                    <ShieldAlert size={16} className="text-red-400" />
                    {t('unifi.threats.title')}
                    <RichTooltip
                        title={t('unifi.tooltip.idsIps.title')}
                        description={t('unifi.tooltip.idsIps.desc')}
                        rows={[
                            { label: t('unifi.tooltip.idsIps.sourceLabel'), value: 'v2 traffic-flows API', color: 'sky', dot: true },
                            { label: t('unifi.tooltip.idsIps.updateLabel'), value: t('unifi.tooltip.idsIps.updateValue'), color: 'gray', dot: true },
                            { label: t('unifi.tooltip.idsIps.cacheLabel'), value: t('unifi.tooltip.idsIps.cacheValue'), color: 'gray', dot: true },
                        ]}
                        footer={t('unifi.tooltip.idsIps.footer')}
                        position="bottom"
                        width={280}
                    />
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Severity filter */}
                    <div className="inline-flex items-center gap-1 bg-[#1b1b1b] rounded-full p-1 border border-gray-800">
                        {([
                            { v: 'ALL' as ThreatSeverity, label: t('unifi.filterAll'), color: 'bg-gray-600' },
                            { v: 'LOW' as ThreatSeverity, label: t('unifi.threats.low'), color: 'bg-blue-600' },
                            { v: 'SUSPICIOUS' as ThreatSeverity, label: t('unifi.threats.suspicious'), color: 'bg-amber-600' },
                            { v: 'CONCERNING' as ThreatSeverity, label: t('unifi.threats.concerning'), color: 'bg-red-600' },
                        ]).map(({ v, label, color }) => (
                            <button
                                key={v}
                                type="button"
                                className={`px-3 py-0.5 rounded-full text-xs ${threatSeverity === v ? `${color} text-white` : 'text-gray-400 hover:text-gray-200'}`}
                                onClick={() => setThreatSeverity(v)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    {/* Range selector */}
                    <div className="inline-flex items-center gap-1 bg-[#1b1b1b] rounded-full p-1 border border-gray-800">
                        {([
                            { v: 3600, label: '1h' },
                            { v: 86400, label: '24h' },
                            { v: 604800, label: '7j' }
                        ] as { v: ThreatRange; label: string }[]).map(({ v, label }) => (
                            <button
                                key={v}
                                type="button"
                                className={`px-3 py-0.5 rounded-full text-xs ${threatRange === v ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                                onClick={() => setThreatRange(v)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {isLoadingThreats && !threatData && (
                <div className="text-center py-12 text-gray-500">
                    <RefreshCw size={24} className="mx-auto mb-2 animate-spin" />
                    <p className="text-sm">{t('common.loading')}</p>
                </div>
            )}

            {threatData && !threatData.available && (
                <Card title={t('unifi.threats.unavailable')} className="bg-unifi-card border border-gray-800 rounded-xl">
                    <div className="py-8 text-gray-500">
                        <div className="text-center mb-4">
                            <ShieldAlert size={36} className="mx-auto mb-3 opacity-40" />
                            <p className="text-sm">{t('unifi.threats.unavailableDesc')}</p>
                            <p className="text-xs mt-1 text-gray-600">{t('unifi.threats.requiresIps')}</p>
                        </div>
                        {threatDebug && (
                            <div className="text-left text-[11px] font-mono bg-black/40 rounded-lg p-3 space-y-1.5 border border-gray-800">
                                <p className="text-gray-400 font-sans text-[10px] uppercase tracking-wide mb-2">Diagnostic</p>
                                <p><span className="text-gray-600">deployment:</span> <span className="text-gray-300">{threatDebug.deploymentType}</span></p>
                                <p><span className="text-gray-600">range:</span> <span className="text-gray-300">{((threatDebug.rangeSeconds ?? 86400) / 3600).toFixed(0)}h</span></p>
                                <p><span className="text-gray-600">endpoints testés:</span></p>
                                <p className="text-amber-500/80 break-all">{threatData.source}</p>
                            </div>
                        )}
                    </div>
                </Card>
            )}

            {threatData?.available && threatData.summary.total === 0 && (() => {
                const isIpsEmpty = (threatData.source || '').includes('ips-event-empty') || (threatData.source || '').includes('ips-empty');
                return (
                    <div className="bg-[#1a1a1a] rounded-xl border border-gray-800 p-6 space-y-4">
                        <div className="text-center text-gray-500">
                            {isIpsEmpty ? (
                                <ShieldAlert size={28} className="mx-auto mb-2 text-amber-600 opacity-60" />
                            ) : (
                                <CheckCircle size={28} className="mx-auto mb-2 text-green-600 opacity-60" />
                            )}
                            <p className="text-sm text-gray-400">{t('unifi.threats.noThreatsInRange')}</p>
                        </div>
                        {isIpsEmpty && (
                            <div className="bg-amber-950/30 border border-amber-800/40 rounded-lg p-4 space-y-2">
                                <p className="text-xs font-semibold text-amber-400">{t('unifi.threats.ipsEmptyTitle')}</p>
                                <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
                                    <li>{t('unifi.threats.ipsEmptyHint1')}</li>
                                    <li>{t('unifi.threats.ipsEmptyHint2')}</li>
                                    <li>{t('unifi.threats.ipsEmptyHint3')}</li>
                                </ul>
                            </div>
                        )}
                        {threatDebug && (
                            <div className="text-[10px] font-mono text-gray-700 text-center space-y-0.5">
                                <p>source: {threatData.source} · {((threatDebug.rangeSeconds ?? 86400) / 3600).toFixed(0)}h · {threatDebug.deploymentType}</p>
                            </div>
                        )}
                    </div>
                );
            })()}

            {threatData?.available && (
                <>
                    {/* Flow Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                            { label: t('unifi.threats.totalBlocked'), value: threatData.summary.total, color: 'text-white', bg: 'bg-red-900/30 border-red-800/50', tooltip: null },
                            { label: t('unifi.threats.low'), value: threatData.summary.low, color: 'text-blue-300', bg: 'bg-blue-900/20 border-blue-800/30', tooltip: { title: t('unifi.tooltip.levelLow.title'), desc: t('unifi.tooltip.levelLow.desc') } },
                            { label: t('unifi.threats.suspicious'), value: threatData.summary.suspicious, color: 'text-amber-300', bg: 'bg-amber-900/20 border-amber-800/30', tooltip: { title: t('unifi.tooltip.levelSuspicious.title'), desc: t('unifi.tooltip.levelSuspicious.desc') } },
                            { label: t('unifi.threats.concerning'), value: threatData.summary.concerning, color: 'text-red-400', bg: 'bg-red-900/20 border-red-800/30', tooltip: { title: t('unifi.tooltip.levelConcerning.title'), desc: t('unifi.tooltip.levelConcerning.desc') } },
                        ].map(({ label, value, color, bg, tooltip }) => {
                            const pct = threatData.summary.total > 0 ? Math.round(value / threatData.summary.total * 1000) / 10 : 0;
                            return (
                                <div key={label} className={`rounded-xl border p-4 ${bg}`}>
                                    <div className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</div>
                                    <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                        {label}
                                        {tooltip && <RichTooltip title={tooltip.title} description={tooltip.desc} position="top" width={260} iconSize={11} />}
                                    </div>
                                    {value !== threatData.summary.total && (
                                        <div className="text-[11px] text-gray-500 mt-0.5">{pct}%</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Top section: Policies + Clients + Regions */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Top Policies */}
                        <Card title={<span className="flex items-center gap-1.5">{t('unifi.threats.topPolicies')}<RichTooltip title={t('unifi.tooltip.topPolicies.title')} description={t('unifi.tooltip.topPolicies.desc')} position="top" width={270} iconSize={12} /></span>} className="bg-unifi-card border border-gray-800 rounded-xl">
                            {threatData.topPolicies.length === 0 ? (
                                <p className="text-xs text-gray-500 py-4 text-center">{t('unifi.threats.noData')}</p>
                            ) : (
                                <div className="space-y-2">
                                    {threatData.topPolicies.map((p) => (
                                        <div key={p.name} className="flex justify-between items-center">
                                            <span className="text-xs text-gray-300 truncate mr-2">{p.name}</span>
                                            <span className="text-xs font-mono font-semibold text-red-400 shrink-0">{p.count.toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>

                        {/* Top Clients */}
                        <Card title={<span className="flex items-center gap-1.5">{t('unifi.threats.topClients')}<RichTooltip title={t('unifi.tooltip.topClients.title')} description={t('unifi.tooltip.topClients.desc')} position="top" width={260} iconSize={12} /></span>} className="bg-unifi-card border border-gray-800 rounded-xl">
                            {threatData.topClients.length === 0 ? (
                                <p className="text-xs text-gray-500 py-4 text-center">{t('unifi.threats.noData')}</p>
                            ) : (
                                <div className="space-y-2">
                                    {threatData.topClients.map((c) => (
                                        <div key={c.mac || c.ip} className="flex justify-between items-center">
                                            <div className="min-w-0 mr-2">
                                                <div className="text-xs text-gray-200 truncate">{c.name || c.mac || c.ip || '-'}</div>
                                                {c.ip && <div className="text-[10px] text-gray-500 font-mono">{c.ip}</div>}
                                            </div>
                                            <span className="text-xs font-mono font-semibold text-amber-400 shrink-0">{c.count.toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>

                        {/* Top Regions */}
                        <Card title={<span className="flex items-center gap-1.5">{t('unifi.threats.topRegions')}<RichTooltip title={t('unifi.tooltip.topRegions.title')} description={t('unifi.tooltip.topRegions.desc')} position="top" width={260} iconSize={12} /></span>} className="bg-unifi-card border border-gray-800 rounded-xl">
                            {threatData.topRegions.length === 0 ? (
                                <p className="text-xs text-gray-500 py-4 text-center">{t('unifi.threats.noData')}</p>
                            ) : (
                                <div className="space-y-2">
                                    {threatData.topRegions.map((r) => (
                                        <div key={r.country} className="flex justify-between items-center">
                                            <span className="inline-flex items-center gap-1.5 text-xs text-gray-300 truncate mr-2">
                                                <img
                                                    src={`/SVG/flag-${r.country.toLowerCase()}.svg`}
                                                    alt={r.country}
                                                    className="w-5 h-3.5 object-cover rounded-[2px] shrink-0"
                                                    onError={(e) => { (e.target as HTMLImageElement).src = '/SVG/flag-xx.svg'; }}
                                                />
                                                {r.country}
                                            </span>
                                            <span className="text-xs font-mono font-semibold text-blue-400 shrink-0">{r.count.toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </div>

                    {/* Recent Flows */}
                    {(() => {
                        const ipQ = threatIpSearch.trim().toLowerCase();
                        const filtered = threatData.recentFlows.filter(f => {
                            if (threatSeverity !== 'ALL' && f.threatLevel !== threatSeverity) return false;
                            if (ipQ && !(
                                (f.srcIp || '').toLowerCase().includes(ipQ) ||
                                (f.dstIp || '').toLowerCase().includes(ipQ) ||
                                (f.clientMac || '').toLowerCase().includes(ipQ) ||
                                (f.clientName || '').toLowerCase().includes(ipQ)
                            )) return false;
                            return true;
                        });
                        const levelOrder = { 'CONCERNING': 3, 'SUSPICIOUS': 2, 'LOW': 1 } as Record<string, number>;
                        const sorted = [...filtered].sort((a, b) => {
                            const { key, dir } = threatSort;
                            let cmp = 0;
                            if (key === 'timestamp') cmp = (a.timestamp || 0) - (b.timestamp || 0);
                            else if (key === 'threatLevel') cmp = (levelOrder[a.threatLevel] || 0) - (levelOrder[b.threatLevel] || 0);
                            else cmp = ((a[key] as string) || '').localeCompare((b[key] as string) || '');
                            return dir === 'asc' ? cmp : -cmp;
                        });
                        const handleSort = (key: ThreatSortKey) => {
                            setThreatSort({ key, dir: threatSort.key === key && threatSort.dir === 'desc' ? 'asc' : 'desc' });
                        };
                        const SortIcon = ({ k }: { k: ThreatSortKey }) => (
                            threatSort.key === k
                                ? <span className="ml-1 text-[9px]">{threatSort.dir === 'desc' ? '▼' : '▲'}</span>
                                : <span className="ml-1 text-[9px] text-gray-700">⇅</span>
                        );
                        const colTh = (k: ThreatSortKey, label: string) => (
                            <th
                                className="px-3 py-2 text-left cursor-pointer select-none hover:text-gray-300 transition-colors whitespace-nowrap"
                                onClick={() => handleSort(k)}
                            >
                                {label}<SortIcon k={k} />
                            </th>
                        );
                        return (
                            <Card
                                title={`${t('unifi.threats.recentFlows')} (${filtered.length}/${threatData.recentFlows.length})`}
                                className="bg-unifi-card border border-gray-800 rounded-xl"
                            >
                                {/* IP search */}
                                <div className="mb-3">
                                    <input
                                        type="text"
                                        value={threatIpSearch}
                                        onChange={e => setThreatIpSearch(e.target.value)}
                                        placeholder={t('unifi.threats.searchIpPlaceholder')}
                                        className="w-full bg-[#111] border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-500"
                                    />
                                </div>
                                {sorted.length === 0 ? (
                                    <p className="text-xs text-gray-500 py-4 text-center">{t('unifi.threats.noData')}</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-xs text-gray-300">
                                            <thead className="text-gray-500 text-[11px] uppercase tracking-wide border-b border-gray-800">
                                                <tr>
                                                    {colTh('timestamp', t('unifi.threats.colTime'))}
                                                    {colTh('threatLevel', t('unifi.threats.colLevel'))}
                                                    {colTh('policy', t('unifi.threats.colPolicy'))}
                                                    {colTh('srcIp', t('unifi.threats.colSrc'))}
                                                    {colTh('dstIp', t('unifi.threats.colDst'))}
                                                    {colTh('country', t('unifi.threats.colCountry'))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sorted.slice(0, 100).map((f, idx) => {
                                                    const ts = f.timestamp > 1e10 ? new Date(f.timestamp) : new Date(f.timestamp * 1000);
                                                    const levelColor = f.threatLevel === 'CONCERNING' ? 'text-red-400' : f.threatLevel === 'SUSPICIOUS' ? 'text-amber-400' : 'text-blue-400';
                                                    return (
                                                        <tr key={idx} className={idx % 2 === 0 ? 'bg-[#0f0f0f]' : ''}>
                                                            <td className="px-3 py-1.5 font-mono text-gray-500 whitespace-nowrap">
                                                                {ts.toLocaleTimeString()}
                                                            </td>
                                                            <td className="px-3 py-1.5">
                                                                {(() => {
                                                                    const lvlKey = f.threatLevel === 'CONCERNING' ? 'levelConcerning' : f.threatLevel === 'SUSPICIOUS' ? 'levelSuspicious' : 'levelLow';
                                                                    return (
                                                                        <RichTooltip title={t(`unifi.tooltip.${lvlKey}.title`)} description={t(`unifi.tooltip.${lvlKey}.desc`)} position="top" width={240}>
                                                                            <span className={`${levelColor} font-semibold text-[11px] cursor-help`}>{f.threatLevel}</span>
                                                                        </RichTooltip>
                                                                    );
                                                                })()}
                                                            </td>
                                                            <td className="px-3 py-1.5 max-w-[180px] truncate" title={f.policy}>{f.policy}</td>
                                                            <td className="px-3 py-1.5 font-mono text-gray-400">{f.srcIp || f.clientMac || '-'}</td>
                                                            <td className="px-3 py-1.5 font-mono text-gray-400">{f.dstIp || '-'}</td>
                                                            <td className="px-3 py-1.5 text-gray-400">
                                                                {f.country ? (
                                                                    <span className="inline-flex items-center gap-1.5">
                                                                        <img
                                                                            src={`/SVG/flag-${f.country.toLowerCase()}.svg`}
                                                                            alt={f.country}
                                                                            className="w-5 h-3.5 object-cover rounded-[2px] shrink-0"
                                                                            onError={(e) => { (e.target as HTMLImageElement).src = '/SVG/flag-xx.svg'; }}
                                                                        />
                                                                        <span>{f.country}</span>
                                                                    </span>
                                                                ) : '-'}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </Card>
                        );
                    })()}
                </>
            )}
        </div>
    );
};
