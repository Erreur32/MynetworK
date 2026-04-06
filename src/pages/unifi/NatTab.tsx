import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Network, Link2, RefreshCw, AlertCircle, CheckCircle, XCircle, Router } from 'lucide-react';
import { Card } from '../../components/widgets/Card';
import { RichTooltip } from '../../components/ui/RichTooltip';
import { usePolling } from '../../hooks/usePolling';
import { POLLING_INTERVALS } from '../../utils/constants';
import { api } from '../../api/client';
import { NatRuleItem } from './types';

interface NatTabProps {
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

export const NatTab: React.FC<NatTabProps> = ({ isActive, systemStats }) => {
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
                <Card
                    title={<span className="flex items-center gap-1.5">{t('unifi.gatewayAndPorts')}<RichTooltip title={t('unifi.tooltip.gateway.title')} description={t('unifi.tooltip.gateway.desc')} position="bottom" width={280} iconSize={12} /></span>}
                    className="bg-unifi-card border border-gray-800 rounded-xl"
                >
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
                title={<span className="flex items-center gap-1.5">{t('unifi.natRules')}<RichTooltip title={t('unifi.tooltip.natRules.title')} description={t('unifi.tooltip.natRules.desc')} rows={[{ label: t('unifi.active'), value: t('unifi.tooltip.natRules.activeValue'), color: 'emerald', dot: true }, { label: t('unifi.inactive'), value: t('unifi.tooltip.natRules.inactiveValue'), color: 'gray', dot: true }]} position="top" width={300} iconSize={12} /></span>}
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
