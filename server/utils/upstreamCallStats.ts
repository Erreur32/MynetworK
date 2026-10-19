/**
 * In-memory counters of the requests sent to the Freebox and the UniFi controller,
 * per endpoint, split between real calls and answers served without one (cache hit
 * or shared in-flight request). Used to measure the effect of the request caches;
 * reset on restart or on demand.
 */

export type UpstreamSource = 'freebox' | 'unifi';
export type UpstreamOutcome = 'call' | 'cache' | 'shared';

interface Counts { call: number; cache: number; shared: number }

interface EndpointStats {
    total: Counts;
    // Per-minute buckets keyed by minute index (epoch ms / 60000), last hour only
    minutes: Map<number, Counts>;
}

const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;
// Bounds memory if endpoint normalisation ever misses a variable path segment
const MAX_ENDPOINTS_PER_SOURCE = 300;

const emptyCounts = (): Counts => ({ call: 0, cache: 0, shared: 0 });

let since = Date.now();
const stats: Record<UpstreamSource, Map<string, EndpointStats>> = { freebox: new Map(), unifi: new Map() };

// Ids, MACs and sites vary per call: fold them so one endpoint stays one row
export function normalizeUpstreamEndpoint(endpoint: string): string {
    return endpoint
        .split('?')[0]
        .replace(/\/s\/[^/]+\//, '/s/:site/')
        .replace(/\/site\/[^/]+\//, '/site/:site/')
        .replace(/\/sites\/[^/]+/, '/sites/:id')
        .replace(/[0-9a-f]{2}(?::[0-9a-f]{2}){5}/gi, ':mac')
        .replace(/\/[0-9a-f]{24}(?=\/|$)/gi, '/:id')
        .replace(/\/\d+(?=\/|$)/g, '/:id');
}

export function recordUpstream(source: UpstreamSource, endpoint: string, outcome: UpstreamOutcome): void {
    const key = normalizeUpstreamEndpoint(endpoint);
    const bySource = stats[source];
    let entry = bySource.get(key);
    if (!entry) {
        if (bySource.size >= MAX_ENDPOINTS_PER_SOURCE) return;
        entry = { total: emptyCounts(), minutes: new Map() };
        bySource.set(key, entry);
    }
    entry.total[outcome]++;

    const minute = Math.floor(Date.now() / MINUTE_MS);
    let bucket = entry.minutes.get(minute);
    if (!bucket) {
        bucket = emptyCounts();
        entry.minutes.set(minute, bucket);
        for (const m of entry.minutes.keys()) {
            if (m <= minute - HOUR_MINUTES) entry.minutes.delete(m);
        }
    }
    bucket[outcome]++;
}

function addCounts(target: Counts, source: Counts): void {
    target.call += source.call;
    target.cache += source.cache;
    target.shared += source.shared;
}

function sumMinutes(entry: EndpointStats, fromMinute: number, toMinute: number): Counts {
    const sum = emptyCounts();
    for (const [m, counts] of entry.minutes) {
        if (m >= fromMinute && m <= toMinute) addCounts(sum, counts);
    }
    return sum;
}

export function getUpstreamStats() {
    const now = Date.now();
    const currentMinute = Math.floor(now / MINUTE_MS);
    // Last complete minute, and the last hour of complete minutes (or less right after a reset)
    const lastMinute = currentMinute - 1;
    const firstMinute = Math.max(currentMinute - HOUR_MINUTES, Math.floor(since / MINUTE_MS));
    const hourMinutes = Math.max(1, currentMinute - firstMinute);

    const sources = (Object.keys(stats) as UpstreamSource[]).map((source) => {
        const totals = emptyCounts();
        const lastMinuteTotals = emptyCounts();
        const lastHourTotals = emptyCounts();
        const endpoints = [...stats[source]].map(([endpoint, entry]) => {
            const lastMinuteCounts = sumMinutes(entry, lastMinute, lastMinute);
            const lastHourCounts = sumMinutes(entry, firstMinute, lastMinute);
            addCounts(totals, entry.total);
            addCounts(lastMinuteTotals, lastMinuteCounts);
            addCounts(lastHourTotals, lastHourCounts);
            return { endpoint, total: entry.total, lastMinute: lastMinuteCounts, lastHour: lastHourCounts };
        });
        endpoints.sort((a, b) => b.total.call - a.total.call || a.endpoint.localeCompare(b.endpoint));
        return {
            source,
            total: totals,
            lastMinute: lastMinuteTotals,
            lastHour: lastHourTotals,
            callsPerMinute: Math.round((lastHourTotals.call / hourMinutes) * 10) / 10,
            endpoints,
        };
    });

    return {
        since: new Date(since).toISOString(),
        uptimeSeconds: Math.round((now - since) / 1000),
        hourWindowMinutes: hourMinutes,
        sources,
    };
}

export function resetUpstreamStats(): void {
    since = Date.now();
    stats.freebox.clear();
    stats.unifi.clear();
}
