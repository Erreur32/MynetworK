import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/widgets/Card';
import { usePluginStore } from '../../stores/pluginStore';
import { GripVertical, RotateCcw } from 'lucide-react';
import { applyOrder, clampSpan, DEFAULT_SPAN, GRID_COLUMNS, useCardLayout } from './cardLayout';
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
    '--udc-ap-scale': '0.45'
};

interface CardTabProps {
    devicesArr: any[];
}

type CardElement = HTMLElement & { setConfig: (c: Record<string, unknown>) => void; hass: unknown };

interface DeviceCardProps {
    deviceId: string;
    hass: unknown;
    showPanel: boolean;
    height?: number;
    uplinkPort?: number;
}

// With a chosen height the card keeps its natural layout and is reduced
// proportionally to fit.
const DeviceCard: React.FC<DeviceCardProps> = ({ deviceId, hass, showPanel, height, uplinkPort }) => {
    const outerRef = useRef<HTMLDivElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<CardElement | null>(null);
    const [naturalHeight, setNaturalHeight] = useState(0);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const el = document.createElement('unifi-device-card') as CardElement;
        for (const [name, value] of Object.entries(THEME_VARS)) el.style.setProperty(name, value);
        el.setConfig({
            type: 'custom:unifi-device-card',
            device_id: deviceId,
            show_panel: showPanel,
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
    }, [deviceId, showPanel, uplinkPort]);

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

// Spans only apply from the md breakpoint up; below it the cards stack full width.
function useIsWide(): boolean {
    const query = '(min-width: 768px)';
    const [wide, setWide] = useState(() => window.matchMedia(query).matches);
    useEffect(() => {
        const mql = window.matchMedia(query);
        const onChange = () => setWide(mql.matches);
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, []);
    return wide;
}

export const CardTab: React.FC<CardTabProps> = ({ devicesArr }) => {
    const { t, i18n } = useTranslation();
    const fetchPluginStats = usePluginStore((s) => s.fetchPluginStats);
    const [cardReady, setCardReady] = useState(false);
    // Realistic front panel (chassis drawn in the model's own colors) vs ports only.
    const [showPanel, setShowPanel] = useState(false);

    // The card is a plain custom element: load it only when this tab is opened.
    useEffect(() => {
        let cancelled = false;
        import('../../vendor/unifi-device-card/unifi-device-card.js')
            .then(() => {
                if (!cancelled) setCardReady(true);
            })
            .catch((error: unknown) => {
                console.error('Failed to load the device card component', error);
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

    const deviceIds = useMemo(() => devices.map((d: MnDevice) => d.id), [devices]);
    const { order, spans, heights, uplinks, move, setSpan, setHeight, setUplink, reset } = useCardLayout(deviceIds);
    const orderedDevices = useMemo(() => applyOrder<MnDevice>(devices, order), [devices, order]);
    const isWide = useIsWide();
    const gridRef = useRef<HTMLDivElement>(null);
    const [draggedId, setDraggedId] = useState<string | null>(null);

    // Width follows the mouse: the span is the pointer position relative to the card's left edge, in grid columns.
    // Pointer capture on the grabbed handle, then forward every move until release.
    const trackPointer = useCallback((e: React.PointerEvent<HTMLDivElement>, onMove: (ev: PointerEvent) => void) => {
        e.preventDefault();
        const handle = e.currentTarget;
        handle.setPointerCapture(e.pointerId);
        const onUp = () => {
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
        };
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
    }, []);

    // Width: the span follows the pointer relative to the card's left edge, in grid columns.
    const resizeWidth = useCallback((card: Element, id: string) => {
        const grid = gridRef.current;
        if (!grid) return () => undefined;
        const columnWidth = grid.getBoundingClientRect().width / GRID_COLUMNS;
        const left = card.getBoundingClientRect().left;
        return (ev: PointerEvent) => setSpan(id, (ev.clientX - left) / columnWidth);
    }, [setSpan]);

    // Height: the card area's bottom edge follows the pointer.
    const resizeHeight = useCallback((card: Element, id: string, startY: number) => {
        const area = card.querySelector('[data-card-area]');
        if (!area) return () => undefined;
        const rect = area.getBoundingClientRect();
        const offset = rect.bottom - startY;
        return (ev: PointerEvent) => setHeight(id, ev.clientY + offset - rect.top);
    }, [setHeight]);

    const startResize = useCallback((e: React.PointerEvent<HTMLDivElement>, id: string, axis: 'width' | 'height' | 'both') => {
        const card = e.currentTarget.parentElement;
        if (!card) return;
        const moveWidth = axis !== 'height' ? resizeWidth(card, id) : null;
        const moveHeight = axis !== 'width' ? resizeHeight(card, id, e.clientY) : null;
        trackPointer(e, (ev) => {
            moveWidth?.(ev);
            moveHeight?.(ev);
        });
    }, [resizeWidth, resizeHeight, trackPointer]);

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
                <button type="button" onClick={reset} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200">
                    <RotateCcw size={12} />
                    {t('unifi.card.resetLayout')}
                </button>
            </div>
            <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
            {orderedDevices.map((d: MnDevice) => (
                <div
                    key={d.id}
                    className={`relative min-w-0 ${draggedId === d.id ? 'opacity-50' : ''}`}
                    style={isWide ? { gridColumn: `span ${clampSpan(spans[d.id] ?? DEFAULT_SPAN)}` } : undefined}
                    onDragOver={(e) => { if (draggedId) e.preventDefault(); }}
                    onDrop={(e) => {
                        e.preventDefault();
                        if (draggedId) move(draggedId, d.id);
                        setDraggedId(null);
                    }}
                >
                <span
                    draggable
                    title={t('unifi.card.dragHint')}
                    className="absolute top-3 right-4 z-10 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-200"
                    onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', d.id);
                        setDraggedId(d.id);
                    }}
                    onDragEnd={() => setDraggedId(null)}
                >
                    <GripVertical size={18} />
                </span>
                <Card
                    title={
                        <span className="flex flex-wrap items-center gap-3">
                            {d.name}
                            {d.type !== 'access_point' && d.ports.length > 0 && (
                                <label className="flex items-center gap-1 px-2 py-0.5 rounded bg-gray-700 text-gray-300 border border-blue-500/70 text-xs font-normal">
                                        {t('unifi.card.uplink')}
                                        <select
                                            className="bg-transparent text-gray-200 outline-none"
                                            value={uplinks[d.id] ?? ''}
                                            onChange={(e) => setUplink(d.id, e.target.value === '' ? null : Number(e.target.value))}
                                        >
                                            <option value="">
                                                {d.uplinkPort != null
                                                    ? t('unifi.card.uplinkAuto', { port: d.uplinkPort })
                                                    : t('unifi.card.uplinkAutoNone')}
                                            </option>
                                            {d.ports.map((n) => (
                                                <option key={n} value={n}>{n}</option>
                                            ))}
                                        </select>
                                </label>
                            )}
                        </span>
                    }
                    className="min-w-0"
                >
                    <div className="flex flex-wrap gap-2 text-xs mb-3">
                        <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300">{t('unifi.card.model')}: {d.model}</span>
                        <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300">{d.type}</span>
                        <span className={`px-2 py-0.5 rounded ${d.exact ? 'bg-green-900/50 text-green-300' : 'bg-amber-900/50 text-amber-300'}`}>
                            {d.exact ? t('unifi.card.exact', { key: d.modelKey }) : t('unifi.card.generic')}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300">{t('unifi.card.ports', { count: d.portCount })}</span>
                    </div>
                    {cardReady && <DeviceCard
                        deviceId={d.id}
                        hass={hass}
                        showPanel={showPanel}
                        height={heights[d.id]}
                        uplinkPort={uplinks[d.id]}
                    />}
                </Card>
                {/* The whole lower border is the height handle */}
                <div
                    title={t('unifi.card.heightHint')}
                    className="absolute bottom-0 left-0 w-full h-2 rounded-b-xl cursor-ns-resize hover:bg-blue-500/30"
                    onPointerDown={(e) => startResize(e, d.id, 'height')}
                    onDoubleClick={() => setHeight(d.id, null)}
                />
                {isWide && (
                    <div
                        title={t('unifi.card.resizeHint')}
                        className="absolute top-0 right-0 h-full w-2 cursor-ew-resize hover:bg-blue-500/30 rounded-r-xl"
                        onPointerDown={(e) => startResize(e, d.id, 'width')}
                    />
                )}
                {isWide && (
                    <div
                        title={t('unifi.card.cornerHint')}
                        className="absolute bottom-1 right-1 z-20 w-4 h-4 cursor-nwse-resize text-gray-500 hover:text-blue-400"
                        onPointerDown={(e) => startResize(e, d.id, 'both')}
                        onDoubleClick={() => { setHeight(d.id, null); setSpan(d.id, DEFAULT_SPAN); }}
                    >
                        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                            <path d="M14 6 6 14M14 10l-4 4M14 2 2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                        </svg>
                    </div>
                )}
                </div>
            ))}
            </div>
        </div>
    );
};
