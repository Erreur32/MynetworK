/**
 * Database connection module using SQLite (better-sqlite3)
 * 
 * SQLite is chosen for simplicity - no separate database server needed.
 * Can be easily migrated to PostgreSQL later if needed.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { initializeDatabaseConfig } from './dbConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'data', 'dashboard.db');

// Create database instance
let db: Database.Database | null = null;

/**
 * Get or create database connection
 * Creates the database file if it doesn't exist
 */
export function getDatabase(): Database.Database {
    if (!db) {
        // Ensure data directory exists
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        db = new Database(dbPath);
        
        // Enable foreign keys
        db.pragma('foreign_keys = ON');
        
        // Apply basic WAL mode first (required before other configs)
        db.pragma('journal_mode = WAL');
        
        // Apply performance configuration (will set other optimizations)
        // Note: initializeDatabaseConfig will be called after schema initialization
        try {
            initializeDatabaseConfig();
        } catch (error) {
            logger.warn('Database', 'Failed to initialize database config (will retry after schema init):', error);
        }
        
        logger.success('Database', `Connected to SQLite database: ${dbPath}`);
    }
    
    return db;
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
    if (db) {
        db.close();
        db = null;
        logger.debug('Database', 'Connection closed');
    }
}

/**
 * Force a WAL checkpoint to ensure all changes are written to the main database file
 * This is important in Docker environments where WAL files might not be properly synchronized
 */
export function checkpointWAL(): void {
    try {
        if (db) {
            // Checkpoint the WAL file to ensure all changes are written to the main database
            db.pragma('wal_checkpoint(TRUNCATE)');
            logger.debug('Database', 'WAL checkpoint completed');
        }
    } catch (error) {
        logger.error('Database', 'Failed to checkpoint WAL:', error);
    }
}

/**
 * Initialize database schema (create tables if they don't exist)
 */
export function initializeDatabase(): void {
    const database = getDatabase();
    
    // Users table
    database.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user', 'viewer')),
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME,
            last_login_ip TEXT,
            avatar TEXT
        )
    `);

    // Add new columns if they don't exist (migration for existing databases)
    try {
        database.exec(`
            ALTER TABLE users ADD COLUMN last_login_ip TEXT;
        `);
    } catch (e: any) {
        // Column already exists, ignore error
        if (!e.message?.includes('duplicate column name')) {
            logger.debug('Database', 'Migration: last_login_ip column may already exist');
        }
    }

    try {
        database.exec(`
            ALTER TABLE users ADD COLUMN avatar TEXT;
        `);
    } catch (e: any) {
        // Column already exists, ignore error
        if (!e.message?.includes('duplicate column name')) {
            logger.debug('Database', 'Migration: avatar column may already exist');
        }
    }

    // Plugin configurations table
    database.exec(`
        CREATE TABLE IF NOT EXISTS plugin_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plugin_id TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 0,
            settings TEXT NOT NULL DEFAULT '{}',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(plugin_id)
        )
    `);

    // Logs table
    database.exec(`
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            plugin_id TEXT,
            action TEXT NOT NULL,
            resource TEXT NOT NULL,
            resource_id TEXT,
            details TEXT,
            ip_address TEXT,
            user_agent TEXT,
            level TEXT NOT NULL DEFAULT 'info' CHECK(level IN ('info', 'warning', 'error')),
            timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // User plugin permissions table
    database.exec(`
        CREATE TABLE IF NOT EXISTS user_plugin_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            plugin_id TEXT NOT NULL,
            can_view INTEGER NOT NULL DEFAULT 1,
            can_edit INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, plugin_id)
        )
    `);

    // App configuration table (for metrics, etc.)
    database.exec(`
        CREATE TABLE IF NOT EXISTS app_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Network scans table (for network scan plugin)
    database.exec(`
        CREATE TABLE IF NOT EXISTS network_scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL UNIQUE,
            mac TEXT,
            hostname TEXT,
            vendor TEXT,
            hostname_source TEXT,
            vendor_source TEXT,
            status TEXT NOT NULL DEFAULT 'unknown' CHECK(status IN ('online', 'offline', 'unknown')),
            ping_latency INTEGER,
            first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            scan_count INTEGER NOT NULL DEFAULT 1,
            additional_info TEXT
        )
    `);
    
    // Migration: Add hostname_source and vendor_source columns if they don't exist
    try {
        database.exec(`
            ALTER TABLE network_scans ADD COLUMN hostname_source TEXT;
        `);
    } catch (error: any) {
        // Column already exists, ignore
        if (!error.message?.includes('duplicate column')) {
            logger.debug('Database', 'Migration: hostname_source column may already exist');
        }
    }
    
    try {
        database.exec(`
            ALTER TABLE network_scans ADD COLUMN vendor_source TEXT;
        `);
    } catch (error: any) {
        // Column already exists, ignore
        if (!error.message?.includes('duplicate column')) {
            logger.debug('Database', 'Migration: vendor_source column may already exist');
        }
    }

    // Network scan history table (tracks each time an IP is seen)
    database.exec(`
        CREATE TABLE IF NOT EXISTS network_scan_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('online', 'offline', 'unknown')),
            ping_latency INTEGER,
            seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ip) REFERENCES network_scans(ip) ON DELETE CASCADE
        )
    `);

    // Latency monitoring table (tracks which IPs have continuous monitoring enabled)
    database.exec(`
        CREATE TABLE IF NOT EXISTS latency_monitoring (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL UNIQUE,
            enabled INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ip) REFERENCES network_scans(ip) ON DELETE CASCADE
        )
    `);

    // Latency measurements table (stores individual ping measurements for monitored IPs)
    database.exec(`
        CREATE TABLE IF NOT EXISTS latency_measurements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            latency REAL,
            packet_loss INTEGER NOT NULL DEFAULT 0,
            measured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ip) REFERENCES latency_monitoring(ip) ON DELETE CASCADE
        )
    `);

    // Create indexes for better performance
    database.exec(`
        CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_logs_plugin_id ON logs(plugin_id);
        CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_logs_action ON logs(action);
        CREATE INDEX IF NOT EXISTS idx_user_plugin_permissions_user_id ON user_plugin_permissions(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_plugin_permissions_plugin_id ON user_plugin_permissions(plugin_id);
        CREATE INDEX IF NOT EXISTS idx_network_scans_ip ON network_scans(ip);
        CREATE INDEX IF NOT EXISTS idx_network_scans_last_seen ON network_scans(last_seen);
        CREATE INDEX IF NOT EXISTS idx_network_scans_status ON network_scans(status);
        CREATE INDEX IF NOT EXISTS idx_network_scan_history_ip ON network_scan_history(ip);
        CREATE INDEX IF NOT EXISTS idx_network_scan_history_seen_at ON network_scan_history(seen_at);
        CREATE INDEX IF NOT EXISTS idx_network_scan_history_status ON network_scan_history(status);
        CREATE INDEX IF NOT EXISTS idx_latency_monitoring_ip ON latency_monitoring(ip);
        CREATE INDEX IF NOT EXISTS idx_latency_monitoring_enabled ON latency_monitoring(enabled);
        CREATE INDEX IF NOT EXISTS idx_latency_measurements_ip ON latency_measurements(ip);
        CREATE INDEX IF NOT EXISTS idx_latency_measurements_measured_at ON latency_measurements(measured_at);
        CREATE INDEX IF NOT EXISTS idx_latency_measurements_ip_measured_at ON latency_measurements(ip, measured_at);
    `);

    logger.success('Database', 'Schema initialized');
}

