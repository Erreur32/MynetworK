import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

interface SortableThProps {
    label: string;
    active: boolean;
    dir: 'asc' | 'desc';
    onClick: () => void;
    align?: 'left' | 'right';
    className?: string;
    style?: React.CSSProperties;
}

function SortIcon({ active, dir }: Readonly<{ active: boolean; dir: 'asc' | 'desc' }>) {
    if (!active) return <ArrowUpDown size={11} className="opacity-30" />;
    if (dir === 'asc') return <ArrowUp size={11} />;
    return <ArrowDown size={11} />;
}

/** Clickable table header with a sort direction indicator — used by any sortable table. */
export const SortableTh: React.FC<SortableThProps> = ({ label, active, dir, onClick, align = 'left', className = '', style }) => (
    <th
        className={`px-2 py-1 cursor-pointer select-none hover:text-gray-200 transition-colors ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
        style={style}
        onClick={onClick}
    >
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
            {label}
            <SortIcon active={active} dir={dir} />
        </span>
    </th>
);
