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

/** Clickable table header with a sort direction indicator — used by any sortable table. */
export const SortableTh: React.FC<SortableThProps> = ({ label, active, dir, onClick, align = 'left', className = '', style }) => (
    <th
        className={`px-2 py-1 cursor-pointer select-none hover:text-gray-200 transition-colors ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
        style={style}
        onClick={onClick}
    >
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
            {label}
            {active
                ? (dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)
                : <ArrowUpDown size={11} className="opacity-30" />}
        </span>
    </th>
);
