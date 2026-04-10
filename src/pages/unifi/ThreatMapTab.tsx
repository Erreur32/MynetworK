/**
 * ThreatMapTab — Leaflet map showing threat attack origins with clustering and animated arcs.
 * Inspired by LogviewR's fail2ban/TabMap component.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

// Fix Leaflet default marker icons broken by Vite's asset hashing
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

import { useTranslation } from 'react-i18next';
import { Map as MapIcon, Zap, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { api } from '../../api/client';
import type { ThreatData } from './types';

// ── Types ────────────────────────────────────────────────────────────────────
interface GeoData {
    lat: number; lng: number; country: string; countryCode: string;
    region: string; city: string; org: string;
}

interface ThreatMapTabProps {
    threatData: ThreatData | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** HSL heat color based on count */
function heatColor(n: number, min: number, max: number): string {
    const t = max <= min ? 1 : Math.max(0, Math.min(1, (n - min) / (max - min)));
    const hue = 14 + t * 12;
    const sat = Math.round(36 + t * 56);
    const light = Math.round(76 - t * 42);
    return `hsl(${hue.toFixed(1)},${sat}%,${light}%)`;
}

/** Flag img HTML for popups */
function flagImgHtml(code: string): string {
    const c = (code || '').toLowerCase().replace(/[^a-z]/g, '');
    const src = c.length === 2 ? `/svg/flag-${c}.svg` : '/svg/flag-xx.svg';
    return `<img src="${src}" width="20" height="15" style="vertical-align:middle;border-radius:2px;margin-right:.3rem" alt="${c.toUpperCase()}" onerror="this.src='/svg/flag-xx.svg'">`;
}

// ── Component ────────────────────────────────────────────────────────────────
export const ThreatMapTab: React.FC<ThreatMapTabProps> = ({ threatData }) => {
    const { t } = useTranslation();
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const clusterRef = useRef<any>(null);
    const markerByIp = useRef<Map<string, any>>(new Map());
    const metaByIp = useRef<Map<string, { country: string; countryCode: string; count: number }>>(new Map());
    const attackLinesRef = useRef<any[]>([]);

    const [mapReady, setMapReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [resolved, setResolved] = useState(0);
    const [totalIps, setTotalIps] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [liveMode, setLiveMode] = useState(false);
    const [serverGeo, setServerGeo] = useState<{ lat: number; lng: number; country: string; city: string } | null>(null);
    const [asideOpen, setAsideOpen] = useState(true);
    const [filterCountry, setFilterCountry] = useState('');
    const [countryStats, setCountryStats] = useState<Record<string, { count: number; code: string }>>({});

    const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Inject dark popup CSS once ────────────────────────────────────────────
    useEffect(() => {
        if (!document.getElementById('unifi-map-popup-style')) {
            const s = document.createElement('style');
            s.id = 'unifi-map-popup-style';
            s.textContent = `
                @keyframes unifi-attack-fly {
                    0%   { stroke-dashoffset: 1000; opacity: 0; }
                    6%   { opacity: 0.9; }
                    75%  { opacity: 0.8; }
                    100% { stroke-dashoffset: 0; opacity: 0; }
                }
                @keyframes unifi-pulse-ring {
                    0%   { transform: scale(1); opacity: 0.8; }
                    100% { transform: scale(2.5); opacity: 0; }
                }
                .unifi-map-popup .leaflet-popup-content-wrapper {
                    background: #161b22; border: 1px solid #30363d;
                    border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,.6);
                    color: #e6edf3; padding: 0;
                }
                .unifi-map-popup .leaflet-popup-content { margin: 0; padding: .75rem .85rem; }
                .unifi-map-popup .leaflet-popup-tip { background: #30363d; }
                .unifi-map-popup .leaflet-popup-close-button { color: #8b949e !important; font-size: 16px; top: 6px !important; right: 8px !important; }
                .unifi-map-popup .leaflet-popup-close-button:hover { color: #e6edf3 !important; }
            `;
            document.head.appendChild(s);
        }
        setMapReady(true);
    }, []);

    // ── Init map (once) ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!mapReady || !mapContainerRef.current || mapRef.current) return;
        try {
            const map = L.map(mapContainerRef.current, { zoomControl: true }).setView([26, 12], 3);
            mapRef.current = map;
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
                subdomains: 'abcd', maxZoom: 20,
            }).addTo(map);
            const MCG = (L as any).markerClusterGroup ?? (window as any).L?.markerClusterGroup;
            if (!MCG) { setError('MarkerCluster not available'); return; }
            clusterRef.current = MCG({ chunkedLoading: true, spiderfyOnMaxZoom: true, showCoverageOnHover: false });
            map.addLayer(clusterRef.current);
            requestAnimationFrame(() => map.invalidateSize({ animate: false }));
            setTimeout(() => map.invalidateSize({ animate: false }), 400);
            const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
            if (mapContainerRef.current) ro.observe(mapContainerRef.current);
            return () => { ro.disconnect(); };
        } catch (e) {
            setError(`Leaflet error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }, [mapReady]);

    // ── Build country stats ───────────────────────────────────────────────────
    const rebuildStats = useCallback(() => {
        const stats: Record<string, { count: number; code: string }> = {};
        for (const [, meta] of metaByIp.current) {
            const c = meta.country || '??';
            if (!stats[c]) stats[c] = { count: 0, code: meta.countryCode };
            stats[c].count++;
        }
        setCountryStats(stats);
    }, []);

    // ── Apply country filter ──────────────────────────────────────────────────
    const applyFilter = useCallback((country: string) => {
        if (!clusterRef.current) return;
        clusterRef.current.clearLayers();
        for (const [ip, marker] of markerByIp.current) {
            const meta = metaByIp.current.get(ip);
            if (!meta) continue;
            if (country && meta.country !== country) continue;
            clusterRef.current.addLayer(marker);
        }
    }, []);

    // ── Add a marker for an IP ────────────────────────────────────────────────
    const addMarker = useCallback((ip: string, geo: GeoData, count: number, flows: any[]) => {
        if (!mapRef.current || markerByIp.current.has(ip)) return;

        const color = heatColor(count, 1, 10);
        const circleIcon = L.divIcon({
            className: '',
            html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid rgba(232,106,101,.6);box-shadow:0 0 6px ${color}"></div>`,
            iconSize: [10, 10], iconAnchor: [5, 5],
        });
        const marker = L.marker([geo.lat, geo.lng], { icon: circleIcon, title: ip });

        const loc = [geo.city, geo.region, geo.country].filter(Boolean).join(', ') || '—';
        const levelBadges = flows.slice(0, 3).map(f => {
            const col = f.threatLevel === 'CONCERNING' ? '#ef4444' : f.threatLevel === 'SUSPICIOUS' ? '#f59e0b' : '#3b82f6';
            return `<span style="display:inline-block;padding:.1rem .3rem;border-radius:3px;font-size:.6rem;background:${col}22;color:${col};border:1px solid ${col}44;margin:.1rem">${f.threatLevel}</span>`;
        }).join(' ');

        const popupHtml = `
            <div style="min-width:220px;font-family:system-ui,sans-serif">
                <div style="font-family:monospace;font-weight:700;color:#e86a65;font-size:.9rem;margin-bottom:.35rem">${ip}</div>
                <div style="font-size:.78rem;color:#e6edf3;margin-bottom:.25rem;display:flex;align-items:center;gap:.3rem">${flagImgHtml(geo.countryCode)}${loc}</div>
                ${geo.org ? `<div style="font-size:.72rem;color:#8b949e;margin-bottom:.35rem">${geo.org}</div>` : ''}
                <div style="font-size:.72rem;color:#e6edf3;margin-bottom:.25rem"><strong>${count}</strong> threat${count > 1 ? 's' : ''} detected</div>
                <div style="margin-bottom:.3rem">${levelBadges}</div>
                ${flows[0]?.policy ? `<div style="font-size:.68rem;color:#8b949e;margin-top:.2rem">Signature: ${flows[0].policy}</div>` : ''}
            </div>`;
        marker.bindPopup(popupHtml, { maxWidth: 300, className: 'unifi-map-popup' });

        metaByIp.current.set(ip, { country: geo.country, countryCode: geo.countryCode, count });
        markerByIp.current.set(ip, marker);
    }, []);

    // ── Resolve IPs from threat data and place markers ────────────────────────
    useEffect(() => {
        if (!mapReady || !mapRef.current || !threatData?.available || !threatData.recentFlows.length) {
            setLoading(false);
            return;
        }
        if (liveMode) return; // live mode handles its own markers

        setLoading(true);
        // Group flows by source IP
        const ipFlows = new Map<string, any[]>();
        for (const f of threatData.recentFlows) {
            const ip = f.srcIp;
            if (!ip || /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|127\.)/.test(ip)) continue;
            if (!ipFlows.has(ip)) ipFlows.set(ip, []);
            ipFlows.get(ip)!.push(f);
        }

        const uniqueIps = [...ipFlows.keys()];
        setTotalIps(uniqueIps.length);
        setResolved(0);

        // Clear old markers
        markerByIp.current.clear();
        metaByIp.current.clear();
        if (clusterRef.current) clusterRef.current.clearLayers();

        if (uniqueIps.length === 0) { setLoading(false); return; }

        // Batch resolve in groups of 15
        let resolvedCount = 0;
        const batches: string[][] = [];
        for (let i = 0; i < uniqueIps.length; i += 15) {
            batches.push(uniqueIps.slice(i, i + 15));
        }

        let batchIdx = 0;
        const processBatch = () => {
            if (batchIdx >= batches.length) {
                setLoading(false);
                rebuildStats();
                return;
            }
            const batch = batches[batchIdx++];
            api.post<Record<string, any>>('/api/plugins/unifi/threats/geo/batch', { ips: batch })
                .then(res => {
                    if (res.success && res.result) {
                        for (const [ip, geo] of Object.entries(res.result)) {
                            if (geo.ok && typeof geo.lat === 'number') {
                                const flows = ipFlows.get(ip) || [];
                                addMarker(ip, geo as GeoData, flows.length, flows);
                                if (clusterRef.current) {
                                    const m = markerByIp.current.get(ip);
                                    if (m) clusterRef.current.addLayer(m);
                                }
                                resolvedCount++;
                                setResolved(resolvedCount);
                            }
                        }
                        rebuildStats();
                    }
                })
                .finally(() => {
                    // Delay between batches to respect ip-api rate limits
                    setTimeout(processBatch, 400);
                });
        };
        processBatch();
    }, [mapReady, threatData, liveMode, addMarker, rebuildStats]);

    // ── Live attack mode: animated arcs ───────────────────────────────────────
    const ensureArrowMarker = useCallback(() => {
        if (!mapRef.current) return;
        const overlayPane = mapRef.current.getPanes().overlayPane as HTMLElement;
        const svg = overlayPane.querySelector('svg');
        if (!svg || svg.querySelector('#unifi-arrow')) return;
        const ns = 'http://www.w3.org/2000/svg';
        const defs = document.createElementNS(ns, 'defs');
        const mkr = document.createElementNS(ns, 'marker');
        mkr.setAttribute('id', 'unifi-arrow');
        mkr.setAttribute('markerWidth', '6');
        mkr.setAttribute('markerHeight', '6');
        mkr.setAttribute('refX', '5');
        mkr.setAttribute('refY', '3');
        mkr.setAttribute('orient', 'auto');
        mkr.setAttribute('markerUnits', 'strokeWidth');
        const arrowTip = document.createElementNS(ns, 'path');
        arrowTip.setAttribute('d', 'M0,0 L0,6 L6,3 z');
        arrowTip.setAttribute('fill', 'rgba(232,106,101,0.9)');
        mkr.appendChild(arrowTip);
        defs.appendChild(mkr);
        svg.prepend(defs);
    }, []);

    const drawAttackArc = useCallback((srcLat: number, srcLng: number, ip: string, level: string) => {
        if (!mapRef.current || !serverGeo) return;
        ensureArrowMarker();

        const src = L.latLng(srcLat, srcLng);
        const dst = L.latLng(serverGeo.lat, serverGeo.lng);

        const arcColor = level === 'CONCERNING' ? '#ef4444' : level === 'SUSPICIOUS' ? '#f59e0b' : '#3b82f6';

        const line = L.polyline([src, dst], { color: arcColor, weight: 2, opacity: 0 } as any);
        line.addTo(mapRef.current);

        requestAnimationFrame(() => {
            const el = (line as any).getElement() as SVGElement | null;
            if (!el) return;
            el.setAttribute('stroke', arcColor);
            el.setAttribute('stroke-width', '2');
            el.setAttribute('stroke-dasharray', '1000');
            el.setAttribute('stroke-dashoffset', '1000');
            el.setAttribute('marker-end', 'url(#unifi-arrow)');
            el.setAttribute('fill', 'none');
            el.style.cssText = `stroke-dasharray:1000;stroke-dashoffset:1000;animation:unifi-attack-fly 2.5s ease-out forwards;`;
        });

        // Pulsing origin dot
        const dotColor = arcColor;
        const dotDiv = document.createElement('div');
        dotDiv.style.cssText = `width:12px;height:12px;border-radius:50%;background:${dotColor}dd;border:2px solid ${dotColor};position:relative;`;
        const ring1 = document.createElement('div');
        ring1.style.cssText = `position:absolute;inset:-5px;border-radius:50%;border:2px solid ${dotColor}80;animation:unifi-pulse-ring 1.2s ease-out infinite;`;
        const ring2 = document.createElement('div');
        ring2.style.cssText = `position:absolute;inset:-10px;border-radius:50%;border:1px solid ${dotColor}40;animation:unifi-pulse-ring 1.2s ease-out 0.4s infinite;`;
        dotDiv.appendChild(ring1);
        dotDiv.appendChild(ring2);

        const pulseIcon = L.divIcon({ className: '', html: dotDiv.outerHTML, iconSize: [12, 12], iconAnchor: [6, 6] });
        const dot = L.marker(src, { icon: pulseIcon, interactive: false });
        dot.addTo(mapRef.current);

        attackLinesRef.current.push(line, dot);
        setTimeout(() => { if (mapRef.current) line.remove(); attackLinesRef.current = attackLinesRef.current.filter(l => l !== line); }, 2700);
        setTimeout(() => { if (mapRef.current) dot.remove(); attackLinesRef.current = attackLinesRef.current.filter(l => l !== dot); }, 6000);
    }, [serverGeo, ensureArrowMarker]);

    // ── Live mode: replay recent flows as arcs ────────────────────────────────
    const replayFlows = useCallback(() => {
        if (!threatData?.recentFlows?.length || !serverGeo) return;

        // For each flow with a known geo, draw an arc
        const flows = threatData.recentFlows.slice(0, 20); // Latest 20
        const ipGeoMap = new Map<string, GeoData>();

        // Collect IPs we already resolved
        for (const [ip] of markerByIp.current) {
            const meta = metaByIp.current.get(ip);
            if (meta) {
                const marker = markerByIp.current.get(ip);
                if (marker) {
                    const latlng = marker.getLatLng();
                    ipGeoMap.set(ip, { lat: latlng.lat, lng: latlng.lng, country: meta.country, countryCode: meta.countryCode, region: '', city: '', org: '' });
                }
            }
        }

        let delay = 0;
        for (const f of flows) {
            const geo = f.srcIp ? ipGeoMap.get(f.srcIp) : null;
            if (geo) {
                setTimeout(() => drawAttackArc(geo.lat, geo.lng, f.srcIp || '', f.threatLevel), delay);
                delay += 300;
            }
        }
    }, [threatData, serverGeo, drawAttackArc]);

    useEffect(() => {
        if (!liveMode) {
            if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
            attackLinesRef.current.forEach(l => { try { l.remove(); } catch { /* */ } });
            attackLinesRef.current = [];
            // Restore cluster markers
            if (clusterRef.current) {
                clusterRef.current.clearLayers();
                for (const [, marker] of markerByIp.current) clusterRef.current.addLayer(marker);
            }
            return;
        }

        // Clear cluster in live mode
        if (clusterRef.current) clusterRef.current.clearLayers();

        // Fetch server geo
        if (!serverGeo) {
            api.get<any>('/api/plugins/unifi/threats/server-geo')
                .then(res => {
                    if (res.success && res.result?.ok) {
                        setServerGeo({ lat: res.result.lat, lng: res.result.lng, country: res.result.country || '', city: res.result.city || '' });
                    }
                })
                .catch(() => {});
        }

        // Replay arcs periodically
        const timer = setInterval(replayFlows, 8000);
        liveIntervalRef.current = timer;
        // Initial replay after a short delay
        setTimeout(replayFlows, 500);
        return () => clearInterval(timer);
    }, [liveMode]); // eslint-disable-line react-hooks/exhaustive-deps

    // Re-run replay when serverGeo becomes available
    useEffect(() => {
        if (liveMode && serverGeo) replayFlows();
    }, [serverGeo]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Filter handler ────────────────────────────────────────────────────────
    const handleCountryClick = useCallback((country: string) => {
        const next = filterCountry === country ? '' : country;
        setFilterCountry(next);
        applyFilter(next);
        if (next && mapRef.current) {
            const bounds = L.latLngBounds([]);
            for (const [ip, marker] of markerByIp.current) {
                const meta = metaByIp.current.get(ip);
                if (meta?.country === next) bounds.extend(marker.getLatLng());
            }
            if (bounds.isValid()) mapRef.current.fitBounds(bounds.pad(0.12));
        }
    }, [filterCountry, applyFilter]);

    const handleReset = useCallback(() => {
        setFilterCountry('');
        applyFilter('');
        rebuildStats();
        mapRef.current?.setView([26, 12], 3);
    }, [applyFilter, rebuildStats]);

    // ── Render ────────────────────────────────────────────────────────────────
    if (error) return <div className="p-8 text-red-400 text-sm">{error}</div>;

    const countryCodes = Object.entries(countryStats).sort((a, b) => b[1].count - a[1].count);
    const cVals = countryCodes.map(([, v]) => v.count);
    const minC = Math.min(...cVals, 0);
    const maxC = Math.max(...cVals, 1);

    return (
        <div className="flex flex-col gap-3" style={{ height: 'calc(100vh - 240px)', overflow: 'hidden' }}>
            {/* Top bar */}
            <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
                <MapIcon size={15} className="text-sky-400" />
                <span className="font-semibold text-[.88rem] text-sky-400">
                    {loading ? t('unifi.threats.mapLoading') : liveMode ? t('unifi.threats.mapLiveMode') : `${totalIps} ${t('unifi.threats.mapIpsOnMap')}`}
                </span>

                {!liveMode && !loading && totalIps > 0 && resolved < totalIps && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-900/20 border border-amber-800/30 text-[.72rem] text-amber-400 font-semibold">
                        {resolved}/{totalIps}
                    </span>
                )}
                {!liveMode && !loading && resolved >= totalIps && totalIps > 0 && (
                    <span className="text-[.72rem] text-green-400">&#10003; {totalIps} geolocated</span>
                )}

                {liveMode && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-900/10 border border-red-800/25">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" style={{ animation: 'unifi-pulse-ring .9s ease-out infinite' }} />
                        <span className="text-[.72rem] text-red-400 font-bold">{t('unifi.threats.mapLiveActive')}</span>
                    </span>
                )}

                <div className="flex-1" />

                {/* Live toggle */}
                <button
                    onClick={() => setLiveMode(m => !m)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[.72rem] rounded-md cursor-pointer font-bold border transition-colors ${
                        liveMode
                            ? 'border-red-800/60 bg-red-900/20 text-red-400'
                            : 'border-gray-700 bg-[#21262d] text-gray-400 hover:text-gray-200'
                    }`}
                >
                    <Zap size={12} />
                    Live
                </button>

                {/* Sidebar toggle */}
                <button
                    onClick={() => setAsideOpen(v => !v)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[.72rem] rounded-md border border-gray-700 bg-[#21262d] text-gray-400 hover:text-gray-200"
                >
                    <SlidersHorizontal size={12} />
                </button>

                {/* Reset */}
                <button
                    onClick={handleReset}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[.72rem] rounded-md border border-gray-700 bg-[#21262d] text-gray-400 hover:text-gray-200"
                >
                    <RotateCcw size={12} />
                </button>
            </div>

            {/* Map + sidebar */}
            <div className="flex flex-1 gap-3 min-h-0">
                {/* Map canvas */}
                <div className="flex-1 rounded-xl overflow-hidden border border-gray-800">
                    <div ref={mapContainerRef} className="w-full h-full" style={{ background: '#0d1117' }} />
                </div>

                {/* Country sidebar */}
                {asideOpen && countryCodes.length > 0 && (
                    <div className="w-[200px] flex-shrink-0 bg-[#0d1117] border border-gray-800 rounded-xl overflow-y-auto p-3 space-y-1" style={{ opacity: liveMode ? 0.3 : 1, pointerEvents: liveMode ? 'none' : 'auto' }}>
                        <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2 font-semibold">
                            {t('unifi.threats.mapCountries')}
                        </div>
                        {countryCodes.map(([country, { count, code }]) => (
                            <button
                                key={country}
                                onClick={() => handleCountryClick(country)}
                                className={`w-full flex items-center justify-between px-2 py-1 rounded text-[.72rem] transition-colors ${
                                    filterCountry === country
                                        ? 'bg-sky-900/30 text-sky-300 border border-sky-800/40'
                                        : 'text-gray-400 hover:text-gray-200 hover:bg-[#161b22] border border-transparent'
                                }`}
                            >
                                <span className="inline-flex items-center gap-1.5 truncate">
                                    <img
                                        src={`/svg/flag-${(code || '').toLowerCase()}.svg`}
                                        alt={code}
                                        className="w-4 h-3 object-cover rounded-[1px] shrink-0"
                                        onError={(e) => { (e.target as HTMLImageElement).src = '/svg/flag-xx.svg'; }}
                                    />
                                    <span className="truncate">{country}</span>
                                </span>
                                <span className="font-mono font-bold ml-2 shrink-0" style={{ color: heatColor(count, minC, maxC) }}>
                                    {count}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
