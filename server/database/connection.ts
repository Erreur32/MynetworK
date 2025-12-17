/**
 * Database connection module using SQLite (better-sqlite3)
 * 
 * SQLite is chosen for simplicity - no separate database server needed.
 * Can be easily migrated to PostgreSQL later if needed.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

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
        
        // Enable WAL mode for better concurrency
        db.pragma('journal_mode = WAL');
        
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

    // Create indexes for better performance
    database.exec(`
        CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_logs_plugin_id ON logs(plugin_id);
        CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_logs_action ON logs(action);
        CREATE INDEX IF NOT EXISTS idx_user_plugin_permissions_user_id ON user_plugin_permissions(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_plugin_permissions_plugin_id ON user_plugin_permissions(plugin_id);
    `);

    logger.success('Database', 'Schema initialized');
}

