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

const NODE_WIDTH = 200;
const NODE_HEIGHT = 70;

const CLIENT_W = 200;
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

    for (const node of nodes) g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    for (const edge of edges) g.setEdge(edge.source, edge.target);

    dagre.layout(g);

    const isHorizontal = direction === 'LR';
    const positioned: Node[] = nodes.map(node => {
        const pos = g.node(node.id);
        return {
            ...node,
            targetPosition: isHorizontal ? Position.Left : Position.Top,
            sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
            position: {
                x: (pos?.x ?? 0) - NODE_WIDTH / 2,
                y: (pos?.y ?? 0) - NODE_HEIGHT / 2
            }
        };
    });

    return { nodes: positioned, edges };
}

interface GroupedDim { w: number; h: number; cols: number }

function computeGroupedDims(childrenByParent: Map<string, string[]>): Map<string, GroupedDim> {
    const dims = new Map<string, GroupedDim>();
    for (const [parent, children] of childrenByParent) {
        const n = children.length;
        const cols = Math.max(1, Math.min(5, Math.ceil(Math.sqrt(n / 1.6))));
        const rows = Math.ceil(n / cols);
        const w = cols * CLIENT_W + (cols - 1) * CLIENT_GAP_X + GROUP_PAD * 2;
        const h = rows * CLIENT_H + (rows - 1) * CLIENT_GAP_Y + GROUP_PAD_TOP + GROUP_PAD;
        dims.set(parent, { w, h, cols });
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
                y: GROUP_PAD_TOP + row * (CLIENT_H + CLIENT_GAP_Y)
            }
        });
    });
    return out;
}

function groupedLayout(
    nodes: Node[],
    edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
    const infraNodes = nodes.filter(isInfra);
    const clientNodes = nodes.filter(n => !isInfra(n));
    const nodeById = new Map(nodes.map(n => [n.id, n] as const));

    const parentByClient = buildParentMap(edges, nodeById);
    const childrenByParent = bucketChildren(clientNodes, parentByClient, ORPHAN_PARENT);
    const dims = computeGroupedDims(childrenByParent);

    const groupNodes: Node[] = [];
    for (const [parent, children] of childrenByParent) {
        const dim = dims.get(parent);
        if (!dim) continue;
        groupNodes.push(buildGroupNode(parent, children.length, dim, nodeById));
    }

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 70, marginx: 20, marginy: 20 });

    for (const n of infraNodes) g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
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

    const positionedInfra: Node[] = infraNodes.map(n => {
        const pos = g.node(n.id);
        return {
            ...n,
            targetPosition: Position.Top,
            sourcePosition: Position.Bottom,
            position: { x: (pos?.x ?? 0) - NODE_WIDTH / 2, y: (pos?.y ?? 0) - NODE_HEIGHT / 2 }
        };
    });

    const positionedGroups: Node[] = groupNodes.map(grp => {
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

    const positionedClients: Node[] = [];
    for (const [parent, children] of childrenByParent) {
        const dim = dims.get(parent);
        if (!dim) continue;
        positionedClients.push(...placeChildrenInGroup(parent, children, clientNodes, dim));
    }

    const visibleEdges = edges.filter(e => isInfraInfraEdge(e, nodeById));

    return {
        nodes: [...positionedGroups, ...positionedInfra, ...positionedClients],
        edges: visibleEdges
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

function placeWrappedChildren(
    parent: Node | undefined,
    parentId: string,
    children: string[],
    clientNodes: Node[],
    dim: WrappedDim,
    orphanX: number
): { nodes: Node[]; nextOrphanX: number } {
    let baseX: number;
    let baseY: number;
    let nextOrphanX = orphanX;
    if (parent) {
        baseX = parent.position.x + NODE_WIDTH / 2 - dim.w / 2;
        baseY = parent.position.y + NODE_HEIGHT + WRAPPED_CLIENT_VGAP;
    } else {
        baseX = orphanX;
        baseY = 0;
        nextOrphanX = orphanX - dim.w - 80;
    }

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
    // Touch parentId so it's used (helps debugging when an orphan bucket lands at parentId === ORPHAN)
    void parentId;
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
        const w = dim ? Math.max(NODE_WIDTH, dim.w) + WRAPPED_SUBTREE_PAD : NODE_WIDTH;
        const h = dim ? NODE_HEIGHT + WRAPPED_CLIENT_VGAP + dim.h : NODE_HEIGHT;
        g.setNode(n.id, { width: w, height: h });
    }
    for (const e of edges) {
        if (isInfraInfraEdge(e, nodeById)) g.setEdge(e.source, e.target);
    }
    dagre.layout(g);

    const positionedInfra: Node[] = infraNodes.map(n => {
        const dim = dims.get(n.id);
        const h = dim ? NODE_HEIGHT + WRAPPED_CLIENT_VGAP + dim.h : NODE_HEIGHT;
        const pos = g.node(n.id);
        return {
            ...n,
            targetPosition: Position.Top,
            sourcePosition: Position.Bottom,
            position: {
                x: (pos?.x ?? 0) - NODE_WIDTH / 2,
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
        const placed = placeWrappedChildren(parent, parentId, children, clientNodes, dim, orphanX);
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
