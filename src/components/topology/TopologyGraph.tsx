/**
 * Topology graph viewer powered by React Flow + dagre layout.
 * Renders the snapshot returned by /api/topology with custom nodes/edges,
 * a side panel for the selected node and pan/zoom/mini-map controls.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    type Edge,
    type Node,
    type EdgeMarkerType,
    type ReactFlowInstance,
    MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTranslation } from 'react-i18next';
import { X, Cable, Wifi, Link2, Tag, Hash, Building2, GitBranch, MoveHorizontal, Boxes, Filter as FilterIcon, Router as RouterIcon, Server, Repeat, Smartphone, HelpCircle, Maximize2, CircleDot, CircleOff, ChevronDown, ChevronUp, Info, RotateCcw, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Lock, Unlock, Download, Image as ImageIcon, FileText, FileCode, Braces } from 'lucide-react';
import { api } from '../../api/client';
import { toPng, toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { TopologyNodeCard, type TopologyNodeData } from './TopologyNodeCard';
import { TopologyGroupNode } from './TopologyGroupNode';
import { layoutGraph, type LayoutMode } from './topologyLayout';

type SourcePlugin = 'freebox' | 'unifi' | 'scan-reseau';
type EdgeMedium = 'ethernet' | 'wifi' | 'uplink';
type NodeKind = 'gateway' | 'switch' | 'ap' | 'repeater' | 'client' | 'unknown';

interface TopologyNodeIn {
    id: string;
    kind: NodeKind;
    label: string;
    ip?: string;
    mac?: string;
    vendor?: string;
    sources: SourcePlugin[];
    metadata?: {
        active?: boolean;
        ssid?: string;
        band?: string;
        signal?: number;
        model?: string;
        host_type?: string;
        ports?: Array<{ idx: number; name?: string; up: boolean; speed?: number; poe?: boolean; media?: string; uplink?: boolean }>;
        localUplinkPortIdx?: number;
    };
}

interface TopologyEdgeIn {
    id: string;
    source: string;
    target: string;
    medium: EdgeMedium;
    linkSpeedMbps?: number;
    portIndex?: number;
    localPortIndex?: number;
    ssid?: string;
    band?: string;
    signal?: number;
    source_plugin: SourcePlugin;
}

export interface TopologyGraphInput {
    nodes: TopologyNodeIn[];
    edges: TopologyEdgeIn[];
}

interface TopologyGraphProps {
    graph: TopologyGraphInput;
    height?: string;
}

// Edge palette deliberately picked to avoid clashing with the node tints
// (gateway=amber, switch=emerald, AP=sky, repeater=purple).
const EDGE_COLOR: Record<EdgeMedium, string> = {
    ethernet: '#a3e635', // lime — distinct from emerald switches
    wifi: '#f472b6',     // pink — distinct from sky APs and purple repeaters
    uplink: '#a78bfa'    // violet/mauve — distinct from amber gateways
};

const nodeTypes = { topology: TopologyNodeCard, topologyGroup: TopologyGroupNode };

const LAYOUT_MODES: Array<{ id: LayoutMode; icon: React.ElementType; key: string }> = [
    { id: 'grouped',    icon: Boxes,           key: 'grouped' },
    { id: 'tree',       icon: GitBranch,       key: 'tree' },
    { id: 'horizontal', icon: MoveHorizontal,  key: 'horizontal' }
];

const NODE_KIND_LEGEND: Array<{ id: NodeKind; bar: string }> = [
    { id: 'gateway',  bar: 'bg-amber-400' },
    { id: 'switch',   bar: 'bg-emerald-400' },
    { id: 'ap',       bar: 'bg-sky-400' },
    { id: 'repeater', bar: 'bg-purple-400' },
    { id: 'client',   bar: 'bg-slate-400' },
    { id: 'unknown',  bar: 'bg-slate-500' }
];

const ALL_SOURCES: SourcePlugin[] = ['freebox', 'unifi', 'scan-reseau'];
const ALL_KINDS: NodeKind[] = ['gateway', 'switch', 'ap', 'repeater', 'client', 'unknown'];

type Status = 'online' | 'offline' | 'stale';
const ALL_STATUS: Status[] = ['online', 'offline', 'stale'];
const DEFAULT_STATUS: Status[] = ['online', 'offline']; // hide stale Freebox cache by default; online + offline both visible

const STATUS_CHIP: Record<Status, { icon: React.ElementType; activeBg: string }> = {
    online:  { icon: CircleDot, activeBg: 'bg-emerald-500/25 border-emerald-400/50 text-emerald-100' },
    offline: { icon: CircleOff, activeBg: 'bg-rose-500/25 border-rose-400/50 text-rose-100' },
    stale:   { icon: CircleOff, activeBg: 'bg-slate-500/25 border-slate-400/50 text-slate-200' }
};

function classifyStatus(node: { sources: SourcePlugin[]; metadata?: { active?: boolean } }): Status {
    if (node.metadata?.active !== false) return 'online';
    // Offline + only seen by Freebox → likely stale Freebox cache
    if (node.sources.length === 1 && node.sources[0] === 'freebox') return 'stale';
    return 'offline';
}

const SOURCE_CHIP: Record<SourcePlugin, { label: string; activeBg: string; dot: string }> = {
    freebox:       { label: 'Freebox', activeBg: 'bg-red-500/25 border-red-400/50 text-red-100',         dot: 'bg-red-400' },
    unifi:         { label: 'UniFi',   activeBg: 'bg-sky-500/25 border-sky-400/50 text-sky-100',         dot: 'bg-sky-400' },
    'scan-reseau': { label: 'Scan',    activeBg: 'bg-emerald-500/25 border-emerald-400/50 text-emerald-100', dot: 'bg-emerald-400' }
};

const KIND_CHIP: Record<NodeKind, { icon: React.ElementType; activeBg: string }> = {
    gateway:  { icon: RouterIcon, activeBg: 'bg-amber-500/25 border-amber-400/50 text-amber-100' },
    switch:   { icon: Server,     activeBg: 'bg-emerald-500/25 border-emerald-400/50 text-emerald-100' },
    ap:       { icon: Wifi,       activeBg: 'bg-sky-500/25 border-sky-400/50 text-sky-100' },
    repeater: { icon: Repeat,     activeBg: 'bg-purple-500/25 border-purple-400/50 text-purple-100' },
    client:   { icon: Smartphone, activeBg: 'bg-slate-500/25 border-slate-400/50 text-slate-100' },
    unknown:  { icon: HelpCircle, activeBg: 'bg-slate-600/25 border-slate-500/50 text-slate-200' }
};

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
}

// Edge styling helpers — flatten the per-edge nested ternaries.
function pickEdgeDashArray(isWifi: boolean, _isUplink: boolean): string | undefined {
    // Only Wi-Fi gets the dashed (animated) look. Uplinks and ethernet are
    // solid — uplinks just stand out via colour (mauve) and stroke width.
    if (isWifi) return '5 4';
    return undefined;
}

function pickEdgeStrokeWidth(isUplink: boolean, isWifi: boolean): number {
    if (isUplink) return 2.5;
    if (isWifi) return 1.8;
    return 1.6;
}

function pickEdgePathOptions(isUplink: boolean, isWifi: boolean): { offset: number; borderRadius: number } | undefined {
    if (isUplink) return { offset: 60, borderRadius: 14 };
    if (isWifi) return { offset: 50, borderRadius: 12 };
    return undefined;
}

// Handle selection per layout mode + edge:
//  - Tree (LR): source on the right, target on the left
//  - Horizontal (TB wrapped): source bottom, target top
//  - Grouped (TB): source bottom, target top — except Wi-Fi which routes
//    via the left-side target handle so labels sit cleanly along the
//    AP-to-client branch
//  - Port-aware (TB only): when an ethernet/uplink edge carries port info
//    and the source/target switch fits its port grid on a single row,
//    land the line on the matching port handle so the cable visually exits
//    AND enters from the right physical port. portIndex maps to the
//    source-side port handle (`p${idx}`); localPortIndex maps to the
//    target-side port handle (`pt${idx}`).
function pickEdgeHandles(
    mode: LayoutMode,
    isWifi: boolean,
    portIndex: number | undefined,
    localPortIndex: number | undefined
): { source: string; target: string } {
    if (mode === 'tree') return { source: 'sr', target: 'tl' };
    const portAware = !isWifi && typeof portIndex === 'number';
    const source = portAware ? `p${portIndex}` : 's';
    const localPortAware = !isWifi && typeof localPortIndex === 'number';
    let target: string;
    if (localPortAware) target = `pt${localPortIndex}`;
    else if (mode === 'grouped' && isWifi) target = 'tl';
    else target = 't';
    return { source, target };
}

function pickChipClass(disabled: boolean, active: boolean, activeBg: string): string {
    if (disabled) return 'opacity-40 cursor-not-allowed border-slate-800 text-slate-500';
    if (active) return activeBg;
    return 'border-slate-700 text-slate-400 hover:text-slate-100 hover:border-slate-600';
}

function formatSpeed(mbps?: number): string | undefined {
    if (!mbps || mbps <= 0) return undefined;
    if (mbps >= 1000) return `${(mbps / 1000).toFixed(mbps % 1000 === 0 ? 0 : 1)} Gbps`;
    return `${mbps} Mbps`;
}

function buildEdgeLabel(e: TopologyEdgeIn): string | undefined {
    const speed = formatSpeed(e.linkSpeedMbps);
    if (e.medium === 'wifi') {
        const parts: string[] = [];
        if (e.ssid) parts.push(e.ssid);
        if (e.band) parts.push(e.band);
        if (speed) parts.push(speed);
        return parts.length > 0 ? parts.join(' · ') : undefined;
    }
    return speed;
}

export const TopologyGraph: React.FC<TopologyGraphProps> = ({ graph, height = '75vh' }) => {
    const { t } = useTranslation();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [mode, setMode] = useState<LayoutMode>('grouped');
    const reactFlowRef = useRef<ReactFlowInstance | null>(null);
    const [manualPositions, setManualPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
    const [dragMode, setDragMode] = useState(false);
    const [moveStep, setMoveStep] = useState(5);
    const [exportMenuOpen, setExportMenuOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    // Manual placements only apply in Grouped mode (Tree/Horizontal are
    // deterministic dagre layouts). Used by the lock toggle, the nudge
    // toolbar, the layout override, and the auto-disable effect below.
    const editableMode = mode === 'grouped';

    const handleInit = useCallback((instance: ReactFlowInstance) => {
        reactFlowRef.current = instance;
    }, []);

    const fitView = useCallback(() => {
        reactFlowRef.current?.fitView({ padding: 0.2, duration: 400 });
    }, []);

    // Image / PDF / SVG / JSON export of the current graph view.
    // PNG and PDF use a single full-graph capture via html-to-image after a
    // fitView so the user gets the entire topology, not just what scrolls
    // into view.
    const exportFile = useCallback(async (format: 'png' | 'svg' | 'pdf' | 'json') => {
        setExportMenuOpen(false);
        if (exporting) return;
        const stamp = new Date().toISOString().slice(0, 10);
        if (format === 'json') {
            const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `topology-${stamp}.json`;
            a.click();
            URL.revokeObjectURL(url);
            return;
        }
        const flowEl = document.querySelector('.react-flow') as HTMLElement | null;
        if (!flowEl) return;
        setExporting(true);
        try {
            reactFlowRef.current?.fitView({ padding: 0.1, duration: 0 });
            await new Promise(r => requestAnimationFrame(() => r(undefined)));
            const opts = { backgroundColor: '#020617', cacheBust: true, pixelRatio: 2 };
            if (format === 'svg') {
                const dataUrl = await toSvg(flowEl, opts);
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `topology-${stamp}.svg`;
                a.click();
                return;
            }
            const png = await toPng(flowEl, opts);
            if (format === 'png') {
                const a = document.createElement('a');
                a.href = png;
                a.download = `topology-${stamp}.png`;
                a.click();
                return;
            }
            // PDF via jsPDF (raster A4 landscape)
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();
            pdf.addImage(png, 'PNG', 0, 0, pageW, pageH);
            pdf.save(`topology-${stamp}.pdf`);
        } catch (err) {
            // best-effort — the user gets a console error but no crash
            // eslint-disable-next-line no-console
            console.error('Topology export failed', err);
        } finally {
            setExporting(false);
        }
    }, [graph, exporting]);

    // Auto-disable edit mode if the user switches away from Grouped:
    // Tree / Horizontal are deterministic dagre layouts where manual placement
    // doesn't apply, so the lock toggle / nudge toolbar / drag handlers must
    // not stay armed.
    useEffect(() => {
        if (!editableMode && dragMode) setDragMode(false);
    }, [editableMode, dragMode]);

    // Load any persisted manual placements once on mount
    useEffect(() => {
        let cancelled = false;
        api.get<Record<string, { x: number; y: number }>>('/api/topology/positions')
            .then(resp => {
                if (cancelled) return;
                const result = (resp as any).result;
                if (resp.success && result && typeof result === 'object') {
                    setManualPositions(new Map(Object.entries(result)));
                }
            })
            .catch(() => { /* swallow — graph still renders with dagre layout */ });
        return () => { cancelled = true; };
    }, []);

    const handleNodeDragStop = useCallback((_e: React.MouseEvent, node: Node) => {
        const x = node.position?.x;
        const y = node.position?.y;
        if (typeof x !== 'number' || typeof y !== 'number') return;
        api.post('/api/topology/positions', { nodeId: node.id, x, y }).catch(() => { /* best-effort */ });
        setManualPositions(prev => {
            const next = new Map(prev);
            next.set(node.id, { x, y });
            return next;
        });
    }, []);

    const resetLayout = useCallback(async () => {
        try {
            await api.delete('/api/topology/positions');
        } catch { /* ignore */ }
        setManualPositions(new Map());
        // Re-fit after a short delay so the dagre layout has rendered
        globalThis.setTimeout(() => reactFlowRef.current?.fitView({ padding: 0.2, duration: 400 }), 50);
    }, []);

    // Nudge the currently-selected node by (dx, dy) pixels and persist.
    // Used by the edit toolbar arrow buttons and the keyboard arrow keys.
    const nudgeSelected = useCallback((dx: number, dy: number) => {
        if (!selectedId) return;
        setManualPositions(prev => {
            const layoutedNode = reactFlowRef.current?.getNode(selectedId);
            const fallback = layoutedNode?.position;
            const current = prev.get(selectedId) ?? fallback;
            if (!current) return prev;
            const next = { x: current.x + dx, y: current.y + dy };
            const map = new Map(prev);
            map.set(selectedId, next);
            api.post('/api/topology/positions', { nodeId: selectedId, x: next.x, y: next.y })
                .catch(() => { /* best-effort */ });
            return map;
        });
    }, [selectedId]);

    // Arrow-key nudging when in edit mode and a node is selected.
    useEffect(() => {
        if (!dragMode || !selectedId) return;
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
            const step = e.shiftKey ? Math.max(20, moveStep * 4) : moveStep;
            let dx = 0;
            let dy = 0;
            switch (e.key) {
                case 'ArrowUp':    dy = -step; break;
                case 'ArrowDown':  dy =  step; break;
                case 'ArrowLeft':  dx = -step; break;
                case 'ArrowRight': dx =  step; break;
                default: return;
            }
            e.preventDefault();
            nudgeSelected(dx, dy);
        };
        globalThis.addEventListener('keydown', onKey);
        return () => globalThis.removeEventListener('keydown', onKey);
    }, [dragMode, selectedId, moveStep, nudgeSelected]);
    const [sourceFilter, setSourceFilter] = useState<Set<SourcePlugin>>(new Set(ALL_SOURCES));
    const [kindFilter, setKindFilter] = useState<Set<NodeKind>>(new Set(ALL_KINDS));
    const [statusFilter, setStatusFilter] = useState<Set<Status>>(new Set(DEFAULT_STATUS));
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [legendOpen, setLegendOpen] = useState(false);

    // Filter the graph before layout: keep nodes matching source/kind/status filters,
    // and only edges whose both endpoints survive the filter.
    const filteredGraph = useMemo(() => {
        const visibleIds = new Set<string>();
        const filteredNodes = graph.nodes.filter(n => {
            const sourceOk = n.sources.length === 0 || n.sources.some(s => sourceFilter.has(s));
            const kindOk = kindFilter.has(n.kind);
            const statusOk = statusFilter.has(classifyStatus(n));
            const ok = sourceOk && kindOk && statusOk;
            if (ok) visibleIds.add(n.id);
            return ok;
        });
        const filteredEdges = graph.edges.filter(e =>
            visibleIds.has(e.source) && visibleIds.has(e.target)
        );
        return { nodes: filteredNodes, edges: filteredEdges };
    }, [graph, sourceFilter, kindFilter, statusFilter]);

    // Available kind/source counts (always derived from full graph for the chip badges)
    const sourceCounts = useMemo(() => {
        const counts: Record<SourcePlugin, number> = { freebox: 0, unifi: 0, 'scan-reseau': 0 };
        for (const n of graph.nodes) for (const s of n.sources) counts[s] = (counts[s] ?? 0) + 1;
        return counts;
    }, [graph]);
    const kindCounts = useMemo(() => {
        const counts: Record<NodeKind, number> = { gateway: 0, switch: 0, ap: 0, repeater: 0, client: 0, unknown: 0 };
        for (const n of graph.nodes) counts[n.kind] = (counts[n.kind] ?? 0) + 1;
        return counts;
    }, [graph]);
    const statusCounts = useMemo(() => {
        const counts: Record<Status, number> = { online: 0, offline: 0, stale: 0 };
        for (const n of graph.nodes) counts[classifyStatus(n)]++;
        return counts;
    }, [graph]);

    const filtersActive =
        sourceFilter.size !== ALL_SOURCES.length ||
        kindFilter.size !== ALL_KINDS.length ||
        statusFilter.size !== DEFAULT_STATUS.length ||
        Array.from(statusFilter).some(s => !DEFAULT_STATUS.includes(s));

    const resetFilters = useCallback(() => {
        setSourceFilter(new Set(ALL_SOURCES));
        setKindFilter(new Set(ALL_KINDS));
        setStatusFilter(new Set(DEFAULT_STATUS));
    }, []);

    const layouted = useMemo(() => {
        // Pre-compute the parent connection info per client (medium + speed +
        // ssid + band + portIndex) so each client card can show "Port 5 · 1
        // Gbps" or "MyWifi · 5G · 866 Mbps" inline. Lets us drop the cluttered
        // labels on the wifi edges.
        const parentConnByClient = new Map<string, {
            medium: 'wifi' | 'ethernet';
            speedMbps?: number;
            ssid?: string;
            band?: string;
            signal?: number;
            portIndex?: number;
        }>();
        for (const e of filteredGraph.edges) {
            if (e.medium === 'uplink') continue;
            // edges are parent → child, so the client is the target
            parentConnByClient.set(e.target, {
                medium: e.medium,
                speedMbps: e.linkSpeedMbps,
                ssid: e.ssid,
                band: e.band,
                signal: e.signal,
                portIndex: e.portIndex
            });
        }

        const rfNodes: Node[] = filteredGraph.nodes.map(n => ({
            id: n.id,
            type: 'topology',
            position: { x: 0, y: 0 },
            data: {
                kind: n.kind,
                label: n.label,
                ip: n.ip,
                mac: n.mac,
                vendor: n.vendor,
                sources: n.sources,
                active: n.metadata?.active,
                ports: n.metadata?.ports,
                host_type: n.metadata?.host_type,
                connection: parentConnByClient.get(n.id),
                localUplinkPortIdx: n.metadata?.localUplinkPortIdx
            } satisfies TopologyNodeData
        }));

        const rfEdges: Edge[] = filteredGraph.edges.map(e => {
            const color = EDGE_COLOR[e.medium];
            const isUplink = e.medium === 'uplink';
            const isWifi = e.medium === 'wifi';
            // SSID / speed / port now live on the client card itself, so client
            // edges (ethernet + wifi) are unlabelled. Uplinks stay labelless.
            const label = isUplink ? buildEdgeLabel(e) : undefined;
            const marker: EdgeMarkerType = { type: MarkerType.ArrowClosed, color };
            // Wi-Fi: animated dashed line (marching-ants) so the wireless
            // relationship to the AP is unambiguous. Uplink: thicker dashed
            // mauve with right-angle routing pushed wide on the sides so it
            // doesn't overlap the parent→client edges. Ethernet: solid.
            const dasharray = pickEdgeDashArray(isWifi, isUplink);
            const handles = pickEdgeHandles(mode, isWifi, e.portIndex, e.localPortIndex);
            const pathOptions = pickEdgePathOptions(isUplink, isWifi);
            const strokeWidth = pickEdgeStrokeWidth(isUplink, isWifi);
            return {
                id: e.id,
                source: e.source,
                target: e.target,
                sourceHandle: handles.source,
                targetHandle: handles.target,
                type: 'smoothstep',
                animated: isWifi,
                label,
                labelBgPadding: [6, 3] as [number, number],
                labelBgBorderRadius: 4,
                labelBgStyle: { fill: 'rgba(15,23,42,0.85)', fillOpacity: 0.85 },
                labelStyle: { fill: '#e2e8f0', fontSize: 10, fontWeight: 500 },
                pathOptions,
                style: {
                    stroke: color,
                    strokeWidth,
                    strokeDasharray: dasharray
                },
                markerEnd: marker,
                data: { medium: e.medium, linkSpeedMbps: e.linkSpeedMbps, portIndex: e.portIndex, ssid: e.ssid, band: e.band, signal: e.signal }
            };
        });

        return layoutGraph(rfNodes, rfEdges, mode);
    }, [filteredGraph, mode]);

    // Manual placements only apply in the Grouped layout — Tree and
    // Horizontal are deterministic dagre layouts where mixing manual
    // positions with auto-layout is confusing. The positions stay in SQLite
    // and reappear when the user switches back to Grouped.
    const nodes = useMemo<Node[]>(() => {
        return layouted.nodes.map(n => {
            const stored = editableMode ? manualPositions.get(n.id) : undefined;
            const isSelected = n.id === selectedId;
            return {
                ...n,
                position: stored ?? n.position,
                selected: isSelected,
                data: { ...n.data, editingMode: dragMode && editableMode }
            };
        });
    }, [layouted, manualPositions, selectedId, dragMode, editableMode]);
    const edges = layouted.edges;

    const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        setSelectedId(prev => (prev === node.id ? null : node.id));
    }, []);

    const handlePaneClick = useCallback(() => setSelectedId(null), []);

    const selectedNode = useMemo(
        () => (selectedId ? filteredGraph.nodes.find(n => n.id === selectedId) ?? null : null),
        [filteredGraph.nodes, selectedId]
    );
    const selectedEdges = useMemo(
        () => (selectedId ? filteredGraph.edges.filter(e => e.source === selectedId || e.target === selectedId) : []),
        [filteredGraph.edges, selectedId]
    );

    return (
        <div className="relative rounded-xl border border-slate-700 overflow-hidden bg-slate-950" style={{ height }}>
            {/* Filters panel (top-left) — collapsible */}
            <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 p-2 rounded-lg bg-slate-900/90 border border-slate-700 shadow-lg max-w-[60vw]">
                <button
                    onClick={() => setFiltersOpen(prev => !prev)}
                    className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-300 hover:text-slate-100 transition-colors"
                >
                    <FilterIcon size={12} />
                    <span>{t('topology.filters.title')}</span>
                    {filtersActive && (
                        <span className="px-1.5 py-px rounded bg-sky-500/30 text-sky-200 text-[9px] normal-case tracking-normal">
                            {t('topology.filters.activeBadge')}
                        </span>
                    )}
                    <span className="ml-auto pl-2">
                        {filtersOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </span>
                </button>
                {filtersOpen && (
                <>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400 pt-1 border-t border-slate-800">
                    <span>{t('topology.filters.sources')}</span>
                    {filtersActive && (
                        <button
                            onClick={resetFilters}
                            className="ml-auto text-sky-400 hover:text-sky-300 text-[10px] normal-case tracking-normal"
                        >
                            {t('topology.filters.reset')}
                        </button>
                    )}
                </div>
                <div className="flex flex-wrap gap-1">
                    {ALL_SOURCES.map(src => {
                        const active = sourceFilter.has(src);
                        const count = sourceCounts[src];
                        const chip = SOURCE_CHIP[src];
                        const disabled = count === 0;
                        const chipClass = pickChipClass(disabled, active, chip.activeBg);
                        return (
                            <button
                                key={src}
                                onClick={() => disabled || setSourceFilter(prev => toggleSet(prev, src))}
                                disabled={disabled}
                                className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded border transition-colors ${chipClass}`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${chip.dot}`} />
                                <span>{chip.label}</span>
                                <span className="opacity-60 font-mono text-[10px]">{count}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400 pt-1 border-t border-slate-800">
                    <FilterIcon size={11} />
                    <span>{t('topology.filters.types')}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                    {ALL_KINDS.map(k => {
                        const count = kindCounts[k];
                        if (count === 0) return null;
                        const active = kindFilter.has(k);
                        const chip = KIND_CHIP[k];
                        const Icon = chip.icon;
                        return (
                            <button
                                key={k}
                                onClick={() => setKindFilter(prev => toggleSet(prev, k))}
                                className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded border transition-colors ${
                                    active
                                        ? chip.activeBg
                                        : 'border-slate-700 text-slate-400 hover:text-slate-100 hover:border-slate-600'
                                }`}
                            >
                                <Icon size={11} />
                                <span>{t(`topology.kind.${k}`)}</span>
                                <span className="opacity-60 font-mono text-[10px]">{count}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400 pt-1 border-t border-slate-800">
                    <FilterIcon size={11} />
                    <span>{t('topology.filters.status')}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                    {ALL_STATUS.map(s => {
                        const count = statusCounts[s];
                        if (count === 0 && s !== 'stale') return null;
                        const active = statusFilter.has(s);
                        const chip = STATUS_CHIP[s];
                        const Icon = chip.icon;
                        return (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(prev => toggleSet(prev, s))}
                                className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded border transition-colors ${
                                    active
                                        ? chip.activeBg
                                        : 'border-slate-700 text-slate-400 hover:text-slate-100 hover:border-slate-600'
                                }`}
                                title={s === 'stale' ? t('topology.status.staleHint') : undefined}
                            >
                                <Icon size={11} />
                                <span>{t(`topology.status.${s}`)}</span>
                                <span className="opacity-60 font-mono text-[10px]">{count}</span>
                            </button>
                        );
                    })}
                </div>
                </>
                )}
            </div>

            {/* Layout mode selector + Reset (top-center toolbar) */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 p-1 rounded-lg bg-slate-900/90 border border-slate-700 shadow-lg">
                {LAYOUT_MODES.map(m => {
                    const Icon = m.icon;
                    const active = mode === m.id;
                    return (
                        <button
                            key={m.id}
                            onClick={() => setMode(m.id)}
                            title={t(`topology.layout.${m.key}`)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded transition-colors ${
                                active
                                    ? 'bg-sky-500/30 text-sky-100 border border-sky-400/30'
                                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800 border border-transparent'
                            }`}
                        >
                            <Icon size={13} />
                            <span className="hidden sm:inline">{t(`topology.layout.${m.key}`)}</span>
                        </button>
                    );
                })}
                <div className="w-px h-5 bg-slate-700 mx-1" />
                <button
                    onClick={fitView}
                    title={t('topology.fitView')}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded text-slate-400 hover:text-sky-200 hover:bg-slate-800 border border-transparent transition-colors"
                >
                    <Maximize2 size={13} />
                    <span className="hidden sm:inline">{t('topology.fitView')}</span>
                </button>
                {editableMode && (
                    <button
                        onClick={() => setDragMode(prev => !prev)}
                        title={dragMode ? t('topology.editLayoutOn') : t('topology.editLayout')}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border transition-colors ${
                            dragMode
                                ? 'bg-amber-500/30 text-amber-100 border-amber-400/50 shadow-sm shadow-amber-500/30'
                                : 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30 hover:bg-emerald-500/25'
                        }`}
                    >
                        {dragMode
                            ? <Unlock size={13} className="text-amber-200" />
                            : <Lock size={13} className="text-emerald-300" />
                        }
                        <span className="hidden sm:inline">{dragMode ? t('topology.editLayoutOn') : t('topology.editLayout')}</span>
                    </button>
                )}
                {editableMode && (manualPositions.size > 0 || dragMode) && (
                    <button
                        onClick={resetLayout}
                        title={t('topology.resetLayout')}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded text-slate-400 hover:text-rose-200 hover:bg-slate-800 border border-transparent transition-colors"
                    >
                        <RotateCcw size={13} />
                        <span className="hidden sm:inline">{t('topology.resetLayout')}</span>
                    </button>
                )}
                <div className="w-px h-5 bg-slate-700 mx-1" />
                <div className="relative">
                    <button
                        onClick={() => setExportMenuOpen(prev => !prev)}
                        disabled={exporting}
                        title={t('topology.export.button')}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border transition-colors ${
                            exportMenuOpen
                                ? 'bg-sky-500/30 text-sky-100 border-sky-400/40'
                                : 'text-slate-400 hover:text-sky-200 hover:bg-slate-800 border-transparent'
                        } disabled:opacity-50`}
                    >
                        <Download size={13} className={exporting ? 'animate-pulse' : ''} />
                        <span className="hidden sm:inline">{exporting ? t('topology.export.exporting') : t('topology.export.button')}</span>
                    </button>
                    {exportMenuOpen && (
                        <div className="absolute top-full mt-1 right-0 z-20 min-w-[160px] rounded-lg bg-slate-900/95 border border-slate-700 shadow-lg overflow-hidden">
                            <button onClick={() => exportFile('png')} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 transition-colors">
                                <ImageIcon size={13} className="text-sky-300" />
                                <span>PNG</span>
                                <span className="ml-auto text-[10px] text-slate-500">{t('topology.export.pngHint')}</span>
                            </button>
                            <button onClick={() => exportFile('pdf')} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 transition-colors border-t border-slate-800">
                                <FileText size={13} className="text-rose-300" />
                                <span>PDF</span>
                                <span className="ml-auto text-[10px] text-slate-500">A4</span>
                            </button>
                            <button onClick={() => exportFile('svg')} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 transition-colors border-t border-slate-800">
                                <FileCode size={13} className="text-amber-300" />
                                <span>SVG</span>
                                <span className="ml-auto text-[10px] text-slate-500">{t('topology.export.svgHint')}</span>
                            </button>
                            <button onClick={() => exportFile('json')} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 transition-colors border-t border-slate-800">
                                <Braces size={13} className="text-emerald-300" />
                                <span>JSON</span>
                                <span className="ml-auto text-[10px] text-slate-500">{t('topology.export.jsonHint')}</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                nodesDraggable={dragMode}
                onNodeClick={handleNodeClick}
                onPaneClick={handlePaneClick}
                onNodeDragStop={handleNodeDragStop}
                onInit={handleInit}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.05}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
            >
                <Background color="#1e293b" gap={28} size={1} />
                <Controls
                    className="!bg-slate-900/80 !border-slate-700"
                    showInteractive={false}
                />
            </ReactFlow>

            {/* Side panel */}
            {selectedNode && (() => {
                const kindAccent = NODE_KIND_LEGEND.find(k => k.id === selectedNode.kind);
                const accentBar = kindAccent?.bar ?? 'bg-slate-500';
                return (
                <div className="absolute top-3 right-3 w-80 max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-xl border-2 border-slate-600 bg-slate-800 shadow-2xl">
                    <div className={`h-1 ${accentBar}`} />
                    <div className="flex items-start justify-between gap-2 p-4 border-b border-slate-700">
                        <div className="min-w-0">
                            <div className="text-xs uppercase tracking-wide text-slate-400">{t(`topology.kind.${selectedNode.kind}`)}</div>
                            <div className="text-base font-semibold text-slate-100 truncate">{selectedNode.label}</div>
                        </div>
                        <button
                            onClick={() => setSelectedId(null)}
                            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
                            aria-label={t('common.close')}
                        >
                            <X size={16} />
                        </button>
                    </div>
                    <div className="p-4 space-y-3 text-sm">
                        {selectedNode.ip && (
                            <DetailRow icon={<Link2 size={14} />} label={t('topology.detail.ip')} value={selectedNode.ip} mono />
                        )}
                        {selectedNode.mac && (
                            <DetailRow icon={<Hash size={14} />} label={t('topology.detail.mac')} value={selectedNode.mac} mono />
                        )}
                        {selectedNode.vendor && (
                            <DetailRow icon={<Building2 size={14} />} label={t('topology.detail.vendor')} value={selectedNode.vendor} />
                        )}
                        {selectedNode.metadata?.model && (
                            <DetailRow icon={<Tag size={14} />} label={t('topology.detail.model')} value={String(selectedNode.metadata.model)} />
                        )}
                        {selectedNode.metadata?.ssid && (() => {
                            const band = selectedNode.metadata.band ? ` (${selectedNode.metadata.band})` : '';
                            const ssidValue = `${selectedNode.metadata.ssid}${band}`;
                            return (
                                <DetailRow icon={<Wifi size={14} />} label={t('topology.detail.ssid')} value={ssidValue} />
                            );
                        })()}
                        {(selectedNode.kind === 'switch' || selectedNode.kind === 'gateway') && selectedNode.metadata?.ports && selectedNode.metadata.ports.length > 0 && (() => {
                            const ports = selectedNode.metadata.ports;
                            const upCount = ports.filter(p => p.up).length;
                            const poeCount = ports.filter(p => p.poe).length;
                            const totalSpeed = ports.filter(p => p.up).reduce((s, p) => s + (p.speed ?? 0), 0);
                            const speedLabel = totalSpeed >= 1000 ? `${(totalSpeed / 1000).toFixed(1)} Gbps` : `${totalSpeed} Mbps`;
                            return (
                                <div className="pt-2 border-t border-slate-700 space-y-1.5">
                                    <div className="text-xs uppercase tracking-wide text-slate-400">
                                        {t('topology.detail.ports')}
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-xs">
                                        <div className="bg-slate-700/40 rounded px-2 py-1.5">
                                            <div className="text-[10px] uppercase tracking-wide text-slate-500">{t('topology.detail.portsUp')}</div>
                                            <div className="font-mono text-slate-100">{upCount} / {ports.length}</div>
                                        </div>
                                        <div className="bg-slate-700/40 rounded px-2 py-1.5">
                                            <div className="text-[10px] uppercase tracking-wide text-slate-500">{t('topology.detail.portsPoe')}</div>
                                            <div className="font-mono text-amber-200">{poeCount}</div>
                                        </div>
                                        <div className="bg-slate-700/40 rounded px-2 py-1.5">
                                            <div className="text-[10px] uppercase tracking-wide text-slate-500">{t('topology.detail.portsTotal')}</div>
                                            <div className="font-mono text-emerald-200">{speedLabel}</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                        {selectedEdges.length > 0 && (
                            <div className="pt-2 border-t border-slate-700">
                                <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">{t('topology.detail.links')}</div>
                                <div className="space-y-1.5">
                                    {selectedEdges.map(e => (
                                        <div key={e.id} className="flex items-center gap-2 text-xs">
                                            {e.medium === 'wifi' ? (
                                                <Wifi size={12} className="text-sky-400 flex-none" />
                                            ) : (
                                                <Cable size={12} className="text-emerald-400 flex-none" />
                                            )}
                                            <span className="text-slate-300 truncate">
                                                {e.source === selectedNode.id ? '→' : '←'} {e.source === selectedNode.id ? e.target.replace(/^mac:/, '') : e.source.replace(/^mac:/, '')}
                                            </span>
                                            {(e.linkSpeedMbps || e.band) && (
                                                <span className="ml-auto text-slate-400 font-mono">
                                                    {buildEdgeLabel(e)}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                );
            })()}

            {/* Edit toolbar (only when drag mode is on) */}
            {dragMode && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 p-1.5 rounded-lg bg-slate-900/95 border border-amber-400/40 shadow-lg shadow-amber-500/10">
                    <span className="px-2 text-[10px] uppercase tracking-wide text-amber-200 font-semibold">
                        {selectedNode ? `${t('topology.editToolbar.move')}: ${selectedNode.label}` : t('topology.editToolbar.selectNode')}
                    </span>
                    <div className="grid grid-cols-3 gap-px ml-1">
                        <div />
                        <button
                            disabled={!selectedNode}
                            onClick={() => nudgeSelected(0, -moveStep)}
                            title="↑"
                            className="w-7 h-7 flex items-center justify-center rounded text-slate-200 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ArrowUp size={14} />
                        </button>
                        <div />
                        <button
                            disabled={!selectedNode}
                            onClick={() => nudgeSelected(-moveStep, 0)}
                            title="←"
                            className="w-7 h-7 flex items-center justify-center rounded text-slate-200 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ArrowLeft size={14} />
                        </button>
                        <button
                            disabled={!selectedNode}
                            onClick={() => nudgeSelected(0, moveStep)}
                            title="↓"
                            className="w-7 h-7 flex items-center justify-center rounded text-slate-200 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ArrowDown size={14} />
                        </button>
                        <button
                            disabled={!selectedNode}
                            onClick={() => nudgeSelected(moveStep, 0)}
                            title="→"
                            className="w-7 h-7 flex items-center justify-center rounded text-slate-200 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ArrowRight size={14} />
                        </button>
                    </div>
                    <div className="w-px h-6 bg-slate-700 mx-1" />
                    <label className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-400">
                        <span>{t('topology.editToolbar.step')}</span>
                        <select
                            value={moveStep}
                            onChange={e => setMoveStep(Number(e.target.value))}
                            className="bg-slate-800 text-slate-200 rounded px-1 py-0.5 text-[11px] border border-slate-700 focus:outline-none focus:border-amber-400/40"
                        >
                            <option value={1}>1 px</option>
                            <option value={5}>5 px</option>
                            <option value={20}>20 px</option>
                            <option value={50}>50 px</option>
                        </select>
                    </label>
                    <span className="px-2 text-[10px] text-slate-500 hidden md:inline">
                        {t('topology.editToolbar.hint')}
                    </span>
                </div>
            )}

            {/* Legend (collapsible) — bottom-right to avoid the React Flow controls (bottom-left) */}
            <div className="absolute bottom-3 right-3 z-10 rounded-lg bg-slate-900/85 border border-slate-700 shadow-lg">
                <button
                    onClick={() => setLegendOpen(prev => !prev)}
                    className="flex items-center gap-2 px-3 py-1.5 text-[11px] uppercase tracking-wide text-slate-300 hover:text-slate-100 transition-colors w-full"
                >
                    <Info size={12} />
                    <span>{t('topology.legend.title')}</span>
                    <span className="ml-auto pl-2">
                        {legendOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                    </span>
                </button>
                {legendOpen && (
                    <div className="px-3 pb-2 pt-1 border-t border-slate-800 space-y-2 text-[11px] text-slate-300">
                        <div>
                            <div className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">{t('topology.legend.links')}</div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: EDGE_COLOR.ethernet }} /> {t('topology.legend.ethernet')}
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 inline-block" style={{ borderTop: `2px dashed ${EDGE_COLOR.wifi}` }} /> {t('topology.legend.wifi')}
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: EDGE_COLOR.uplink }} /> {t('topology.legend.uplink')}
                                </span>
                            </div>
                        </div>
                        <div>
                            <div className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">{t('topology.legend.nodes')}</div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                                {NODE_KIND_LEGEND.map(k => (
                                    <span key={k.id} className="flex items-center gap-1.5">
                                        <span className={`w-2 h-2 rounded-sm ${k.bar}`} /> {t(`topology.kind.${k.id}`)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

interface DetailRowProps { icon: React.ReactNode; label: string; value: string; mono?: boolean }
const DetailRow: React.FC<DetailRowProps> = ({ icon, label, value, mono }) => (
    <div className="flex items-start gap-2">
        <span className="mt-0.5 text-slate-400">{icon}</span>
        <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
            <div className={`text-slate-200 truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
        </div>
    </div>
);

export default TopologyGraph;
