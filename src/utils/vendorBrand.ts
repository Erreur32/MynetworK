/**
 * Maps raw vendor strings (IEEE OUI registry labels, Freebox vendor_name)
 * to a simple-icons brand icon, so device UIs can show a recognizable logo
 * instead of a generic icon when the manufacturer is known.
 */
import {
  siApple,
  siSamsung,
  siGoogle,
  siSonos,
  siSynology,
  siQnap,
  siTplink,
  siUbiquiti,
  siNetgear,
  siLinksys,
  siMikrotik,
  siCisco,
  siXiaomi,
  siHuawei,
  siHonor,
  siOneplus,
  siOppo,
  siVivo,
  siSony,
  siLg,
  siDell,
  siLenovo,
  siHp,
  siAcer,
  siIntel,
  siNvidia,
  siEpson,
  siPhilipshue,
  siRoku,
  siRaspberrypi,
  siRing,
  siArlo,
  siWyze,
  siShelly,
  siSeagate,
  siRazer,
  siOrange,
  siMitsubishi,
  siProxmox,
  siVeeam,
  siMotorola,
  siNokia,
  siEcovacs,
  siIkea,
  siIrobot,
  siWemo,
  siBose,
  siSmartthings,
  siLifx,
  siHomeassistant,
  siTruenas,
  siUnraid,
  siOpenmediavault,
  siPortainer,
  siPihole,
  siAdguard,
  siPlex,
  siJellyfin,
  siNextcloud,
  siGrafana,
  siNginxproxymanager,
  siHomebridge,
  siEsphome,
  siTasmota,
  siZigbee,
  siVmware,
  siLinux,
  siAndroid,
  siDenon,
  siJbl,
  siTesla,
  siCorsair,
  siElgato,
  siSteamdeck,
  siDji,
  siBambulab,
  siFritz,
  type SimpleIcon
} from 'simple-icons';
import type { LucideIcon } from 'lucide-react';
import {
  Plug, Thermometer, Clock, Router, Radio, Lightbulb, Tv, Monitor,
  Smartphone, Tablet, Laptop, HardDrive, Wifi, Globe, Car, Printer, Camera, Speaker, Gamepad2, Server,
  AppWindow
} from 'lucide-react';

/** Broad device family used to group the icon picker into sections. */
export type IconCategory =
  | 'network' | 'computer' | 'mobile' | 'storage' | 'smarthome' | 'media'
  | 'camera' | 'printer' | 'gaming' | 'server' | 'vehicle' | 'generic';

// Ordered by specificity: longer/more specific substrings first so e.g.
// "TP-Link" doesn't get shadowed by a shorter unrelated match.
const VENDOR_MATCHERS: Array<{ pattern: RegExp; icon: SimpleIcon; category: IconCategory }> = [
  { pattern: /raspberry\s*pi/i, icon: siRaspberrypi, category: 'computer' },
  { pattern: /philips\s*hue|signify/i, icon: siPhilipshue, category: 'smarthome' },
  { pattern: /tp-?link|\btapo\b/i, icon: siTplink, category: 'network' },
  { pattern: /ubiquiti/i, icon: siUbiquiti, category: 'network' },
  { pattern: /synology/i, icon: siSynology, category: 'storage' },
  { pattern: /qnap/i, icon: siQnap, category: 'storage' },
  { pattern: /netgear/i, icon: siNetgear, category: 'network' },
  { pattern: /linksys/i, icon: siLinksys, category: 'network' },
  { pattern: /mikrotik/i, icon: siMikrotik, category: 'network' },
  { pattern: /cisco/i, icon: siCisco, category: 'network' },
  { pattern: /xiaomi/i, icon: siXiaomi, category: 'mobile' },
  { pattern: /huawei/i, icon: siHuawei, category: 'mobile' },
  { pattern: /honor/i, icon: siHonor, category: 'mobile' },
  { pattern: /oneplus/i, icon: siOneplus, category: 'mobile' },
  { pattern: /oppo/i, icon: siOppo, category: 'mobile' },
  { pattern: /\bvivo\b/i, icon: siVivo, category: 'mobile' },
  { pattern: /sonos/i, icon: siSonos, category: 'media' },
  { pattern: /\bapple\b/i, icon: siApple, category: 'mobile' },
  { pattern: /\bsamsung\b/i, icon: siSamsung, category: 'mobile' },
  { pattern: /\bgoogle\b/i, icon: siGoogle, category: 'computer' },
  { pattern: /sony/i, icon: siSony, category: 'media' },
  { pattern: /\blg\s+electronics\b|^lg\b/i, icon: siLg, category: 'media' },
  { pattern: /\bdell\b/i, icon: siDell, category: 'computer' },
  { pattern: /lenovo/i, icon: siLenovo, category: 'computer' },
  { pattern: /hewlett\s*packard|\bhp\b/i, icon: siHp, category: 'computer' },
  { pattern: /\bacer\b/i, icon: siAcer, category: 'computer' },
  { pattern: /\bintel\b/i, icon: siIntel, category: 'computer' },
  { pattern: /nvidia/i, icon: siNvidia, category: 'computer' },
  { pattern: /epson/i, icon: siEpson, category: 'printer' },
  { pattern: /\broku\b/i, icon: siRoku, category: 'media' },
  { pattern: /\bring\b/i, icon: siRing, category: 'camera' },
  { pattern: /\barlo\b/i, icon: siArlo, category: 'camera' },
  { pattern: /\bwyze\b/i, icon: siWyze, category: 'camera' },
  { pattern: /\bshelly\b/i, icon: siShelly, category: 'smarthome' },
  { pattern: /seagate/i, icon: siSeagate, category: 'storage' },
  { pattern: /razer/i, icon: siRazer, category: 'gaming' },
  { pattern: /\borange\b/i, icon: siOrange, category: 'network' },
  { pattern: /mitsubishi/i, icon: siMitsubishi, category: 'smarthome' },
  { pattern: /proxmox/i, icon: siProxmox, category: 'server' },
  { pattern: /motorola/i, icon: siMotorola, category: 'mobile' },
  { pattern: /\bnokia\b|hmd\s*global/i, icon: siNokia, category: 'mobile' },
  { pattern: /ecovacs/i, icon: siEcovacs, category: 'smarthome' },
  { pattern: /\bvmware\b/i, icon: siVmware, category: 'server' },
  // Common home-network / IoT hardware brands
  { pattern: /ikea|tradfri/i, icon: siIkea, category: 'smarthome' },
  { pattern: /irobot|roomba/i, icon: siIrobot, category: 'smarthome' },
  { pattern: /\bwemo\b|belkin/i, icon: siWemo, category: 'smarthome' },
  { pattern: /\bbose\b/i, icon: siBose, category: 'media' },
  { pattern: /smartthings/i, icon: siSmartthings, category: 'smarthome' },
  { pattern: /\blifx\b/i, icon: siLifx, category: 'smarthome' },
  // Audio, gaming and misc hardware brands with their own registered OUI blocks
  { pattern: /\bdenon\b/i, icon: siDenon, category: 'media' },
  { pattern: /\bjbl\b/i, icon: siJbl, category: 'media' },
  { pattern: /\btesla\b/i, icon: siTesla, category: 'vehicle' },
  { pattern: /corsair/i, icon: siCorsair, category: 'gaming' },
  { pattern: /elgato/i, icon: siElgato, category: 'gaming' },
  { pattern: /steam\s*deck/i, icon: siSteamdeck, category: 'gaming' },
  { pattern: /\bdji\b/i, icon: siDji, category: 'vehicle' },
  { pattern: /bambu\s*lab/i, icon: siBambulab, category: 'printer' },
  { pattern: /\bavm\b|fritz!?box|fritz!?os/i, icon: siFritz, category: 'network' }
];

/**
 * Resolves a raw vendor/manufacturer string (OUI lookup) to a simple-icons
 * brand icon. Returns null when no known brand matches (caller should fall
 * back to a generic category icon).
 */
export function getVendorBrand(vendorRaw?: string | null): SimpleIcon | null {
  if (!vendorRaw) return null;
  for (const { pattern, icon } of VENDOR_MATCHERS) {
    if (pattern.test(vendorRaw)) return icon;
  }
  return null;
}

// Brands with no registered MAC OUI block (pure software/service vendors), or
// whose OUI vendor string isn't yet in the local IEEE database snapshot —
// detectable only from the device's label/hostname, never from `vendor`.
const LABEL_MATCHERS: Array<{ pattern: RegExp; icon: SimpleIcon; category: IconCategory }> = [
  { pattern: /veeam/i, icon: siVeeam, category: 'server' },
  // Tapo product line reports under the parent TP-Link OUI; falls back here
  // when the local vendor lookup hasn't caught up with a recent OUI block.
  { pattern: /\btapo\b/i, icon: siTplink, category: 'network' },
  // Shelly devices run on Espressif (ESP8266/32) chips with no dedicated OUI
  // block of their own, so `vendor` reports "Espressif Inc.": only the
  // hostname (e.g. "shellyplug-s-...") reveals the actual brand.
  { pattern: /\bshelly\b/i, icon: siShelly, category: 'smarthome' },
  // Home automation hub, runs on generic hardware, identifiable only by hostname.
  { pattern: /home\s*assistant|\bhassio\b|\bhomeassistant\b/i, icon: siHomeassistant, category: 'smarthome' },
  // NAS operating systems, often self-built or on generic hardware, no dedicated OUI.
  { pattern: /truenas/i, icon: siTruenas, category: 'storage' },
  { pattern: /unraid/i, icon: siUnraid, category: 'storage' },
  { pattern: /openmediavault|\bomv\b/i, icon: siOpenmediavault, category: 'storage' },
  // Common self-hosted / Docker services on a home server or NAS.
  { pattern: /portainer/i, icon: siPortainer, category: 'server' },
  { pattern: /pi-?hole/i, icon: siPihole, category: 'server' },
  { pattern: /adguard/i, icon: siAdguard, category: 'server' },
  { pattern: /\bplex\b/i, icon: siPlex, category: 'media' },
  { pattern: /jellyfin/i, icon: siJellyfin, category: 'media' },
  { pattern: /nextcloud/i, icon: siNextcloud, category: 'server' },
  { pattern: /grafana/i, icon: siGrafana, category: 'server' },
  { pattern: /nginx-?proxy-?manager|\bnpm\b/i, icon: siNginxproxymanager, category: 'server' },
  { pattern: /homebridge/i, icon: siHomebridge, category: 'smarthome' },
  // IoT firmware / integration hubs, identified by hostname rather than OUI.
  { pattern: /esphome/i, icon: siEsphome, category: 'smarthome' },
  { pattern: /tasmota/i, icon: siTasmota, category: 'smarthome' },
  { pattern: /zigbee/i, icon: siZigbee, category: 'smarthome' },
  // Operating-system hostnames: the OUI vendor is often a chipmaker/OEM
  // motherboard maker rather than the OS itself, so these are only
  // detectable from the device's own hostname (e.g. "DESKTOP-1AB2C3D",
  // "iPhone-de-Marie", "raspberrypi.local").
  { pattern: /iphone|ipad|ipod|macbook|imac|mac-?mini|mac-?pro|mac-?studio|\bmacos\b/i, icon: siApple, category: 'mobile' },
  { pattern: /\bandroid\b/i, icon: siAndroid, category: 'mobile' },
  { pattern: /\blinux\b|\bubuntu\b|\bdebian\b|\bfedora\b|\bcentos\b|\bmanjaro\b|raspbian/i, icon: siLinux, category: 'computer' }
];

/**
 * Resolves a device label/hostname to a simple-icons brand icon, for
 * software-only vendors that never show up in OUI vendor detection.
 */
export function getVendorBrandFromLabel(label?: string | null): SimpleIcon | null {
  if (!label) return null;
  for (const { pattern, icon } of LABEL_MATCHERS) {
    if (pattern.test(label)) return icon;
  }
  return null;
}

// Known vendors without a simple-icons logo — a distinctive lucide icon
// beats the generic category fallback while we don't vendor a local SVG.
const VENDOR_ICON_FALLBACK_MATCHERS: Array<{ pattern: RegExp; icon: LucideIcon; category: IconCategory }> = [
  { pattern: /meross/i, icon: Plug, category: 'smarthome' },
  { pattern: /netatmo/i, icon: Thermometer, category: 'smarthome' },
  { pattern: /freebox/i, icon: Router, category: 'network' },
  { pattern: /reolink/i, icon: Camera, category: 'camera' },
  // Powerline (CPL) and mesh Wi-Fi networking gear, no simple-icons logo.
  { pattern: /devolo/i, icon: Wifi, category: 'network' },
  { pattern: /aqara|lumi\s*united/i, icon: Radio, category: 'smarthome' },
  // Tuya: white-label smart-home OEM (plugs, bulbs, sensors, switches) — no simple-icons logo.
  { pattern: /\btuya\b/i, icon: Lightbulb, category: 'smarthome' },
  // Plain Philips (TVs, shavers, appliances) — distinct from Philips Hue, matched above.
  { pattern: /\bphilips\b/i, icon: Tv, category: 'media' },
  // Motherboard/mainboard manufacturers: their OUI almost always identifies a
  // self-built desktop PC's onboard NIC, not a branded consumer product — a
  // generic PC icon is more accurate here than the manufacturer's own logo.
  { pattern: /asus(tek)?/i, icon: Monitor, category: 'computer' },
  { pattern: /\bmsi\b|micro-?star/i, icon: Monitor, category: 'computer' },
  { pattern: /gigabyte/i, icon: Monitor, category: 'computer' },
  { pattern: /asrock/i, icon: Monitor, category: 'computer' },
  { pattern: /super\s*micro/i, icon: Monitor, category: 'server' },
  { pattern: /biostar/i, icon: Monitor, category: 'computer' },
  { pattern: /\bevga\b/i, icon: Monitor, category: 'computer' },
  // Amazon has no free-licensed logo in simple-icons (same restriction as Windows/Microsoft).
  { pattern: /amazon.*alexa|\becho\s*dot\b|\becho\s*show\b/i, icon: Speaker, category: 'media' },
  { pattern: /amazon.*fire\s*tv|firetv/i, icon: Tv, category: 'media' },
  // Printer brands with no simple-icons logo.
  { pattern: /\bcanon\b/i, icon: Printer, category: 'printer' },
  { pattern: /\bbrother\b/i, icon: Printer, category: 'printer' },
  { pattern: /\bxerox\b/i, icon: Printer, category: 'printer' },
  { pattern: /lexmark/i, icon: Printer, category: 'printer' },
  // Smart-home brands with no simple-icons logo.
  { pattern: /nanoleaf/i, icon: Lightbulb, category: 'smarthome' },
  { pattern: /\bgovee\b/i, icon: Lightbulb, category: 'smarthome' },
  { pattern: /switch-?bot/i, icon: Plug, category: 'smarthome' },
  { pattern: /broadlink/i, icon: Radio, category: 'smarthome' },
  { pattern: /yeelight/i, icon: Lightbulb, category: 'smarthome' },
  { pattern: /\beufy\b/i, icon: Camera, category: 'camera' },
  // Storage / NAS brands with no simple-icons logo.
  { pattern: /western\s*digital|\bwdc\b|\bwd\b/i, icon: HardDrive, category: 'storage' },
  { pattern: /buffalo/i, icon: HardDrive, category: 'storage' },
  { pattern: /asustor/i, icon: HardDrive, category: 'storage' },
  // Networking brands with no simple-icons logo.
  { pattern: /d-?link/i, icon: Router, category: 'network' },
  { pattern: /zyxel/i, icon: Router, category: 'network' },
  { pattern: /\beero\b/i, icon: Router, category: 'network' }
];

export function getVendorIconFallback(vendorRaw?: string | null): LucideIcon | null {
  if (!vendorRaw) return null;
  for (const { pattern, icon } of VENDOR_ICON_FALLBACK_MATCHERS) {
    if (pattern.test(vendorRaw)) return icon;
  }
  return null;
}

// LaMetric has no registered OUI block at all (runs on a third-party Wi-Fi
// module, so `vendor` shows the chipmaker, not LaMetric) — only a hostname
// match can identify it.
const LABEL_ICON_FALLBACK_MATCHERS: Array<{ pattern: RegExp; icon: LucideIcon; category: IconCategory }> = [
  { pattern: /lametric/i, icon: Clock, category: 'smarthome' },
  // Windows has no free-licensed logo in simple-icons (same restriction as
  // Microsoft/Amazon); only default Windows hostnames reveal the OS.
  { pattern: /^desktop-|^laptop-|^win-\d|\bwindows\b|\bwin1[01]\b/i, icon: AppWindow, category: 'computer' }
];

export function getVendorIconFallbackFromLabel(label?: string | null): LucideIcon | null {
  if (!label) return null;
  for (const { pattern, icon } of LABEL_ICON_FALLBACK_MATCHERS) {
    if (pattern.test(label)) return icon;
  }
  return null;
}

/** True when `<VendorIcon>` will render something (logo or fallback icon) for this vendor/label pair. */
export function hasVendorIcon(vendorRaw?: string | null, label?: string | null): boolean {
  return getVendorBrand(vendorRaw) !== null
    || getVendorBrandFromLabel(label) !== null
    || getVendorIconFallback(vendorRaw) !== null
    || getVendorIconFallbackFromLabel(label) !== null;
}

// ── Manual icon override catalog ────────────────────────────────────────────
// Feeds the vendor-icon picker (force a vendor name + pick an icon on a device
// row). IDs are stable strings persisted in `network_scans.vendor_icon`:
//   - `simple:<slug>` → a brand logo already bundled above
//   - `lucide:<Name>` → a lucide fallback icon already bundled above
//   - `custom:<data-url>` → a user-imported icon, resolved by the caller

function slugifyIconTitle(title: string): string {
  // The first replace already collapses any run of non-alnum chars into a single
  // '-', so at most one leading/trailing '-' can remain — no `+` quantifier needed.
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const ALL_SIMPLE_ICONS: Array<{ icon: SimpleIcon; category: IconCategory }> = Array.from(
  new Map(
    [...VENDOR_MATCHERS, ...LABEL_MATCHERS].map((m) => [m.icon.title, { icon: m.icon, category: m.category }])
  ).values()
);

// Every icon used by the fallback matchers above (Plug, Camera, Printer, HardDrive,
// Router...) is already one of these named entries, so it's selectable in the picker
// without needing a separate anonymous copy.
const ALL_LUCIDE_ICONS: Array<{ name: string; icon: LucideIcon; category: IconCategory }> = [
  { name: 'Plug', icon: Plug, category: 'smarthome' },
  { name: 'Thermometer', icon: Thermometer, category: 'smarthome' },
  { name: 'Clock', icon: Clock, category: 'smarthome' },
  { name: 'Router', icon: Router, category: 'network' },
  { name: 'Radio', icon: Radio, category: 'smarthome' },
  { name: 'Lightbulb', icon: Lightbulb, category: 'smarthome' },
  { name: 'Tv', icon: Tv, category: 'media' },
  { name: 'Monitor', icon: Monitor, category: 'computer' },
  { name: 'Smartphone', icon: Smartphone, category: 'mobile' },
  { name: 'Tablet', icon: Tablet, category: 'mobile' },
  { name: 'Laptop', icon: Laptop, category: 'computer' },
  { name: 'HardDrive', icon: HardDrive, category: 'storage' },
  { name: 'Wifi', icon: Wifi, category: 'network' },
  { name: 'Globe', icon: Globe, category: 'generic' },
  { name: 'Car', icon: Car, category: 'vehicle' },
  { name: 'Printer', icon: Printer, category: 'printer' },
  { name: 'Camera', icon: Camera, category: 'camera' },
  { name: 'Speaker', icon: Speaker, category: 'media' },
  { name: 'Gamepad2', icon: Gamepad2, category: 'gaming' },
  { name: 'Server', icon: Server, category: 'server' },
  { name: 'AppWindow', icon: AppWindow, category: 'computer' }
];

export interface VendorIconCatalogEntry {
  id: string;
  title: string;
  kind: 'simple' | 'lucide';
  category: IconCategory;
  icon: SimpleIcon | LucideIcon;
}

/** Full list of built-in icons selectable in the vendor-icon picker. */
export function getVendorIconCatalog(): VendorIconCatalogEntry[] {
  return [
    ...ALL_SIMPLE_ICONS.map(({ icon, category }) => ({ id: `simple:${slugifyIconTitle(icon.title)}`, title: icon.title, kind: 'simple' as const, category, icon })),
    ...ALL_LUCIDE_ICONS.map(({ name, icon, category }) => ({ id: `lucide:${name}`, title: name, kind: 'lucide' as const, category, icon }))
  ];
}

/** Best-guess catalog id for a vendor string, used to prefill the picker. */
export function suggestVendorIconId(vendorRaw?: string | null): string | null {
  const brand = getVendorBrand(vendorRaw);
  if (brand) return `simple:${slugifyIconTitle(brand.title)}`;
  const FallbackIcon = getVendorIconFallback(vendorRaw);
  if (FallbackIcon) {
    const match = ALL_LUCIDE_ICONS.find((e) => e.icon === FallbackIcon);
    if (match) return `lucide:${match.name}`;
  }
  return null;
}

export type ResolvedVendorIcon =
  | { kind: 'simple'; icon: SimpleIcon }
  | { kind: 'lucide'; icon: LucideIcon }
  | { kind: 'custom'; dataUrl: string };

/** Resolves a persisted `vendor_icon` id (or a live picker selection) to something renderable. */
export function resolveVendorIconId(id?: string | null): ResolvedVendorIcon | null {
  if (!id) return null;

  if (id.startsWith('simple:')) {
    const slug = id.slice('simple:'.length);
    const found = ALL_SIMPLE_ICONS.find(({ icon }) => slugifyIconTitle(icon.title) === slug);
    return found ? { kind: 'simple', icon: found.icon } : null;
  }

  if (id.startsWith('lucide:')) {
    const name = id.slice('lucide:'.length);
    const found = ALL_LUCIDE_ICONS.find((e) => e.name === name);
    return found ? { kind: 'lucide', icon: found.icon } : null;
  }

  if (id.startsWith('custom:')) {
    return { kind: 'custom', dataUrl: id.slice('custom:'.length) };
  }

  return null;
}
