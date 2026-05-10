/**
 * Cluster container node — renders a colored frame around grouped clients
 * (one cluster per AP/switch/gateway/repeater that has children).
 *
 * Mimics the graphviz-cluster look from the reference SVG: rounded
 * rectangle, dashed border for Wi-Fi clusters, solid for wired, with the
 * parent label and child count at the top. Wi-Fi clusters (AP / repeater /
 * discovered) animate the dashes with a marching-ants effect to mirror the
 * Wi-Fi link animation used in tree / horizontal modes.
 */

import React from 'react';
import { Wifi, Server, Router as RouterIcon, Repeat, Search } from 'lucide-react';

type GroupKind = 'gateway' | 'switch' | 'ap' | 'repeater' | 'discovered';

interface GroupData {
    parentId?: string;
    parentLabel: string;
    count: number;
    kind: GroupKind;
}

interface KindStyle {
    bg: string;
    text: string;
    icon: React.ElementType;
    stroke: string; // SVG stroke color
    wifi: boolean;  // animate the border (marching ants)
}

const STYLE: Record<GroupKind, KindStyle> = {
    gateway:    { bg: 'bg-amber-500/8',   text: 'text-amber-200',   icon: RouterIcon, stroke: 'rgba(251, 191, 36, 0.5)',  wifi: false },
    switch:     { bg: 'bg-emerald-500/8', text: 'text-emerald-200', icon: Server,     stroke: 'rgba(52, 211, 153, 0.5)',  wifi: false },
    ap:         { bg: 'bg-sky-500/8',     text: 'text-sky-200',     icon: Wifi,       stroke: 'rgba(56, 189, 248, 0.6)',  wifi: true },
    repeater:   { bg: 'bg-purple-500/8',  text: 'text-purple-200',  icon: Repeat,     stroke: 'rgba(192, 132, 252, 0.6)', wifi: true },
    discovered: { bg: 'bg-slate-700/15',  text: 'text-slate-300',   icon: Search,     stroke: 'rgba(148, 163, 184, 0.5)', wifi: true }
};

const RADIUS = 14;

export const TopologyGroupNode: React.FC<{ data: GroupData }> = ({ data }) => {
    const s = STYLE[data.kind] ?? STYLE.switch;
    const Icon = s.icon;
    return (
        <div className={`relative w-full h-full rounded-xl ${s.bg} pointer-events-none`}>
            {/* SVG-based border — supports animated marching ants for Wi-Fi clusters */}
            <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                xmlns="http://www.w3.org/2000/svg"
                preserveAspectRatio="none"
            >
                <rect
                    x="1"
                    y="1"
                    width="calc(100% - 2px)"
                    height="calc(100% - 2px)"
                    rx={RADIUS}
                    ry={RADIUS}
                    fill="none"
                    stroke={s.stroke}
                    strokeWidth={2}
                    strokeDasharray={s.wifi ? '8 4' : undefined}
                    className={s.wifi ? 'topology-cluster-marching' : undefined}
                />
            </svg>
            <div className={`relative flex items-center gap-1.5 px-3 py-1.5 ${s.text} text-[11px] font-semibold uppercase tracking-wide`}>
                <Icon size={12} />
                <span className="truncate">{data.parentLabel}</span>
                <span className="ml-auto opacity-60 normal-case font-mono">({data.count})</span>
            </div>
        </div>
    );
};

export default TopologyGroupNode;
