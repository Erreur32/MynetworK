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
import { X, Cable, Wifi, Link2, Tag, Hash, Building2, GitBranch, MoveHorizontal, Boxes, Filter as FilterIcon, Router as RouterIcon, Server, Repeat, Smartphone, HelpCircle, Maximize2, CircleDot, CircleOff, ChevronDown, ChevronUp, Info, RotateCcw, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Lock, Unlock, Download, Image as ImageIcon, FileText, FileCode, Braces, Layers, Magnet, Zap, Gauge, ArrowRightLeft } from 'lucide-react';
import { api } from '../../api/client';
import { toPng, toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { TopologyNodeCard, type TopologyNodeData, shouldRenderUplinkChip } from './TopologyNodeCard';
import { TopologyGroupNode } from './TopologyGroupNode';
import { layoutGraph, getNodeWidth, type LayoutMode } from './topologyLayout';

type SourcePlugin = 'freebox' | 'unifi' | 'scan-reseau';
type EdgeMedium = 'ethernet' | 'wifi' | 'uplink' | 'virtual';
type NodeKind = 'gateway' | 'switch' | 'ap' | 'repeater' | 'client' | 'vm-host' | 'unknown';

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
        ports?: Array<{ idx: number; name?: string; up: boolean; speed?: number; poe?: boolean; media?: string; uplink?: boolean; localUplink?: boolean }>;
        localUplinkPortIdxs?: number[];
        vmCount?: number;
        vmActiveCount?: number;
        vmInactiveCount?: number;
        hypervisor?: string;
        hostHostname?: string;
        hostIp?: string;
        hostMac?: string;
        hostVendor?: string;
        modelDisplay?: string;
        portsFromSnapshot?: boolean;
        hasDedicatedUplink?: boolean;
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
    wifi: '#7dd3fc',     // sky-300 light blue — visually softer than the
                         // previous pink so 10+ overlapping animated dashes
                         // on a busy AP don't shimmer/strobe against the dark
                         // background. Still distinct from the sky-500 AP
                         // card tint thanks to the lighter shade + dashed
                         // pattern.
    uplink: '#a78bfa',   // violet/mauve — distinct from amber gateways
    virtual: '#e879f9'   // fuchsia — matches the vm-host card tint
};

const PORT_BADGE_CLASS: Record<EdgeMedium, string> = {
    uplink:   'bg-purple-500/20 text-purple-200 border-purple-400/40',
    wifi:     'bg-sky-500/20 text-sky-200 border-sky-400/40',
    ethernet: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
    virtual:  'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-400/40'
};

const EDGE_ICON_COLOR: Record<EdgeMedium, string> = {
    uplink:   'text-purple-400',
    wifi:     'text-sky-400',
    ethernet: 'text-emerald-400',
    virtual:  'text-fuchsia-400'
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
    { id: 'vm-host',  bar: 'bg-fuchsia-400' },
    { id: 'client',   bar: 'bg-slate-400' },
    { id: 'unknown',  bar: 'bg-slate-500' }
];

const PORT_LEGEND: Array<{ key: 'portUp' | 'portFibre' | 'portUplink' | 'portDown'; swatch: string }> = [
    { key: 'portUp',     swatch: 'bg-emerald-500 border-emerald-300' },
    { key: 'portFibre',  swatch: 'bg-cyan-500 border-cyan-300' },
    { key: 'portUplink', swatch: 'bg-purple-500 border-purple-300' },
    { key: 'portDown',   swatch: 'bg-slate-700/70 border-slate-600/40' }
];

const ALL_SOURCES: SourcePlugin[] = ['freebox', 'unifi', 'scan-reseau'];
const ALL_KINDS: NodeKind[] = ['gateway', 'switch', 'ap', 'repeater', 'vm-host', 'client', 'unknown'];

type Status = 'online' | 'offline' | 'stale';
const ALL_STATUS: Status[] = ['online', 'offline', 'stale'];
const DEFAULT_STATUS: Status[] = ['online'];

// Bump the storage-key version when the filter shape changes so older saved
// state is ignored instead of crashing the UI.
const FILTERS_STORAGE_KEY = 'topology.filters.v1';
// Snap-to-grid preference for the drag-edit toolbar. Stored as '1' / '0'.
const SNAP_STORAGE_KEY = 'topology.snap.v1';
const SNAP_GRID: [number, number] = [10, 10];
interface PersistedFilters {
    sources: SourcePlugin[];
    kinds: NodeKind[];
    statuses: Status[];
}

// For multi-toggle filters (sources/kinds), backfill any new union members
// the saved state doesn't know about. Otherwise adding a new NodeKind /
// SourcePlugin silently hides it from users with older localStorage state.
function mergeWithDefaults<T>(persisted: T[] | null, all: readonly T[]): T[] {
    if (!persisted) return [...all];
    const missing = all.filter(v => !persisted.includes(v));
    return [...persisted, ...missing];
}

function loadPersistedFilters(): PersistedFilters | null {
    try {
        const raw = globalThis.localStorage?.getItem(FILTERS_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<PersistedFilters>;
        if (!parsed || typeof parsed !== 'object') return null;
        const persistedSources = Array.isArray(parsed.sources)
            ? parsed.sources.filter(s => ALL_SOURCES.includes(s)) : null;
        const persistedKinds = Array.isArray(parsed.kinds)
            ? parsed.kinds.filter(k => ALL_KINDS.includes(k)) : null;
        const persistedStatuses = Array.isArray(parsed.statuses)
            ? parsed.statuses.filter(s => ALL_STATUS.includes(s)) : null;
        return {
            sources: mergeWithDefaults(persistedSources, ALL_SOURCES),
            kinds: mergeWithDefaults(persistedKinds, ALL_KINDS),
            // Statuses use a SUBSET default (online only), so we preserve the
            // user's exact choice rather than backfilling.
            statuses: persistedStatuses ?? [...DEFAULT_STATUS]
        };
    } catch {
        return null;
    }
}

function savePersistedFilters(f: PersistedFilters): void {
    try {
        globalThis.localStorage?.setItem(FILTERS_STORAGE_KEY, JSON.stringify(f));
    } catch { /* quota / disabled storage — best-effort */ }
}

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
    gateway:   { icon: RouterIcon, activeBg: 'bg-amber-500/25 border-amber-400/50 text-amber-100' },
    switch:    { icon: Server,     activeBg: 'bg-emerald-500/25 border-emerald-400/50 text-emerald-100' },
    ap:        { icon: Wifi,       activeBg: 'bg-sky-500/25 border-sky-400/50 text-sky-100' },
    repeater:  { icon: Repeat,     activeBg: 'bg-purple-500/25 border-purple-400/50 text-purple-100' },
    'vm-host': { icon: Layers,     activeBg: 'bg-fuchsia-500/25 border-fuchsia-400/50 text-fuchsia-100' },
    client:    { icon: Smartphone, activeBg: 'bg-slate-500/25 border-slate-400/50 text-slate-100' },
    unknown:   { icon: HelpCircle, activeBg: 'bg-slate-600/25 border-slate-500/50 text-slate-200' }
};

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
}

// Edge styling helpers — flatten the per-edge nested ternaries.
function pickEdgeDashArray(isWifi: boolean, _isUplink: boolean, isVirtual: boolean): string | undefined {
    // Wi-Fi and virtual links are dashed (animated for Wi-Fi). Uplinks and
    // ethernet stay solid — uplinks stand out via colour (mauve) and width.
    if (isWifi) return '5 4';
    if (isVirtual) return '3 3';
    return undefined;
}

function pickEdgeStrokeWidth(isUplink: boolean, isWifi: boolean, isVirtual: boolean): number {
    if (isUplink) return 2.5;
    if (isWifi) return 1.8;
    if (isVirtual) return 1.4;
    return 1.6;
}

// smoothstep path knobs: `offset` is the length of the perpendicular stub
// the line travels OUT of a handle before bending. Smaller offset = the bend
// happens closer to each card, so any residual horizontal jog due to fan-
// handle quantization is squeezed into a few pixels and reads as "almost
// straight" instead of a visible Z. Combined with FAN_OUT_COUNT=24 the
// quantization is already small, so the offset doesn't need to absorb it.
function pickEdgePathOptions(isUplink: boolean, isWifi: boolean): { offset: number; borderRadius: number } {
    if (isUplink) return { offset: 18, borderRadius: 6 };
    if (isWifi) return { offset: 14, borderRadius: 6 };
    return { offset: 12, borderRadius: 5 };
}

// Handle selection per layout mode + edge:
//  - Tree (LR): static — source on the right, target on the left
//  - Horizontal / Grouped (TB): dynamic — pick handles based on the FINAL
//    relative position of source and target so the path is always a clean
//    line (when aligned) or a single L (when diagonal).
//
//    Crucial rule: when the target is offset BOTH horizontally and vertically,
//    we use PERPENDICULAR handles (e.g. source bottom + target left) so that
//    smoothstep draws an L-shape with a single corner. Using parallel handles
//    (bottom→top) with a horizontal offset is what produced the "S" / zigzag
//    the user kept seeing — smoothstep had to weave around the gap.
//
//  - Port-aware override (switches): the source is locked to `p${portIndex}`
//    (bottom port). We still derive the target side from the relative position
//    so the cable doesn't dive into the top of a sideways-placed device.
//  - Legacy Wi-Fi-in-grouped fallback: only when positions aren't known yet.
type HandleSide = 'top' | 'bottom' | 'left' | 'right';
const OPPOSITE_SIDE: Record<HandleSide, HandleSide> = {
    top: 'bottom', bottom: 'top', left: 'right', right: 'left'
};
const SOURCE_HANDLE_BY_SIDE: Record<HandleSide, string> = {
    top: 'st', bottom: 's', left: 'sl', right: 'sr'
};
const TARGET_HANDLE_BY_SIDE: Record<HandleSide, string> = {
    top: 't', bottom: 'tb', left: 'tl', right: 'tr'
};
// Within this many pixels of perfect alignment we consider the target to be
// directly below/above (or left/right of) the source — small enough that the
// human eye doesn't see misalignment, so we use parallel handles for a clean
// straight line. Beyond this, we switch to perpendicular handles (L-shape).
const ALIGN_TOL = 16;

interface SidePair { source: HandleSide; target: HandleSide }
// Ratio above which we treat the offset as "mostly along one axis" and pick
// parallel handles (source bottom + target top, or source right + target
// left). Below this we fall back to perpendicular L. The fan-out alignment
// in spreadCentralHandles compensates for the horizontal offset, so parallel
// handles still produce a near-straight cable — and crucially, every client
// in a stack lands on the SAME side of its card, which is what the user
// wants from a "stack ... même logique de câblage" standpoint.
const PARALLEL_RATIO = 1.5;

function parallelPair(source: HandleSide): SidePair {
    return { source, target: OPPOSITE_SIDE[source] };
}

// True diagonal (offset ~45°) — perpendicular pair gives a single-corner L.
function diagonalPair(dx: number, dy: number): SidePair {
    if (Math.abs(dy) >= Math.abs(dx)) {
        return { source: dy >= 0 ? 'bottom' : 'top', target: dx >= 0 ? 'left' : 'right' };
    }
    return { source: dx >= 0 ? 'right' : 'left', target: dy >= 0 ? 'top' : 'bottom' };
}

// Decide which handle SIDES to use given the offset between source and target.
// Parallel handles when one axis dominates (so a stack of clients all enter
// from the top), perpendicular L when the offset is close to 45°.
function pickSidePair(dx: number, dy: number): SidePair {
    if (Math.abs(dx) < ALIGN_TOL) return parallelPair(dy >= 0 ? 'bottom' : 'top');
    if (Math.abs(dy) < ALIGN_TOL) return parallelPair(dx >= 0 ? 'right' : 'left');
    const ratio = Math.abs(dy) / Math.max(1, Math.abs(dx));
    if (ratio > PARALLEL_RATIO) return parallelPair(dy >= 0 ? 'bottom' : 'top');
    if (ratio < 1 / PARALLEL_RATIO) return parallelPair(dx >= 0 ? 'right' : 'left');
    return diagonalPair(dx, dy);
}

interface PickResult { source: string; target: string; sourceSide: HandleSide; targetSide: HandleSide }

interface EdgeHandleQuery {
    mode: LayoutMode;
    isWifi: boolean;
    isUplink: boolean;
    portIndex: number | undefined;
    localPortIndex: number | undefined;
    targetHasUplinkChip: boolean;
    sourcePos: { x: number; y: number } | undefined;
    targetPos: { x: number; y: number } | undefined;
}

// Side facing the target along the X axis — used for both wifi accordion
// (clients face the AP spine) and port-aware switch edges.
function targetSideFromDx(dx: number): HandleSide {
    if (Math.abs(dx) < ALIGN_TOL) return 'top';
    return dx >= 0 ? 'left' : 'right';
}

function resolveEdgeSides(q: EdgeHandleQuery): SidePair {
    if (!q.sourcePos || !q.targetPos) return { source: 'bottom', target: 'top' };
    const dx = q.targetPos.x - q.sourcePos.x;
    const dy = q.targetPos.y - q.sourcePos.y;
    const pair = pickSidePair(dx, dy);
    const portAware = !q.isWifi && typeof q.portIndex === 'number';
    let target = pair.target;
    if (portAware) target = targetSideFromDx(dx);
    if (q.isWifi) target = targetSideFromDx(dx);
    let source = q.isWifi ? 'bottom' as HandleSide : pair.source;
    if (q.isUplink) target = 'top';
    return { source, target };
}

function pickTargetHandle(q: EdgeHandleQuery, side: HandleSide): { handle: string; side: HandleSide } {
    const uplinkAware = !q.isWifi && typeof q.localPortIndex === 'number' && q.targetHasUplinkChip;
    if (uplinkAware) return { handle: `pt${q.localPortIndex}`, side: 'top' };
    if (!q.sourcePos && q.mode === 'grouped' && q.isWifi) return { handle: 'tl', side: 'left' };
    return { handle: TARGET_HANDLE_BY_SIDE[side], side };
}

function pickEdgeHandles(q: EdgeHandleQuery): PickResult {
    if (q.mode === 'tree') return { source: 'sr', target: 'tl', sourceSide: 'right', targetSide: 'left' };
    const sides = resolveEdgeSides(q);
    const portAware = !q.isWifi && typeof q.portIndex === 'number';
    const source = portAware ? `p${q.portIndex}` : SOURCE_HANDLE_BY_SIDE[sides.source];
    const tgt = pickTargetHandle(q, sides.target);
    return { source, target: tgt.handle, sourceSide: sides.source, targetSide: tgt.side };
}


// Must match FAN_OUT_COUNT in TopologyNodeCard.tsx — the card renders that
// many evenly-spaced source handles on its bottom edge (s0..sN-1) and matching
// target handles on its top edge (t0..tN-1). 24 keeps the source/target X
// quantization tight enough (~12-14 px on a 300 px infra card, ~7 px on a
// 170 px client card) that any residual handle-misalignment bend is sub-
// pixel-perceptible — no visible "tear" or zigzag.
const FAN_OUT_COUNT = 24;

// Pick the fan-handle index whose X position (relative to the card's left
// edge) best matches the supplied target X. The card stores its handles at
// xPx = ((i+0.5) / FAN_OUT_COUNT) * cardWidth — solve for i.
function fanIdxForOffset(targetXFromCardLeft: number, cardWidth: number): number {
    if (cardWidth <= 0) return Math.floor(FAN_OUT_COUNT / 2);
    const t = targetXFromCardLeft / cardWidth;
    const idx = Math.round(t * FAN_OUT_COUNT - 0.5);
    return Math.max(0, Math.min(FAN_OUT_COUNT - 1, idx));
}

function handleAbsX(cardLeftX: number, cardWidth: number, handleIdx: number): number {
    return cardLeftX + ((handleIdx + 0.5) / FAN_OUT_COUNT) * cardWidth;
}

// Mutates `edges` in place. For every edge using the CENTRAL `s` source
// handle, pick the s${i} fan handle whose X position best matches the
// target's centre X — so the cable leaves the source card directly above
// the target. Then align the target's `t` handle (if used) to that same X
// so the cable is straight from end to end.
//
// Result: each child cable lands on its own swim lane on the parent; in a
// stack of clients every cable still enters the client from the top side
// (consistent layout), and there are no S curves because both endpoints
// share the same X. Port-aware (p${idx}) / uplink-chip (pt${idx}) handles
// are left alone — those are tied to physical ports and must not move.
function spreadCentralHandles(
    edges: Edge[],
    finalPositions: Map<string, { x: number; y: number }>,
    widthById: Map<string, number>
): void {
    for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        // Wi-Fi edges stay on the central `s` handle so all cables from the
        // same AP visually overlap on a single vertical spine going down
        // through the accordion. Spreading them would break the spine effect.
        const d = (e.data ?? {}) as { medium?: EdgeMedium };
        if (d.medium === 'wifi') continue;
        if (e.sourceHandle !== 's' && e.targetHandle !== 't') continue;
        const sourcePos = finalPositions.get(e.source);
        const targetPos = finalPositions.get(e.target);
        if (!sourcePos || !targetPos) continue;
        const sourceW = widthById.get(e.source) ?? 0;
        const targetW = widthById.get(e.target) ?? 0;

        let sourceHandle = e.sourceHandle;
        let alignX: number | null = null;
        if (sourceHandle === 's' && sourceW > 0) {
            const targetCenterX = targetPos.x + targetW / 2;
            const fanIdx = fanIdxForOffset(targetCenterX - sourcePos.x, sourceW);
            sourceHandle = `s${fanIdx}`;
            alignX = handleAbsX(sourcePos.x, sourceW, fanIdx);
        }
        let targetHandle = e.targetHandle;
        if (targetHandle === 't' && targetW > 0) {
            // Prefer aligning to the source's chosen fan-handle X. If the
            // source isn't a central `s` handle (port-aware switch port,
            // side handle, etc.), fall back to the source's centre X.
            const refX = alignX ?? (sourcePos.x + sourceW / 2);
            const fanIdx = fanIdxForOffset(refX - targetPos.x, targetW);
            targetHandle = `t${fanIdx}`;
        }
        edges[i] = { ...e, sourceHandle, targetHandle };
    }
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

// Trigger a browser download for an in-memory blob — used by the JSON export.
function downloadJsonBlob(payload: unknown, filename: string): void {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function downloadDataUrl(dataUrl: string, filename: string): void {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
}

const EXPORT_RENDER_OPTS = { backgroundColor: '#020617', cacheBust: true, pixelRatio: 2 } as const;

// Raster/vector export of the React Flow canvas (PNG/SVG direct, PDF wraps
// the PNG in an A4 landscape page via jsPDF).
async function exportFlowElement(flowEl: HTMLElement, format: 'png' | 'svg' | 'pdf', stamp: string): Promise<void> {
    if (format === 'svg') {
        const dataUrl = await toSvg(flowEl, EXPORT_RENDER_OPTS);
        downloadDataUrl(dataUrl, `topology-${stamp}.svg`);
        return;
    }
    const png = await toPng(flowEl, EXPORT_RENDER_OPTS);
    if (format === 'png') {
        downloadDataUrl(png, `topology-${stamp}.png`);
        return;
    }
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    pdf.addImage(png, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
    pdf.save(`topology-${stamp}.pdf`);
}

export const TopologyGraph: React.FC<TopologyGraphProps> = ({ graph, height = '75vh' }) => {
    const { t } = useTranslation();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    const [mode, setMode] = useState<LayoutMode>('grouped');
    const reactFlowRef = useRef<ReactFlowInstance | null>(null);
    const [manualPositions, setManualPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
    const [dragMode, setDragMode] = useState(false);
    const [moveStep, setMoveStep] = useState(5);
    // Snap-to-grid toggle for the drag-edit experience. 10px grid is fine
    // enough to feel like free placement but still helps the user line two
    // cards on the same vertical/horizontal axis without arrow-key nudging.
    // OFF by default — the user explicitly asked for "free placement first".
    const [snapEnabled, setSnapEnabled] = useState<boolean>(() => {
        try { return globalThis.localStorage?.getItem(SNAP_STORAGE_KEY) === '1'; }
        catch { return false; }
    });
    useEffect(() => {
        try { globalThis.localStorage?.setItem(SNAP_STORAGE_KEY, snapEnabled ? '1' : '0'); }
        catch { /* quota / disabled — best-effort */ }
    }, [snapEnabled]);
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
            downloadJsonBlob(graph, `topology-${stamp}.json`);
            return;
        }
        const flowEl = document.querySelector('.react-flow') as HTMLElement | null;
        if (!flowEl) return;
        setExporting(true);
        try {
            reactFlowRef.current?.fitView({ padding: 0.1, duration: 0 });
            await new Promise(r => requestAnimationFrame(() => r(undefined)));
            await exportFlowElement(flowEl, format, stamp);
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
    const persistedFilters = useRef(loadPersistedFilters()).current;
    const [sourceFilter, setSourceFilter] = useState<Set<SourcePlugin>>(
        () => new Set(persistedFilters?.sources ?? ALL_SOURCES)
    );
    const [kindFilter, setKindFilter] = useState<Set<NodeKind>>(
        () => new Set(persistedFilters?.kinds ?? ALL_KINDS)
    );
    const [statusFilter, setStatusFilter] = useState<Set<Status>>(
        () => new Set(persistedFilters?.statuses ?? DEFAULT_STATUS)
    );
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [legendOpen, setLegendOpen] = useState(false);

    // Skip the initial mount: we'd just write back what we just read.
    const didMountFilters = useRef(false);
    useEffect(() => {
        if (!didMountFilters.current) {
            didMountFilters.current = true;
            return;
        }
        savePersistedFilters({
            sources: Array.from(sourceFilter),
            kinds: Array.from(kindFilter),
            statuses: Array.from(statusFilter)
        });
    }, [sourceFilter, kindFilter, statusFilter]);

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
        const counts: Record<NodeKind, number> = { gateway: 0, switch: 0, ap: 0, repeater: 0, 'vm-host': 0, client: 0, unknown: 0 };
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
            if (e.medium !== 'ethernet' && e.medium !== 'wifi') continue;
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

        const nodeById = new Map(filteredGraph.nodes.map(n => [n.id, n]));

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
                localUplinkPortIdxs: n.metadata?.localUplinkPortIdxs,
                vmCount: typeof n.metadata?.vmCount === 'number' ? n.metadata.vmCount : undefined,
                vmActiveCount: typeof n.metadata?.vmActiveCount === 'number' ? n.metadata.vmActiveCount : undefined,
                vmInactiveCount: typeof n.metadata?.vmInactiveCount === 'number' ? n.metadata.vmInactiveCount : undefined,
                hypervisor: typeof n.metadata?.hypervisor === 'string' ? n.metadata.hypervisor : undefined,
                modelDisplay: typeof n.metadata?.modelDisplay === 'string' ? n.metadata.modelDisplay : undefined,
                portsFromSnapshot: n.metadata?.portsFromSnapshot === true ? true : undefined,
                hasDedicatedUplink: typeof n.metadata?.hasDedicatedUplink === 'boolean' ? n.metadata.hasDedicatedUplink : undefined
            } satisfies TopologyNodeData
        }));

        const rfEdges: Edge[] = filteredGraph.edges.map(e => {
            const color = EDGE_COLOR[e.medium];
            const isUplink = e.medium === 'uplink';
            const isWifi = e.medium === 'wifi';
            const isVirtual = e.medium === 'virtual';
            // SSID / speed / port now live on the client card itself, so client
            // edges (ethernet + wifi) are unlabelled. Uplinks stay labelless.
            const label = isUplink ? buildEdgeLabel(e) : undefined;
            const marker: EdgeMarkerType = { type: MarkerType.ArrowClosed, color };
            // Wi-Fi: animated dashed line (marching-ants) so the wireless
            // relationship to the AP is unambiguous. Uplink: thicker dashed
            // mauve with right-angle routing pushed wide on the sides so it
            // doesn't overlap the parent→client edges. Virtual (VM→host):
            // thin dashed fuchsia. Ethernet: solid.
            const dasharray = pickEdgeDashArray(isWifi, isUplink, isVirtual);
            // `pt${idx}` only exists when the target renders an Uplink chip for that port
            // (inline grid, ≤12 ports, port in localUplinkPortIdxs). Falling back avoids
            // React Flow silently dropping the edge when the chip isn't there.
            const targetNode = nodeById.get(e.target);
            const targetUplinks = targetNode?.metadata?.localUplinkPortIdxs;
            const targetPortsCount = targetNode?.metadata?.ports?.length ?? 0;
            // Use the SAME rule TopologyNodeCard uses to render the chip — a
            // drift here makes edges target a non-existent `pt${idx}` handle
            // and React Flow silently drops them.
            const chipRendered = targetNode
                ? shouldRenderUplinkChip(targetNode.kind, targetNode.metadata?.hasDedicatedUplink)
                : false;
            const targetHasUplinkChip = chipRendered
                && typeof e.localPortIndex === 'number'
                && targetUplinks?.includes(e.localPortIndex) === true
                && targetPortsCount > 0
                && targetPortsCount <= 12;
            // Handles are intentionally left unset here. They are computed in
            // the `edges` memo below using the FINAL node positions (dagre +
            // manual overrides) so an edge always exits the side of the card
            // facing the other endpoint after a drag.
            //
            // type='smoothstep' gives clean right-angle paths with rounded
            // corners — the user wants right angles when needed, NOT a soft S
            // curve. Combined with the dynamic handle picker (which puts the
            // exit/entry on the natural side) and the increased dagre nodesep
            // /ranksep, the only bend you should see is the L-shape needed to
            // route between adjacent sides — no zigzags.
            const pathOptions = pickEdgePathOptions(isUplink, isWifi);
            const strokeWidth = pickEdgeStrokeWidth(isUplink, isWifi, isVirtual);
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
                pathOptions,
                style: {
                    stroke: color,
                    strokeWidth,
                    strokeDasharray: dasharray
                },
                markerEnd: marker,
                data: {
                    medium: e.medium,
                    linkSpeedMbps: e.linkSpeedMbps,
                    portIndex: e.portIndex,
                    localPortIndex: e.localPortIndex,
                    targetHasUplinkChip,
                    ssid: e.ssid,
                    band: e.band,
                    signal: e.signal
                }
            };
        });

        return layoutGraph(rfNodes, rfEdges, mode);
    }, [filteredGraph, mode]);

    // Manual placements only apply in the Grouped layout — Tree and
    // Horizontal are deterministic dagre layouts where mixing manual
    // positions with auto-layout is confusing. The positions stay in SQLite
    // and reappear when the user switches back to Grouped.
    //
    // We expose finalPositions as its own memo so `edgesWithHandles` below
    // can re-pick edge handles whenever a manual drag changes a position,
    // without re-running dagre (which lives in `layouted`).
    const finalPositions = useMemo(() => {
        const map = new Map<string, { x: number; y: number }>();
        for (const n of layouted.nodes) {
            const stored = editableMode ? manualPositions.get(n.id) : undefined;
            map.set(n.id, stored ?? n.position);
        }
        return map;
    }, [layouted.nodes, manualPositions, editableMode]);

    const nodes = useMemo<Node[]>(() => {
        return layouted.nodes.map(n => {
            const isSelected = n.id === selectedId;
            const pos = finalPositions.get(n.id) ?? n.position;
            return {
                ...n,
                position: pos,
                selected: isSelected,
                data: { ...n.data, editingMode: dragMode && editableMode }
            };
        });
    }, [layouted.nodes, finalPositions, selectedId, dragMode, editableMode]);

    // Re-pick handles using the FINAL positions: when a card is dragged to
    // the left of its parent, the edge should exit from the parent's left
    // side and enter the child's right side, instead of sticking to the
    // dagre-era top/bottom defaults. Also applies the "selected" highlight
    // (thicker stroke + drop-shadow glow) so the user gets feedback when they
    // click on a cable.
    //
    // Fan-out post-processing: when multiple edges leave the same source
    // through the central `s` (bottom) handle — typical of an AP serving many
    // Wi-Fi clients — they would all stack on one pixel. We spread them
    // across the s0..sN-1 fan handles ordered by target X. Same logic on the
    // target side for `t` (top) → t0..tN-1.
    const widthById = useMemo(() => {
        const map = new Map<string, number>();
        for (const n of layouted.nodes) map.set(n.id, getNodeWidth(n));
        return map;
    }, [layouted.nodes]);

    const edges = useMemo<Edge[]>(() => {
        const initial = layouted.edges.map(e => {
            const d = (e.data ?? {}) as {
                medium?: EdgeMedium;
                portIndex?: number;
                localPortIndex?: number;
                targetHasUplinkChip?: boolean;
            };
            const isWifi = d.medium === 'wifi';
            const isUplink = d.medium === 'uplink';
            const handles = pickEdgeHandles({
                mode,
                isWifi,
                isUplink,
                portIndex: d.portIndex,
                localPortIndex: d.localPortIndex,
                targetHasUplinkChip: d.targetHasUplinkChip === true,
                sourcePos: finalPositions.get(e.source),
                targetPos: finalPositions.get(e.target)
            });
            const isSelected = e.id === selectedEdgeId;
            const baseStyle = (e.style ?? {}) as React.CSSProperties;
            const baseStrokeWidth = typeof baseStyle.strokeWidth === 'number' ? baseStyle.strokeWidth : 1.6;
            const stroke = typeof baseStyle.stroke === 'string' ? baseStyle.stroke : '#94a3b8';
            const style: React.CSSProperties = isSelected
                ? {
                    ...baseStyle,
                    strokeWidth: baseStrokeWidth + 2,
                    filter: `drop-shadow(0 0 6px ${stroke})`
                }
                : baseStyle;
            // Always smoothstep — the user explicitly rejected diagonals
            // ("jamais oblique"). Decrochement / Z artefacts on parallel pairs
            // are mitigated by the FAN_OUT_COUNT bump (tighter handle grid)
            // and the smaller pathOptions offsets so any remaining bend is
            // a few pixels wide instead of a visible zigzag.
            return {
                ...e,
                type: 'smoothstep',
                sourceHandle: handles.source,
                targetHandle: handles.target,
                selected: isSelected,
                zIndex: isSelected ? 10 : undefined,
                style
            };
        });
        spreadCentralHandles(initial, finalPositions, widthById);
        return initial;
    }, [layouted.edges, finalPositions, widthById, mode, selectedEdgeId]);

    // Node selection and edge selection are mutually exclusive — clicking a
    // node clears the edge panel and vice versa. The pane click clears both.
    const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        setSelectedEdgeId(null);
        setSelectedId(prev => (prev === node.id ? null : node.id));
    }, []);

    const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
        setSelectedId(null);
        setSelectedEdgeId(prev => (prev === edge.id ? null : edge.id));
    }, []);

    const handlePaneClick = useCallback(() => {
        setSelectedId(null);
        setSelectedEdgeId(null);
    }, []);

    // Auto-fit the view in two cases:
    //  1. First time nodes appear (page load / tab switch back / filter reset)
    //  2. Layout mode change (Grouped / Tree / Horizontal)
    // We don't refit on every periodic poll — that would steal pan/zoom from
    // the user.
    //
    // The refs are updated INSIDE the timer callback (not in the effect body),
    // because React 18 strict mode runs effects twice in dev: setup → cleanup
    // → setup. Updating refs in the body would make the second setup see the
    // refs already up-to-date and bail, so fitView would never fire in dev.
    const lastFittedCountRef = useRef(0);
    const lastFittedModeRef = useRef<LayoutMode | null>(null);
    useEffect(() => {
        const count = layouted.nodes.length;
        if (count === 0) return;
        const firstLoad = lastFittedCountRef.current === 0;
        const modeChanged = lastFittedModeRef.current !== null && lastFittedModeRef.current !== mode;
        if (!firstLoad && !modeChanged) return;
        const id = globalThis.setTimeout(() => {
            reactFlowRef.current?.fitView({ padding: 0.2, duration: 400 });
            lastFittedCountRef.current = count;
            lastFittedModeRef.current = mode;
        }, 200);
        return () => globalThis.clearTimeout(id);
    }, [layouted, mode]);

    const nodeLabelById = useMemo(
        () => new Map(filteredGraph.nodes.map(n => [n.id, n.label])),
        [filteredGraph.nodes]
    );
    const selectedNode = useMemo(
        () => (selectedId ? filteredGraph.nodes.find(n => n.id === selectedId) ?? null : null),
        [filteredGraph.nodes, selectedId]
    );
    // Sort by port-on-this-device ascending so the side panel shows P1, P2, …
    // before the wifi/portless rows.
    const selectedEdges = useMemo(() => {
        if (!selectedId) return [];
        const list = filteredGraph.edges.filter(e => e.source === selectedId || e.target === selectedId);
        const portOf = (e: typeof list[number]): number => {
            const p = e.source === selectedId ? e.portIndex : e.localPortIndex;
            return typeof p === 'number' && p > 0 ? p : Number.MAX_SAFE_INTEGER;
        };
        return list.slice().sort((a, b) => portOf(a) - portOf(b));
    }, [filteredGraph.edges, selectedId]);

    // Edge selection: resolves the input edge and looks up the source switch's
    // matching port (so we can show PoE state on the panel — PoE is a property
    // of the port, not the edge).
    const selectedEdge = useMemo(
        () => (selectedEdgeId ? filteredGraph.edges.find(e => e.id === selectedEdgeId) ?? null : null),
        [filteredGraph.edges, selectedEdgeId]
    );
    const selectedEdgePoe = useMemo<boolean | null>(() => {
        if (!selectedEdge || typeof selectedEdge.portIndex !== 'number') return null;
        const src = filteredGraph.nodes.find(n => n.id === selectedEdge.source);
        const port = src?.metadata?.ports?.find(p => p.idx === selectedEdge.portIndex);
        return typeof port?.poe === 'boolean' ? port.poe : null;
    }, [selectedEdge, filteredGraph.nodes]);

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
                snapToGrid={dragMode && snapEnabled}
                snapGrid={SNAP_GRID}
                onNodeClick={handleNodeClick}
                onEdgeClick={handleEdgeClick}
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
                <div className="absolute top-3 right-3 w-96 lg:w-[28rem] max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-xl border-2 border-slate-600 bg-slate-800 shadow-2xl">
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
                        {(selectedNode.kind === 'ap' || selectedNode.kind === 'repeater') && (
                            <WifiSummaryBlock selectedNodeId={selectedNode.id} edges={selectedEdges} t={t} />
                        )}
                        {selectedEdges.length > 0 && (
                            <div className="pt-2 border-t border-slate-700">
                                <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">{t('topology.detail.links')}</div>
                                <div className="space-y-1.5">
                                    {selectedEdges.map(e => (
                                        <EdgeRow key={e.id} edge={e} selectedNodeId={selectedNode.id} nodeLabelById={nodeLabelById} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                );
            })()}

            {/* Edge info panel — mutually exclusive with the node panel.
                Click on a cable in the graph → this side panel slides in with
                medium, speed, port, SSID/band/signal and PoE state. */}
            {!selectedNode && selectedEdge && (
                <EdgeInfoPanel
                    edge={selectedEdge}
                    sourceLabel={nodeLabelById.get(selectedEdge.source) ?? selectedEdge.source.replace(/^mac:/, '')}
                    targetLabel={nodeLabelById.get(selectedEdge.target) ?? selectedEdge.target.replace(/^mac:/, '')}
                    poeActive={selectedEdgePoe}
                    onClose={() => setSelectedEdgeId(null)}
                    t={t}
                />
            )}

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
                    <button
                        onClick={() => setSnapEnabled(prev => !prev)}
                        title={snapEnabled ? t('topology.editToolbar.snapOn') : t('topology.editToolbar.snapOff')}
                        className={`flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wide rounded border transition-colors ${
                            snapEnabled
                                ? 'bg-sky-500/30 text-sky-100 border-sky-400/50'
                                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                        }`}
                    >
                        <Magnet size={11} />
                        <span>{t('topology.editToolbar.snap')}</span>
                        <span className={`font-mono text-[9px] ${snapEnabled ? 'text-sky-200' : 'text-slate-500'}`}>
                            {snapEnabled ? `${SNAP_GRID[0]}px` : t('topology.editToolbar.snapOff')}
                        </span>
                    </button>
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
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 inline-block" style={{ borderTop: `2px dashed ${EDGE_COLOR.virtual}` }} /> {t('topology.legend.virtual')}
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
                        <div>
                            <div className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">{t('topology.legend.ports')}</div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                                {PORT_LEGEND.map(p => (
                                    <span key={p.key} className="flex items-center gap-1.5">
                                        <span className={`w-3.5 h-3 rounded-sm border ${p.swatch}`} />
                                        {t(`topology.legend.${p.key}`)}
                                    </span>
                                ))}
                                <span className="flex items-center gap-1.5">
                                    <span className="relative inline-flex w-3.5 h-3 rounded-sm border bg-emerald-500 border-emerald-300">
                                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-1 ring-amber-200" />
                                    </span>
                                    {t('topology.legend.poe')}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

interface SsidAggregate { count: number; bands: Set<string> }

function aggregateBySsid(wifiEdges: TopologyEdgeIn[]): Map<string, SsidAggregate> {
    const out = new Map<string, SsidAggregate>();
    for (const e of wifiEdges) {
        const key = e.ssid || '—';
        const entry = out.get(key) ?? { count: 0, bands: new Set<string>() };
        entry.count++;
        if (e.band) entry.bands.add(e.band);
        out.set(key, entry);
    }
    return out;
}

function formatSsidBands(bands: Set<string>): string {
    return Array.from(bands).sort((a, b) => a.localeCompare(b)).join('/') || '—';
}

interface WifiSummaryBlockProps {
    selectedNodeId: string;
    edges: TopologyEdgeIn[];
    t: (k: string) => string;
}

const WifiSummaryBlock: React.FC<WifiSummaryBlockProps> = ({ selectedNodeId, edges, t }) => {
    const wifiOut = edges.filter(e => e.medium === 'wifi' && e.source === selectedNodeId);
    if (wifiOut.length === 0) return null;
    const bySsid = aggregateBySsid(wifiOut);
    const totalSpeed = wifiOut.reduce((s, e) => s + (e.linkSpeedMbps ?? 0), 0);
    const speedLabel = formatSpeed(totalSpeed) ?? '—';
    return (
        <div className="pt-2 border-t border-slate-700 space-y-1.5">
            <div className="text-xs uppercase tracking-wide text-slate-400">{t('topology.detail.wifiSummary')}</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-700/40 rounded px-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">{t('topology.detail.wifiClients')}</div>
                    <div className="font-mono text-sky-200">{wifiOut.length}</div>
                </div>
                <div className="bg-slate-700/40 rounded px-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">{t('topology.detail.wifiTotal')}</div>
                    <div className="font-mono text-sky-200">{speedLabel}</div>
                </div>
            </div>
            {bySsid.size > 0 && (
                <div className="space-y-1">
                    {Array.from(bySsid.entries()).map(([ssid, info]) => (
                        <SsidRow key={ssid} ssid={ssid} count={info.count} bandsText={formatSsidBands(info.bands)} />
                    ))}
                </div>
            )}
        </div>
    );
};

const SsidRow: React.FC<{ ssid: string; count: number; bandsText: string }> = ({ ssid, count, bandsText }) => (
    <div className="flex items-center justify-between gap-2 text-[11px] bg-slate-700/30 rounded px-2 py-1">
        <span className="truncate text-slate-200" title={ssid}>{ssid}</span>
        <span className="flex-none text-slate-400 font-mono">{count} · {bandsText}</span>
    </div>
);

interface EdgeRowProps {
    edge: TopologyEdgeIn;
    selectedNodeId: string;
    nodeLabelById: Map<string, string>;
}

function buildWifiMetaLine(edge: TopologyEdgeIn, speedTxt: string | null): string {
    const segments: string[] = [];
    if (typeof edge.signal === 'number') segments.push(`${edge.signal} dBm`);
    if (speedTxt) segments.push(speedTxt);
    return segments.join(' · ');
}

function buildPortBadgeText(hasPort: boolean, port: number | undefined, isOutgoing: boolean): string {
    if (hasPort) return `P${port}`;
    return isOutgoing ? '→' : '←';
}

const EdgeRow: React.FC<EdgeRowProps> = ({ edge, selectedNodeId, nodeLabelById }) => {
    const isOutgoing = edge.source === selectedNodeId;
    const otherId = isOutgoing ? edge.target : edge.source;
    const otherLabel = nodeLabelById.get(otherId) ?? otherId.replace(/^mac:/, '');
    const port = isOutgoing ? edge.portIndex : edge.localPortIndex;
    const isWifi = edge.medium === 'wifi';
    const hasPort = typeof port === 'number' && port > 0;
    const portBadge = buildPortBadgeText(hasPort, port, isOutgoing);
    const speedTxt = formatSpeed(edge.linkSpeedMbps) ?? null;
    const bandSuffix = edge.band ? ` · ${edge.band}` : '';
    const wifiSsidLine = `${edge.ssid ?? '—'}${bandSuffix}`;
    const wifiMetaLine = buildWifiMetaLine(edge, speedTxt);
    const showWifiMeta = isWifi && (edge.ssid || edge.band || speedTxt || typeof edge.signal === 'number');
    return (
        <div className={`flex items-start gap-2 text-xs px-1.5 py-1 rounded ${isWifi ? 'bg-sky-500/5' : ''}`}>
            {isWifi
                ? <Wifi size={12} className={`flex-none mt-0.5 ${EDGE_ICON_COLOR.wifi}`} />
                : <Cable size={12} className={`flex-none mt-0.5 ${EDGE_ICON_COLOR[edge.medium]}`} />}
            <span className={`flex-none font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border ${PORT_BADGE_CLASS[edge.medium]} ${hasPort ? '' : 'opacity-50'}`}>
                {portBadge}
            </span>
            <div className="min-w-0 flex-1">
                <div className="text-slate-200 truncate" title={otherLabel}>{otherLabel}</div>
                {showWifiMeta && (
                    <div className="grid grid-cols-[1fr_auto] gap-x-2 mt-0.5 text-[10px] text-slate-400 leading-tight">
                        <span className="truncate" title={edge.ssid ?? ''}>{wifiSsidLine}</span>
                        <span className="font-mono whitespace-nowrap">{wifiMetaLine}</span>
                    </div>
                )}
            </div>
            {!isWifi && speedTxt && (
                <span className="ml-auto text-slate-400 font-mono whitespace-nowrap">{speedTxt}</span>
            )}
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

interface EdgeInfoPanelProps {
    edge: TopologyEdgeIn;
    sourceLabel: string;
    targetLabel: string;
    poeActive: boolean | null;
    onClose: () => void;
    t: (k: string) => string;
}

const EdgeInfoPanel: React.FC<EdgeInfoPanelProps> = ({ edge, sourceLabel, targetLabel, poeActive, onClose, t }) => {
    const speed = formatSpeed(edge.linkSpeedMbps);
    const accent = EDGE_COLOR[edge.medium];
    const MediumIcon = edge.medium === 'wifi' ? Wifi : Cable;
    return (
        <div className="absolute top-3 right-3 w-96 lg:w-[28rem] max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-xl border-2 border-slate-600 bg-slate-800 shadow-2xl">
            <div className="h-1" style={{ background: accent }} />
            <div className="flex items-start justify-between gap-2 p-4 border-b border-slate-700">
                <div className="min-w-0 flex-1">
                    <div className="text-xs uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
                        <MediumIcon size={11} className={EDGE_ICON_COLOR[edge.medium]} />
                        <span>{t(`topology.medium.${edge.medium}`)}</span>
                    </div>
                    <div className="text-base font-semibold text-slate-100 truncate flex items-center gap-1.5 mt-0.5">
                        <span className="truncate" title={sourceLabel}>{sourceLabel}</span>
                        <ArrowRightLeft size={13} className="flex-none text-slate-400" />
                        <span className="truncate" title={targetLabel}>{targetLabel}</span>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
                    aria-label={t('common.close')}
                >
                    <X size={16} />
                </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
                {speed && (
                    <DetailRow icon={<Gauge size={14} />} label={t('topology.edgeInfo.speed')} value={speed} mono />
                )}
                {typeof edge.portIndex === 'number' && (
                    <DetailRow
                        icon={<Hash size={14} />}
                        label={t('topology.edgeInfo.sourcePort')}
                        value={`Port ${edge.portIndex}`}
                        mono
                    />
                )}
                {typeof edge.localPortIndex === 'number' && (
                    <DetailRow
                        icon={<Hash size={14} />}
                        label={t('topology.edgeInfo.targetPort')}
                        value={`Port ${edge.localPortIndex}`}
                        mono
                    />
                )}
                {edge.ssid && (
                    <DetailRow
                        icon={<Wifi size={14} />}
                        label={t('topology.edgeInfo.ssid')}
                        value={`${edge.ssid}${edge.band ? ' · ' + edge.band : ''}`}
                    />
                )}
                {typeof edge.signal === 'number' && (
                    <DetailRow
                        icon={<Wifi size={14} />}
                        label={t('topology.edgeInfo.signal')}
                        value={`${edge.signal} dBm`}
                        mono
                    />
                )}
                {poeActive !== null && (
                    <DetailRow
                        icon={<Zap size={14} className={poeActive ? 'text-amber-300' : 'text-slate-500'} />}
                        label={t('topology.edgeInfo.poe')}
                        value={poeActive ? t('topology.edgeInfo.poeActive') : t('topology.edgeInfo.poeInactive')}
                    />
                )}
                <DetailRow icon={<Tag size={14} />} label={t('topology.edgeInfo.source_plugin')} value={edge.source_plugin} />
            </div>
        </div>
    );
};

export default TopologyGraph;
