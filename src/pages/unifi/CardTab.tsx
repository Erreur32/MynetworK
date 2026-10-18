import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/widgets/Card';
import { usePluginStore } from '../../stores/pluginStore';
import { createMynetworkHass, type MnDevice } from '../../vendor/unifi-device-card/mynetwork-adapter';

const LIVE_REFRESH_MS = 5000;

// Maps the card's own palette onto the application theme variables, so it
// follows the dark/glass/modern themes instead of its built-in colors. Set on
// the element itself because the card's :host rule would otherwise win.
const THEME_VARS: Record<string, string> = {
    '--udc-card-bg': 'transparent',
    '--udc-chrome-bg': 'var(--bg-secondary)',
    '--udc-panel-bg': 'var(--bg-tertiary)',
    '--udc-label-color': 'var(--text-secondary)',
    '--udc-bg': 'var(--bg-primary)',
    '--udc-surface': 'var(--bg-secondary)',
    '--udc-surf2': 'var(--bg-tertiary)',
    '--udc-border': 'var(--border-color)',
    '--udc-text': 'var(--text-primary)',
    '--udc-dim': 'var(--text-secondary)',
    '--udc-muted': 'var(--text-tertiary)',
    '--udc-accent': 'var(--accent-primary)',
    '--udc-green': 'var(--accent-success)',
    '--udc-orange': 'var(--accent-warning)',
    // Compact sizing: smaller ports and AP disc than the 36px / 1.0 defaults.
    '--udc-port-size': '26px',
    '--udc-ap-scale': '0.7'
};

interface CardTabProps {
    devicesArr: any[];
}

type CardElement = HTMLElement & { setConfig: (c: Record<string, unknown>) => void; hass: unknown };

const DeviceCard: React.FC<{ deviceId: string; hass: unknown; showPanel: boolean }> = ({ deviceId, hass, showPanel }) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<CardElement | null>(null);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const el = document.createElement('unifi-device-card') as CardElement;
        for (const [name, value] of Object.entries(THEME_VARS)) el.style.setProperty(name, value);
        el.setConfig({ type: 'custom:unifi-device-card', device_id: deviceId,
            show_panel: showPanel,
            // Up: slow blink. Port with traffic: faster blink. Kept calm on purpose.
            port_led_blink: true,
            port_led_blink_speed_rj45: 1,
            port_led_blink_speed_sfp: 1,
            port_led_traffic_blink_speed: 0.5
        });
        host.appendChild(el);
        cardRef.current = el;
        return () => {
            el.remove();
            cardRef.current = null;
        };
    }, [deviceId, showPanel]);

    useEffect(() => {
        if (cardRef.current) cardRef.current.hass = hass;
    });

    return <div ref={hostRef} />;
};

export const CardTab: React.FC<CardTabProps> = ({ devicesArr }) => {
    const { t, i18n } = useTranslation();
    const fetchPluginStats = usePluginStore((s) => s.fetchPluginStats);
    const [cardReady, setCardReady] = useState(false);
    // Realistic front panel (chassis drawn in the model's own colors) vs ports only.
    const [showPanel, setShowPanel] = useState(false);

    // The card is a plain custom element: load it only when this tab is opened.
    useEffect(() => {
        let cancelled = false;
        import('../../vendor/unifi-device-card/unifi-device-card.js').then(() => {
            if (!cancelled) setCardReady(true);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') void fetchPluginStats('unifi');
        }, LIVE_REFRESH_MS);
        return () => clearInterval(id);
    }, [fetchPluginStats]);

    const { hass, devices } = useMemo(
        () => createMynetworkHass(devicesArr, i18n.language?.slice(0, 2) || 'en'),
        [devicesArr, i18n.language]
    );

    if (devices.length === 0) {
        return <div className="text-center py-8 text-gray-500">{t('unifi.card.noDevice')}</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
                <p className="text-xs text-gray-500">{t('unifi.card.intro', { seconds: LIVE_REFRESH_MS / 1000 })}</p>
                <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input type="checkbox" checked={showPanel} onChange={(e) => setShowPanel(e.target.checked)} />
                    {t('unifi.card.hardwareView')}
                </label>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4 items-start">
            {devices.map((d: MnDevice) => (
                <Card key={d.id} title={d.name} className="min-w-0">
                    <div className="flex flex-wrap gap-2 text-xs mb-3">
                        <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300">{t('unifi.card.model')}: {d.model}</span>
                        <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300">{d.type}</span>
                        <span className={`px-2 py-0.5 rounded ${d.exact ? 'bg-green-900/50 text-green-300' : 'bg-amber-900/50 text-amber-300'}`}>
                            {d.exact ? t('unifi.card.exact', { key: d.modelKey }) : t('unifi.card.generic')}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300">{t('unifi.card.ports', { count: d.portCount })}</span>
                    </div>
                    {cardReady && <DeviceCard deviceId={d.id} hass={hass} showPanel={showPanel} />}
                </Card>
            ))}
            </div>
        </div>
    );
};
