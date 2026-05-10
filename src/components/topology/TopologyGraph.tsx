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
    MiniMap,
    type Edge,
    type Node,
    type EdgeMarkerType,
    type ReactFlowInstance,
    type Viewport,
    MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTranslation } from 'react-i18next';
import { X, Cable, Wifi, Link2, Tag, Hash, Building2, GitBranch, MoveHorizontal, Boxes, Filter as FilterIcon, Router as RouterIcon, Server, Repeat, Smartphone, HelpCircle, Maximize2, CircleDot, CircleOff, ChevronDown, ChevronUp, Info } from 'lucide-react';
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
        ports?: Array<{ idx: number; name?: string; up: boolean; speed?: number; poe?: boolean }>;
    };
}

interface TopologyEdgeIn {
    id: string;
    source: string;
    target: string;
    medium: EdgeMedium;
    linkSpeedMbps?: number;
    portIndex?: number;
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
// (gateway=amber, switch=emerald, AP=sky, repeater=purple). Uplinks stay amber
// because they always go INTO a gateway (same colour family is intentional).
const EDGE_COLOR: Record<EdgeMedium, string> = {
    ethernet: '#a3e635', // lime — distinct from emerald switches
    wifi: '#f472b6',     // pink — distinct from sky APs and purple repeaters
    uplink: '#f59e0b'
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
        if (e.band && speed) return `${e.band} · ${speed}`;
        return e.band || speed;
    }
    return speed;
}

export const TopologyGraph: React.FC<TopologyGraphProps> = ({ graph, height = '75vh' }) => {
    const { t } = useTranslation();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [mode, setMode] = useState<LayoutMode>('grouped');
    const [zoom, setZoom] = useState(1);
    const reactFlowRef = useRef<ReactFlowInstance | null>(null);

    const handleInit = useCallback((instance: ReactFlowInstance) => {
        reactFlowRef.current = instance;
    }, []);

    const handleMove = useCallback((_: unknown, viewport: Viewport) => {
        setZoom(viewport.zoom);
    }, []);

    const fitView = useCallback(() => {
        reactFlowRef.current?.fitView({ padding: 0.2, duration: 400 });
    }, []);
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
                ports: n.metadata?.ports
            } satisfies TopologyNodeData
        }));

        const rfEdges: Edge[] = filteredGraph.edges.map(e => {
            const color = EDGE_COLOR[e.medium];
            const isUplink = e.medium === 'uplink';
            const isWifi = e.medium === 'wifi';
            const label = buildEdgeLabel(e);
            const marker: EdgeMarkerType = { type: MarkerType.ArrowClosed, color };
            // Wi-Fi: animated dashed line (marching-ants) so the wireless
            // relationship to the AP is unambiguous. Uplink: thicker dashed,
            // not animated. Ethernet: solid.
            const dasharray = isWifi ? '5 4' : (isUplink ? '6 3' : undefined);
            return {
                id: e.id,
                source: e.source,
                target: e.target,
                type: 'smoothstep',
                animated: isWifi,
                label,
                labelBgPadding: [6, 3] as [number, number],
                labelBgBorderRadius: 4,
                labelBgStyle: { fill: 'rgba(15,23,42,0.85)', fillOpacity: 0.85 },
                labelStyle: { fill: '#e2e8f0', fontSize: 10, fontWeight: 500 },
                style: {
                    stroke: color,
                    strokeWidth: isUplink ? 2.5 : (isWifi ? 1.8 : 1.6),
                    strokeDasharray: dasharray
                },
                markerEnd: marker,
                data: { medium: e.medium, linkSpeedMbps: e.linkSpeedMbps, portIndex: e.portIndex, ssid: e.ssid, band: e.band, signal: e.signal }
            };
        });

        return layoutGraph(rfNodes, rfEdges, mode);
    }, [filteredGraph, mode]);

    const [nodes, setNodes] = useState<Node[]>(layouted.nodes);
    const [edges, setEdges] = useState<Edge[]>(layouted.edges);

    useEffect(() => {
        setNodes(layouted.nodes);
        setEdges(layouted.edges);
    }, [layouted]);

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
            </div>

            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodeClick={handleNodeClick}
                onPaneClick={handlePaneClick}
                onInit={handleInit}
                onMove={handleMove}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.05}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
            >
                <Background color="#1e293b" gap={28} size={1} />
                <Controls className="!bg-slate-900/80 !border-slate-700" />
                {/* MiniMap only when zoomed-in (otherwise the global view is already visible) */}
                {zoom > 0.6 && (
                    <MiniMap
                        position="top-right"
                        pannable
                        zoomable
                        nodeStrokeWidth={2}
                        nodeColor={(n) => {
                            if (n.type === 'topologyGroup') return 'rgba(148, 163, 184, 0.15)';
                            const k = (n.data as TopologyNodeData)?.kind;
                            if (k === 'gateway') return '#f59e0b';
                            if (k === 'switch') return '#10b981';
                            if (k === 'ap') return '#0ea5e9';
                            if (k === 'repeater') return '#a855f7';
                            return '#94a3b8';
                        }}
                        nodeStrokeColor={(n) => {
                            if (n.type === 'topologyGroup') return 'rgba(148, 163, 184, 0.4)';
                            return '#0f172a';
                        }}
                        style={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid #334155', borderRadius: 8 }}
                        maskColor="rgba(15, 23, 42, 0.65)"
                    />
                )}
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
                                    <span className="w-3 inline-block" style={{ borderTop: `2px dashed ${EDGE_COLOR.uplink}` }} /> {t('topology.legend.uplink')}
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
