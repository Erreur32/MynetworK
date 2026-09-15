import React from 'react';
import type { SimpleIcon } from 'simple-icons';
import { getVendorBrand, getVendorBrandFromLabel, getVendorLocalIcon, getVendorLocalIconFromLabel, getVendorIconFallback, getVendorIconFallbackFromLabel, resolveVendorIconId, FORCE_WHITE_BRAND_TITLES } from '../../utils/vendorBrand';

interface BrandSvgIconProps {
  icon: SimpleIcon;
  size?: number;
  className?: string;
  /** Explicit color choice for near-black brand marks (see `FORCE_WHITE_BRAND_TITLES`);
   *  defaults to white when unset, since this app has no light theme. */
  forceColor?: 'black' | 'white';
}

/** Renders a resolved simple-icons brand mark. */
export const BrandSvgIcon: React.FC<BrandSvgIconProps> = ({ icon, size = 16, className, forceColor }) => {
  const fill = forceColor
    ? (forceColor === 'white' ? '#fff' : '#000')
    : (FORCE_WHITE_BRAND_TITLES.has(icon.title) ? '#fff' : `#${icon.hex}`);
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-label={icon.title}
    >
      <title>{icon.title}</title>
      <path d={icon.path} fill={fill} />
    </svg>
  );
};

interface VendorIconProps {
  vendor?: string | null;
  /** Device label/hostname — used for software-only brands (e.g. Veeam)
   *  that never show up in OUI vendor detection. */
  label?: string | null;
  /** Manually forced icon id (`network_scans.vendor_icon`), takes priority over auto-detection. */
  forcedIcon?: string | null;
  size?: number;
  className?: string;
}

/**
 * Renders the manufacturer's brand logo for a device when the vendor
 * (OUI lookup / Freebox vendor_name) or label/hostname matches a known
 * brand. Falls back to a distinctive lucide icon for known vendors without
 * a simple-icons logo. Renders nothing when unmatched — callers are
 * expected to fall back to a generic category icon.
 */
export const VendorIcon: React.FC<VendorIconProps> = ({ vendor, label, forcedIcon, size = 16, className }) => {
  const resolved = resolveVendorIconId(forcedIcon);
  if (resolved) {
    if (resolved.kind === 'simple') return <BrandSvgIcon icon={resolved.icon} size={size} className={className} forceColor={resolved.forceColor} />;
    if (resolved.kind === 'local') return <img src={resolved.icon.url} width={size} height={size} className={className} alt={resolved.icon.title} />;
    if (resolved.kind === 'lucide') { const Icon = resolved.icon; return <Icon size={size} className={className} />; }
    // Custom icons never execute embedded scripts when rendered via <img>, unlike inline SVG injection.
    return <img src={resolved.dataUrl} width={size} height={size} className={className} alt={vendor || label || 'vendor icon'} />;
  }

  const brand = getVendorBrand(vendor) ?? getVendorBrandFromLabel(label);
  if (brand) return <BrandSvgIcon icon={brand} size={size} className={className} />;

  // Label-based match first: it's always more specific than a vendor-OUI match
  // (e.g. a Freebox Ultra model logo should win over the generic Freebox mark).
  const localIcon = getVendorLocalIconFromLabel(label) ?? getVendorLocalIcon(vendor);
  if (localIcon) return <img src={localIcon.url} width={size} height={size} className={className} alt={localIcon.title} />;

  const FallbackIcon = getVendorIconFallback(vendor) ?? getVendorIconFallbackFromLabel(label);
  if (FallbackIcon) return <FallbackIcon size={size} className={className} />;

  return null;
};
