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
  type SimpleIcon
} from 'simple-icons';
import type { LucideIcon } from 'lucide-react';
import {
  Plug, Thermometer, Clock, Router, Radio, Lightbulb, Tv, Monitor,
  Smartphone, Tablet, Laptop, HardDrive, Wifi, Globe, Car, Printer, Camera, Speaker, Gamepad2, Server
} from 'lucide-react';

// Ordered by specificity: longer/more specific substrings first so e.g.
// "TP-Link" doesn't get shadowed by a shorter unrelated match.
const VENDOR_MATCHERS: Array<{ pattern: RegExp; icon: SimpleIcon }> = [
  { pattern: /raspberry\s*pi/i, icon: siRaspberrypi },
  { pattern: /philips\s*hue|signify/i, icon: siPhilipshue },
  { pattern: /tp-?link|\btapo\b/i, icon: siTplink },
  { pattern: /ubiquiti/i, icon: siUbiquiti },
  { pattern: /synology/i, icon: siSynology },
  { pattern: /qnap/i, icon: siQnap },
  { pattern: /netgear/i, icon: siNetgear },
  { pattern: /linksys/i, icon: siLinksys },
  { pattern: /mikrotik/i, icon: siMikrotik },
  { pattern: /cisco/i, icon: siCisco },
  { pattern: /xiaomi/i, icon: siXiaomi },
  { pattern: /huawei/i, icon: siHuawei },
  { pattern: /honor/i, icon: siHonor },
  { pattern: /oneplus/i, icon: siOneplus },
  { pattern: /oppo/i, icon: siOppo },
  { pattern: /\bvivo\b/i, icon: siVivo },
  { pattern: /sonos/i, icon: siSonos },
  { pattern: /\bapple\b/i, icon: siApple },
  { pattern: /\bsamsung\b/i, icon: siSamsung },
  { pattern: /\bgoogle\b/i, icon: siGoogle },
  { pattern: /sony/i, icon: siSony },
  { pattern: /\blg\s+electronics\b|^lg\b/i, icon: siLg },
  { pattern: /\bdell\b/i, icon: siDell },
  { pattern: /lenovo/i, icon: siLenovo },
  { pattern: /hewlett\s*packard|\bhp\b/i, icon: siHp },
  { pattern: /\bacer\b/i, icon: siAcer },
  { pattern: /\bintel\b/i, icon: siIntel },
  { pattern: /nvidia/i, icon: siNvidia },
  { pattern: /epson/i, icon: siEpson },
  { pattern: /\broku\b/i, icon: siRoku },
  { pattern: /\bring\b/i, icon: siRing },
  { pattern: /\barlo\b/i, icon: siArlo },
  { pattern: /\bwyze\b/i, icon: siWyze },
  { pattern: /\bshelly\b/i, icon: siShelly },
  { pattern: /seagate/i, icon: siSeagate },
  { pattern: /razer/i, icon: siRazer },
  { pattern: /\borange\b/i, icon: siOrange },
  { pattern: /mitsubishi/i, icon: siMitsubishi },
  { pattern: /proxmox/i, icon: siProxmox },
  { pattern: /motorola/i, icon: siMotorola },
  { pattern: /\bnokia\b|hmd\s*global/i, icon: siNokia },
  { pattern: /ecovacs/i, icon: siEcovacs },
  // Common home-network / IoT hardware brands
  { pattern: /ikea|tradfri/i, icon: siIkea },
  { pattern: /irobot|roomba/i, icon: siIrobot },
  { pattern: /\bwemo\b|belkin/i, icon: siWemo },
  { pattern: /\bbose\b/i, icon: siBose },
  { pattern: /smartthings/i, icon: siSmartthings },
  { pattern: /\blifx\b/i, icon: siLifx }
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
const LABEL_MATCHERS: Array<{ pattern: RegExp; icon: SimpleIcon }> = [
  { pattern: /veeam/i, icon: siVeeam },
  // Tapo product line reports under the parent TP-Link OUI; falls back here
  // when the local vendor lookup hasn't caught up with a recent OUI block.
  { pattern: /\btapo\b/i, icon: siTplink },
  // Home automation hub, runs on generic hardware, identifiable only by hostname.
  { pattern: /home\s*assistant|\bhassio\b|\bhomeassistant\b/i, icon: siHomeassistant },
  // NAS operating systems, often self-built or on generic hardware, no dedicated OUI.
  { pattern: /truenas/i, icon: siTruenas },
  { pattern: /unraid/i, icon: siUnraid },
  { pattern: /openmediavault|\bomv\b/i, icon: siOpenmediavault },
  // Common self-hosted / Docker services on a home server or NAS.
  { pattern: /portainer/i, icon: siPortainer },
  { pattern: /pi-?hole/i, icon: siPihole },
  { pattern: /adguard/i, icon: siAdguard },
  { pattern: /\bplex\b/i, icon: siPlex },
  { pattern: /jellyfin/i, icon: siJellyfin },
  { pattern: /nextcloud/i, icon: siNextcloud },
  { pattern: /grafana/i, icon: siGrafana },
  { pattern: /nginx-?proxy-?manager|\bnpm\b/i, icon: siNginxproxymanager },
  { pattern: /homebridge/i, icon: siHomebridge },
  // IoT firmware / integration hubs, identified by hostname rather than OUI.
  { pattern: /esphome/i, icon: siEsphome },
  { pattern: /tasmota/i, icon: siTasmota },
  { pattern: /zigbee/i, icon: siZigbee }
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
const VENDOR_ICON_FALLBACK_MATCHERS: Array<{ pattern: RegExp; icon: LucideIcon }> = [
  { pattern: /meross/i, icon: Plug },
  { pattern: /netatmo/i, icon: Thermometer },
  { pattern: /freebox/i, icon: Router },
  { pattern: /aqara|lumi\s*united/i, icon: Radio },
  // Tuya: white-label smart-home OEM (plugs, bulbs, sensors, switches) — no simple-icons logo.
  { pattern: /\btuya\b/i, icon: Lightbulb },
  // Plain Philips (TVs, shavers, appliances) — distinct from Philips Hue, matched above.
  { pattern: /\bphilips\b/i, icon: Tv },
  // Motherboard/mainboard manufacturers: their OUI almost always identifies a
  // self-built desktop PC's onboard NIC, not a branded consumer product — a
  // generic PC icon is more accurate here than the manufacturer's own logo.
  { pattern: /asus(tek)?/i, icon: Monitor },
  { pattern: /\bmsi\b|micro-?star/i, icon: Monitor },
  { pattern: /gigabyte/i, icon: Monitor },
  { pattern: /asrock/i, icon: Monitor },
  { pattern: /super\s*micro/i, icon: Monitor },
  { pattern: /biostar/i, icon: Monitor },
  { pattern: /\bevga\b/i, icon: Monitor }
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
const LABEL_ICON_FALLBACK_MATCHERS: Array<{ pattern: RegExp; icon: LucideIcon }> = [
  { pattern: /lametric/i, icon: Clock }
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
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const ALL_SIMPLE_ICONS: SimpleIcon[] = Array.from(
  new Map(
    [...VENDOR_MATCHERS.map((m) => m.icon), ...LABEL_MATCHERS.map((m) => m.icon)].map((icon) => [icon.title, icon])
  ).values()
);

const ALL_LUCIDE_ICONS: Array<{ name: string; icon: LucideIcon }> = [
  { name: 'Plug', icon: Plug },
  { name: 'Thermometer', icon: Thermometer },
  { name: 'Clock', icon: Clock },
  { name: 'Router', icon: Router },
  { name: 'Radio', icon: Radio },
  { name: 'Lightbulb', icon: Lightbulb },
  { name: 'Tv', icon: Tv },
  { name: 'Monitor', icon: Monitor },
  { name: 'Smartphone', icon: Smartphone },
  { name: 'Tablet', icon: Tablet },
  { name: 'Laptop', icon: Laptop },
  { name: 'HardDrive', icon: HardDrive },
  { name: 'Wifi', icon: Wifi },
  { name: 'Globe', icon: Globe },
  { name: 'Car', icon: Car },
  { name: 'Printer', icon: Printer },
  { name: 'Camera', icon: Camera },
  { name: 'Speaker', icon: Speaker },
  { name: 'Gamepad2', icon: Gamepad2 },
  { name: 'Server', icon: Server }
];

export interface VendorIconCatalogEntry {
  id: string;
  title: string;
  kind: 'simple' | 'lucide';
  icon: SimpleIcon | LucideIcon;
}

/** Full list of built-in icons selectable in the vendor-icon picker. */
export function getVendorIconCatalog(): VendorIconCatalogEntry[] {
  return [
    ...ALL_SIMPLE_ICONS.map((icon) => ({ id: `simple:${slugifyIconTitle(icon.title)}`, title: icon.title, kind: 'simple' as const, icon })),
    ...ALL_LUCIDE_ICONS.map(({ name, icon }) => ({ id: `lucide:${name}`, title: name, kind: 'lucide' as const, icon }))
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
    const found = ALL_SIMPLE_ICONS.find((icon) => slugifyIconTitle(icon.title) === slug);
    return found ? { kind: 'simple', icon: found } : null;
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
