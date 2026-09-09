import React from 'react';
import type { SimpleIcon } from 'simple-icons';
import { getVendorBrand, getVendorBrandFromLabel, getVendorIconFallback, getVendorIconFallbackFromLabel } from '../../utils/vendorBrand';

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
export const VendorIcon: React.FC<VendorIconProps> = ({ vendor, label, size = 16, className }) => {
  const brand = getVendorBrand(vendor) ?? getVendorBrandFromLabel(label);
  if (brand) return <BrandSvgIcon icon={brand} size={size} className={className} />;

  const FallbackIcon = getVendorIconFallback(vendor) ?? getVendorIconFallbackFromLabel(label);
  if (FallbackIcon) return <FallbackIcon size={size} className={className} />;

  return null;
};
