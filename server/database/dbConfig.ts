/**
 * Database Configuration Service
 * 
 * Manages SQLite performance settings optimized for Docker environments
 * Provides admin interface to configure database performance parameters
 */

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

