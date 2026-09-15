import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Search, Upload, RotateCcw, Pencil, type LucideIcon } from 'lucide-react';
import type { SimpleIcon } from 'simple-icons';
import { useClickOutside } from '../../hooks';
import { getVendorIconCatalog, resolveVendorIconId, type VendorIconCatalogEntry, type ResolvedVendorIcon, type IconCategory, type LocalBrandIcon } from '../../utils/vendorBrand';
import { BrandSvgIcon } from './VendorIcon';

// Fixed display order for category sections in the picker (most common home-network
// device families first).
const CATEGORY_ORDER: IconCategory[] = [
  'network', 'computer', 'mobile', 'storage', 'smarthome', 'media',
  'camera', 'printer', 'gaming', 'server', 'vehicle', 'generic'
];

const POPOVER_WIDTH = 400;

// Kept in sync with server/utils/vendorIconValidation.ts (MAX_CUSTOM_ICON_LENGTH ~= 200_000
// chars of base64 data URL). Raw file size is capped lower since base64 inflates it ~37%.
const MAX_CUSTOM_ICON_FILE_SIZE = 120 * 1024; // 120KB
const ACCEPTED_CUSTOM_ICON_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

interface VendorIconPreviewProps {
  entry: VendorIconCatalogEntry;
  size?: number;
}

const CatalogIconPreview: React.FC<VendorIconPreviewProps> = ({ entry, size = 18 }) => {
  if (entry.kind === 'simple') return <BrandSvgIcon icon={entry.icon as SimpleIcon} size={size} forceColor={entry.forceColor} />;
  if (entry.kind === 'local') { const local = entry.icon as LocalBrandIcon; return <img src={local.url} width={size} height={size} alt={local.title} />; }
  const Icon = entry.icon as LucideIcon;
  return <Icon size={size} />;
};

/** Trigger button preview for the currently resolved icon, or an empty placeholder when unset. */
const ResolvedIconPreview: React.FC<{ resolved: ResolvedVendorIcon | null; size?: number }> = ({ resolved, size = 14 }) => {
  if (!resolved) return <span className="w-3.5 h-3.5 rounded-full border border-dashed border-gray-600" />;
  if (resolved.kind === 'simple') return <BrandSvgIcon icon={resolved.icon} size={size} forceColor={resolved.forceColor} />;
  if (resolved.kind === 'local') return <img src={resolved.icon.url} width={size} height={size} alt={resolved.icon.title} />;
  if (resolved.kind === 'lucide') return <resolved.icon size={size} />;
  return <img src={resolved.dataUrl} width={size} height={size} alt="" />;
};

interface VendorIconPickerProps {
  /** Current forced icon id, or null when no explicit override has been picked yet. */
  value: string | null;
  onChange: (iconId: string | null) => void;
  /** Disables the trigger button (e.g. while saving). */
  disabled?: boolean;
  /**
   * 'full' (default): standard icon+chevron trigger, used while the whole vendor row
   * (name + icon) is being edited.
   * 'cell': wraps `children` (the already-rendered VendorIcon, or nothing when unset) in a
   * button that covers the whole table cell, with a pencil overlay on hover, so the entire
   * icon column cell opens the picker, whether or not an icon is currently set.
   */
  variant?: 'full' | 'cell';
  /** Icon content to wrap, only used by the 'cell' variant. */
  children?: React.ReactNode;
}

/**
 * Compact icon button that opens a searchable catalog popover (simple-icons brands +
 * lucide fallbacks) plus a custom-icon import control. Used by the vendor column's
 * inline edit overlay in NetworkScanPage.tsx.
 */
export const VendorIconPicker: React.FC<VendorIconPickerProps> = ({ value, onChange, disabled, variant = 'full', children }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const catalog = useMemo(() => getVendorIconCatalog(), []);
  const resolvedValue = resolveVendorIconId(value);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((entry) => entry.title.toLowerCase().includes(q));
  }, [catalog, search]);

  const groupedEntries = useMemo(() => {
    const groups = new Map<IconCategory, VendorIconCatalogEntry[]>();
    for (const entry of filtered) {
      const bucket = groups.get(entry.category);
      if (bucket) bucket.push(entry);
      else groups.set(entry.category, [entry]);
    }
    return CATEGORY_ORDER
      .map((category) => ({ category, entries: groups.get(category) ?? [] }))
      .filter(({ entries }) => entries.length > 0);
  }, [filtered]);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 6, left: Math.max(8, rect.left - POPOVER_WIDTH + rect.width) });
    } else {
      setPosition(null);
      setSearch('');
      setImportError(null);
    }
  }, [isOpen]);

  // Focus the search input once the popover has actually mounted (position is only
  // set after that), rather than relying on the JSX `autoFocus` attribute.
  useEffect(() => {
    if (position) searchInputRef.current?.focus();
  }, [position]);

  const closePopover = useCallback(() => setIsOpen(false), []);
  useClickOutside(popoverRef, closePopover, isOpen);

  const handlePick = (iconId: string) => {
    onChange(iconId);
    setIsOpen(false);
  };

  const handleReset = () => {
    onChange(null);
    setIsOpen(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);

    if (!ACCEPTED_CUSTOM_ICON_TYPES.includes(file.type)) {
      setImportError(t('networkScan.vendorIconPicker.errors.invalidType'));
      return;
    }
    if (file.size > MAX_CUSTOM_ICON_FILE_SIZE) {
      setImportError(t('networkScan.vendorIconPicker.errors.tooLarge'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl.startsWith('data:image/')) {
        setImportError(t('networkScan.vendorIconPicker.errors.readFailed'));
        return;
      }
      handlePick(`custom:${dataUrl}`);
    };
    reader.onerror = () => setImportError(t('networkScan.vendorIconPicker.errors.readFailed'));
    reader.readAsDataURL(file);
  };

  return (
    <>
      {variant === 'cell' ? (
        <button
          ref={buttonRef}
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((v) => !v);
          }}
          className="group/cell relative flex items-center justify-center w-7 h-7 rounded hover:bg-white/5 transition-colors disabled:opacity-50"
          title={t('networkScan.vendorIconPicker.trigger')}
        >
          {children}
          <span className="absolute inset-0 flex items-center justify-center rounded bg-black/70 opacity-0 group-hover/cell:opacity-100 transition-opacity">
            <Pencil size={11} className="text-gray-100" />
          </span>
        </button>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((v) => !v);
          }}
          className="flex items-center gap-1 px-1.5 py-1 bg-[#1a1a1a] border border-gray-700 rounded hover:border-blue-500 transition-colors disabled:opacity-50"
          title={t('networkScan.vendorIconPicker.trigger')}
        >
          <span className="flex items-center justify-center w-4 h-4 text-gray-200">
            <ResolvedIconPreview resolved={resolvedValue} />
          </span>
          <ChevronDown size={12} className="text-gray-500" />
        </button>
      )}

      {isOpen && position && createPortal(
        <div
          ref={popoverRef}
          className="fixed w-[400px] max-h-96 flex flex-col bg-[#1a1a1a] border border-gray-700 rounded-lg shadow-xl z-[9999] overflow-hidden"
          style={{ top: position.top, left: position.left }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-gray-700">
            <p className="text-xs font-semibold text-gray-300">{t('networkScan.vendorIconPicker.title')}</p>
          </div>
          <div className="p-2 border-b border-gray-700 flex items-center gap-2">
            <Search size={14} className="text-gray-500 flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('networkScan.vendorIconPicker.searchPlaceholder')}
              className="flex-1 bg-transparent text-sm text-gray-200 focus:outline-none placeholder:text-gray-600"
            />
            {value && (
              <button
                type="button"
                onClick={handleReset}
                title={t('networkScan.vendorIconPicker.reset')}
                className="p-1 text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
              >
                <RotateCcw size={14} />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">{t('networkScan.vendorIconPicker.noResults')}</p>
            ) : (
              groupedEntries.map(({ category, entries }) => (
                <div key={category} className="mb-2 last:mb-0">
                  <div className="text-[10px] uppercase tracking-wide text-gray-600 px-1 mb-1">{t(`networkScan.vendorIconPicker.categories.${category}`)}</div>
                  <div className="grid grid-cols-8 gap-1">
                    {entries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        title={entry.title}
                        onClick={() => handlePick(entry.id)}
                        className={`flex items-center justify-center p-1.5 rounded hover:bg-[#252525] transition-colors ${entry.kind === 'lucide' ? 'text-gray-300' : ''} ${value === entry.id ? 'bg-blue-500/20 ring-1 ring-blue-500' : ''}`}
                      >
                        <CatalogIconPreview entry={entry} />
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-2 border-t border-gray-700">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-2 py-1.5 text-xs text-gray-300 bg-[#111111] hover:bg-[#252525] border border-gray-700 rounded transition-colors"
            >
              <Upload size={12} />
              {t('networkScan.vendorIconPicker.import')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_CUSTOM_ICON_TYPES.join(',')}
              onChange={handleFileChange}
              className="hidden"
            />
            {importError && <p className="text-[11px] text-red-400 mt-1">{importError}</p>}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
