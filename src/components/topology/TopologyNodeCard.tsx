/**
 * Custom React Flow node renderer for topology nodes.
 * Visual style depends on the node kind (gateway/switch/ap/repeater/client).
 */

import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Router, Server, Wifi, Repeat, Smartphone, HelpCircle, Cable } from 'lucide-react';

type NodeKind = 'gateway' | 'switch' | 'ap' | 'repeater' | 'client' | 'unknown';
type SourcePlugin = 'freebox' | 'unifi' | 'scan-reseau';

export interface TopologyNodeData extends Record<string, unknown> {
    kind: NodeKind;
    label: string;
    ip?: string;
    mac?: string;
    vendor?: string;
    sources: SourcePlugin[];
    active?: boolean;
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

export const TopologyNodeCard: React.FC<NodeProps> = ({ data, selected }) => {
    const d = data as TopologyNodeData;
    const style = KIND_STYLE[d.kind] ?? KIND_STYLE.unknown;
    const isInfra = d.kind === 'gateway' || d.kind === 'switch' || d.kind === 'ap' || d.kind === 'repeater';
    const BrandIcon = isInfra ? pickInfraIcon(d.kind, d.sources) : null;
    const Icon = BrandIcon ?? style.icon;
    const inactive = d.active === false;
    const borderClass = inactive ? 'border-slate-600/40' : style.border;
    const ringClass = selected ? `ring-2 ${style.ring}` : '';
    const tintClass = inactive ? 'from-slate-700/30 to-slate-800/15' : style.tint;
    const iconWrapperColor = inactive ? 'text-slate-500' : style.iconColor;
    const labelClass = pickLabelClass(inactive, isInfra);

    return (
        <div
            className={`relative w-[200px] rounded-lg border-2 shadow-md transition-all overflow-hidden bg-slate-900 ${borderClass} ${ringClass}`}
        >
            {/* Tinted overlay (active) or muted gray (offline) over solid slate-900 base */}
            <div
                className={`absolute inset-0 bg-gradient-to-br pointer-events-none ${tintClass}`}
            />
            <Handle type="target" position={Position.Top} className="!bg-white/50 !border-white/50 !w-2 !h-2" />
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
                </div>
            </div>
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
            <Handle type="source" position={Position.Bottom} className="!bg-white/50 !border-white/50 !w-2 !h-2" />
        </div>
    );
};

export default TopologyNodeCard;
