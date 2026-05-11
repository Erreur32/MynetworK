/**
 * Custom React Flow node renderer for topology nodes.
 * Visual style depends on the node kind (gateway/switch/ap/repeater/client).
 */

import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Router, Server, Wifi, Repeat, Smartphone, HelpCircle, Cable, Tv, Layers } from 'lucide-react';

type NodeKind = 'gateway' | 'switch' | 'ap' | 'repeater' | 'client' | 'vm-host' | 'unknown';
type SourcePlugin = 'freebox' | 'unifi' | 'scan-reseau';

export interface SwitchPort {
    idx: number;
    name?: string;
    up: boolean;
    speed?: number;
    poe?: boolean;
    media?: string;
    uplink?: boolean;       // receives a child cascade (parent-side)
    localUplink?: boolean;  // this device's outgoing uplink (goes upstream)
}

export interface ClientConnection {
    medium: 'wifi' | 'ethernet';
    speedMbps?: number;
    ssid?: string;
    band?: string;
    signal?: number;
    portIndex?: number;
}

export interface TopologyNodeData extends Record<string, unknown> {
    kind: NodeKind;
    label: string;
    ip?: string;
    mac?: string;
    vendor?: string;
    sources: SourcePlugin[];
    active?: boolean;
    ports?: SwitchPort[];
    host_type?: string;
    connection?: ClientConnection;
    editingMode?: boolean;
    localUplinkPortIdxs?: number[];
    /** vm-host specific — count of VM children */
    vmCount?: number;
    /** vm-host specific — VM child count split by active flag */
    vmActiveCount?: number;
    vmInactiveCount?: number;
    /** vm-host specific — hypervisor label (proxmox/kvm/vmware/...) */
    hypervisor?: string;
}

function formatConnSpeed(mbps?: number): string | undefined {
    if (!mbps || mbps <= 0) return undefined;
    if (mbps >= 1000) return `${(mbps / 1000).toFixed(mbps % 1000 === 0 ? 0 : 1)} Gbps`;
    return `${mbps} Mbps`;
}

function buildConnectionLabel(c: ClientConnection): string | null {
    if (c.medium === 'wifi') {
        const parts: string[] = [];
        if (c.ssid) parts.push(c.ssid);
        if (c.band) parts.push(c.band);
        const sp = formatConnSpeed(c.speedMbps);
        if (sp) parts.push(sp);
        return parts.length > 0 ? parts.join(' · ') : null;
    }
    const parts: string[] = [];
    if (typeof c.portIndex === 'number') parts.push(`Port ${c.portIndex}`);
    const sp = formatConnSpeed(c.speedMbps);
    if (sp) parts.push(sp);
    return parts.length > 0 ? parts.join(' · ') : null;
}

function isFreeboxPlayer(d: TopologyNodeData): boolean {
    const ht = (d.host_type ?? '').toLowerCase();
    if (ht.startsWith('freebox_player')) return true;
    const label = (d.label ?? '').toLowerCase();
    return label.includes('freebox player') || label.includes('pop tv') || label.includes('freebox pop');
}

const KIND_STYLE: Record<NodeKind, { icon: React.ElementType; ring: string; tint: string; iconColor: string; border: string }> = {
    gateway:   { icon: Router,     ring: 'ring-amber-400/70',   tint: 'from-amber-600/40 to-amber-800/20',     iconColor: 'text-amber-200',   border: 'border-amber-400/40' },
    switch:    { icon: Server,     ring: 'ring-emerald-400/70', tint: 'from-emerald-600/40 to-emerald-800/20', iconColor: 'text-emerald-200', border: 'border-emerald-400/40' },
    ap:        { icon: Wifi,       ring: 'ring-sky-400/70',     tint: 'from-sky-600/40 to-sky-800/20',         iconColor: 'text-sky-200',     border: 'border-sky-400/40' },
    repeater:  { icon: Repeat,     ring: 'ring-purple-400/70',  tint: 'from-purple-600/40 to-purple-800/20',   iconColor: 'text-purple-200',  border: 'border-purple-400/40' },
    'vm-host': { icon: Layers,     ring: 'ring-fuchsia-400/70', tint: 'from-fuchsia-600/40 to-indigo-800/20',  iconColor: 'text-fuchsia-200', border: 'border-fuchsia-400/40' },
    client:    { icon: Smartphone, ring: 'ring-slate-400/50',   tint: 'from-slate-700/60 to-slate-800/40',     iconColor: 'text-slate-200',   border: 'border-slate-500/50' },
    unknown:   { icon: HelpCircle, ring: 'ring-slate-400/50',   tint: 'from-slate-700/60 to-slate-800/40',     iconColor: 'text-slate-300',   border: 'border-slate-500/50' }
};

const FreeboxLogo: React.FC<{ size?: number }> = ({ size = 18 }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="25 23.39 180 203.23" width={size} height={size}>
        <path
            fill="#cd1e25"
            d="m 187.24133,23.386327 c -14.98294,0.01847 -31.16732,4.917913 -41.74251,9.8272 l 0,-0.03081 c -17.70535,8.087262 -29.24956,16.441925 -37.86091,25.630825 -8.274459,8.82635 -13.79935,18.347312 -19.6236,28.9271 l -32.007722,0 c -0.927639,0 -1.76557,0.528637 -2.187247,1.355475 l -4.189654,8.194475 c -0.389391,0.763987 -0.354765,1.672163 0.09242,2.402888 0.447184,0.73072 1.268849,1.17064 2.125634,1.17064 l 30.313378,0 -56.930003,121.03787 c -0.434171,0.92135 -0.243567,2.03654 0.462094,2.77256 l 1.139832,1.17064 c 0.558802,0.58297 1.358434,0.86405 2.15644,0.73935 l 23.227934,-3.60434 c 0.772991,-0.11988 1.456644,-0.60023 1.81757,-1.29386 l 62.814004,-120.82222 39.95574,0 c 0.89584,0 1.71899,-0.48182 2.15644,-1.263065 l 4.55933,-8.194463 c 0.42512,-0.761537 0.41033,-1.682025 -0.0308,-2.4337 -0.44115,-0.752912 -1.2532,-1.23225 -2.12564,-1.23225 l -37.89172,0 11.58316,-23.844062 0.0308,-0.0308 c 2.64355,-5.680688 5.57101,-11.577 10.41252,-15.988463 2.42384,-2.211887 5.31224,-4.079988 8.99544,-5.421913 3.68196,-1.340687 8.17722,-2.155199 13.73959,-2.156437 3.99619,-0.0038 7.9776,0.940212 11.95284,1.9408 3.97524,0.988263 7.91475,2.054163 11.98364,2.064025 2.12317,0.0025 4.06766,-0.5422 5.69916,-1.386287 2.45711,-1.27415 4.25866,-3.180438 5.48352,-5.083038 0.61243,-0.956225 1.08562,-1.906287 1.41709,-2.834175 0.32901,-0.93405 0.51754,-1.834825 0.5237,-2.772562 0.002,-0.941438 -0.20331,-1.859475 -0.58531,-2.68015 -0.67527,-1.445425 -1.82004,-2.48545 -3.08062,-3.265463 -1.90753,-1.169412 -4.18351,-1.838525 -6.65417,-2.279662 -2.47066,-0.433763 -5.12,-0.6149 -7.73237,-0.616125 z"
        />
    </svg>
);

const UniFiLogo: React.FC<{ size?: number }> = ({ size = 18 }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size}>
        <path
            fill="#1fb0ec"
            d="M5.343 4.222h1.099v1.1H5.343zm7.438 14.435a7.2 7.2 0 0 1-3.51-.988a6.5 6.5 0 0 0 2.947 3.936l.66.364c5.052-.337 8.009-3.6 8.009-7.863v-.924c-1.201 3.918-3.995 5.66-8.106 5.475m-4.107-2.291V8.355H7.562v4.1H6.448V10h-1.11v1.1H4.225V5.042H3.113v9.063c0 4.508 3.3 7.9 8.888 7.9a6.82 6.82 0 0 1-3.327-5.639M7.562 4.772h1.112v1.1H7.562zM3.113 2h1.112v1.111H3.113zm2.231 5.805h1.1v1.1h-1.1zm1.111-1.649h1.1v1.1h-1.1zm-.006-3.045h1.113V4.21H6.449zm8.876 2.677v10.577a9 9 0 0 1-.164 1.7c2.671-.486 4.414-2.137 5.3-5.014l.431-1.407V2.012c-5.042 0-5.567 1.931-5.567 3.776"
        />
    </svg>
);

function pickInfraIcon(_kind: NodeKind, sources: SourcePlugin[]): React.ElementType | null {
    // Prefer brand logos for infra so the user can read at a glance which
    // ecosystem owns the device. Mixed-source nodes pick UniFi when present.
    if (sources.includes('unifi')) return UniFiLogo;
    if (sources.includes('freebox')) return FreeboxLogo;
    return null;
}

// Small connection-type badge in the top-right corner: tells you at a glance
// whether a switch is wired or an AP serves Wi-Fi. The brand SVG remains the
// main icon so both pieces of info are visible.
const KIND_BADGE: Partial<Record<NodeKind, { icon: React.ElementType; bg: string; ring: string; title: string }>> = {
    ap:       { icon: Wifi,  bg: 'bg-sky-500',     ring: 'ring-sky-300/60',     title: 'Wi-Fi' },
    repeater: { icon: Wifi,  bg: 'bg-purple-500',  ring: 'ring-purple-300/60',  title: 'Wi-Fi' },
    switch:   { icon: Cable, bg: 'bg-emerald-500', ring: 'ring-emerald-300/60', title: 'Ethernet' }
};

function pickLabelClass(inactive: boolean, isInfra: boolean): string {
    if (inactive) return 'text-slate-400';
    return isInfra ? 'text-white' : 'text-slate-100';
}

const SWITCH_INLINE_PORTS_MAX = 12;
// Bottom-row port cell footprint (cell width + gap). Must stay in sync with
// the xs cell size in SwitchPortGrid and with the handle math below.
const PORT_CELL_WIDTH = 28;
// Infra cards (gateway/switch/AP/repeater) are intentionally larger than
// client cards so they read clearly even in a busy graph. Keep in sync with
// NODE_WIDTH in topologyLayout.ts — dagre needs the same value.
const INFRA_CARD_WIDTH = 300;
// vm-host cards carry an extra info row (vmCount + hypervisor), so they get
// a touch more width than regular infra to keep things uncramped.
const VM_HOST_CARD_WIDTH = 340;
const CLIENT_CARD_WIDTH = 170;
const UPLINK_CHIP_W = 64;
const UPLINK_CHIP_GAP = 6;
const HIDDEN_HANDLE_CLASS = '!opacity-0 !w-1 !h-1 !border-0';

function pickCardWidth(d: TopologyNodeData): number {
    const isInfra = d.kind === 'gateway' || d.kind === 'switch' || d.kind === 'ap' || d.kind === 'repeater' || d.kind === 'vm-host';
    if (!isInfra) return CLIENT_CARD_WIDTH;
    if (d.kind === 'vm-host') return VM_HOST_CARD_WIDTH;
    const ports = (d.kind === 'switch' || d.kind === 'gateway') ? d.ports : undefined;
    if (ports && ports.length > 0 && ports.length <= SWITCH_INLINE_PORTS_MAX) {
        return Math.max(INFRA_CARD_WIDTH, ports.length * PORT_CELL_WIDTH + 18);
    }
    return INFRA_CARD_WIDTH;
}

function isFibrePort(port: SwitchPort): boolean {
    const m = (port.media ?? '').toLowerCase();
    if (m.includes('sfp') || m.includes('fiber') || m.includes('fibre')) return true;
    // 10G/XG without explicit media is overwhelmingly SFP+ in UniFi gear
    if (m === 'xg' || m === '10g') return true;
    if (port.up && (port.speed ?? 0) >= 10000) return true;
    return false;
}

function pickPortClass(port: SwitchPort): string {
    if (!port.up) return 'bg-slate-700/70 text-slate-500 border-slate-600/40';
    if (port.uplink || port.localUplink) return 'bg-purple-500 text-white border-purple-300';
    if (isFibrePort(port)) return 'bg-cyan-500 text-white border-cyan-300';
    return 'bg-emerald-500 text-white border-emerald-300';
}

function portCategoryLabel(port: SwitchPort): string {
    if (!port.up) return 'Down — pas de lien (slate)';
    if (port.localUplink) return 'Uplink → parent (mauve)';
    if (port.uplink) return 'Uplink ← enfant (mauve)';
    if (isFibrePort(port)) return 'Fibre / SFP+ (cyan)';
    return 'Client filaire (vert)';
}

function portTooltip(port: SwitchPort): string {
    const name = port.name ? ` — ${port.name}` : '';
    const category = portCategoryLabel(port);
    const speedSeg = port.up && port.speed ? ` · ${port.speed} Mbps` : '';
    const mediaSeg = port.media ? ` · ${port.media}` : '';
    const poeSeg = port.poe && port.up ? '\n• Point ambre = PoE actif' : '';
    return `Port ${port.idx}${name}\n• ${category}${speedSeg}${mediaSeg}${poeSeg}`;
}

export const SwitchPortGrid: React.FC<{ ports: SwitchPort[]; cellSize?: 'xs' | 'sm'; wrap?: boolean }> = ({ ports, cellSize = 'sm', wrap = true }) => {
    // xs is used by the infra card's bottom port row. Width MUST match the
    // handle math (`xPx = 20 + gridIdx * 26`) so the edge endpoints land on
    // the centre of each port cell.
    const cls = cellSize === 'sm' ? 'w-[26px] h-[22px] text-[10px]' : 'w-[24px] h-[20px] text-[10px]';
    const wrapClass = wrap ? 'flex-wrap' : 'flex-nowrap';
    return (
        <div className={`flex ${wrapClass} gap-0.5`}>
            {ports.map(p => (
                <div
                    key={p.idx}
                    title={portTooltip(p)}
                    className={`relative flex items-center justify-center rounded-sm border font-mono font-bold leading-none ${cls} ${pickPortClass(p)}`}
                >
                    {p.idx}
                    {p.poe && p.up && (
                        <span
                            className="absolute -top-1 -right-1 block w-2.5 h-2.5 rounded-full bg-amber-400 ring-1 ring-amber-200 shadow-md pointer-events-none"
                            aria-label="PoE active"
                        />
                    )}
                </div>
            ))}
        </div>
    );
};

function pickClientIcon(d: TopologyNodeData, fallback: React.ElementType): React.ElementType {
    if (isFreeboxPlayer(d)) return Tv;
    return fallback;
}

function pickConnectionChipClass(inactive: boolean, medium: 'wifi' | 'ethernet'): string {
    if (inactive) return 'bg-slate-700/50 text-slate-400 border-slate-600/40';
    if (medium === 'wifi') return 'bg-pink-500/15 text-pink-200 border-pink-400/40';
    return 'bg-lime-500/15 text-lime-200 border-lime-400/40';
}

export const TopologyNodeCard: React.FC<NodeProps> = ({ data, selected }) => {
    const d = data as TopologyNodeData;
    const style = KIND_STYLE[d.kind] ?? KIND_STYLE.unknown;
    const isInfra = d.kind === 'gateway' || d.kind === 'switch' || d.kind === 'ap' || d.kind === 'repeater' || d.kind === 'vm-host';
    const BrandIcon = isInfra ? pickInfraIcon(d.kind, d.sources) : null;
    const ClientIcon = isInfra ? null : pickClientIcon(d, style.icon);
    const Icon = BrandIcon ?? ClientIcon ?? style.icon;
    const inactive = d.active === false;
    const borderClass = inactive ? 'border-slate-600/40' : style.border;
    // When in edit mode and selected: bright amber pulsing halo so the user
    // can see at a glance which card the keyboard arrows / nudge buttons
    // will move. Outside edit mode, fall back to the kind-tinted ring.
    const editingActive = d.editingMode === true && selected;
    let ringClass = '';
    if (editingActive) {
        ringClass = 'ring-4 ring-amber-400 ring-offset-2 ring-offset-slate-950 animate-pulse';
    } else if (selected) {
        ringClass = `ring-2 ${style.ring}`;
    }
    const tintClass = inactive ? 'from-slate-700/30 to-slate-800/15' : style.tint;
    const iconWrapperColor = inactive ? 'text-slate-500' : style.iconColor;
    const labelClass = pickLabelClass(inactive, isInfra);

    const cardWidth = pickCardWidth(d);
    // Mauve "Uplink" chip on TOP of the card, with its own target Handle.
    // Bottom grid hides uplink ports so the chip doesn't visually duplicate them.
    const { uplinkPorts, bottomPorts, showUplinkChips } = React.useMemo(() => {
        const sp = d.ports ? [...d.ports].sort((a, b) => a.idx - b.idx) : null;
        const set = new Set(d.localUplinkPortIdxs ?? []);
        const inline = sp !== null && sp.length <= SWITCH_INLINE_PORTS_MAX;
        const up = sp ? sp.filter(p => set.has(p.idx)) : [];
        const show = up.length > 0 && inline;
        const bp = sp && show ? sp.filter(p => !set.has(p.idx)) : sp;
        return { uplinkPorts: up, bottomPorts: bp, showUplinkChips: show };
    }, [d.ports, d.localUplinkPortIdxs]);
    const uplinkChipsTotalW = uplinkPorts.length * UPLINK_CHIP_W
        + Math.max(0, uplinkPorts.length - 1) * UPLINK_CHIP_GAP;
    const uplinkChipsStartX = Math.max(8, (cardWidth - uplinkChipsTotalW) / 2);

    return (
        <div
            style={{ width: `${cardWidth}px` }}
            className={`relative rounded-lg border-2 shadow-md transition-all overflow-visible bg-slate-900 ${borderClass} ${ringClass}`}
        >
            {showUplinkChips && uplinkPorts.map((p, i) => {
                const x = uplinkChipsStartX + i * (UPLINK_CHIP_W + UPLINK_CHIP_GAP);
                const handleX = x + UPLINK_CHIP_W / 2;
                const label = uplinkPorts.length > 1 ? `Uplink ${i + 1}` : 'Uplink';
                const speedSeg = p.speed ? ` · ${p.speed} Mbps` : '';
                const tooltip = `${label} — port ${p.idx}${speedSeg}`;
                return (
                    <React.Fragment key={`uplink-${p.idx}`}>
                        <div
                            className="absolute z-20 flex items-center justify-center rounded-sm border bg-purple-500 text-white border-purple-300 text-[9px] font-bold uppercase tracking-wide leading-none shadow whitespace-nowrap pointer-events-none"
                            style={{ left: `${x}px`, top: '-10px', width: `${UPLINK_CHIP_W}px`, height: '16px' }}
                            title={tooltip}
                        >
                            {label}
                        </div>
                        <Handle
                            id={`pt${p.idx}`}
                            type="target"
                            position={Position.Top}
                            style={{ left: `${handleX}px`, background: 'transparent', border: 'none', width: 4, height: 4 }}
                        />
                    </React.Fragment>
                );
            })}
            <div
                className={`absolute inset-0 bg-gradient-to-br pointer-events-none ${tintClass}`}
            />
            {/* Invisible anchors — React Flow needs these to exist so edges can attach. */}
            <Handle id="t" type="target" position={Position.Top} className={HIDDEN_HANDLE_CLASS} />
            <Handle id="tl" type="target" position={Position.Left} className={HIDDEN_HANDLE_CLASS} />
            <Handle id="sr" type="source" position={Position.Right} className={HIDDEN_HANDLE_CLASS} />
            <div className={`relative flex items-center ${isInfra ? 'gap-2.5 p-3' : 'gap-2 p-2.5'}`}>
                <div className={`flex-none rounded-md bg-slate-950/70 border border-white/15 flex items-center justify-center ${iconWrapperColor} ${isInfra ? 'w-11 h-11' : 'w-9 h-9'}`}>
                    <Icon size={isInfra ? 22 : 18} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className={`font-semibold truncate ${isInfra ? 'text-base' : 'text-sm'} ${labelClass}`}>
                        {d.label || '—'}
                    </div>
                    {d.ip && (
                        <div className={`font-mono truncate ${isInfra ? 'text-xs' : 'text-[11px]'} ${
                            inactive ? 'text-slate-500' : 'text-slate-300'
                        }`}>{d.ip}</div>
                    )}
                    {!isInfra && d.connection && (() => {
                        const conn = d.connection;
                        const labelText = buildConnectionLabel(conn);
                        if (!labelText) return null;
                        const ConnIcon = conn.medium === 'wifi' ? Wifi : Cable;
                        const chip = pickConnectionChipClass(inactive, conn.medium);
                        return (
                            <div className={`mt-1 inline-flex items-center gap-1 px-1.5 py-px rounded border text-[10px] max-w-full ${chip}`}>
                                <ConnIcon size={10} className="flex-none" />
                                <span className="truncate">{labelText}</span>
                            </div>
                        );
                    })()}
                    {d.vendor && d.kind === 'vm-host' && (
                        <div className="mt-0.5 text-[10px] text-slate-400 truncate" title={d.vendor}>
                            {d.vendor}
                        </div>
                    )}
                </div>
            </div>
            {d.kind === 'vm-host' && (
                <div className="relative px-3 pb-2.5 pt-1 border-t border-white/10 flex items-center gap-1.5 flex-wrap text-[11px]">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/40 font-mono font-bold">
                        <Layers size={10} className="flex-none" />
                        {d.vmCount ?? '?'} VM{(d.vmCount ?? 0) > 1 ? 's' : ''}
                    </span>
                    {typeof d.vmActiveCount === 'number' && d.vmActiveCount > 0 && (
                        <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border bg-emerald-500/15 text-emerald-200 border-emerald-400/40 font-mono"
                            title="Active VMs"
                        >
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            {d.vmActiveCount}
                        </span>
                    )}
                    {typeof d.vmInactiveCount === 'number' && d.vmInactiveCount > 0 && (
                        <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border bg-rose-500/10 text-rose-200 border-rose-400/30 font-mono"
                            title="Inactive / offline VMs"
                        >
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-400" />
                            {d.vmInactiveCount}
                        </span>
                    )}
                    {d.hypervisor && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded border bg-slate-800/60 text-slate-200 border-slate-600/50 uppercase tracking-wide text-[10px]">
                            {d.hypervisor}
                        </span>
                    )}
                </div>
            )}
            {bottomPorts && bottomPorts.length > 0 && (
                <div className="relative px-2 pb-2 pt-0.5 border-t border-white/10">
                    <SwitchPortGrid
                        ports={bottomPorts}
                        cellSize="xs"
                        wrap={bottomPorts.length > SWITCH_INLINE_PORTS_MAX}
                    />
                    {/* Source-only per-port handles. Uplink targets live on the top chips. */}
                    {bottomPorts.length <= SWITCH_INLINE_PORTS_MAX && bottomPorts.map((p, gridIdx) => {
                        // x = grid pad (8) + half cell (12) + gridIdx * (cell 24 + gap 2)
                        // Keep in sync with the xs cell size in SwitchPortGrid.
                        const xPx = 20 + gridIdx * 26;
                        return (
                            <Handle
                                key={`p${p.idx}`}
                                id={`p${p.idx}`}
                                type="source"
                                position={Position.Bottom}
                                style={{ left: `${xPx}px`, background: 'transparent', border: 'none', width: 4, height: 4 }}
                            />
                        );
                    })}
                </div>
            )}
            {(() => {
                const badge = KIND_BADGE[d.kind];
                if (!badge) return null;
                const BadgeIcon = badge.icon;
                return (
                    <div
                        title={badge.title}
                        className={`absolute top-1 right-1 z-10 flex items-center justify-center rounded-full ${badge.bg} ring-1 ${badge.ring} shadow ${isInfra ? 'w-5 h-5' : 'w-4 h-4'}`}
                    >
                        <BadgeIcon size={isInfra ? 11 : 9} className="text-white" strokeWidth={3} />
                    </div>
                );
            })()}
            {/* Status dot for clients/unknown — green=active, rose=inactive.
                Infra kinds use KIND_BADGE (above) instead, so we skip them. */}
            {!isInfra && (
                <div
                    title={inactive ? 'Inactive / offline' : 'Active'}
                    className={`absolute top-1 right-1 z-10 w-2.5 h-2.5 rounded-full ring-2 ring-slate-900 ${
                        inactive ? 'bg-rose-500' : 'bg-emerald-500'
                    }`}
                />
            )}
            <Handle id="s" type="source" position={Position.Bottom} className={HIDDEN_HANDLE_CLASS} />
        </div>
    );
};

export default TopologyNodeCard;
