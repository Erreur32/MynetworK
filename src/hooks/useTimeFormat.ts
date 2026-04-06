/**
 * Hook for managing time format preference (12h / 24h).
 * Persists the choice in localStorage under 'mynetwork_time_format'.
 */
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'mynetwork_time_format';

export type TimeFormat = '12h' | '24h';

function readStoredFormat(): TimeFormat {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v === '12h' || v === '24h') return v;
    } catch { /* ignore */ }
    return '24h'; // default
}

export function useTimeFormat() {
    const [format, setFormatState] = useState<TimeFormat>(readStoredFormat);

    const setFormat = useCallback((f: TimeFormat) => {
        try { localStorage.setItem(STORAGE_KEY, f); } catch { /* ignore */ }
        setFormatState(f);
        // Notify other instances via storage event
        window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: f }));
    }, []);

    return { format, setFormat };
}

/**
 * Format a Date to a time string respecting the stored time format preference.
 * Uses the passed locale and merges hour12 from storage.
 */
export function formatTimeWithPreference(
    date: Date,
    locale: string,
    options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
): string {
    const stored = readStoredFormat();
    return date.toLocaleTimeString(locale, { ...options, hour12: stored === '12h' });
}
