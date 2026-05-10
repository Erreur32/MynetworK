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
const NODE_WIDTH = 240;
const NODE_HEIGHT = 76;
const CLIENT_NODE_WIDTH = 170;

const SWITCH_INLINE_PORTS_MAX = 12;
const PORT_CELL_WIDTH = 22;

function portsFor(node: Node): TopologyNodeData['ports'] {
    const data = node.data as TopologyNodeData | undefined;
    if (!data) return undefined;
    if (data.kind !== 'switch' && data.kind !== 'gateway') return undefined;
    return data.ports;
}

function isInfraData(data: TopologyNodeData | undefined): boolean {
    if (!data) return false;
    return data.kind === 'gateway' || data.kind === 'switch' || data.kind === 'ap' || data.kind === 'repeater';
}

export function getNodeWidth(node: Node): number {
    const data = node.data as TopologyNodeData | undefined;
    if (!isInfraData(data)) return CLIENT_NODE_WIDTH;
    const ports = portsFor(node);
    if (ports && ports.length > 0 && ports.length <= SWITCH_INLINE_PORTS_MAX) {
        return Math.max(NODE_WIDTH, ports.length * PORT_CELL_WIDTH + 18);
    }
    return NODE_WIDTH;
}

function nodeHeightFor(node: Node): number {
    const data = node.data as TopologyNodeData | undefined;
    if (!isInfraData(data)) return CLIENT_H;
    const ports = portsFor(node);
    if (!ports || ports.length === 0) return NODE_HEIGHT;
    const fitsInline = ports.length <= SWITCH_INLINE_PORTS_MAX;
    const rows = fitsInline ? 1 : Math.ceil(ports.length / 8);
    return NODE_HEIGHT + rows * 18 + 6;
}

const CLIENT_W = CLIENT_NODE_WIDTH;
const CLIENT_H = 56;
const CLIENT_GAP_X = 10;
const CLIENT_GAP_Y = 8;
const GROUP_PAD = 12;
const GROUP_PAD_TOP = 36;

const INFRA_KINDS = new Set(['gateway', 'switch', 'ap', 'repeater']);

function getNodeKind(node: Node): string {
    const data = node.data as TopologyNodeData | undefined;
    return data?.kind ?? '';
}

function isInfra(node: Node): boolean {
    return INFRA_KINDS.has(getNodeKind(node));
}

interface GroupNodeData extends Record<string, unknown> {
    parentId?: string;
    parentLabel: string;
    count: number;
    kind: string;
}

function getGroupParentId(node: Node, fallback: string): string {
    const data = node.data as GroupNodeData | undefined;
    return data?.parentId ?? fallback;
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

interface GroupedDim { w: number; h: number; cols: number; vGap: number }

const WIFI_CLUSTER_VGAP = 32; // taller gap so the wifi edge label fits
const WIFI_CLUSTER_COLS = 1;  // single column for wifi: each client gets its own row & left-side edge
const WIRED_FLAT_MAX_COLS = 12; // wired switch clients laid flat on a single row up to this count, then wraps

function isWifiCluster(parentId: string, nodeById: Map<string, Node>): boolean {
    const parent = nodeById.get(parentId);
    const data = parent?.data as TopologyNodeData | undefined;
    return data?.kind === 'ap' || data?.kind === 'repeater';
}

function computeGroupedDims(childrenByParent: Map<string, string[]>, nodeById: Map<string, Node>): Map<string, GroupedDim> {
    const dims = new Map<string, GroupedDim>();
    for (const [parent, children] of childrenByParent) {
        const wifi = isWifiCluster(parent, nodeById);
        const n = children.length;
        const cols = wifi
            ? WIFI_CLUSTER_COLS
            : Math.max(1, Math.min(WIRED_FLAT_MAX_COLS, n));
        const vGap = wifi ? WIFI_CLUSTER_VGAP : CLIENT_GAP_Y;
        const rows = Math.ceil(n / cols);
        const w = cols * CLIENT_W + (cols - 1) * CLIENT_GAP_X + GROUP_PAD * 2;
        const h = rows * CLIENT_H + (rows - 1) * vGap + GROUP_PAD_TOP + GROUP_PAD;
        dims.set(parent, { w, h, cols, vGap });
    }
    return dims;
}

const ORPHAN_PARENT = '__orphans__';

function buildGroupNode(
    parentKey: string,
    childCount: number,
    dim: GroupedDim,
    nodeById: Map<string, Node>
): Node {
    const isOrphan = parentKey === ORPHAN_PARENT;
    const parentNode = isOrphan ? null : nodeById.get(parentKey);
    const parentData = parentNode?.data as TopologyNodeData | undefined;
    const data: GroupNodeData = {
        parentId: isOrphan ? undefined : parentKey,
        parentLabel: isOrphan ? 'Discovered' : (parentData?.label ?? '?'),
        count: childCount,
        kind: isOrphan ? 'discovered' : (parentData?.kind ?? 'switch')
    };
    return {
        id: `group:${parentKey}`,
        type: 'topologyGroup',
        position: { x: 0, y: 0 },
        data,
        style: { width: dim.w, height: dim.h, background: 'transparent', border: 'none' },
        selectable: false,
        draggable: false,
        zIndex: -1
    };
}

function placeChildrenInGroup(
    parentKey: string,
    children: string[],
    clientNodes: Node[],
    dim: GroupedDim
): Node[] {
    const out: Node[] = [];
    children.forEach((cid, idx) => {
        const client = clientNodes.find(c => c.id === cid);
        if (!client) return;
        const col = idx % dim.cols;
        const row = Math.floor(idx / dim.cols);
        out.push({
            ...client,
            parentId: `group:${parentKey}`,
            extent: 'parent',
            targetPosition: Position.Top,
            sourcePosition: Position.Bottom,
            position: {
                x: GROUP_PAD + col * (CLIENT_W + CLIENT_GAP_X),
                y: GROUP_PAD_TOP + row * (CLIENT_H + dim.vGap)
            }
        });
    });
    return out;
}

function buildGroupedDagre(
    infraNodes: Node[],
    groupNodes: Node[],
    edges: Edge[],
    childrenByParent: Map<string, string[]>,
    dims: Map<string, GroupedDim>,
    nodeById: Map<string, Node>
): dagre.graphlib.Graph {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 70, marginx: 20, marginy: 20 });

    for (const n of infraNodes) {
        g.setNode(n.id, { width: getNodeWidth(n), height: nodeHeightFor(n) });
    }
    for (const grp of groupNodes) {
        const dim = dims.get(getGroupParentId(grp, ORPHAN_PARENT));
        if (dim) g.setNode(grp.id, { width: dim.w, height: dim.h });
    }
    for (const e of edges) {
        if (isInfraInfraEdge(e, nodeById)) g.setEdge(e.source, e.target);
    }
    for (const parent of childrenByParent.keys()) {
        if (parent !== ORPHAN_PARENT) g.setEdge(parent, `group:${parent}`);
    }
    dagre.layout(g);
    return g;
}

function positionGroupedInfra(infraNodes: Node[], g: dagre.graphlib.Graph): Node[] {
    return infraNodes.map(n => {
        const pos = g.node(n.id);
        const w = getNodeWidth(n);
        const h = nodeHeightFor(n);
        return {
            ...n,
            targetPosition: Position.Top,
            sourcePosition: Position.Bottom,
            position: { x: (pos?.x ?? 0) - w / 2, y: (pos?.y ?? 0) - h / 2 }
        };
    });
}

function positionGroupedGroups(
    groupNodes: Node[],
    dims: Map<string, GroupedDim>,
    g: dagre.graphlib.Graph
): Node[] {
    return groupNodes.map(grp => {
        const pid = getGroupParentId(grp, ORPHAN_PARENT);
        const dim = dims.get(pid);
        const pos = g.node(grp.id);
        const w = dim?.w ?? 0;
        const h = dim?.h ?? 0;
        return {
            ...grp,
            position: { x: (pos?.x ?? 0) - w / 2, y: (pos?.y ?? 0) - h / 2 }
        };
    });
}

/**
 * Grouped layout — infra hierarchy with clients clustered under their parent.
 *
 * The cluster container itself is rendered as a transparent group (no
 * coloured border / title), so visually only the infra cards and the client
 * cards are visible — but each parent infra still reserves enough space for
 * its children, who appear in a tidy grid right below.
 */
const CLUSTER_VGAP = 24; // vertical gap between an infra card and its client cluster below

function groupedLayout(
    nodes: Node[],
    edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
    const infraNodes = nodes.filter(isInfra);
    const clientNodes = nodes.filter(n => !isInfra(n));
    const nodeById = new Map(nodes.map(n => [n.id, n] as const));

    const parentByClient = buildParentMap(edges, nodeById);
    const childrenByParent = bucketChildren(clientNodes, parentByClient, ORPHAN_PARENT);
    const dims = computeGroupedDims(childrenByParent, nodeById);

    // Lay out the infra hierarchy with dagre. Each infra reserves enough
    // height for its child cluster below so siblings don't overlap.
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 90, marginx: 30, marginy: 30 });

    for (const n of infraNodes) {
        const baseW = getNodeWidth(n);
        const baseH = nodeHeightFor(n);
        const dim = dims.get(n.id);
        const w = dim ? Math.max(baseW, dim.w) : baseW;
        const h = dim ? baseH + CLUSTER_VGAP + dim.h : baseH;
        g.setNode(n.id, { width: w, height: h });
    }
    for (const e of edges) {
        if (isInfraInfraEdge(e, nodeById)) g.setEdge(e.source, e.target);
    }
    dagre.layout(g);

    // Place each infra at the TOP of its reserved bounding box so its client
    // cluster fits in the space below.
    const positionedInfra: Node[] = infraNodes.map(n => {
        const baseW = getNodeWidth(n);
        const baseH = nodeHeightFor(n);
        const dim = dims.get(n.id);
        const fullH = dim ? baseH + CLUSTER_VGAP + dim.h : baseH;
        const pos = g.node(n.id);
        return {
            ...n,
            targetPosition: Position.Top,
            sourcePosition: Position.Bottom,
            position: {
                x: (pos?.x ?? 0) - baseW / 2,
                y: (pos?.y ?? 0) - fullH / 2
            }
        };
    });

    // Place clients absolutely (no parent/extent constraint) so they can be
    // freely dragged once persistence is wired up.
    const positionedClients: Node[] = [];
    let orphanX = -600;
    for (const [parent, children] of childrenByParent) {
        const dim = dims.get(parent);
        if (!dim) continue;
        const parentInfra = positionedInfra.find(n => n.id === parent);

        let baseX: number;
        let baseY: number;
        if (parentInfra) {
            const parentW = getNodeWidth(parentInfra);
            const parentH = nodeHeightFor(parentInfra);
            baseX = parentInfra.position.x + parentW / 2 - dim.w / 2;
            baseY = parentInfra.position.y + parentH + CLUSTER_VGAP;
        } else {
            baseX = orphanX;
            baseY = 0;
            orphanX -= dim.w + 80;
        }

        children.forEach((cid, idx) => {
            const c = clientNodes.find(node => node.id === cid);
            if (!c) return;
            const col = idx % dim.cols;
            const row = Math.floor(idx / dim.cols);
            positionedClients.push({
                ...c,
                targetPosition: Position.Top,
                sourcePosition: Position.Bottom,
                position: {
                    x: baseX + GROUP_PAD + col * (CLIENT_W + CLIENT_GAP_X),
                    y: baseY + row * (CLIENT_H + dim.vGap)
                }
            });
        });
    }

    return {
        nodes: [...positionedInfra, ...positionedClients],
        edges
    };
}

const ORPHAN = '__orphan__';

interface WrappedDim { cols: number; rows: number; w: number; h: number }

function computeWrappedDims(childrenByParent: Map<string, string[]>): Map<string, WrappedDim> {
    const dims = new Map<string, WrappedDim>();
    const MAX_COLS = 4;
    const HGAP = 28;
    const VGAP = 18;
    for (const [parentId, children] of childrenByParent) {
        const n = children.length;
        const cols = Math.min(MAX_COLS, Math.max(1, Math.ceil(Math.sqrt(n / 1.5))));
        const rows = Math.ceil(n / cols);
        const w = cols * NODE_WIDTH + (cols - 1) * HGAP;
        const h = rows * CLIENT_H + (rows - 1) * VGAP;
        dims.set(parentId, { cols, rows, w, h });
    }
    return dims;
}

const WRAPPED_HGAP = 28;
const WRAPPED_VGAP = 18;
const WRAPPED_CLIENT_VGAP = 50;
const WRAPPED_SUBTREE_PAD = 60;

function pickWrappedBase(
    parent: Node | undefined,
    dim: WrappedDim,
    orphanX: number
): { baseX: number; baseY: number; nextOrphanX: number } {
    if (parent) {
        return {
            baseX: parent.position.x + NODE_WIDTH / 2 - dim.w / 2,
            baseY: parent.position.y + NODE_HEIGHT + WRAPPED_CLIENT_VGAP,
            nextOrphanX: orphanX
        };
    }
    return {
        baseX: orphanX,
        baseY: 0,
        nextOrphanX: orphanX - dim.w - 80
    };
}

function placeWrappedChildren(
    parent: Node | undefined,
    children: string[],
    clientNodes: Node[],
    dim: WrappedDim,
    orphanX: number
): { nodes: Node[]; nextOrphanX: number } {
    const { baseX, baseY, nextOrphanX } = pickWrappedBase(parent, dim, orphanX);
    const out: Node[] = [];
    children.forEach((cid, idx) => {
        const c = clientNodes.find(node => node.id === cid);
        if (!c) return;
        const col = idx % dim.cols;
        const row = Math.floor(idx / dim.cols);
        out.push({
            ...c,
            targetPosition: Position.Top,
            sourcePosition: Position.Bottom,
            position: {
                x: baseX + col * (NODE_WIDTH + WRAPPED_HGAP),
                y: baseY + row * (CLIENT_H + WRAPPED_VGAP)
            }
        });
    });
    return { nodes: out, nextOrphanX };
}

function wrappedTreeLayout(
    nodes: Node[],
    edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
    const nodeById = new Map(nodes.map(n => [n.id, n] as const));
    const infraNodes = nodes.filter(isInfra);
    const clientNodes = nodes.filter(n => !isInfra(n));

    const parentByClient = buildParentMap(edges, nodeById);
    const childrenByParent = bucketChildren(clientNodes, parentByClient, ORPHAN);
    const dims = computeWrappedDims(childrenByParent);

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', nodesep: 100, ranksep: 130, marginx: 40, marginy: 40 });

    for (const n of infraNodes) {
        const dim = dims.get(n.id);
        const baseW = getNodeWidth(n);
        const baseH = nodeHeightFor(n);
        const w = dim ? Math.max(baseW, dim.w) + WRAPPED_SUBTREE_PAD : baseW;
        const h = dim ? baseH + WRAPPED_CLIENT_VGAP + dim.h : baseH;
        g.setNode(n.id, { width: w, height: h });
    }
    for (const e of edges) {
        if (isInfraInfraEdge(e, nodeById)) g.setEdge(e.source, e.target);
    }
    dagre.layout(g);

    const positionedInfra: Node[] = infraNodes.map(n => {
        const dim = dims.get(n.id);
        const baseW = getNodeWidth(n);
        const baseH = nodeHeightFor(n);
        const h = dim ? baseH + WRAPPED_CLIENT_VGAP + dim.h : baseH;
        const pos = g.node(n.id);
        return {
            ...n,
            targetPosition: Position.Top,
            sourcePosition: Position.Bottom,
            position: {
                x: (pos?.x ?? 0) - baseW / 2,
                y: (pos?.y ?? 0) - h / 2
            }
        };
    });

    const positionedClients: Node[] = [];
    let orphanX = -500;
    for (const [parentId, children] of childrenByParent) {
        const dim = dims.get(parentId);
        if (!dim) continue;
        const parent = positionedInfra.find(n => n.id === parentId);
        const placed = placeWrappedChildren(parent, children, clientNodes, dim, orphanX);
        positionedClients.push(...placed.nodes);
        orphanX = placed.nextOrphanX;
    }

    return { nodes: [...positionedInfra, ...positionedClients], edges };
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
