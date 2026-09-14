/**
 * Per-token MCP tool overrides
 *
 * Explicit exceptions layered on top of a token's access_level (see
 * McpToken.ts): a row here always wins over the access_level default for
 * that one tool. Deleting the row reverts the tool to the access_level rule.
 */

import { getDatabase } from "../connection.js";
import { logger } from "../../utils/logger.js";

export interface McpTokenToolOverrideRow {
  toolName: string;
  enabled: boolean;
}

export class McpTokenToolOverrideRepository {
  static listForToken(tokenId: number): McpTokenToolOverrideRow[] {
    try {
      const db = getDatabase();
      const rows = db
        .prepare(
          "SELECT tool_name, enabled FROM mcp_token_tool_overrides WHERE token_id = ?",
        )
        .all(tokenId) as { tool_name: string; enabled: number }[];
      return rows.map((row) => ({
        toolName: row.tool_name,
        enabled: row.enabled === 1,
      }));
    } catch (error) {
      logger.error("McpTokenToolOverride", `Failed to list overrides for token ${tokenId}:`, error);
      return [];
    }
  }

  static setOverride(tokenId: number, toolName: string, enabled: boolean): boolean {
    try {
      const db = getDatabase();
      db.prepare(
        `INSERT INTO mcp_token_tool_overrides (token_id, tool_name, enabled)
         VALUES (?, ?, ?)
         ON CONFLICT(token_id, tool_name) DO UPDATE SET enabled = excluded.enabled`,
      ).run(tokenId, toolName, enabled ? 1 : 0);
      return true;
    } catch (error) {
      logger.error(
        "McpTokenToolOverride",
        `Failed to set override for token ${tokenId}, tool ${toolName}:`,
        error,
      );
      return false;
    }
  }

  /** Removes the override, reverting the tool to the token's access_level default. */
  static clearOverride(tokenId: number, toolName: string): boolean {
    try {
      const db = getDatabase();
      db.prepare(
        "DELETE FROM mcp_token_tool_overrides WHERE token_id = ? AND tool_name = ?",
      ).run(tokenId, toolName);
      return true;
    } catch (error) {
      logger.error(
        "McpTokenToolOverride",
        `Failed to clear override for token ${tokenId}, tool ${toolName}:`,
        error,
      );
      return false;
    }
  }
}
