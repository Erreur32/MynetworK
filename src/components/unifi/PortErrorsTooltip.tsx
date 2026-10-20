import React from 'react';
import { useTranslation } from 'react-i18next';
import { RichTooltip } from '../ui/RichTooltip';

export interface PortErrorTooltipRow {
    device: string;
    port: number;
    rx: number;
    tx: number;
}

interface PortErrorsTooltipProps {
    rows: PortErrorTooltipRow[];
    position?: 'top' | 'bottom';
    children: React.ReactNode;
}

const MAX_ROWS = 6;

// Which ports have errors (RX / TX) and the usual causes, shared by every UniFi view showing a port error total.
export const PortErrorsTooltip: React.FC<PortErrorsTooltipProps> = ({ rows, position = 'top', children }) => {
    const { t } = useTranslation();
    return (
        <RichTooltip
            title={t('unifi.tooltip.errors.title')}
            description={rows.length > 0 ? t('unifi.tooltip.errors.whyDesc') : t('unifi.tooltip.errors.noneValue')}
            rows={rows.slice(0, MAX_ROWS).map((r) => ({
                label: `${r.device} · ${t('unifi.tooltip.errors.portLabel', { port: r.port })}`,
                value: `RX ${r.rx.toLocaleString()} · TX ${r.tx.toLocaleString()}`,
                color: 'red' as const,
                dot: true
            }))}
            footer={rows.length > MAX_ROWS ? t('unifi.tooltip.errors.morePorts', { count: rows.length - MAX_ROWS }) : undefined}
            position={position}
            width={320}
        >
            {children}
        </RichTooltip>
    );
};
