import { useCallback, useEffect, useState } from 'react';

// Layout of the CARD tab: display order and width (in columns of a 12-column grid).
// Stored per browser only; every access is guarded because storage can be blocked.
const STORAGE_KEY = 'mynetwork.unifi.cardLayout.v1';

export const GRID_COLUMNS = 12;
export const MIN_SPAN = 3;
export const DEFAULT_SPAN = 4;
export const MIN_HEIGHT = 60;
export const MAX_HEIGHT = 700;

interface StoredLayout {
    order: string[];
    spans: Record<string, number>;
    // Chosen card height in px; absent = natural height. The card content is stretched to fit.
    heights: Record<string, number>;
    // Uplink port chosen by hand; absent = automatic detection from the controller.
    uplinks: Record<string, number>;
}

const EMPTY: StoredLayout = { order: [], spans: {}, heights: {}, uplinks: {} };

function load(): StoredLayout {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return EMPTY;
        const parsed = JSON.parse(raw) as Partial<StoredLayout>;
        return {
            order: Array.isArray(parsed.order) ? parsed.order.filter((v) => typeof v === 'string') : [],
            spans: parsed.spans && typeof parsed.spans === 'object' ? parsed.spans : {},
            heights: parsed.heights && typeof parsed.heights === 'object' ? parsed.heights : {},
            uplinks: parsed.uplinks && typeof parsed.uplinks === 'object' ? parsed.uplinks : {}
        };
    } catch {
        return EMPTY;
    }
}

function save(layout: StoredLayout): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
        // storage unavailable: the layout simply does not persist
    }
}

export const clampHeight = (height: number): number => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(height)));

export const clampSpan = (span: number): number => Math.min(GRID_COLUMNS, Math.max(MIN_SPAN, Math.round(span)));

/** Saved order first, devices not seen before are appended in their natural order. */
export function applyOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...items].sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

export function useCardLayout(deviceIds: string[]) {
    const [layout, setLayout] = useState<StoredLayout>(load);

    useEffect(() => save(layout), [layout]);

    const move = useCallback((fromId: string, toId: string) => {
        if (fromId === toId) return;
        setLayout((prev) => {
            const known = [...prev.order.filter((id) => deviceIds.includes(id))];
            for (const id of deviceIds) if (!known.includes(id)) known.push(id);
            const from = known.indexOf(fromId);
            const to = known.indexOf(toId);
            if (from < 0 || to < 0) return prev;
            known.splice(to, 0, known.splice(from, 1)[0]);
            return { ...prev, order: known };
        });
    }, [deviceIds]);

    const setSpan = useCallback((id: string, span: number) => {
        setLayout((prev) => ({ ...prev, spans: { ...prev.spans, [id]: clampSpan(span) } }));
    }, []);

    const setHeight = useCallback((id: string, height: number | null) => {
        setLayout((prev) => {
            const heights = { ...prev.heights };
            if (height == null) delete heights[id];
            else heights[id] = clampHeight(height);
            return { ...prev, heights };
        });
    }, []);

    const setUplink = useCallback((id: string, port: number | null) => {
        setLayout((prev) => {
            const uplinks = { ...prev.uplinks };
            if (port == null) delete uplinks[id];
            else uplinks[id] = port;
            return { ...prev, uplinks };
        });
    }, []);

    const reset = useCallback(() => setLayout(EMPTY), []);

    return { order: layout.order, spans: layout.spans, heights: layout.heights, uplinks: layout.uplinks, move, setSpan, setHeight, setUplink, reset };
}
