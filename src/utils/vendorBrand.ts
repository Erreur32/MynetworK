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
  siAsus,
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
  siMsi,
  siOrange,
  siMitsubishi,
  siProxmox,
  siVeeam,
  siMotorola,
  siNokia,
  type SimpleIcon
} from 'simple-icons';
import type { LucideIcon } from 'lucide-react';
import { Plug, Thermometer, Clock } from 'lucide-react';

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
  { pattern: /asus(tek)?/i, icon: siAsus },
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
  { pattern: /\bmsi\b|micro-?star/i, icon: siMsi },
  { pattern: /\borange\b/i, icon: siOrange },
  { pattern: /mitsubishi/i, icon: siMitsubishi },
  { pattern: /proxmox/i, icon: siProxmox },
  { pattern: /motorola/i, icon: siMotorola },
  { pattern: /\bnokia\b|hmd\s*global/i, icon: siNokia }
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

// Brands with no registered MAC OUI block (pure software/service vendors) —
// detectable only from the device's label/hostname, never from `vendor`.
const LABEL_MATCHERS: Array<{ pattern: RegExp; icon: SimpleIcon }> = [
  { pattern: /veeam/i, icon: siVeeam }
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
  { pattern: /netatmo/i, icon: Thermometer }
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
