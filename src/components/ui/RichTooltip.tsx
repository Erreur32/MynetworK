import React, { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

export interface TooltipRow {
  label: string;
  value?: string;
  color?: 'blue' | 'green' | 'emerald' | 'yellow' | 'amber' | 'red' | 'orange' | 'sky' | 'purple' | 'gray';
  dot?: boolean;
}

export interface RichTooltipProps {
  title: string;
  description?: string;
  rows?: TooltipRow[];
  footer?: string;
  children?: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  iconSize?: number;
  iconClass?: string;
  width?: number;
}

const COLOR_MAP: Record<NonNullable<TooltipRow['color']>, { dot: string; label: string; value: string }> = {
  blue:    { dot: 'bg-blue-400',    label: 'text-blue-300',    value: 'text-blue-200' },
  sky:     { dot: 'bg-sky-400',     label: 'text-sky-300',     value: 'text-sky-200' },
  green:   { dot: 'bg-green-400',   label: 'text-green-300',   value: 'text-green-200' },
  emerald: { dot: 'bg-emerald-400', label: 'text-emerald-300', value: 'text-emerald-200' },
  yellow:  { dot: 'bg-yellow-400',  label: 'text-yellow-300',  value: 'text-yellow-200' },
  amber:   { dot: 'bg-amber-400',   label: 'text-amber-300',   value: 'text-amber-200' },
  orange:  { dot: 'bg-orange-400',  label: 'text-orange-300',  value: 'text-orange-200' },
  red:     { dot: 'bg-red-400',     label: 'text-red-300',     value: 'text-red-200' },
  purple:  { dot: 'bg-purple-400',  label: 'text-purple-300',  value: 'text-purple-200' },
  gray:    { dot: 'bg-gray-400',    label: 'text-gray-300',    value: 'text-gray-200' },
};

export const RichTooltip: React.FC<RichTooltipProps> = ({
  title,
  description,
  rows,
  footer,
  children,
  position = 'top',
  iconSize = 13,
  iconClass = 'text-gray-500 hover:text-gray-300 cursor-help',
  width = 240,
}) => {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return;

    const tr = triggerRef.current.getBoundingClientRect();
    const tt = tooltipRef.current.getBoundingClientRect();
    const gap = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = 0;
    let left = 0;

    switch (position) {
      case 'top':
        top = tr.top - tt.height - gap;
        left = tr.left + (tr.width - tt.width) / 2;
        break;
      case 'bottom':
        top = tr.bottom + gap;
        left = tr.left + (tr.width - tt.width) / 2;
        break;
      case 'left':
        top = tr.top + (tr.height - tt.height) / 2;
        left = tr.left - tt.width - gap;
        break;
      case 'right':
        top = tr.top + (tr.height - tt.height) / 2;
        left = tr.right + gap;
        break;
    }

    // Clamp inside viewport
    left = Math.max(8, Math.min(left, vw - tt.width - 8));
    top  = Math.max(8, Math.min(top,  vh - tt.height - 8));

    setCoords({ top, left });
  }, [visible, position]);

  const trigger = children ?? (
    <Info size={iconSize} className={iconClass} />
  );

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="inline-flex items-center"
      >
        {trigger}
      </span>

      {visible && (
        <div
          ref={tooltipRef}
          style={{ top: coords.top, left: coords.left, width }}
          className="fixed z-[9999] pointer-events-none"
        >
          {/* Card */}
          <div className="bg-[#0f1117] border border-gray-700/80 rounded-xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-3 py-2 bg-gradient-to-r from-blue-900/40 to-transparent border-b border-gray-700/60">
              <p className="text-xs font-semibold text-white">{title}</p>
            </div>

            <div className="px-3 py-2 space-y-1.5">
              {/* Description */}
              {description && (
                <p className="text-[11px] text-gray-400 leading-relaxed">{description}</p>
              )}

              {/* Rows */}
              {rows && rows.length > 0 && (
                <div className="space-y-1 pt-0.5">
                  {rows.map((row, i) => {
                    const colors = row.color ? COLOR_MAP[row.color] : null;
                    return (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {row.dot && colors && (
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors.dot}`} />
                          )}
                          <span className={`text-[11px] truncate ${colors ? colors.label : 'text-gray-400'}`}>
                            {row.label}
                          </span>
                        </div>
                        {row.value !== undefined && (
                          <span className={`text-[11px] font-mono font-medium flex-shrink-0 ${colors ? colors.value : 'text-gray-300'}`}>
                            {row.value}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {footer && (
              <div className="px-3 py-1.5 border-t border-gray-700/60 bg-gray-900/40">
                <p className="text-[10px] text-gray-500 italic">{footer}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
