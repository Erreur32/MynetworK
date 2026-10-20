import React from 'react';
import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import { StatusBadge } from '../ui';
import { RichTooltip } from '../ui/RichTooltip';
import { useFreeboxSfp, wanSignalLevel, PON_RX_CRIT_DBM, PON_RX_WARN_DBM } from '../../hooks/useFreeboxSfp';
import { SFP_LEVEL_TEXT } from '../unifi/SfpModules';

// Icon for the Freebox home card "system state" frame: only present when the fibre module has no
// signal or a weak one. The box reports no module temperature, so heat cannot be flagged here.
export const FreeboxSfpAlert: React.FC<{ enabled: boolean }> = ({ enabled }) => {
    const { t } = useTranslation();
    const sfp = useFreeboxSfp(enabled);
    const wan = sfp?.modules.find((m) => m.role === 'wan');
    if (!wan || wan.role !== 'wan') return null;
    const level = wanSignalLevel(wan);
    if (level === 'ok') return null;
    const lost = wan.present === false || wan.has_signal === false || wan.link === false;
    const detail = lost ? t('freebox.sfp.signalLost') : `RX ${wan.rx_dbm?.toFixed(1)} dBm`;
    return (
        <RichTooltip
            title={t('freebox.sfp.alertTitle')}
            description={t('freebox.sfp.thresholds', { warn: PON_RX_WARN_DBM, crit: PON_RX_CRIT_DBM })}
            rows={[
                { label: t('freebox.sfp.module'), value: [wan.vendor, wan.model].filter(Boolean).join(' ') || '-', color: 'gray', dot: true },
                { label: t('freebox.sfp.signal'), value: detail, color: level === 'crit' ? 'red' : 'amber', dot: true },
                { label: 'TX', value: wan.tx_dbm === null ? '-' : `${wan.tx_dbm.toFixed(2)} dBm`, color: 'gray', dot: true },
            ]}
            position="top"
            width={300}
        >
            <StatusBadge icon={<Zap size={14} />} value={`SFP ${detail}`} color={SFP_LEVEL_TEXT[level]} />
        </RichTooltip>
    );
};
