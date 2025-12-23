/**
 * Database Purge Service
 * 
 * Handles automatic and manual purging of old data from the database
 * Specifically manages retention policies for network scan data
 */

import { NetworkScanRepository } from '../database/models/NetworkScan.js';
import { AppConfigRepository } from '../database/models/AppConfig.js';
import { logger } from '../utils/logger.js';
import cron from 'node-cron';

export interface RetentionConfig {
    // History retention (network_scan_history table)
    historyRetentionDays: number; // Default: 30 days
    
    // Scan entries retention (network_scans table)
    scanRetentionDays: number; // Default: 90 days for all entries
    
    // Offline entries retention (shorter retention for offline IPs)
    offlineRetentionDays: number; // Default: 7 days
    
    // Enable automatic purge
    autoPurgeEnabled: boolean; // Default: true
    
    // Purge schedule (cron expression)
    purgeSchedule: string; // Default: '0 2 * * *' (daily at 2 AM)
}

const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
    historyRetentionDays: 30,
    scanRetentionDays: 90,
    offlineRetentionDays: 7,
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
    totalDeleted: number;
} {
    const config = getRetentionConfig();
    
    logger.info('DatabasePurgeService', 'Starting database purge...', {
        historyRetentionDays: config.historyRetentionDays,
        scanRetentionDays: config.scanRetentionDays,
        offlineRetentionDays: config.offlineRetentionDays
    });
    
    try {
        // Purge history entries (oldest first)
        const historyDeleted = NetworkScanRepository.purgeHistory(config.historyRetentionDays);
        
        // Purge offline entries (shorter retention)
        const offlineDeleted = NetworkScanRepository.purgeOfflineScans(config.offlineRetentionDays);
        
        // Purge old scan entries (longer retention, but after offline purge)
        const scansDeleted = NetworkScanRepository.purgeOldScans(config.scanRetentionDays);
        
        const totalDeleted = historyDeleted + scansDeleted + offlineDeleted;
        
        logger.info('DatabasePurgeService', `Purge completed: ${totalDeleted} entries deleted`, {
            historyDeleted,
            scansDeleted,
            offlineDeleted
        });
        
        // Optimize database after purge (only if significant data was deleted)
        if (totalDeleted > 100) {
            logger.info('DatabasePurgeService', 'Optimizing database after purge...');
            NetworkScanRepository.optimizeDatabase();
        }
        
        return {
            historyDeleted,
            scansDeleted,
            offlineDeleted,
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
 */
export function purgeScansOnly(retentionDays: number = 0): number {
    logger.info('DatabasePurgeService', `Purging scan entries (retention: ${retentionDays} days)`);
    try {
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
 */
export function purgeOfflineOnly(retentionDays: number = 0): number {
    logger.info('DatabasePurgeService', `Purging offline scan entries (retention: ${retentionDays} days)`);
    try {
        const deleted = NetworkScanRepository.purgeOfflineScans(retentionDays);
        logger.info('DatabasePurgeService', `Offline purge completed: ${deleted} entries deleted`);
        return deleted;
    } catch (error) {
        logger.error('DatabasePurgeService', 'Offline purge failed:', error);
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

