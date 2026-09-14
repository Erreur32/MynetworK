/**
 * MCP bearer token repository
 *
 * Named, multi-token store backing the admin UI's token management page.
 * Revocation is soft (revoked_at set, row kept) to preserve an audit trail.
 */

import { getDatabase } from "../connection.js";
import { logger } from "../../utils/logger.js";

export type McpTokenAccessLevel = "full" | "read_only";

export interface McpTokenRow {
  id: number;
  name: string;
  tokenHash: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  accessLevel: McpTokenAccessLevel;
}

interface RawRow {
  id: number;
  name: string;
  token_hash: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  access_level: string;
}

function fromRaw(row: RawRow): McpTokenRow {
  return {
    id: row.id,
    name: row.name,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    accessLevel: row.access_level === "read_only" ? "read_only" : "full",
  };
}

export class McpTokenRepository {
  static create(
    name: string,
    tokenHash: string,
    expiresAt: Date | null,
    accessLevel: McpTokenAccessLevel = "full",
  ): McpTokenRow | null {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        INSERT INTO mcp_tokens (name, token_hash, expires_at, access_level)
        VALUES (?, ?, ?, ?)
      `);
      const result = stmt.run(
        name,
        tokenHash,
        expiresAt?.toISOString() ?? null,
        accessLevel,
      );
      return this.findById(result.lastInsertRowid as number);
    } catch (error) {
      logger.error("McpToken", "Failed to create token:", error);
      return null;
    }
  }

  static setAccessLevel(id: number, accessLevel: McpTokenAccessLevel): boolean {
    try {
      const db = getDatabase();
      const result = db
        .prepare("UPDATE mcp_tokens SET access_level = ? WHERE id = ?")
        .run(accessLevel, id);
      return result.changes > 0;
    } catch (error) {
      logger.error("McpToken", `Failed to set access level for token ${id}:`, error);
      return false;
    }
  }

  static findById(id: number): McpTokenRow | null {
    try {
      const db = getDatabase();
      const row = db
        .prepare("SELECT * FROM mcp_tokens WHERE id = ?")
        .get(id) as RawRow | undefined;
      return row ? fromRaw(row) : null;
    } catch (error) {
      logger.error("McpToken", "Failed to find token:", error);
      return null;
    }
  }

  /** All rows, most recent first, for the admin UI list. */
  static listAll(): McpTokenRow[] {
    try {
      const db = getDatabase();
      const rows = db
        .prepare("SELECT * FROM mcp_tokens ORDER BY created_at DESC")
        .all() as RawRow[];
      return rows.map(fromRaw);
    } catch (error) {
      logger.error("McpToken", "Failed to list tokens:", error);
      return [];
    }
  }

  /** Active (non-revoked, non-expired) rows, for auth verification. */
  static listActive(): McpTokenRow[] {
    try {
      const db = getDatabase();
      const rows = db
        .prepare(
          `SELECT * FROM mcp_tokens
           WHERE revoked_at IS NULL
             AND (expires_at IS NULL OR expires_at > datetime('now'))`,
        )
        .all() as RawRow[];
      return rows.map(fromRaw);
    } catch (error) {
      logger.error("McpToken", "Failed to list active tokens:", error);
      return [];
    }
  }

  static hasActive(): boolean {
    try {
      const db = getDatabase();
      const row = db
        .prepare(
          `SELECT 1 FROM mcp_tokens
           WHERE revoked_at IS NULL
             AND (expires_at IS NULL OR expires_at > datetime('now'))
           LIMIT 1`,
        )
        .get();
      return row !== undefined;
    } catch (error) {
      logger.error("McpToken", "Failed to check active tokens:", error);
      return false;
    }
  }

  static touchLastUsed(id: number): void {
    try {
      const db = getDatabase();
      db.prepare(
        "UPDATE mcp_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run(id);
    } catch (error) {
      logger.error("McpToken", `Failed to record usage for token ${id}:`, error);
    }
  }

  /** Soft revoke: keeps the row for audit purposes. No-op if already revoked. */
  static revoke(id: number): boolean {
    try {
      const db = getDatabase();
      const result = db
        .prepare(
          "UPDATE mcp_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL",
        )
        .run(id);
      return result.changes > 0;
    } catch (error) {
      logger.error("McpToken", `Failed to revoke token ${id}:`, error);
      return false;
    }
  }

  /**
   * Hard delete: fully removes the row (and its tool overrides, via FK
   * cascade). Used to clean up history for tokens that are already
   * revoked/expired, unlike revoke() which keeps an audit trail.
   */
  static purge(id: number): boolean {
    try {
      const db = getDatabase();
      const result = db.prepare("DELETE FROM mcp_tokens WHERE id = ?").run(id);
      return result.changes > 0;
    } catch (error) {
      logger.error("McpToken", `Failed to purge token ${id}:`, error);
      return false;
    }
  }

  /**
   * Used once by the legacy-singleton migration to preserve the original
   * created/last-used timestamps instead of resetting them to "now".
   * INSERT OR IGNORE: no-op if already migrated (token_hash is UNIQUE).
   */
  static insertLegacy(
    name: string,
    tokenHash: string,
    createdAt: string,
    lastUsedAt: string | null,
  ): void {
    try {
      const db = getDatabase();
      db.prepare(
        `INSERT OR IGNORE INTO mcp_tokens (name, token_hash, created_at, last_used_at, expires_at)
         VALUES (?, ?, ?, ?, NULL)`,
      ).run(name, tokenHash, createdAt, lastUsedAt);
    } catch (error) {
      logger.error("McpToken", "Failed to migrate legacy token:", error);
    }
  }

  static count(): number {
    try {
      const db = getDatabase();
      const result = db
        .prepare("SELECT COUNT(*) as count FROM mcp_tokens")
        .get() as { count: number };
      return result.count;
    } catch {
      return 0;
    }
  }
}
