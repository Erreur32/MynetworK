import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../widgets/Card';
import { api } from '../../api/client';
import { usePolling } from '../../hooks/usePolling';
import { SFP_LEVEL_TEXT } from '../unifi/SfpModules';
import type { SfpLevel } from '../../vendor/unifi-device-card/mynetwork-sfp.js';

interface WanModule {
    role: 'wan';
    present: boolean | null;
    has_signal: boolean | null;
    link: boolean | null;
    alim_ok: boolean | null;
    link_type: string | null;
    model: string | null;
    vendor: string | null;
    serial: string | null;
    rx_dbm: number | null;
    tx_dbm: number | null;
}

interface LanModule {
    role: 'lan';
    id: number | null;
    name: string;
    link: string | null;
    speed: number | null;
    mode: string | null;
    hosts: string[];
}

interface SfpResult {
    modules: Array<WanModule | LanModule>;
}

// PON receivers work down to about -27 dBm (GPON class B+), far below the 10G Ethernet optics.
const PON_RX_WARN_DBM = -24;
const PON_RX_CRIT_DBM = -27;

const wanSignalLevel = (m: WanModule): SfpLevel => {
    if (m.present === false || m.has_signal === false || m.alim_ok === false || m.link === false) return 'crit';
    if (m.rx_dbm === null) return 'ok';
    return m.rx_dbm < PON_RX_CRIT_DBM ? 'crit' : m.rx_dbm < PON_RX_WARN_DBM ? 'warn' : 'ok';
};

const Row: React.FC<{ label: string; value: React.ReactNode; className?: string }> = ({ label, value, className = 'text-gray-200' }) => (
    <div className="flex items-center justify-between gap-3">
        <span className="text-gray-500">{label}</span>
        <span className={`text-right font-medium ${className}`}>{value}</span>
    </div>
);

const flag = (ok: boolean | null, good: string, bad: string): [string, string] =>
    ok === null ? ['-', 'text-gray-400'] : ok ? [good, 'text-emerald-400'] : [bad, 'text-red-400'];

const WanBlock: React.FC<{ module: WanModule }> = ({ module: m }) => {
    const { t } = useTranslation();
    const level = wanSignalLevel(m);
    const [signal, signalClass] = flag(m.has_signal, t('freebox.sfp.signalOk'), t('freebox.sfp.signalLost'));
    const [power, powerClass] = flag(m.alim_ok, t('freebox.sfp.powerOk'), t('freebox.sfp.powerFault'));
    const [link, linkClass] = flag(m.link, t('freebox.sfp.linkUp'), t('freebox.sfp.linkDown'));
    const dbm = (v: number | null) => (v === null ? '-' : `${v.toFixed(2)} dBm`);
    return (
        <div className="bg-[#1a1a1a] rounded-lg p-3 space-y-1.5 text-xs">
            <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-gray-200">{t('freebox.sfp.wan')}</span>
                <span className="px-1.5 py-0.5 rounded border text-[10px] bg-sky-900/30 border-sky-700/50 text-sky-300">{t('freebox.sfp.optical')}</span>
                {m.link_type && <span className="px-1.5 py-0.5 rounded border text-[10px] border-gray-700 text-gray-300">{m.link_type.toUpperCase()}</span>}
            </div>
            <Row label={t('freebox.sfp.module')} value={[m.vendor, m.model].filter(Boolean).join(' ') || '-'} />
            {m.serial && <Row label={t('freebox.sfp.serial')} value={<span className="font-mono">{m.serial}</span>} />}
            <Row label={t('freebox.sfp.link')} value={link} className={linkClass} />
            <Row label={t('freebox.sfp.signal')} value={signal} className={signalClass} />
            <Row label={t('freebox.sfp.power')} value={power} className={powerClass} />
            <Row label="RX" value={dbm(m.rx_dbm)} className={SFP_LEVEL_TEXT[level]} />
            <Row label="TX" value={dbm(m.tx_dbm)} />
            <Row label={t('freebox.sfp.temperature')} value={t('freebox.sfp.notReported')} className="text-gray-500" />
            <p className="pt-1 text-[10px] text-gray-500">{t('freebox.sfp.thresholds', { warn: PON_RX_WARN_DBM, crit: PON_RX_CRIT_DBM })}</p>
        </div>
    );
};

const LanBlock: React.FC<{ module: LanModule }> = ({ module: m }) => {
    const { t } = useTranslation();
    const up = m.link === 'up';
    const speed = m.speed === null ? '-' : m.speed >= 1000 ? `${m.speed / 1000} Gbit/s` : `${m.speed} Mbit/s`;
    return (
        <div className="bg-[#1a1a1a] rounded-lg p-3 space-y-1.5 text-xs">
            <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-gray-200">{m.name}</span>
                <span className="px-1.5 py-0.5 rounded border text-[10px] border-gray-700 text-gray-300">{t('freebox.sfp.lan')}</span>
            </div>
            <Row label={t('freebox.sfp.link')} value={up ? t('freebox.sfp.linkUp') : t('freebox.sfp.linkDown')} className={up ? 'text-emerald-400' : 'text-gray-400'} />
            <Row label={t('freebox.sfp.speed')} value={up ? speed : '-'} />
            {m.mode && up && <Row label={t('freebox.sfp.mode')} value={m.mode} />}
            {m.hosts.length > 0 && <Row label={t('freebox.sfp.connectedTo')} value={m.hosts.join(', ')} />}
            <p className="pt-1 text-[10px] text-gray-500">{t('freebox.sfp.lanNoMeasures')}</p>
        </div>
    );
};

// SFP modules of the Freebox: the fibre module with its optical power, and the SFP LAN ports.
// Nothing is rendered when the box reports none.
export const FreeboxSfpCard: React.FC<{ enabled: boolean }> = ({ enabled }) => {
    const { t } = useTranslation();
    const [sfp, setSfp] = useState<SfpResult | null>(null);
    usePolling(async () => {
        const res = await api.get<SfpResult>('/api/settings/sfp').catch(() => null);
        if (res?.success) setSfp(res.result ?? null);
    }, { enabled, interval: 2 * 60_000 });

    if (!sfp || sfp.modules.length === 0) return null;
    return (
        <Card title={t('freebox.sfp.title')}>
            <div className="flex flex-col gap-3">
                {sfp.modules.map((m) => m.role === 'wan'
                    ? <WanBlock key="wan" module={m} />
                    : <LanBlock key={`lan-${m.id ?? m.name}`} module={m} />)}
            </div>
        </Card>
    );
};
