import React from 'react';
import { useTranslation } from 'react-i18next';
import { RichTooltip } from '../ui/RichTooltip';
import { readSfpModules, TEMP_CRIT_C, TEMP_WARN_C, RX_CRIT_DBM, RX_WARN_DBM, type SfpInfo, type SfpLevel } from '../../vendor/unifi-device-card/mynetwork-sfp.js';

export const SFP_LEVEL_TEXT: Record<SfpLevel, string> = {
    ok: 'text-emerald-400',
    warn: 'text-amber-400',
    crit: 'text-red-400'
};

const SFP_LEVEL_TOOLTIP: Record<SfpLevel, 'emerald' | 'amber' | 'red'> = { ok: 'emerald', warn: 'amber', crit: 'red' };

const KIND_BADGE: Record<SfpInfo['kind'], string> = {
    electrical: 'bg-amber-900/30 border-amber-700/50 text-amber-300',
    optical: 'bg-sky-900/30 border-sky-700/50 text-sky-300'
};

const SfpModuleRow: React.FC<{ sfp: SfpInfo }> = ({ sfp }) => {
    const { t } = useTranslation();
    const port = sfp.port ?? '?';
    const rows = [
        { label: t('unifi.sfp.module'), value: [sfp.vendor, sfp.part].filter(Boolean).join(' ') || '-', color: 'gray' as const },
        ...(sfp.compliance ? [{ label: t('unifi.sfp.compliance'), value: sfp.compliance, color: 'gray' as const }] : []),
        ...(sfp.temperature !== undefined ? [{ label: t('unifi.sfp.temperature'), value: `${sfp.temperature.toFixed(1)} °C`, color: SFP_LEVEL_TOOLTIP[sfp.tempLevel] }] : []),
        ...(sfp.voltage !== undefined ? [{ label: t('unifi.sfp.voltage'), value: `${sfp.voltage.toFixed(2)} V`, color: 'gray' as const }] : []),
        ...(sfp.current !== undefined ? [{ label: t('unifi.sfp.current'), value: `${sfp.current.toFixed(1)} mA`, color: 'gray' as const }] : []),
        ...(sfp.rx !== undefined ? [{ label: 'RX', value: `${sfp.rx.toFixed(2)} dBm`, color: SFP_LEVEL_TOOLTIP[sfp.signalLevel] }] : []),
        ...(sfp.tx !== undefined ? [{ label: 'TX', value: `${sfp.tx.toFixed(2)} dBm`, color: 'gray' as const }] : []),
        ...(sfp.rxLos ? [{ label: t('unifi.sfp.fault'), value: t('unifi.sfp.rxLos'), color: 'red' as const }] : []),
        ...(sfp.txFault ? [{ label: t('unifi.sfp.fault'), value: t('unifi.sfp.txFault'), color: 'red' as const }] : [])
    ].map((r) => ({ ...r, dot: true }));

    return (
        <RichTooltip
            title={t('unifi.sfp.tooltipTitle', { port })}
            description={sfp.kind === 'electrical' ? t('unifi.sfp.electricalNote') : undefined}
            rows={rows}
            footer={t('unifi.sfp.thresholds', { tempWarn: TEMP_WARN_C, tempCrit: TEMP_CRIT_C, rxWarn: RX_WARN_DBM, rxCrit: RX_CRIT_DBM })}
            position="top"
            width={300}
        >
            <div className="rounded-lg bg-black/20 border border-gray-800 px-2.5 py-2 space-y-1 cursor-help">
                <div className="flex items-center gap-2">
                    <span className="text-gray-300 font-semibold">{t('unifi.sfp.port', { port })}</span>
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] ${KIND_BADGE[sfp.kind]}`}>{t(`unifi.sfp.${sfp.kind}`)}</span>
                    {(sfp.rxLos || sfp.txFault) && <span className="text-red-400 font-semibold">{sfp.rxLos ? 'LOS' : 'TX'}</span>}
                </div>
                {sfp.part && <div className="text-gray-500 text-[10px] truncate">{[sfp.vendor, sfp.part].filter(Boolean).join(' ')}</div>}
                <div className="flex items-center gap-3">
                    {sfp.temperature !== undefined && (
                        <span className={`font-semibold ${SFP_LEVEL_TEXT[sfp.tempLevel]}`}>{sfp.temperature.toFixed(1)} °C</span>
                    )}
                    {sfp.rx !== undefined && (
                        <span className={`font-mono text-[11px] ${SFP_LEVEL_TEXT[sfp.signalLevel]}`}>
                            RX {sfp.rx.toFixed(1)}{sfp.tx !== undefined ? ` · TX ${sfp.tx.toFixed(1)}` : ''} dBm
                        </span>
                    )}
                </div>
            </div>
        </RichTooltip>
    );
};

// SFP transceivers of a device (temperature, and optical power for optical modules), nothing when it has none.
export const SfpModules: React.FC<{ device: unknown }> = ({ device }) => {
    const { t } = useTranslation();
    const modules = readSfpModules(device);
    if (modules.length === 0) return null;
    return (
        <div className="mt-3 pt-3 border-t border-gray-800 text-xs space-y-2">
            <div className="text-gray-500">{t('unifi.sfp.title')}</div>
            {modules.map((sfp, i) => <SfpModuleRow key={sfp.port ?? i} sfp={sfp} />)}
        </div>
    );
};
