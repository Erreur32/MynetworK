/**
 * Layout helpers for the topology graph.
 *
 * Three modes are supported:
 *  - `tree`       : dagre top-down hierarchy (gateways → infra → clients)
 *  - `horizontal` : dagre left-to-right hierarchy (compact for many clients)
 *  - `grouped`    : graphviz-cluster style — clients are visually grouped
 *                   inside their parent AP/switch/gateway, mimicking the
 *                   reference SVG style. Best for dense networks.
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

function isInfra(node: Node): boolean {
    return INFRA_KINDS.has((node.data as TopologyNodeData)?.kind);
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

function groupedLayout(
    nodes: Node[],
    edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
    const infraNodes = nodes.filter(isInfra);
    const clientNodes = nodes.filter(n => !isInfra(n));
    const nodeById = new Map(nodes.map(n => [n.id, n] as const));

    // Determine each client's parent from edges (whichever endpoint is infra)
    const parentByClient = new Map<string, string>();
    for (const e of edges) {
        const s = nodeById.get(e.source);
        const t = nodeById.get(e.target);
        if (!s || !t) continue;
        if (!isInfra(s) && isInfra(t)) parentByClient.set(s.id, t.id);
        else if (!isInfra(t) && isInfra(s)) parentByClient.set(t.id, s.id);
    }

    // Bucket clients by parent (orphans → synthetic 'discovered' parent)
    const childrenByParent = new Map<string, string[]>();
    const ORPHAN_PARENT = '__orphans__';
    for (const c of clientNodes) {
        const parent = parentByClient.get(c.id) ?? ORPHAN_PARENT;
        if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
        childrenByParent.get(parent)!.push(c.id);
    }

    // Compute group dimensions and create group container nodes
    interface Dim { w: number; h: number; cols: number }
    const dims = new Map<string, Dim>();
    const groupNodes: Node[] = [];
    for (const [parent, children] of childrenByParent) {
        const n = children.length;
        const cols = Math.max(1, Math.min(5, Math.ceil(Math.sqrt(n / 1.6))));
        const rows = Math.ceil(n / cols);
        const w = cols * CLIENT_W + (cols - 1) * CLIENT_GAP_X + GROUP_PAD * 2;
        const h = rows * CLIENT_H + (rows - 1) * CLIENT_GAP_Y + GROUP_PAD_TOP + GROUP_PAD;
        dims.set(parent, { w, h, cols });

        const isOrphan = parent === ORPHAN_PARENT;
        const parentNode = isOrphan ? null : nodeById.get(parent);
        const parentData = parentNode?.data as TopologyNodeData | undefined;
        groupNodes.push({
            id: `group:${parent}`,
            type: 'topologyGroup',
            position: { x: 0, y: 0 },
            data: {
                parentId: isOrphan ? undefined : parent,
                parentLabel: isOrphan ? 'Discovered' : (parentData?.label ?? '?'),
                count: n,
                kind: isOrphan ? 'discovered' : (parentData?.kind ?? 'switch')
            },
            style: { width: w, height: h, background: 'transparent', border: 'none' },
            selectable: false,
            draggable: false,
            zIndex: -1
        });
    }

    // Layout infra + groups together via dagre
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 70, marginx: 20, marginy: 20 });

    for (const n of infraNodes) g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    for (const grp of groupNodes) {
        const dim = dims.get((grp.data as any).parentId ?? ORPHAN_PARENT)!;
        g.setNode(grp.id, { width: dim.w, height: dim.h });
    }
    // Real infra↔infra uplinks
    for (const e of edges) {
        const s = nodeById.get(e.source);
        const t = nodeById.get(e.target);
        if (s && t && isInfra(s) && isInfra(t)) g.setEdge(e.source, e.target);
    }
    // Synthetic edges parent→group so dagre keeps them visually paired
    for (const parent of childrenByParent.keys()) {
        if (parent === ORPHAN_PARENT) continue;
        g.setEdge(parent, `group:${parent}`);
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
        const pid = (grp.data as any).parentId ?? ORPHAN_PARENT;
        const dim = dims.get(pid)!;
        const pos = g.node(grp.id);
        return {
            ...grp,
            position: { x: (pos?.x ?? 0) - dim.w / 2, y: (pos?.y ?? 0) - dim.h / 2 }
        };
    });

    const positionedClients: Node[] = [];
    for (const [parent, children] of childrenByParent) {
        const dim = dims.get(parent)!;
        children.forEach((cid, idx) => {
            const client = clientNodes.find(c => c.id === cid);
            if (!client) return;
            const col = idx % dim.cols;
            const row = Math.floor(idx / dim.cols);
            positionedClients.push({
                ...client,
                parentId: `group:${parent}`,
                extent: 'parent',
                targetPosition: Position.Top,
                sourcePosition: Position.Bottom,
                position: {
                    x: GROUP_PAD + col * (CLIENT_W + CLIENT_GAP_X),
                    y: GROUP_PAD_TOP + row * (CLIENT_H + CLIENT_GAP_Y)
                }
            });
        });
    }

    // In grouped mode, only render infra↔infra edges (client links are visualized by the cluster)
    const visibleEdges = edges.filter(e => {
        const s = nodeById.get(e.source);
        const t = nodeById.get(e.target);
        return !!(s && t && isInfra(s) && isInfra(t));
    });

    // React Flow requires parents to appear before children in the array
    return {
        nodes: [...positionedGroups, ...positionedInfra, ...positionedClients],
        edges: visibleEdges
    };
}

/**
 * Wrapped TB layout — keeps a top-down hierarchy but instead of laying every
 * client of the same parent on a single (very wide) bottom row, it stacks
 * them in a small grid below their parent. The grid wraps after a few columns
 * so the diagram grows in height instead of width. Unlike the Grouped mode,
 * there is no visible cluster container — just nodes positioned in 2D.
 */
function wrappedTreeLayout(
    nodes: Node[],
    edges: Edge[]
): { nodes: Node[]; edges: Edge[] } {
    const nodeById = new Map(nodes.map(n => [n.id, n] as const));
    const infraNodes = nodes.filter(isInfra);
    const clientNodes = nodes.filter(n => !isInfra(n));

    const parentByClient = new Map<string, string>();
    for (const e of edges) {
        const s = nodeById.get(e.source);
        const t = nodeById.get(e.target);
        if (!s || !t) continue;
        if (!isInfra(s) && isInfra(t)) parentByClient.set(s.id, t.id);
        else if (!isInfra(t) && isInfra(s)) parentByClient.set(t.id, s.id);
    }

    const ORPHAN = '__orphan__';
    const childrenByParent = new Map<string, string[]>();
    for (const c of clientNodes) {
        const parent = parentByClient.get(c.id) ?? ORPHAN;
        if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
        childrenByParent.get(parent)!.push(c.id);
    }

    const MAX_COLS = 4;
    const HGAP = 28; // horizontal gap between client cards
    const VGAP = 18; // vertical gap between client cards
    interface Dim { cols: number; rows: number; w: number; h: number }
    const dims = new Map<string, Dim>();
    for (const [parentId, children] of childrenByParent) {
        const n = children.length;
        const cols = Math.min(MAX_COLS, Math.max(1, Math.ceil(Math.sqrt(n / 1.5))));
        const rows = Math.ceil(n / cols);
        const w = cols * NODE_WIDTH + (cols - 1) * HGAP;
        const h = rows * CLIENT_H + (rows - 1) * VGAP;
        dims.set(parentId, { cols, rows, w, h });
    }

    // Layout infra with dagre TB, reserving extra width/height per node based on its client subtree
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', nodesep: 100, ranksep: 130, marginx: 40, marginy: 40 });

    const CLIENT_VGAP = 50; // vertical gap between parent infra and its client grid
    const SUBTREE_PAD = 60; // extra horizontal padding around each parent subtree to avoid touching siblings
    for (const n of infraNodes) {
        const dim = dims.get(n.id);
        const w = dim ? Math.max(NODE_WIDTH, dim.w) + SUBTREE_PAD : NODE_WIDTH;
        const h = dim ? NODE_HEIGHT + CLIENT_VGAP + dim.h : NODE_HEIGHT;
        g.setNode(n.id, { width: w, height: h });
    }
    for (const e of edges) {
        const s = nodeById.get(e.source);
        const t = nodeById.get(e.target);
        if (s && t && isInfra(s) && isInfra(t)) g.setEdge(e.source, e.target);
    }
    dagre.layout(g);

    const positionedInfra: Node[] = infraNodes.map(n => {
        const dim = dims.get(n.id);
        const h = dim ? NODE_HEIGHT + CLIENT_VGAP + dim.h : NODE_HEIGHT;
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
        const dim = dims.get(parentId)!;
        const parent = positionedInfra.find(n => n.id === parentId);

        let baseX: number;
        let baseY: number;
        if (parent) {
            baseX = parent.position.x + NODE_WIDTH / 2 - dim.w / 2;
            baseY = parent.position.y + NODE_HEIGHT + CLIENT_VGAP;
        } else {
            baseX = orphanX;
            baseY = 0;
            orphanX -= dim.w + 80;
        }

        children.forEach((cid, idx) => {
            const c = clientNodes.find(c => c.id === cid);
            if (!c) return;
            const col = idx % dim.cols;
            const row = Math.floor(idx / dim.cols);
            positionedClients.push({
                ...c,
                targetPosition: Position.Top,
                sourcePosition: Position.Bottom,
                position: {
                    x: baseX + col * (NODE_WIDTH + HGAP),
                    y: baseY + row * (CLIENT_H + VGAP)
                }
            });
        });
    }

    return { nodes: [...positionedInfra, ...positionedClients], edges };
}

export function layoutGraph(
    nodes: Node[],
    edges: Edge[],
    mode: LayoutMode = 'grouped'
): { nodes: Node[]; edges: Edge[] } {
    // Mode label/behavior mapping (intentionally swapped from the previous version):
    //   'tree'       → vertical-looking dagre LR (root left, branches stack down) — matches the "tree" visual
    //   'horizontal' → wrapped TB grid (wide top-down with multi-row client wrapping) — matches the "horizontal flow" visual
    if (mode === 'tree') return dagreLayout(nodes, edges, 'LR');
    if (mode === 'horizontal') return wrappedTreeLayout(nodes, edges);
    return groupedLayout(nodes, edges);
}
