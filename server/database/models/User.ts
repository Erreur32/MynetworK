/**
 * User model and database operations
 * 
 * Handles user creation, authentication, and management
 */

import { getDatabase } from '../connection.js';

export interface User {
    id: number;
    username: string;
    email: string;
    passwordHash: string;
    role: 'admin' | 'user' | 'viewer';
    enabled: boolean;
    createdAt: Date;
    lastLogin?: Date;
    lastLoginIp?: string;
    avatar?: string;
}

export interface CreateUserInput {
    username: string;
    email: string;
    password: string;
    role?: 'admin' | 'user' | 'viewer';
}

export interface UpdateUserInput {
    email?: string;
    password?: string;
    role?: 'admin' | 'user' | 'viewer';
    enabled?: boolean;
    avatar?: string;
    username?: string;
}

/**
 * User repository for database operations
 */
export class UserRepository {
    /**
     * Create a new user
     */
    static create(input: CreateUserInput, passwordHash: string): User {
        const db = getDatabase();
        const stmt = db.prepare(`
            INSERT INTO users (username, email, password_hash, role, enabled)
            VALUES (?, ?, ?, ?, 1)
        `);
        
        const result = stmt.run(
            input.username,
            input.email,
            passwordHash,
            input.role || 'user'
        );
        
        return this.findById(result.lastInsertRowid as number)!;
    }

    /**
     * Find user by ID
     */
    static findById(id: number): User | null {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
        const row = stmt.get(id) as any;
        
        if (!row) return null;
        
        return {
            id: row.id,
            username: row.username,
            email: row.email,
            passwordHash: row.password_hash,
            role: row.role,
            enabled: row.enabled === 1,
            createdAt: new Date(row.created_at),
            lastLogin: row.last_login ? new Date(row.last_login) : undefined,
            lastLoginIp: row.last_login_ip || undefined,
            avatar: row.avatar || undefined
        };
    }

    /**
     * Find user by username
     */
    static findByUsername(username: string): User | null {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
        const row = stmt.get(username) as any;
        
        if (!row) return null;
        
        return {
            id: row.id,
            username: row.username,
            email: row.email,
            passwordHash: row.password_hash,
            role: row.role,
            enabled: row.enabled === 1,
            createdAt: new Date(row.created_at),
            lastLogin: row.last_login ? new Date(row.last_login) : undefined,
            lastLoginIp: row.last_login_ip || undefined,
            avatar: row.avatar || undefined
        };
    }

    /**
     * Find user by email
     */
    static findByEmail(email: string): User | null {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
        const row = stmt.get(email) as any;
        
        if (!row) return null;
        
        return {
            id: row.id,
            username: row.username,
            email: row.email,
            passwordHash: row.password_hash,
            role: row.role,
            enabled: row.enabled === 1,
            createdAt: new Date(row.created_at),
            lastLogin: row.last_login ? new Date(row.last_login) : undefined,
            lastLoginIp: row.last_login_ip || undefined,
            avatar: row.avatar || undefined
        };
    }

    /**
     * Get all users
     */
    static findAll(): User[] {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM users ORDER BY created_at DESC');
        const rows = stmt.all() as any[];
        
        return rows.map(row => ({
            id: row.id,
            username: row.username,
            email: row.email,
            passwordHash: row.password_hash,
            role: row.role,
            enabled: row.enabled === 1,
            createdAt: new Date(row.created_at),
            lastLogin: row.last_login ? new Date(row.last_login) : undefined,
            lastLoginIp: row.last_login_ip || undefined,
            avatar: row.avatar || undefined
        }));
    }

    /**
     * Update user
     */
    static update(id: number, input: UpdateUserInput): User | null {
        const db = getDatabase();
        const updates: string[] = [];
        const values: any[] = [];
        
        if (input.email !== undefined) {
            updates.push('email = ?');
            values.push(input.email);
        }
        if (input.password !== undefined) {
            updates.push('password_hash = ?');
            values.push(input.password);
        }
        if (input.role !== undefined) {
            updates.push('role = ?');
            values.push(input.role);
        }
        if (input.enabled !== undefined) {
            updates.push('enabled = ?');
            values.push(input.enabled ? 1 : 0);
        }
        if (input.avatar !== undefined) {
            updates.push('avatar = ?');
            values.push(input.avatar);
        }
        if (input.username !== undefined) {
            updates.push('username = ?');
            values.push(input.username);
        }
        
        if (updates.length === 0) {
            return this.findById(id);
        }
        
        // Add id to values for WHERE clause
        values.push(id);
        
        const stmt = db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`);
        stmt.run(...values);
        
        return this.findById(id);
    }

    /**
     * Update last login timestamp and IP
     */
    static updateLastLogin(id: number, ipAddress?: string): void {
        const db = getDatabase();
        if (ipAddress) {
            const stmt = db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP, last_login_ip = ? WHERE id = ?');
            stmt.run(ipAddress, id);
        } else {
            const stmt = db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?');
            stmt.run(id);
        }
    }

    /**
     * Delete user
     */
    static delete(id: number): boolean {
        const db = getDatabase();
        const stmt = db.prepare('DELETE FROM users WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }

    /**
     * Check if username exists
     */
    static usernameExists(username: string): boolean {
        const db = getDatabase();
        const stmt = db.prepare('SELECT 1 FROM users WHERE username = ?');
        return stmt.get(username) !== undefined;
    }

    /**
     * Check if email exists
     */
    static emailExists(email: string): boolean {
        const db = getDatabase();
        const stmt = db.prepare('SELECT 1 FROM users WHERE email = ?');
        return stmt.get(email) !== undefined;
    }
}

