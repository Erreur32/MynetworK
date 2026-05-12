/**
 * Layout helpers for the topology graph.
 *
 * Three modes are supported:
 *  - `tree`       : dagre left-to-right hierarchy (root on the left,
 *                   branches stacking down) — looks like a tree at first
 *                   glance, hence the name
 *  - `horizontal` : wrapped TB layout — top-down hierarchy where each
 *                   parent's clients are stacked in a small grid below it,
 *                   so the diagram grows in height instead of width
 *  - `grouped`    : graphviz-cluster style — clients are visually grouped
 *                   inside their parent AP/switch/gateway. Best for dense
 *                   networks
 *
 * Edge convention: edges go parent → child (source = parent, target = child).
 * dagre TB places the source above the target, so this puts the gateway at
 * the top and clients at the bottom.
 */

import dagre from 'dagre';
import { Position, type Edge, type Node } from '@xyflow/react';
import type { TopologyNodeData } from './TopologyNodeCard';

export type LayoutMode = 'tree' | 'horizontal' | 'grouped';

// Network infrastructure cards (gateway, switch, AP, repeater) — bigger
// than the client cards so they read clearly even in a sea of small clients.
// MUST stay in sync with INFRA_CARD_WIDTH / PORT_CELL_WIDTH in
// TopologyNodeCard.tsx — dagre uses these for hit boxes, so a mismatch makes
// edges land off-port.
const NODE_WIDTH = 300;
const NODE_HEIGHT = 92;
// vm-host: same height as regular infra + an extra info row (~28 px).
const VM_HOST_NODE_WIDTH = 340;
const VM_HOST_NODE_HEIGHT = 120;
// Must match CLIENT_CARD_WIDTH in TopologyNodeCard.tsx — dagre reserves slots
// at this width while the card renders at the same width; a mismatch leaves
// client cards overflowing their reserved column.
const CLIENT_NODE_WIDTH = 220;

const SWITCH_INLINE_PORTS_MAX = 12;
const PORT_CELL_WIDTH = 28;
const PORT_ROW_HEIGHT = 22;

function portsFor(node: Node): TopologyNodeData['ports'] {
    const data = node.data as TopologyNodeData | undefined;
    if (!data) return undefined;
    if (data.kind !== 'switch' && data.kind !== 'gateway') return undefined;
    return data.ports;
}

function isInfraData(data: TopologyNodeData | undefined): boolean {
    if (!data) return false;
    return INFRA_KINDS.has(data.kind);
}

export function getNodeWidth(node: Node): number {
    const data = node.data as TopologyNodeData | undefined;
    if (!isInfraData(data)) return CLIENT_NODE_WIDTH;
    if (data?.kind === 'vm-host') return VM_HOST_NODE_WIDTH;
    const ports = portsFor(node);
    if (ports && ports.length > 0 && ports.length <= SWITCH_INLINE_PORTS_MAX) {
        return Math.max(NODE_WIDTH, ports.length * PORT_CELL_WIDTH + 18);
    }
    return NODE_WIDTH;
}

function nodeHeightFor(node: Node): number {
    const data = node.data as TopologyNodeData | undefined;
    if (!isInfraData(data)) return CLIENT_H;
    if (data?.kind === 'vm-host') return VM_HOST_NODE_HEIGHT;
    const ports = portsFor(node);
    if (!ports || ports.length === 0) return NODE_HEIGHT;
    const fitsInline = ports.length <= SWITCH_INLINE_PORTS_MAX;
    const rows = fitsInline ? 1 : Math.ceil(ports.length / 8);
    return NODE_HEIGHT + rows * PORT_ROW_HEIGHT + 6;
}

const CLIENT_H = 56;

// Treat vm-host as infra so it gets the bigger card, sits in the dagre
// hierarchy (under its switch), and its child VMs cluster below it.
const INFRA_KINDS = new Set(['gateway', 'switch', 'ap', 'repeater', 'vm-host']);

function getNodeKind(node: Node): string {
    const data = node.data as TopologyNodeData | undefined;
    return data?.kind ?? '';
}

function isInfra(node: Node): boolean {
    return INFRA_KINDS.has(getNodeKind(node));
}

function buildParentMap(edges: Edge[], nodeById: Map<string, Node>): Map<string, string> {
    const parentByClient = new Map<string, string>();
    for (const e of edges) {
        const s = nodeById.get(e.source);
        const t = nodeById.get(e.target);
        if (!s || !t) continue;
        const sIsInfra = isInfra(s);
        const tIsInfra = isInfra(t);
        if (sIsInfra && !tIsInfra) parentByClient.set(t.id, s.id);
        else if (!sIsInfra && tIsInfra) parentByClient.set(s.id, t.id);
    }
    return parentByClient;
}

function bucketChildren(
    clientNodes: Node[],
    parentByClient: Map<string, string>,
    orphanKey: string
): Map<string, string[]> {
    const childrenByParent = new Map<string, string[]>();
    for (const c of clientNodes) {
        const parent = parentByClient.get(c.id) ?? orphanKey;
        const bucket = childrenByParent.get(parent);
        if (bucket) bucket.push(c.id);
        else childrenByParent.set(parent, [c.id]);
    }
    return childrenByParent;
}

function isInfraInfraEdge(e: Edge, nodeById: Map<string, Node>): boolean {
    const s = nodeById.get(e.source);
    const t = nodeById.get(e.target);
    return Boolean(s && t && isInfra(s) && isInfra(t));
}

function dagreLayout(
    nodes: Node[],
    edges: Edge[],
    direction: 'TB' | 'LR'
): { nodes: Node[]; edges: Edge[] } {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
        rankdir: direction,
        nodesep: direction === 'LR' ? 24 : 36,
        ranksep: 80,
        marginx: 20,
        marginy: 20
    });

    for (const node of nodes) {
        g.setNode(node.id, { width: getNodeWidth(node), height: nodeHeightFor(node) });
    }
    for (const edge of edges) g.setEdge(edge.source, edge.target);

    dagre.layout(g);

    const isHorizontal = direction === 'LR';
    const positioned: Node[] = nodes.map(node => {
        const pos = g.node(node.id);
        const w = getNodeWidth(node);
        const h = nodeHeightFor(node);
        return {
            ...node,
            targetPosition: isHorizontal ? Position.Left : Position.Top,
            sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
            position: {
                x: (pos?.x ?? 0) - w / 2,
                y: (pos?.y ?? 0) - h / 2
            }
        };
    });

    return { nodes: positioned, edges };
}

function isWifiCluster(parentId: string, nodeById: Map<string, Node>): boolean {
    const parent = nodeById.get(parentId);
    const data = parent?.data as TopologyNodeData | undefined;
    return data?.kind === 'ap' || data?.kind === 'repeater';
}

const ORPHAN = '__orphan__';

// Horizontal-mode layout. Three cluster placements depending on parent kind
// and child count:
//   - 'wifi-accordion'      Wi-Fi clients flank the AP (alternating L/R, half-row stagger)
//   - 'wired-column'        ≤6 wired clients: single vertical column on the right of the switch
//   - 'wired-split-columns' 7-12 wired clients: column on the right AND on the left
//   - 'grid'                fallback for very large unstructured sets
// dim.h is the CLUSTER height ONLY (without the parent card). The "reserved
// height" used by dagre = parent.baseH + vgap + dim.h, computed in one place
// (infraReservedHeight) so siblings can be equalised — without that, an AP
// with 18 clients and a sibling sub-switch with 4 clients would render on
// different Y lines under the same main switch.
type WrappedPlacement = 'wifi-accordion' | 'wired-column' | 'wired-split-columns' | 'grid';
type WrappedAnchor = 'left' | 'center';
interface WrappedDim { w: number; h: number; placement: WrappedPlacement; anchor: WrappedAnchor }

const WRAPPED_HGAP = 28;
const WRAPPED_VGAP = 18;
const WRAPPED_CLIENT_VGAP = 50;     // gap between an infra card and its cluster below
const WRAPPED_SUBTREE_PAD = 60;     // breathing room added around centered sub-trees in dagre
const WIFI_SPINE_GAP_MIN = 56;      // floor: never tighter than this even for narrow APs
const WIFI_SPINE_BREATH = 24;       // breathing room on each side of the AP card inside the channel
const WIFI_CLIENT_VGAP = 36;        // vertical gap between two cards on the same wifi side column
const WIRED_COL_VGAP = 24;          // vertical gap between two wired cards in a column
const WIRED_COL_HGAP = 48;          // horizontal gap between a switch and its wired column
const WIRED_COL_MAX = 6;            // max wired clients per single column before splitting / falling back

// Horizontal distance from the AP centre to the nearest edge of a flanking
// client card. Sized so the AP card itself fits INSIDE the channel between
// the two client columns (parentW / 2 + breathing on each side) — without
// this the wide AP / VM-host cards (300-340 px) overlapped the client cards
// because the constant 56 px channel was too narrow.
function wifiSpineGap(parentW: number): number {
    return Math.max(WIFI_SPINE_GAP_MIN, parentW / 2 + WIFI_SPINE_BREATH);
}

function wiredColumnHeight(n: number): number {
    return n * CLIENT_H + Math.max(0, n - 1) * WIRED_COL_VGAP;
}

function wifiAccordionHeight(n: number): number {
    // Two side columns staggered by half a row.
    const rowH = CLIENT_H + WIFI_CLIENT_VGAP;
    const rowsPerSide = Math.max(1, Math.ceil(n / 2));
    return rowsPerSide * rowH + (n > 1 ? rowH / 2 : 0);
}

function wifiAccordionWidth(parentW: number): number {
    return 2 * CLIENT_NODE_WIDTH + 2 * wifiSpineGap(parentW);
}

function computeWrappedDims(
    childrenByParent: Map<string, string[]>,
    nodeById: Map<string, Node>
): Map<string, WrappedDim> {
    const dims = new Map<string, WrappedDim>();
    for (const [parentId, children] of childrenByParent) {
        const n = children.length;
        const wifi = isWifiCluster(parentId, nodeById);
        if (wifi) {
            const parentNode = nodeById.get(parentId);
            const parentW = parentNode ? getNodeWidth(parentNode) : NODE_WIDTH;
            dims.set(parentId, {
                w: wifiAccordionWidth(parentW),
                h: wifiAccordionHeight(n),
                placement: 'wifi-accordion',
                anchor: 'center'
            });
            continue;
        }
        if (n <= WIRED_COL_MAX) {
            dims.set(parentId, {
                w: NODE_WIDTH + WIRED_COL_HGAP + CLIENT_NODE_WIDTH,
                h: wiredColumnHeight(n),
                placement: 'wired-column',
                anchor: 'left'
            });
            continue;
        }
        if (n <= WIRED_COL_MAX * 2) {
            const rightN = WIRED_COL_MAX;
            const leftN = n - WIRED_COL_MAX;
            dims.set(parentId, {
                w: NODE_WIDTH + 2 * (WIRED_COL_HGAP + CLIENT_NODE_WIDTH),
                h: Math.max(wiredColumnHeight(rightN), wiredColumnHeight(leftN)),
                placement: 'wired-split-columns',
                anchor: 'center'
            });
            continue;
        }
        // Grid fallback for very large sets — rare in practice.
        const cols = 4;
        const rows = Math.ceil(n / cols);
        dims.set(parentId, {
            w: cols * CLIENT_NODE_WIDTH + (cols - 1) * WRAPPED_HGAP,
            h: rows * CLIENT_H + (rows - 1) * WRAPPED_VGAP,
            placement: 'grid',
            anchor: 'center'
        });
    }
    return dims;
}

// Single source of truth for the vertical space an infra needs in the dagre
// rank: its own card + the gap + its cluster (if any). dim.h is cluster only.
function infraReservedHeight(node: Node, dim: WrappedDim | undefined): number {
    const baseH = nodeHeightFor(node);
    if (!dim) return baseH;
    return baseH + WRAPPED_CLIENT_VGAP + dim.h;
}

// Force every infra-sibling group (same parent) to share the largest reserved
// height. Combined with dagre TB (which centres same-rank nodes on the same
// Y), this puts every AP / sub-switch / VM-host hanging off the main switch
// on a single horizontal line — what the user asked for.
function equalizeSiblings(
    infraNodes: Node[],
    edges: Edge[],
    nodeById: Map<string, Node>,
    dims: Map<string, WrappedDim>
): Map<string, number> {
    const heights = new Map<string, number>();
    for (const n of infraNodes) heights.set(n.id, infraReservedHeight(n, dims.get(n.id)));
    const siblingsByParent = new Map<string, string[]>();
    for (const e of edges) {
        if (!isInfraInfraEdge(e, nodeById)) continue;
        const bucket = siblingsByParent.get(e.source);
        if (bucket) bucket.push(e.target);
        else siblingsByParent.set(e.source, [e.target]);
    }
    for (const siblings of siblingsByParent.values()) {
        if (siblings.length < 2) continue;
        let max = 0;
        for (const id of siblings) max = Math.max(max, heights.get(id) ?? 0);
        for (const id of siblings) {
            const cur = heights.get(id) ?? 0;
            if (cur < max) heights.set(id, max);
        }
    }
    return heights;
}

// All placement helpers take a `clientById` Map (built once in
// buildHierarchicalLayout) so per-child lookup is O(1) instead of an
// O(N) scan of `clientNodes` — matters when a switch has 50+ ports.
function placeWifiAccordion(parent: Node, children: string[], clientById: Map<string, Node>): Node[] {
    const parentW = getNodeWidth(parent);
    const parentCx = parent.position.x + parentW / 2;
    const spineGap = wifiSpineGap(parentW);  // AP card sits centred inside the channel between columns
    const baseY = parent.position.y + nodeHeightFor(parent) + WRAPPED_CLIENT_VGAP;
    const rowH = CLIENT_H + WIFI_CLIENT_VGAP;
    const out: Node[] = [];
    children.forEach((cid, idx) => {
        const c = clientById.get(cid);
        if (!c) return;
        const isLeft = idx % 2 === 0;
        const sideRow = Math.floor(idx / 2);
        const y = baseY + sideRow * rowH + (isLeft ? 0 : rowH / 2);
        const x = isLeft
            ? parentCx - spineGap - CLIENT_NODE_WIDTH
            : parentCx + spineGap;
        out.push({
            ...c,
            // Cable enters from the side facing the AP spine.
            targetPosition: isLeft ? Position.Right : Position.Left,
            sourcePosition: Position.Bottom,
            position: { x, y }
        });
    });
    return out;
}

function placeWiredColumn(
    parent: Node,
    xLeft: number,
    children: string[],
    clientById: Map<string, Node>,
    side: 'left' | 'right'
): Node[] {
    const baseY = parent.position.y + nodeHeightFor(parent) + WRAPPED_CLIENT_VGAP;
    const target = side === 'right' ? Position.Left : Position.Right;
    const out: Node[] = [];
    children.forEach((cid, idx) => {
        const c = clientById.get(cid);
        if (!c) return;
        out.push({
            ...c,
            targetPosition: target,
            sourcePosition: Position.Bottom,
            position: { x: xLeft, y: baseY + idx * (CLIENT_H + WIRED_COL_VGAP) }
        });
    });
    return out;
}

function placeOrphanGrid(
    children: string[],
    clientById: Map<string, Node>,
    orphanX: number,
    dim: WrappedDim
): { nodes: Node[]; nextOrphanX: number } {
    const cols = Math.max(1, Math.min(4, children.length));
    const out: Node[] = [];
    children.forEach((cid, idx) => {
        const c = clientById.get(cid);
        if (!c) return;
        const col = idx % cols, row = Math.floor(idx / cols);
        out.push({
            ...c,
            targetPosition: Position.Top,
            sourcePosition: Position.Bottom,
            position: {
                x: orphanX + col * (CLIENT_NODE_WIDTH + WRAPPED_HGAP),
                y: row * (CLIENT_H + WRAPPED_VGAP)
            }
        });
    });
    return { nodes: out, nextOrphanX: orphanX - dim.w - 80 };
}

function placeWrappedChildren(
    parent: Node | undefined,
    children: string[],
    clientById: Map<string, Node>,
    dim: WrappedDim,
    orphanX: number
): { nodes: Node[]; nextOrphanX: number } {
    if (!parent) return placeOrphanGrid(children, clientById, orphanX, dim);
    if (dim.placement === 'wifi-accordion') {
        return { nodes: placeWifiAccordion(parent, children, clientById), nextOrphanX: orphanX };
    }
    if (dim.placement === 'wired-column') {
        const xLeft = parent.position.x + getNodeWidth(parent) + WIRED_COL_HGAP;
        return { nodes: placeWiredColumn(parent, xLeft, children, clientById, 'right'), nextOrphanX: orphanX };
    }
    if (dim.placement === 'wired-split-columns') {
        const right = children.slice(0, WIRED_COL_MAX);
        const left = children.slice(WIRED_COL_MAX);
        const rightX = parent.position.x + getNodeWidth(parent) + WIRED_COL_HGAP;
        const leftX = parent.position.x - WIRED_COL_HGAP - CLIENT_NODE_WIDTH;
        return {
            nodes: [
                ...placeWiredColumn(parent, rightX, right, clientById, 'right'),
                ...placeWiredColumn(parent, leftX, left, clientById, 'left')
            ],
            nextOrphanX: orphanX
        };
    }
    // grid — large fallback, cluster centered below parent
    const cols = 4;
    const baseX = parent.position.x + getNodeWidth(parent) / 2 - dim.w / 2;
    const baseY = parent.position.y + nodeHeightFor(parent) + WRAPPED_CLIENT_VGAP;
    const out: Node[] = [];
    children.forEach((cid, idx) => {
        const c = clientById.get(cid);
        if (!c) return;
        const col = idx % cols, row = Math.floor(idx / cols);
        out.push({
            ...c,
            targetPosition: Position.Top,
            sourcePosition: Position.Bottom,
            position: {
                x: baseX + col * (CLIENT_NODE_WIDTH + WRAPPED_HGAP),
                y: baseY + row * (CLIENT_H + WRAPPED_VGAP)
            }
        });
    });
    return { nodes: out, nextOrphanX: orphanX };
}

interface HierarchicalOpts { nodesep: number; ranksep: number }

// Shared implementation behind both `horizontal` and `grouped` modes — they
// use the same placement system (wifi-accordion / wired-column / split / grid)
// and the same sibling Y equalisation. Only the dagre rank/node spacing
// differs: `horizontal` gets generous spacing for readability on big trees,
// `grouped` packs tighter to read as a denser dashboard.
function buildHierarchicalLayout(
    nodes: Node[],
    edges: Edge[],
    opts: HierarchicalOpts
): { nodes: Node[]; edges: Edge[] } {
    const nodeById = new Map(nodes.map(n => [n.id, n] as const));
    const infraNodes = nodes.filter(isInfra);
    const clientNodes = nodes.filter(n => !isInfra(n));

    const parentByClient = buildParentMap(edges, nodeById);
    const childrenByParent = bucketChildren(clientNodes, parentByClient, ORPHAN);
    const dims = computeWrappedDims(childrenByParent, nodeById);
    const reservedH = equalizeSiblings(infraNodes, edges, nodeById, dims);

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', nodesep: opts.nodesep, ranksep: opts.ranksep, marginx: 40, marginy: 40 });

    for (const n of infraNodes) {
        const dim = dims.get(n.id);
        const baseW = getNodeWidth(n);
        // anchor='left' lays out parent flush-left in its box (no centring pad);
        // others stay centred with subtree pad for breathing room.
        const w = dim
            ? Math.max(baseW, dim.w) + (dim.anchor === 'left' ? 0 : WRAPPED_SUBTREE_PAD)
            : baseW;
        const h = reservedH.get(n.id) ?? nodeHeightFor(n);
        g.setNode(n.id, { width: w, height: h });
    }
    for (const e of edges) {
        if (isInfraInfraEdge(e, nodeById)) g.setEdge(e.source, e.target);
    }
    dagre.layout(g);

    const positionedInfra: Node[] = infraNodes.map(n => {
        const dim = dims.get(n.id);
        const baseW = getNodeWidth(n);
        const h = reservedH.get(n.id) ?? nodeHeightFor(n);
        const pos = g.node(n.id);
        // anchor='left': parent flush-left in the reserved box so the right
        // column sits in the space to its right. anchor='center': parent
        // centred on the box centre.
        const infraX = dim?.anchor === 'left'
            ? (pos?.x ?? 0) - dim.w / 2
            : (pos?.x ?? 0) - baseW / 2;
        return {
            ...n,
            targetPosition: Position.Top,
            sourcePosition: Position.Bottom,
            position: { x: infraX, y: (pos?.y ?? 0) - h / 2 }
        };
    });

    const positionedClients: Node[] = [];
    let orphanX = -500;
    // Index for O(1) parent/child lookups inside the placement loop (was
    // O(P×I) and O(N²) with `.find()` on each child).
    const clientById = new Map(clientNodes.map(c => [c.id, c] as const));
    const infraById = new Map(positionedInfra.map(n => [n.id, n] as const));
    for (const [parentId, children] of childrenByParent) {
        const dim = dims.get(parentId);
        if (!dim) continue;
        const parent = infraById.get(parentId);
        const placed = placeWrappedChildren(parent, children, clientById, dim, orphanX);
        positionedClients.push(...placed.nodes);
        orphanX = placed.nextOrphanX;
    }

    return { nodes: [...positionedInfra, ...positionedClients], edges };
}

function wrappedTreeLayout(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
    return buildHierarchicalLayout(nodes, edges, { nodesep: 100, ranksep: 130 });
}

function groupedLayout(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
    // Tighter spacing than horizontal so the layout reads as a denser
    // dashboard — same placement modes, just packed closer.
    return buildHierarchicalLayout(nodes, edges, { nodesep: 60, ranksep: 90 });
}

export function layoutGraph(
    nodes: Node[],
    edges: Edge[],
    mode: LayoutMode = 'grouped'
): { nodes: Node[]; edges: Edge[] } {
    if (mode === 'tree') return dagreLayout(nodes, edges, 'LR');
    if (mode === 'horizontal') return wrappedTreeLayout(nodes, edges);
    return groupedLayout(nodes, edges);
}
