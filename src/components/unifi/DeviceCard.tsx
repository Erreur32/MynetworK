import React, { useEffect, useRef, useState } from 'react';

// Maps the card's own palette onto the application theme variables, so it
// follows the dark/glass/modern themes instead of its built-in colors. Set on
// the element itself because the card's :host rule would otherwise win.
const COMPACT_PORT_SIZE = '22px';

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
    '--udc-ap-scale': '0.45'
};

type CardElement = HTMLElement & { setConfig: (c: Record<string, unknown>) => void; hass: unknown };

interface DeviceCardProps {
    deviceId: string;
    hass: unknown;
    height?: number;
    uplinkPort?: number;
    // Search page variant: no card title (the caller already shows the device name) and smaller ports.
    compact?: boolean;
}

// With a chosen height the card keeps its natural layout and is reduced
// proportionally to fit.
export const DeviceCard: React.FC<DeviceCardProps> = ({ deviceId, hass, height, uplinkPort, compact }) => {
    const outerRef = useRef<HTMLDivElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<CardElement | null>(null);
    const [naturalHeight, setNaturalHeight] = useState(0);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const el = document.createElement('unifi-device-card') as CardElement;
        for (const [name, value] of Object.entries(THEME_VARS)) el.style.setProperty(name, value);
        if (compact) el.style.setProperty('--udc-port-size', COMPACT_PORT_SIZE);
        el.setConfig({
            type: 'custom:unifi-device-card',
            device_id: deviceId,
            show_name: !compact,
            // Ports only: the realistic chassis view is not offered.
            show_panel: false,
            // Without a detected uplink, open on a connected special port (SFP+, 10G) instead of the first one.
            default_uplink_port: 'auto',
            // Manual choice; without it the card uses the uplink detected from the controller.
            ...(uplinkPort != null ? { uplink_port: uplinkPort } : {}),
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
    }, [deviceId, uplinkPort, compact]);

    useEffect(() => {
        if (cardRef.current) cardRef.current.hass = hass;
    });

    // transform does not change the layout box, so this keeps reporting the natural height.
    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const observer = new ResizeObserver(() => setNaturalHeight(host.offsetHeight));
        observer.observe(host);
        return () => observer.disconnect();
    }, []);

    // Uniform reduction: the whole card shrinks proportionally to fit the chosen
    // height (never enlarged, extra height is just empty space), no deformation.
    const scale = height != null && naturalHeight > 0 ? Math.min(1, height / naturalHeight) : 1;
    return (
        <div ref={outerRef} data-card-area className="relative" style={height != null ? { height, overflow: 'hidden' } : undefined}>
            <div
                ref={hostRef}
                style={scale < 1 ? { transform: `scale(${scale})`, transformOrigin: 'top center' } : undefined}
            />
        </div>
    );
};
