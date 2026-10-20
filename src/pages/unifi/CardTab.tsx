import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/widgets/Card';
import { usePluginStore } from '../../stores/pluginStore';
import { usePolling } from '../../hooks/usePolling';
import { GripVertical, RotateCcw } from 'lucide-react';
import { applyOrder, clampSpan, DEFAULT_SPAN, GRID_COLUMNS, useCardLayout } from './cardLayout';
import { DeviceCard } from '../../components/unifi/DeviceCard';
import { createMynetworkHass, mnDeviceId, type MnDevice } from '../../vendor/unifi-device-card/mynetwork-adapter';

const LIVE_REFRESH_MS = 5000;

const TYPE_RANK: Record<MnDevice['type'], number> = { gateway: 0, switch: 1, access_point: 2 };

interface CardTabProps {
    devicesArr: any[];
    // Extra content under each card, given the raw controller device and its card kind.
    renderDetails?: (device: any, kind: MnDevice['type']) => React.ReactNode;
}

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

export const CardTab: React.FC<CardTabProps> = ({ devicesArr, renderDetails }) => {
    const { t, i18n } = useTranslation();
    const fetchPluginStats = usePluginStore((s) => s.fetchPluginStats);
    const [cardReady, setCardReady] = useState(false);

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

    // Only UniFi stats poller while this tab is open (UniFiPage pauses its 30s poll).
    usePolling(() => fetchPluginStats('unifi'), { interval: LIVE_REFRESH_MS });

    const { hass, devices } = useMemo(
        () => createMynetworkHass(devicesArr, i18n.language?.slice(0, 2) || 'en'),
        [devicesArr, i18n.language]
    );

    const deviceIds = useMemo(() => devices.map((d: MnDevice) => d.id), [devices]);
    const rawById = useMemo(() => new Map(devicesArr.map((raw) => [mnDeviceId(raw), raw])), [devicesArr]);
    const { isDefault, order, spans, heights, uplinks, move, setSpan, setHeight, setUplink, reset } = useCardLayout(deviceIds);
    // Default order: gateway, then switches, then access points; a saved manual order wins.
    const orderedDevices = useMemo(
        () => applyOrder<MnDevice>([...devices].sort((a, b) => TYPE_RANK[a.type] - TYPE_RANK[b.type]), order),
        [devices, order]
    );
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
                {!isDefault && (
                    <button
                        type="button"
                        onClick={reset}
                        title={t('unifi.card.resetHint')}
                        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 bg-[#111827] text-xs text-gray-200 transition-colors hover:bg-[#1f2937] hover:border-gray-500"
                    >
                        <RotateCcw size={14} />
                        {t('unifi.card.resetLayout')}
                    </button>
                )}
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
                        height={heights[d.id]}
                        uplinkPort={uplinks[d.id]}
                    />}
                    {renderDetails && rawById.has(d.id) && renderDetails(rawById.get(d.id), d.type)}
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
