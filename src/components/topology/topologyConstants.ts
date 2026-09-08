/**
 * Layout constants shared between the dagre layout (topologyLayout.ts), the
 * card renderer (TopologyNodeCard.tsx), and the edge fan-out math
 * (TopologyGraph.tsx). Single source of truth — dagre reserves slots at
 * these sizes while the cards render at the same sizes, so any drift here
 * makes edges land off-port or cards overflow their reserved column.
 */

// Network infrastructure cards (gateway, switch, AP, repeater) — bigger
// than the client cards so they read clearly even in a sea of small clients.
export const INFRA_CARD_WIDTH = 300;

// vm-host: same width family as infra, a touch wider for the extra info row
// (vmCount + hypervisor).
export const VM_HOST_CARD_WIDTH = 340;

// Wide enough that the Wi-Fi connection pill ("MyWifi · 5G · 866 Mbps") fits
// inside the chip without truncation.
export const CLIENT_CARD_WIDTH = 220;

// Above this port count, a switch/gateway card switches from one inline row
// of ports to a wrapped grid.
export const SWITCH_INLINE_PORTS_MAX = 12;

// Bottom-row port cell footprint (cell width + gap).
export const PORT_CELL_WIDTH = 28;

// Fan-out handle count: handles are evenly spaced along the bottom (source)
// and top (target) of the card. 24 keeps the quantization step well under
// the smoothstep offset, so a residual misalignment between source X and
// target X never produces a visible zigzag — the bend is too small to read
// as a "tear".
export const FAN_OUT_COUNT = 24;
