/**
 * Cluster container node — renders a colored frame around grouped clients
 * (one cluster per AP/switch/gateway/repeater that has children).
 *
 * Mimics the graphviz-cluster look from the reference SVG: rounded
 * rectangle, dashed border for Wi-Fi clusters, solid for wired, with the
 * parent label and child count at the top.
 */

import React from 'react';
import { Wifi, Server, Router as RouterIcon, Repeat, Search } from 'lucide-react';

interface GroupData {
    parentId?: string;
    parentLabel: string;
    count: number;
    kind: 'gateway' | 'switch' | 'ap' | 'repeater' | 'discovered';
}

const STYLE = {
    gateway:    { border: 'border-amber-400/50',   bg: 'bg-amber-500/8',   text: 'text-amber-200',   icon: RouterIcon, dashed: false },
    switch:     { border: 'border-emerald-400/50', bg: 'bg-emerald-500/8', text: 'text-emerald-200', icon: Server,     dashed: false },
    ap:         { border: 'border-sky-400/50',     bg: 'bg-sky-500/8',     text: 'text-sky-200',     icon: Wifi,       dashed: true },
    repeater:   { border: 'border-purple-400/50',  bg: 'bg-purple-500/8',  text: 'text-purple-200',  icon: Repeat,     dashed: true },
    discovered: { border: 'border-slate-500/60',   bg: 'bg-slate-700/15',  text: 'text-slate-300',   icon: Search,     dashed: true }
} as const;

export const TopologyGroupNode: React.FC<{ data: GroupData }> = ({ data }) => {
    const s = STYLE[data.kind] ?? STYLE.switch;
    const Icon = s.icon;
    return (
        <div
            className={`w-full h-full rounded-xl border-2 ${s.border} ${s.bg} pointer-events-none`}
            style={{ borderStyle: s.dashed ? 'dashed' : 'solid' }}
        >
            <div className={`flex items-center gap-1.5 px-3 py-1.5 ${s.text} text-[11px] font-semibold uppercase tracking-wide`}>
                <Icon size={12} />
                <span className="truncate">{data.parentLabel}</span>
                <span className="ml-auto opacity-60 normal-case font-mono">({data.count})</span>
            </div>
        </div>
    );
};

export default TopologyGroupNode;
