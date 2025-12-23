/**
 * Metrics Collector Service
 * 
 * Collects application metrics in memory to avoid high cardinality issues
 * Metrics are aggregated (no per-user, per-route, per-IP labels)
 * Designed for Prometheus/InfluxDB export
 */

interface ScanMetrics {
    lastScanDuration: number; // milliseconds
    lastScanTimestamp: number; // Unix timestamp
    lastScanScanned: number;
    lastScanFound: number;
    lastScanUpdated: number;
    latencySum: number; // Sum of all latencies for average calculation
    latencyCount: number; // Number of latency measurements
    latencyMin: number;
    latencyMax: number;
    scanCount: number; // Total number of scans executed
}

interface AuthMetrics {
    loginSuccessTotal: number;
    loginFailedTotal: number;
    loginBlockedTotal: number;
    ipBlockedTotal: number;
    sessionsActive: number;
}

interface ApiMetrics {
    requestsTotal: number;
    requestsByStatus: Record<string, number>; // status code -> count
    errorsTotal: number;
    requestsDurationSum: number; // Sum for average calculation
    requestsDurationCount: number;
    requestsDurationMin: number;
    requestsDurationMax: number;
}

interface SecurityMetrics {
    eventsByLevel: Record<string, number>; // level -> count
    settingsChangedTotal: number;
    blockedIpsCount: number;
}

interface DatabaseMetrics {
    scanEntriesTotal: number;
    historyEntriesTotal: number;
    dbSizeBytes: number;
    oldestEntryTimestamp: number; // Unix timestamp
}

interface SchedulerMetrics {
    enabled: number; // 1 or 0
    lastRunTimestamp: number; // Unix timestamp
    nextRunTimestamp: number; // Unix timestamp
    runsTotal: number;
}

class MetricsCollector {
    private scanMetrics: ScanMetrics = {
        lastScanDuration: 0,
        lastScanTimestamp: 0,
        lastScanScanned: 0,
        lastScanFound: 0,
        lastScanUpdated: 0,
        latencySum: 0,
        latencyCount: 0,
        latencyMin: Infinity,
        latencyMax: 0,
        scanCount: 0
    };

    private authMetrics: AuthMetrics = {
        loginSuccessTotal: 0,
        loginFailedTotal: 0,
        loginBlockedTotal: 0,
        ipBlockedTotal: 0,
        sessionsActive: 0
    };

    private apiMetrics: ApiMetrics = {
        requestsTotal: 0,
        requestsByStatus: {},
        errorsTotal: 0,
        requestsDurationSum: 0,
        requestsDurationCount: 0,
        requestsDurationMin: Infinity,
        requestsDurationMax: 0
    };

    private securityMetrics: SecurityMetrics = {
        eventsByLevel: {},
        settingsChangedTotal: 0,
        blockedIpsCount: 0
    };

    private schedulerMetrics: SchedulerMetrics = {
        enabled: 0,
        lastRunTimestamp: 0,
        nextRunTimestamp: 0,
        runsTotal: 0
    };

    /**
     * Record scan completion metrics
     * Called AFTER scan completes to avoid performance impact
     */
    recordScanComplete(duration: number, scanned: number, found: number, updated: number, latencies: number[]): void {
        this.scanMetrics.lastScanDuration = duration;
        this.scanMetrics.lastScanTimestamp = Date.now();
        this.scanMetrics.lastScanScanned = scanned;
        this.scanMetrics.lastScanFound = found;
        this.scanMetrics.lastScanUpdated = updated;
        this.scanMetrics.scanCount++;

        // Calculate latency statistics from provided latencies
        if (latencies.length > 0) {
            const sum = latencies.reduce((a, b) => a + b, 0);
            const min = Math.min(...latencies);
            const max = Math.max(...latencies);

            // Update running statistics
            this.scanMetrics.latencySum += sum;
            this.scanMetrics.latencyCount += latencies.length;
            
            if (this.scanMetrics.latencyMin === Infinity || min < this.scanMetrics.latencyMin) {
                this.scanMetrics.latencyMin = min;
            }
            if (max > this.scanMetrics.latencyMax) {
                this.scanMetrics.latencyMax = max;
            }
        }
    }

    /**
     * Record authentication event (aggregated, no username)
     */
    recordAuthLogin(status: 'success' | 'failed' | 'blocked'): void {
        if (status === 'success') {
            this.authMetrics.loginSuccessTotal++;
        } else if (status === 'failed') {
            this.authMetrics.loginFailedTotal++;
        } else if (status === 'blocked') {
            this.authMetrics.loginBlockedTotal++;
        }
    }

    /**
     * Record IP blocked event
     */
    recordIpBlocked(): void {
        this.authMetrics.ipBlockedTotal++;
    }

    /**
     * Update active sessions count
     */
    updateSessionsActive(count: number): void {
        this.authMetrics.sessionsActive = count;
    }

    /**
     * Record API request (aggregated, no route/method details)
     */
    recordApiRequest(status: number, duration: number): void {
        this.apiMetrics.requestsTotal++;
        
        const statusStr = status.toString();
        this.apiMetrics.requestsByStatus[statusStr] = (this.apiMetrics.requestsByStatus[statusStr] || 0) + 1;
        
        if (status >= 400) {
            this.apiMetrics.errorsTotal++;
        }

        // Update duration statistics
        this.apiMetrics.requestsDurationSum += duration;
        this.apiMetrics.requestsDurationCount++;
        
        if (this.apiMetrics.requestsDurationMin === Infinity || duration < this.apiMetrics.requestsDurationMin) {
            this.apiMetrics.requestsDurationMin = duration;
        }
        if (duration > this.apiMetrics.requestsDurationMax) {
            this.apiMetrics.requestsDurationMax = duration;
        }
    }

    /**
     * Record security event (aggregated by level only)
     */
    recordSecurityEvent(level: 'info' | 'warning' | 'error'): void {
        this.securityMetrics.eventsByLevel[level] = (this.securityMetrics.eventsByLevel[level] || 0) + 1;
    }

    /**
     * Record security settings change
     */
    recordSecuritySettingsChanged(): void {
        this.securityMetrics.settingsChangedTotal++;
    }

    /**
     * Update blocked IPs count
     */
    updateBlockedIpsCount(count: number): void {
        this.securityMetrics.blockedIpsCount = count;
    }

    /**
     * Update scheduler metrics
     */
    updateSchedulerMetrics(enabled: boolean, lastRun?: number, nextRun?: number): void {
        this.schedulerMetrics.enabled = enabled ? 1 : 0;
        if (lastRun !== undefined) {
            this.schedulerMetrics.lastRunTimestamp = lastRun;
            this.schedulerMetrics.runsTotal++;
        }
        if (nextRun !== undefined) {
            this.schedulerMetrics.nextRunTimestamp = nextRun;
        }
    }

    /**
     * Update database metrics
     */
    updateDatabaseMetrics(scanEntries: number, historyEntries: number, dbSize: number, oldestEntry?: number): void {
        this.databaseMetrics.scanEntriesTotal = scanEntries;
        this.databaseMetrics.historyEntriesTotal = historyEntries;
        this.databaseMetrics.dbSizeBytes = dbSize;
        if (oldestEntry !== undefined) {
            this.databaseMetrics.oldestEntryTimestamp = oldestEntry;
        }
    }

    /**
     * Get all metrics for export
     */
    getAllMetrics(): {
        scan: ScanMetrics;
        auth: AuthMetrics;
        api: ApiMetrics;
        security: SecurityMetrics;
        scheduler: SchedulerMetrics;
        database: DatabaseMetrics;
    } {
        return {
            scan: { ...this.scanMetrics },
            auth: { ...this.authMetrics },
            api: { ...this.apiMetrics },
            security: { ...this.securityMetrics },
            scheduler: { ...this.schedulerMetrics },
            database: { ...this.databaseMetrics }
        };
    }

    /**
     * Reset metrics (useful for testing or periodic reset)
     */
    reset(): void {
        this.scanMetrics = {
            lastScanDuration: 0,
            lastScanTimestamp: 0,
            lastScanScanned: 0,
            lastScanFound: 0,
            lastScanUpdated: 0,
            latencySum: 0,
            latencyCount: 0,
            latencyMin: Infinity,
            latencyMax: 0,
            scanCount: 0
        };
        this.apiMetrics = {
            requestsTotal: 0,
            requestsByStatus: {},
            errorsTotal: 0,
            requestsDurationSum: 0,
            requestsDurationCount: 0,
            requestsDurationMin: Infinity,
            requestsDurationMax: 0
        };
        // Note: auth, security, scheduler, database metrics are not reset
        // as they represent cumulative counters
    }
}

export const metricsCollector = new MetricsCollector();

