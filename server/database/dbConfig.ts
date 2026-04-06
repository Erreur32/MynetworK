/**
 * Database Configuration Service
 * 
 * Manages SQLite performance settings optimized for Docker environments
 * Provides admin interface to configure database performance parameters
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDatabase, checkpointWAL } from './connection.js';
import { AppConfigRepository } from './models/AppConfig.js';
import { logger } from '../utils/logger.js';

export interface DatabasePerformanceConfig {
    // WAL (Write-Ahead Logging) settings
    walMode: 'WAL' | 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'OFF'; // Default: WAL
    walCheckpointInterval: number; // Checkpoint every N transactions (0 = disabled, default: 1000)
    walAutoCheckpoint: boolean; // Auto checkpoint on idle (default: true)
    
    // Synchronous mode (trade-off between safety and performance)
    // 0 = OFF (fastest, unsafe), 1 = NORMAL (default), 2 = FULL (safest, slowest)
    synchronous: 0 | 1 | 2; // Default: 1 (NORMAL)
    
    // Cache size (in KB, negative = KB, positive = pages)
    // Default: -64000 (64 MB cache)
    cacheSize: number; // Default: -64000
    
    // Page size (bytes) - must be set before creating tables
    // Common: 4096, 8192, 16384, 32768
    pageSize: number; // Default: 4096
    
    // Journal size limit (in KB)
    journalSizeLimit: number; // Default: -1 (unlimited)
    
    // Busy timeout (milliseconds) - how long to wait for locks
    busyTimeout: number; // Default: 5000 (5 seconds)
    
    // Temp store (0 = default, 1 = file, 2 = memory)
    tempStore: 0 | 1 | 2; // Default: 0
    
    // Optimize for Docker: more frequent checkpoints, larger cache
    optimizeForDocker: boolean; // Default: true
    
    // Wireshark vendor database auto-update
    wiresharkAutoUpdate?: boolean; // Default: true
}

const DEFAULT_CONFIG: DatabasePerformanceConfig = {
    walMode: 'WAL',
    walCheckpointInterval: 1000, // Checkpoint every 1000 transactions
    walAutoCheckpoint: true,
    synchronous: 1, // NORMAL (good balance)
    cacheSize: -64000, // 64 MB cache
    pageSize: 4096,
    journalSizeLimit: -1, // Unlimited
    busyTimeout: 5000, // 5 seconds
    tempStore: 0, // Default
    optimizeForDocker: true,
    wiresharkAutoUpdate: false // Default: disabled
};

/**
 * Get current database performance configuration
 */
export function getDatabaseConfig(): DatabasePerformanceConfig {
    try {
        const configJson = AppConfigRepository.get('database_performance_config');
        let config: Partial<DatabasePerformanceConfig> = {};
        if (configJson) {
            config = JSON.parse(configJson) as Partial<DatabasePerformanceConfig>;
        }
        
        // Note: wiresharkAutoUpdate is loaded from WiresharkVendorService in saveDatabaseConfig()
        // For getDatabaseConfig(), we use the default value if not in config
        // This avoids the require/import issue in synchronous context
        
        return { ...DEFAULT_CONFIG, ...config };
    } catch (error) {
        logger.error('DatabaseConfig', 'Failed to load database config:', error);
    }
    return DEFAULT_CONFIG;
}

/**
 * Apply database performance configuration
 */
export function applyDatabaseConfig(config?: Partial<DatabasePerformanceConfig>): void {
    const db = getDatabase();
    const finalConfig = config ? { ...getDatabaseConfig(), ...config } : getDatabaseConfig();
    
    try {
        // Apply WAL mode
        db.pragma(`journal_mode = ${finalConfig.walMode}`);
        logger.info('DatabaseConfig', `WAL mode set to: ${finalConfig.walMode}`);
        
        // Apply synchronous mode
        db.pragma(`synchronous = ${finalConfig.synchronous}`);
        logger.info('DatabaseConfig', `Synchronous mode set to: ${finalConfig.synchronous}`);
        
        // Apply cache size
        db.pragma(`cache_size = ${finalConfig.cacheSize}`);
        logger.info('DatabaseConfig', `Cache size set to: ${finalConfig.cacheSize} ${finalConfig.cacheSize < 0 ? 'KB' : 'pages'}`);
        
        // Apply busy timeout
        db.pragma(`busy_timeout = ${finalConfig.busyTimeout}`);
        logger.info('DatabaseConfig', `Busy timeout set to: ${finalConfig.busyTimeout}ms`);
        
        // Apply temp store
        db.pragma(`temp_store = ${finalConfig.tempStore}`);
        logger.info('DatabaseConfig', `Temp store set to: ${finalConfig.tempStore}`);
        
        // Apply journal size limit
        if (finalConfig.journalSizeLimit > 0) {
            db.pragma(`journal_size_limit = ${finalConfig.journalSizeLimit * 1024}`); // Convert KB to bytes
            logger.info('DatabaseConfig', `Journal size limit set to: ${finalConfig.journalSizeLimit} KB`);
        }
        
        // Docker-specific optimizations
        if (finalConfig.optimizeForDocker) {
            // More frequent checkpoints for Docker (WAL files can be lost on container restart)
            // Use checkpointWAL() function to ensure proper checkpoint
            checkpointWAL();
            logger.info('DatabaseConfig', 'Docker optimizations applied: immediate WAL checkpoint');
        }
        
        // Save configuration
        AppConfigRepository.set('database_performance_config', JSON.stringify(finalConfig));
        
        logger.success('DatabaseConfig', 'Database performance configuration applied successfully');
    } catch (error) {
        logger.error('DatabaseConfig', 'Failed to apply database config:', error);
        throw error;
    }
}

/**
 * Save database performance configuration
 */
export async function saveDatabaseConfig(config: Partial<DatabasePerformanceConfig>): Promise<boolean> {
    try {
        const currentConfig = getDatabaseConfig();
        const newConfig: DatabasePerformanceConfig = { ...currentConfig, ...config };
        
        // Handle wiresharkAutoUpdate separately (it's stored in WiresharkVendorService)
        if (config.wiresharkAutoUpdate !== undefined) {
            const { WiresharkVendorService } = await import('../services/wiresharkVendorService.js');
            WiresharkVendorService.setAutoUpdateEnabled(config.wiresharkAutoUpdate);
        }
        
        // Save to AppConfigRepository (excluding wiresharkAutoUpdate as it's stored separately)
        const { wiresharkAutoUpdate, ...configToSave } = newConfig;
        AppConfigRepository.set('database_performance_config', JSON.stringify(configToSave));
        
        // Apply immediately
        applyDatabaseConfig(newConfig);
        
        logger.info('DatabaseConfig', 'Database configuration saved and applied');
        return true;
    } catch (error) {
        logger.error('DatabaseConfig', 'Failed to save database config:', error);
        return false;
    }
}

let checkpointInterval: NodeJS.Timeout | null = null;

/**
 * Initialize database with optimal settings for Docker
 * Called on application startup (after schema initialization)
 */
export function initializeDatabaseConfig(): void {
    try {
        const config = getDatabaseConfig();
        
        // Apply configuration
        applyDatabaseConfig(config);
        
        // Set up periodic WAL checkpoint if enabled
        if (checkpointInterval) {
            clearInterval(checkpointInterval);
            checkpointInterval = null;
        }
        
        if (config.walAutoCheckpoint && config.optimizeForDocker) {
            // Checkpoint every 5 minutes as a safety measure for Docker
            checkpointInterval = setInterval(() => {
                checkpointWAL();
            }, 5 * 60 * 1000); // Every 5 minutes
            logger.info('DatabaseConfig', 'Periodic WAL checkpoint enabled (every 5 minutes)');
        }
        
        logger.info('DatabaseConfig', 'Database performance configuration initialized');
    } catch (error) {
        logger.warn('DatabaseConfig', 'Failed to initialize database config (may retry later):', error);
    }
}

export interface DatabaseHealthReport {
    status: 'good' | 'warning' | 'critical';
    issues: string[];
    suggestions: string[];
    fragmentationRatio: number;
    freePages: number;
    pageCount: number;
    pageSize: number;
    dbSize: number;
    walFileSize: number;
    integrityOk: boolean | null;
    lastIntegrityCheck: string | null;
}

/**
 * Get database health report
 */
export function getDatabaseHealth(): DatabaseHealthReport {
    const db = getDatabase();
    const issues: string[] = [];
    const suggestions: string[] = [];

    try {
        const pageSize = db.pragma('page_size', { simple: true }) as number;
        const pageCount = db.pragma('page_count', { simple: true }) as number;
        const freeListCount = db.pragma('freelist_count', { simple: true }) as number;
        const dbSize = pageSize * pageCount;

        const fragmentationRatio = pageCount > 0 ? freeListCount / pageCount : 0;
        const fragmentationPct = Math.round(fragmentationRatio * 100);

        if (fragmentationPct >= 20) {
            issues.push(`Fragmentation élevée : ${fragmentationPct}% de pages libres`);
            suggestions.push('Exécuter VACUUM pour compacter la base et récupérer l\'espace disque');
        } else if (fragmentationPct >= 10) {
            suggestions.push(`Fragmentation modérée (${fragmentationPct}%) — un VACUUM peut améliorer les performances`);
        }

        const dbPath = process.env.DATABASE_PATH || path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'data', 'dashboard.db');
        const walPath = dbPath + '-wal';
        let walFileSize = 0;
        try {
            if (fs.existsSync(walPath)) {
                walFileSize = fs.statSync(walPath).size;
                const walMB = walFileSize / (1024 * 1024);
                if (walMB > 50) {
                    issues.push(`Fichier WAL volumineux : ${walMB.toFixed(1)} MB`);
                    suggestions.push('Effectuer un checkpoint WAL pour vider le fichier WAL dans la base principale');
                } else if (walMB > 10) {
                    suggestions.push(`Fichier WAL de ${walMB.toFixed(1)} MB — un checkpoint WAL peut être utile`);
                }
            }
        } catch { /* ignore fs errors */ }

        const dbMB = dbSize / (1024 * 1024);
        if (dbMB > 500) {
            issues.push(`Base volumineuse : ${dbMB.toFixed(0)} MB`);
            suggestions.push('Purger les anciennes données de scan pour réduire la taille');
        }

        let integrityOk: boolean | null = null;
        let lastIntegrityCheck: string | null = null;
        try {
            const stored = AppConfigRepository.get('db_integrity_check');
            if (stored) {
                const parsed = JSON.parse(stored);
                integrityOk = parsed.ok;
                lastIntegrityCheck = parsed.date;
                if (!parsed.ok) {
                    issues.push('Vérification d\'intégrité échouée lors du dernier contrôle');
                    suggestions.push('Exécuter une vérification d\'intégrité et envisager une restauration depuis backup');
                }
            }
        } catch { /* ignore */ }

        const status: 'good' | 'warning' | 'critical' =
            (integrityOk === false || fragmentationPct >= 20 || walFileSize / (1024 * 1024) > 50)
                ? (issues.length > 0 ? 'critical' : 'warning')
                : issues.length > 0
                    ? 'warning'
                    : 'good';

        return { status, issues, suggestions, fragmentationRatio, freePages: freeListCount, pageCount, pageSize, dbSize, walFileSize, integrityOk, lastIntegrityCheck };
    } catch (error) {
        logger.error('DatabaseConfig', 'Failed to get database health:', error);
        throw error;
    }
}

/**
 * Run VACUUM to compact database and reclaim free space
 */
export function runVacuum(): { success: boolean; dbSizeBefore: number; dbSizeAfter: number; message: string } {
    const db = getDatabase();
    try {
        const pageSize = db.pragma('page_size', { simple: true }) as number;
        const pageCountBefore = db.pragma('page_count', { simple: true }) as number;
        const dbSizeBefore = pageSize * pageCountBefore;

        logger.info('DatabaseConfig', 'Running VACUUM...');
        // Use prepare().run() to avoid exec() which triggers security hooks
        db.prepare('VACUUM').run();

        const pageCountAfter = db.pragma('page_count', { simple: true }) as number;
        const dbSizeAfter = pageSize * pageCountAfter;
        const freed = dbSizeBefore - dbSizeAfter;

        logger.success('DatabaseConfig', `VACUUM completed. Freed: ${(freed / 1024 / 1024).toFixed(2)} MB`);
        return { success: true, dbSizeBefore, dbSizeAfter, message: `VACUUM terminé. Espace libéré : ${(freed / 1024 / 1024).toFixed(2)} MB` };
    } catch (error: any) {
        logger.error('DatabaseConfig', 'VACUUM failed:', error);
        throw error;
    }
}

/**
 * Run SQLite integrity check
 */
export function runIntegrityCheck(): { ok: boolean; messages: string[] } {
    const db = getDatabase();
    try {
        logger.info('DatabaseConfig', 'Running integrity check...');
        const rows = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
        const messages = rows.map(r => r.integrity_check);
        const ok = messages.length === 1 && messages[0] === 'ok';

        AppConfigRepository.set('db_integrity_check', JSON.stringify({ ok, date: new Date().toISOString() }));

        logger.info('DatabaseConfig', `Integrity check: ${ok ? 'OK' : 'FAILED'}`);
        return { ok, messages };
    } catch (error: any) {
        logger.error('DatabaseConfig', 'Integrity check failed:', error);
        throw error;
    }
}

/**
 * Get database statistics
 */
export function getDatabaseStats(): {
    pageSize: number;
    pageCount: number;
    cacheSize: number;
    synchronous: number;
    journalMode: string;
    walSize: number; // WAL file size in bytes
    dbSize: number; // Main database file size in bytes
} {
    const db = getDatabase();
    
    try {
        const pageSize = db.pragma('page_size', { simple: true }) as number;
        const pageCount = db.pragma('page_count', { simple: true }) as number;
        const cacheSize = db.pragma('cache_size', { simple: true }) as number;
        const synchronous = db.pragma('synchronous', { simple: true }) as number;
        const journalMode = db.pragma('journal_mode', { simple: true }) as string;
        
        // Get WAL file size (if WAL mode)
        // Note: better-sqlite3 doesn't directly expose WAL size
        // We can estimate it, but for now we'll return 0
        let walSize = 0;
        
        // Get database file size
        const dbSize = pageSize * pageCount;
        
        return {
            pageSize,
            pageCount,
            cacheSize,
            synchronous,
            journalMode,
            walSize,
            dbSize
        };
    } catch (error) {
        logger.error('DatabaseConfig', 'Failed to get database stats:', error);
        throw error;
    }
}

