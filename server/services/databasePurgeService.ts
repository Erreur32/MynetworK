/**
 * Database Purge Service
 * 
 * Handles automatic and manual purging of old data from the database
 * Specifically manages retention policies for network scan data
 */

import { NetworkScanRepository } from '../database/models/NetworkScan.js';
import { LatencyMonitoringRepository } from '../database/models/LatencyMonitoring.js';
import { AppConfigRepository } from '../database/models/AppConfig.js';
import { logger } from '../utils/logger.js';
import { getDatabase } from '../database/connection.js';
import cron from 'node-cron';
import * as fs from 'fs';
import * as path from 'path';

export interface RetentionConfig {
    // History retention (network_scan_history table)
    historyRetentionDays: number; // Default: 30 days
    
    // Scan entries retention (network_scans table)
    scanRetentionDays: number; // Default: 90 days for all entries
    
    // Offline entries retention (shorter retention for offline IPs)
    offlineRetentionDays: number; // Default: 7 days
    
    // Latency measurements retention (latency_measurements table)
    latencyMeasurementsRetentionDays: number; // Default: 30 days
    
    // Keep IPs when purging (don't delete IPs, only history and old scan data)
    keepIpsOnPurge: boolean; // Default: true
    
    // Enable automatic purge
    autoPurgeEnabled: boolean; // Default: true
    
    // Purge schedule (cron expression)
    purgeSchedule: string; // Default: '0 2 * * *' (daily at 2 AM)
}

const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
    historyRetentionDays: 30,
    scanRetentionDays: 90,
    offlineRetentionDays: 7,
    latencyMeasurementsRetentionDays: 30,
    keepIpsOnPurge: true, // Keep IPs by default to monitor total network IPs
    autoPurgeEnabled: false, // Disabled by default - must be enabled manually in admin
    purgeSchedule: '0 2 * * *' // Daily at 2 AM
};

let purgeTask: ReturnType<typeof cron.schedule> | null = null;

/**
 * Get current retention configuration from database
 */
export function getRetentionConfig(): RetentionConfig {
    try {
        const configJson = AppConfigRepository.get('network_scan_retention');
        if (configJson) {
            const config = JSON.parse(configJson) as RetentionConfig;
            // Merge with defaults to ensure all fields are present
            return { ...DEFAULT_RETENTION_CONFIG, ...config };
        }
    } catch (error) {
        logger.error('DatabasePurgeService', 'Failed to load retention config:', error);
    }
    return DEFAULT_RETENTION_CONFIG;
}

/**
 * Save retention configuration to database
 */
export function saveRetentionConfig(config: Partial<RetentionConfig>): boolean {
    try {
        const currentConfig = getRetentionConfig();
        const newConfig: RetentionConfig = { ...currentConfig, ...config };
        
        AppConfigRepository.set('network_scan_retention', JSON.stringify(newConfig));
        
        // Restart scheduler if schedule changed or auto-purge was toggled
        if (config.purgeSchedule !== undefined || config.autoPurgeEnabled !== undefined) {
            stopAutoPurge();
            if (newConfig.autoPurgeEnabled) {
                startAutoPurge(newConfig.purgeSchedule);
            }
        }
        
        logger.info('DatabasePurgeService', 'Retention configuration saved:', newConfig);
        return true;
    } catch (error) {
        logger.error('DatabasePurgeService', 'Failed to save retention config:', error);
        return false;
    }
}

/**
 * Execute purge based on current retention configuration
 */
export function executePurge(): {
    historyDeleted: number;
    scansDeleted: number;
    offlineDeleted: number;
    latencyMeasurementsDeleted: number;
    totalDeleted: number;
} {
    const config = getRetentionConfig();
    
    logger.info('DatabasePurgeService', 'Starting database purge...', {
        historyRetentionDays: config.historyRetentionDays,
        scanRetentionDays: config.scanRetentionDays,
        offlineRetentionDays: config.offlineRetentionDays,
        latencyMeasurementsRetentionDays: config.latencyMeasurementsRetentionDays,
        keepIpsOnPurge: config.keepIpsOnPurge
    });
    
    try {
        // Always purge history entries (doesn't affect IPs)
        const historyDeleted = NetworkScanRepository.purgeHistory(config.historyRetentionDays);
        
        let scansDeleted = 0;
        let offlineDeleted = 0;
        
        // Only purge IPs if keepIpsOnPurge is false
        if (!config.keepIpsOnPurge) {
            // Purge offline entries (shorter retention)
            offlineDeleted = NetworkScanRepository.purgeOfflineScans(config.offlineRetentionDays);
            
            // Purge old scan entries (longer retention, but after offline purge)
            scansDeleted = NetworkScanRepository.purgeOldScans(config.scanRetentionDays);
        } else {
            logger.info('DatabasePurgeService', 'Keeping IPs during purge (keepIpsOnPurge=true)');
        }
        
        // Purge latency measurements using configured retention
        const latencyMeasurementsDeleted = LatencyMonitoringRepository.deleteOldMeasurements(config.latencyMeasurementsRetentionDays);
        
        const totalDeleted = historyDeleted + scansDeleted + offlineDeleted + latencyMeasurementsDeleted;
        
        logger.info('DatabasePurgeService', `Purge completed: ${totalDeleted} entries deleted`, {
            historyDeleted,
            scansDeleted,
            offlineDeleted,
            latencyMeasurementsDeleted,
            keepIpsOnPurge: config.keepIpsOnPurge
        });
        
        // Execute VACUUM automatically if significant data was deleted (>100 entries)
        // Limit to once per day maximum
        if (totalDeleted > 100) {
            executeVacuumIfAllowed();
        }
        
        return {
            historyDeleted,
            scansDeleted,
            offlineDeleted,
            latencyMeasurementsDeleted,
            totalDeleted
        };
    } catch (error) {
        logger.error('DatabasePurgeService', 'Purge execution failed:', error);
        throw error;
    }
}

/**
 * Purge only history entries (for manual purge)
 * @param retentionDays Number of days to keep (0 = delete all)
 */
export function purgeHistoryOnly(retentionDays: number = 0): number {
    logger.info('DatabasePurgeService', `Purging history entries (retention: ${retentionDays} days)`);
    try {
        const deleted = NetworkScanRepository.purgeHistory(retentionDays);
        logger.info('DatabasePurgeService', `History purge completed: ${deleted} entries deleted`);
        return deleted;
    } catch (error) {
        logger.error('DatabasePurgeService', 'History purge failed:', error);
        throw error;
    }
}

/**
 * Purge only scan entries (for manual purge)
 * @param retentionDays Number of days to keep (0 = delete all)
 * @param keepIps If true, skip purging IPs (only purge history)
 */
export function purgeScansOnly(retentionDays: number = 0, keepIps: boolean = true): number {
    logger.info('DatabasePurgeService', `Purging scan entries (retention: ${retentionDays} days, keepIps: ${keepIps})`);
    try {
        if (keepIps) {
            logger.info('DatabasePurgeService', 'Skipping scan purge (keepIps=true)');
            return 0;
        }
        const deleted = NetworkScanRepository.purgeOldScans(retentionDays);
        logger.info('DatabasePurgeService', `Scan purge completed: ${deleted} entries deleted`);
        return deleted;
    } catch (error) {
        logger.error('DatabasePurgeService', 'Scan purge failed:', error);
        throw error;
    }
}

/**
 * Purge only offline scan entries (for manual purge)
 * @param retentionDays Number of days to keep (0 = delete all)
 * @param keepIps If true, skip purging IPs (only purge history)
 */
export function purgeOfflineOnly(retentionDays: number = 0, keepIps: boolean = true): number {
    logger.info('DatabasePurgeService', `Purging offline scan entries (retention: ${retentionDays} days, keepIps: ${keepIps})`);
    try {
        if (keepIps) {
            logger.info('DatabasePurgeService', 'Skipping offline purge (keepIps=true)');
            return 0;
        }
        const deleted = NetworkScanRepository.purgeOfflineScans(retentionDays);
        logger.info('DatabasePurgeService', `Offline purge completed: ${deleted} entries deleted`);
        return deleted;
    } catch (error) {
        logger.error('DatabasePurgeService', 'Offline purge failed:', error);
        throw error;
    }
}

/**
 * Purge only latency measurements (for manual purge)
 * @param retentionDays Number of days to keep (0 = delete all)
 */
export function purgeLatencyMeasurementsOnly(retentionDays: number = 30): number {
    logger.info('DatabasePurgeService', `Purging latency measurements (retention: ${retentionDays} days)`);
    try {
        const deleted = LatencyMonitoringRepository.deleteOldMeasurements(retentionDays);
        logger.info('DatabasePurgeService', `Latency measurements purge completed: ${deleted} entries deleted`);
        return deleted;
    } catch (error) {
        logger.error('DatabasePurgeService', 'Latency measurements purge failed:', error);
        throw error;
    }
}

/**
 * Clear all scan data (for dev/testing)
 * Deletes ALL entries from both tables
 */
export function clearAllScanData(): {
    scansDeleted: number;
    historyDeleted: number;
    totalDeleted: number;
} {
    logger.info('DatabasePurgeService', 'Clearing ALL scan data (dev mode)');
    try {
        // Delete all history first (due to foreign key constraint)
        const historyDeleted = NetworkScanRepository.purgeHistory(0);
        
        // Delete all scans
        const scansDeleted = NetworkScanRepository.deleteAll();
        
        const totalDeleted = historyDeleted + scansDeleted;
        
        logger.info('DatabasePurgeService', `All scan data cleared: ${scansDeleted} scans, ${historyDeleted} history entries`);
        
        // Optimize database after complete clear
        NetworkScanRepository.optimizeDatabase();
        
        return {
            scansDeleted,
            historyDeleted,
            totalDeleted
        };
    } catch (error) {
        logger.error('DatabasePurgeService', 'Clear all failed:', error);
        throw error;
    }
}

/**
 * Start automatic purge scheduler
 */
export function startAutoPurge(schedule?: string): void {
    const config = getRetentionConfig();
    
    if (!config.autoPurgeEnabled) {
        logger.info('DatabasePurgeService', 'Auto-purge is disabled');
        return;
    }
    
    // Stop existing task if any
    if (purgeTask) {
        stopAutoPurge();
    }
    
    const cronExpression = schedule || config.purgeSchedule;
    
    try {
        purgeTask = cron.schedule(cronExpression, () => {
            logger.info('DatabasePurgeService', 'Running scheduled purge...');
            try {
                executePurge();
            } catch (error) {
                logger.error('DatabasePurgeService', 'Scheduled purge failed:', error);
            }
        }, {
            scheduled: true,
            timezone: 'Europe/Paris'
        } as any);
        
        logger.info('DatabasePurgeService', `Auto-purge scheduler started with schedule: ${cronExpression}`);
    } catch (error) {
        logger.error('DatabasePurgeService', 'Failed to start auto-purge scheduler:', error);
    }
}

/**
 * Stop automatic purge scheduler
 */
export function stopAutoPurge(): void {
    if (purgeTask) {
        purgeTask.stop();
        purgeTask = null;
        logger.info('DatabasePurgeService', 'Auto-purge scheduler stopped');
    }
}

/**
 * Execute VACUUM if allowed (max once per day)
 */
function executeVacuumIfAllowed(): void {
    try {
        const lastVacuumJson = AppConfigRepository.get('last_vacuum_timestamp');
        const now = Date.now();
        const oneDayInMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        
        if (lastVacuumJson) {
            const lastVacuum = parseInt(lastVacuumJson, 10);
            const timeSinceLastVacuum = now - lastVacuum;
            
            if (timeSinceLastVacuum < oneDayInMs) {
                const hoursRemaining = Math.ceil((oneDayInMs - timeSinceLastVacuum) / (60 * 60 * 1000));
                logger.info('DatabasePurgeService', `VACUUM skipped (executed less than 24h ago, ${hoursRemaining}h remaining)`);
                return;
            }
        }
        
        logger.info('DatabasePurgeService', 'Executing VACUUM...');
        NetworkScanRepository.optimizeDatabase();
        
        // Save timestamp of VACUUM execution
        AppConfigRepository.set('last_vacuum_timestamp', now.toString());
        logger.info('DatabasePurgeService', 'VACUUM completed successfully');
    } catch (error) {
        logger.error('DatabasePurgeService', 'VACUUM execution failed:', error);
        // Don't throw - VACUUM failure shouldn't break purge
    }
}

/**
 * Optimize database manually (VACUUM + index optimization + stats)
 * This function can be called on demand and doesn't have the 24h limit
 */
export function optimizeDatabase(): {
    vacuumExecuted: boolean;
    message: string;
} {
    try {
        logger.info('DatabasePurgeService', 'Starting manual database optimization...');
        
        // Execute VACUUM
        NetworkScanRepository.optimizeDatabase();
        
        // Save timestamp
        AppConfigRepository.set('last_vacuum_timestamp', Date.now().toString());
        
        logger.info('DatabasePurgeService', 'Manual database optimization completed');
        
        return {
            vacuumExecuted: true,
            message: 'Database optimization completed successfully'
        };
    } catch (error) {
        logger.error('DatabasePurgeService', 'Manual database optimization failed:', error);
        throw error;
    }
}

/**
 * Estimate database size before and after purge
 */
export function estimateDatabaseSize(): {
    currentSizeMB: number;
    estimatedSizeAfterPurgeMB: number;
    estimatedFreedMB: number;
} {
    try {
        const db = getDatabase();
        const dbPath = (db.prepare('PRAGMA database_list').all() as any[])[0]?.file as string;
        
        // Get current database file size
        const currentSizeBytes = fs.statSync(dbPath).size;
        const currentSizeMB = currentSizeBytes / (1024 * 1024);
        
        // Estimate size after purge based on retention config
        const config = getRetentionConfig();
        
        // Count entries that would be deleted (rough estimation)
        // We'll use a simpler approach: estimate based on retention percentages
        const stats = NetworkScanRepository.getDatabaseStats();
        const totalScans = stats.totalScans || 0;
        const totalHistory = stats.totalHistory || 0;
        
        // Estimate entries to be deleted
        let estimatedDeletedEntries = 0;
        
        // History entries (always purged)
        if (config.historyRetentionDays > 0) {
            estimatedDeletedEntries += Math.floor(totalHistory * 0.3); // Rough estimate: 30% older than retention
        }
        
        // Scan entries (only if keepIpsOnPurge is false)
        if (!config.keepIpsOnPurge) {
            if (config.scanRetentionDays > 0) {
                estimatedDeletedEntries += Math.floor(totalScans * 0.1); // Rough estimate: 10% older than retention
            }
            // Offline entries
            const offlineScans = stats.offlineScans || 0;
            if (config.offlineRetentionDays > 0) {
                estimatedDeletedEntries += Math.floor(offlineScans * 0.5); // Rough estimate: 50% older than retention
            }
        }
        
        // Latency measurements (rough estimate: assume 1000 measurements per day per monitored IP)
        // This is a very rough estimate
        estimatedDeletedEntries += 1000; // Conservative estimate
        
        // Rough estimation: assume each entry takes ~1KB on average
        const estimatedFreedBytes = estimatedDeletedEntries * 1024; // 1KB per entry
        const estimatedFreedMB = estimatedFreedBytes / (1024 * 1024);
        const estimatedSizeAfterPurgeMB = Math.max(0, currentSizeMB - estimatedFreedMB);
        
        return {
            currentSizeMB: Math.round(currentSizeMB * 100) / 100,
            estimatedSizeAfterPurgeMB: Math.round(estimatedSizeAfterPurgeMB * 100) / 100,
            estimatedFreedMB: Math.round(estimatedFreedMB * 100) / 100
        };
    } catch (error) {
        logger.error('DatabasePurgeService', 'Failed to estimate database size:', error);
        // Return current size only if estimation fails
        try {
            const db = getDatabase();
            const dbPath = (db.prepare('PRAGMA database_list').all() as any[])[0]?.file as string;
            const currentSizeBytes = fs.statSync(dbPath).size;
            const currentSizeMB = currentSizeBytes / (1024 * 1024);
            return {
                currentSizeMB: Math.round(currentSizeMB * 100) / 100,
                estimatedSizeAfterPurgeMB: currentSizeMB,
                estimatedFreedMB: 0
            };
        } catch (fallbackError) {
            logger.error('DatabasePurgeService', 'Failed to get current database size:', fallbackError);
            return {
                currentSizeMB: 0,
                estimatedSizeAfterPurgeMB: 0,
                estimatedFreedMB: 0
            };
        }
    }
}

/**
 * Initialize purge service on application startup
 */
export function initializePurgeService(): void {
    const config = getRetentionConfig();
    
    if (config.autoPurgeEnabled) {
        startAutoPurge(config.purgeSchedule);
        logger.info('DatabasePurgeService', 'Purge service initialized with auto-purge enabled');
    } else {
        logger.info('DatabasePurgeService', 'Purge service initialized with auto-purge disabled');
    }
}

