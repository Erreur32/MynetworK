import React from 'react';
import type { SimpleIcon } from 'simple-icons';
import { getVendorBrand, getVendorBrandFromLabel, getVendorIconFallback, getVendorIconFallbackFromLabel, resolveVendorIconId } from '../../utils/vendorBrand';

interface BrandSvgIconProps {
  icon: SimpleIcon;
  size?: number;
  className?: string;
}

/** Renders a resolved simple-icons brand mark. */
export const BrandSvgIcon: React.FC<BrandSvgIconProps> = ({ icon, size = 16, className }) => (
  <svg
    role="img"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    aria-label={icon.title}
  >
    <title>{icon.title}</title>
    <path d={icon.path} fill={`#${icon.hex}`} />
  </svg>
);

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
    if (resolved.kind === 'simple') return <BrandSvgIcon icon={resolved.icon} size={size} className={className} />;
    if (resolved.kind === 'lucide') { const Icon = resolved.icon; return <Icon size={size} className={className} />; }
    // Custom icons never execute embedded scripts when rendered via <img>, unlike inline SVG injection.
    return <img src={resolved.dataUrl} width={size} height={size} className={className} alt={vendor || label || 'vendor icon'} />;
  }

  const brand = getVendorBrand(vendor) ?? getVendorBrandFromLabel(label);
  if (brand) return <BrandSvgIcon icon={brand} size={size} className={className} />;

  const FallbackIcon = getVendorIconFallback(vendor) ?? getVendorIconFallbackFromLabel(label);
  if (FallbackIcon) return <FallbackIcon size={size} className={className} />;

  return null;
};
