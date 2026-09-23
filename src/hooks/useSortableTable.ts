import { useMemo, useState } from 'react';

/** Generic client-side table sort: click a column to sort by it, click again to flip direction. */
export function useSortableTable<T, K extends string>(
    data: T[],
    getValue: (item: T, key: K) => string | number,
    initialKey: K,
    initialDir: 'asc' | 'desc' = 'desc'
) {
    const [sortKey, setSortKey] = useState<K>(initialKey);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialDir);

    const sorted = useMemo(() => {
        const copy = [...data];
        copy.sort((a, b) => {
            const av = getValue(a, sortKey);
            const bv = getValue(b, sortKey);
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return copy;
    }, [data, sortKey, sortDir, getValue]);

    const toggleSort = (key: K) => {
        if (key === sortKey) {
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    return { sorted, sortKey, sortDir, toggleSort };
}
