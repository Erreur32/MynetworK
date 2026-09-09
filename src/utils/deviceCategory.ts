import type { LucideIcon } from 'lucide-react';
import { Smartphone, Tablet, Laptop, Monitor, Tv, Globe, Car, Wifi, HardDrive } from 'lucide-react';
import type { Device } from '../types';

/**
 * Maps a host_type reported by Freebox/scanner sources to our coarse
 * device category. Used as the icon fallback tier when no brand logo
 * matched the vendor.
 */
export function mapHostTypeToCategory(hostType?: string): Device['type'] {
  const typeMap: Record<string, Device['type']> = {
    smartphone: 'phone',
    phone: 'phone',
    tablet: 'tablet',
    laptop: 'laptop',
    computer: 'desktop',
    workstation: 'desktop',
    desktop: 'desktop',
    multimedia: 'tv',
    tv: 'tv',
    television: 'tv',
    gaming_console: 'tv',
    networking_device: 'repeater',
    printer: 'iot',
    car: 'car',
    nas: 'nas',
    other: 'other'
  };
  return typeMap[hostType?.toLowerCase() ?? ''] || 'other';
}

export const CATEGORY_ICON: Record<Device['type'], LucideIcon> = {
  phone: Smartphone,
  tablet: Tablet,
  laptop: Laptop,
  desktop: Monitor,
  tv: Tv,
  car: Car,
  repeater: Wifi,
  nas: HardDrive,
  iot: Globe,
  other: Globe
};
