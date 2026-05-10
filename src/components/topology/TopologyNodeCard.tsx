/**
 * Custom React Flow node renderer for topology nodes.
 * Visual style depends on the node kind (gateway/switch/ap/repeater/client).
 */

import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Router, Server, Wifi, Repeat, Smartphone, HelpCircle, Cable, Tv } from 'lucide-react';

type NodeKind = 'gateway' | 'switch' | 'ap' | 'repeater' | 'client' | 'unknown';
type SourcePlugin = 'freebox' | 'unifi' | 'scan-reseau';

export interface SwitchPort {
    idx: number;
    name?: string;
    up: boolean;
    speed?: number;
    poe?: boolean;
    media?: string;
    uplink?: boolean;
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
    gateway:  { icon: Router,     ring: 'ring-amber-400/70',   tint: 'from-amber-600/40 to-amber-800/20',     iconColor: 'text-amber-200',   border: 'border-amber-400/40' },
    switch:   { icon: Server,     ring: 'ring-emerald-400/70', tint: 'from-emerald-600/40 to-emerald-800/20', iconColor: 'text-emerald-200', border: 'border-emerald-400/40' },
    ap:       { icon: Wifi,       ring: 'ring-sky-400/70',     tint: 'from-sky-600/40 to-sky-800/20',         iconColor: 'text-sky-200',     border: 'border-sky-400/40' },
    repeater: { icon: Repeat,     ring: 'ring-purple-400/70',  tint: 'from-purple-600/40 to-purple-800/20',   iconColor: 'text-purple-200',  border: 'border-purple-400/40' },
    client:   { icon: Smartphone, ring: 'ring-slate-400/50',   tint: 'from-slate-700/60 to-slate-800/40',     iconColor: 'text-slate-200',   border: 'border-slate-500/50' },
    unknown:  { icon: HelpCircle, ring: 'ring-slate-400/50',   tint: 'from-slate-700/60 to-slate-800/40',     iconColor: 'text-slate-300',   border: 'border-slate-500/50' }
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
const PORT_CELL_WIDTH = 22;
const INFRA_CARD_WIDTH = 240;
const CLIENT_CARD_WIDTH = 170;

function pickCardWidth(d: TopologyNodeData): number {
    const isInfra = d.kind === 'gateway' || d.kind === 'switch' || d.kind === 'ap' || d.kind === 'repeater';
    if (!isInfra) return CLIENT_CARD_WIDTH;
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
    if (port.uplink) return 'bg-purple-500 text-white border-purple-300';
    if (isFibrePort(port)) return 'bg-cyan-500 text-white border-cyan-300';
    if (port.poe) return 'bg-amber-400 text-amber-950 border-amber-300';
    return 'bg-emerald-500 text-white border-emerald-300';
}

function portTooltip(port: SwitchPort): string {
    const status = port.up ? `${port.speed ?? '?'} Mbps` : 'Down';
    const poe = port.poe ? ' · PoE' : '';
    const uplink = port.uplink ? ' · uplink' : '';
    const name = port.name ? ` (${port.name})` : '';
    const media = port.media ? ` · ${port.media}` : '';
    return `Port ${port.idx}${name} — ${status}${poe}${uplink}${media}`;
}

export const SwitchPortGrid: React.FC<{ ports: SwitchPort[]; cellSize?: 'xs' | 'sm'; wrap?: boolean }> = ({ ports, cellSize = 'sm', wrap = true }) => {
    const cls = cellSize === 'sm' ? 'w-[22px] h-[18px] text-[9px]' : 'w-[18px] h-[14px] text-[8px]';
    const wrapClass = wrap ? 'flex-wrap' : 'flex-nowrap';
    return (
        <div className={`flex ${wrapClass} gap-0.5`}>
            {ports.map(p => (
                <div
                    key={p.idx}
                    title={portTooltip(p)}
                    className={`flex items-center justify-center rounded-sm border font-mono font-bold leading-none ${cls} ${pickPortClass(p)}`}
                >
                    {p.idx}
                </div>
            ))}
        </div>
    );
};

function pickClientIcon(d: TopologyNodeData, fallback: React.ElementType): React.ElementType {
    if (isFreeboxPlayer(d)) return Tv;
    return fallback;
}

export const TopologyNodeCard: React.FC<NodeProps> = ({ data, selected }) => {
    const d = data as TopologyNodeData;
    const style = KIND_STYLE[d.kind] ?? KIND_STYLE.unknown;
    const isInfra = d.kind === 'gateway' || d.kind === 'switch' || d.kind === 'ap' || d.kind === 'repeater';
    const BrandIcon = isInfra ? pickInfraIcon(d.kind, d.sources) : null;
    const ClientIcon = !isInfra ? pickClientIcon(d, style.icon) : null;
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
    return (
        <div
            style={{ width: `${cardWidth}px` }}
            className={`relative rounded-lg border-2 shadow-md transition-all overflow-hidden bg-slate-900 ${borderClass} ${ringClass}`}
        >
            {/* Tinted overlay (active) or muted gray (offline) over solid slate-900 base */}
            <div
                className={`absolute inset-0 bg-gradient-to-br pointer-events-none ${tintClass}`}
            />
            <Handle id="t" type="target" position={Position.Top} className="!bg-white/50 !border-white/50 !w-2 !h-2" />
            <Handle id="tl" type="target" position={Position.Left} className="!bg-pink-400/70 !border-pink-300/70 !w-2 !h-2" />
            <div className="relative flex items-center gap-2 p-2.5">
                <div className={`flex-none w-9 h-9 rounded-md bg-slate-950/70 border border-white/15 flex items-center justify-center ${iconWrapperColor}`}>
                    <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className={`text-sm font-semibold truncate ${labelClass}`}>
                        {d.label || '—'}
                    </div>
                    {d.ip && (
                        <div className={`text-[11px] font-mono truncate ${
                            inactive ? 'text-slate-500' : 'text-slate-300'
                        }`}>{d.ip}</div>
                    )}
                    {!isInfra && d.connection && (() => {
                        const conn = d.connection;
                        const labelText = buildConnectionLabel(conn);
                        if (!labelText) return null;
                        const ConnIcon = conn.medium === 'wifi' ? Wifi : Cable;
                        const chip = inactive
                            ? 'bg-slate-700/50 text-slate-400 border-slate-600/40'
                            : conn.medium === 'wifi'
                                ? 'bg-pink-500/15 text-pink-200 border-pink-400/40'
                                : 'bg-lime-500/15 text-lime-200 border-lime-400/40';
                        return (
                            <div className={`mt-1 inline-flex items-center gap-1 px-1.5 py-px rounded border text-[10px] max-w-full ${chip}`}>
                                <ConnIcon size={10} className="flex-none" />
                                <span className="truncate">{labelText}</span>
                            </div>
                        );
                    })()}
                </div>
            </div>
            {(d.kind === 'switch' || d.kind === 'gateway') && d.ports && d.ports.length > 0 && (
                <div className="relative px-2 pb-2 pt-0.5 border-t border-white/10">
                    <SwitchPortGrid
                        ports={d.ports}
                        cellSize="xs"
                        wrap={d.ports.length > SWITCH_INLINE_PORTS_MAX}
                    />
                </div>
            )}
            {(() => {
                const badge = KIND_BADGE[d.kind];
                if (!badge) return null;
                const BadgeIcon = badge.icon;
                return (
                    <div
                        title={badge.title}
                        className={`absolute top-1 right-1 z-10 flex items-center justify-center w-4 h-4 rounded-full ${badge.bg} ring-1 ${badge.ring} shadow`}
                    >
                        <BadgeIcon size={9} className="text-white" strokeWidth={3} />
                    </div>
                );
            })()}
            <Handle id="s" type="source" position={Position.Bottom} className="!bg-white/50 !border-white/50 !w-2 !h-2" />
        </div>
    );
};

export default TopologyNodeCard;
