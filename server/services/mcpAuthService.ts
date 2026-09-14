/**
 * MCP authentication service
 *
 * Manages the named, multi-token store used to authenticate MCP clients
 * (server/database/models/McpToken.ts). Separate from the JWT auth used by
 * the web UI: these tokens are bearer credentials with an optional expiry,
 * hashed with SHA-256 before being persisted (never stored in plaintext).
 */
import crypto from "crypto";
import { AppConfigRepository } from "../database/models/AppConfig.js";
import {
  McpTokenRepository,
  McpTokenRow,
  McpTokenAccessLevel,
} from "../database/models/McpToken.js";
import { McpTokenToolOverrideRepository } from "../database/models/McpTokenToolOverride.js";
import { getToolCatalog, McpToolMeta } from "../mcp/toolCatalog.js";
import { resolveToolEnabled } from "../mcp/toolPermissions.js";

const RUNTIME_DISABLED_KEY = "mcp_runtime_disabled";

// Legacy singleton keys (pre-multi-token). Read once for migration, then
// cleared so this only runs a single time per install.
const LEGACY_TOKEN_HASH_KEY = "mcp_token_hash";
const LEGACY_CREATED_AT_KEY = "mcp_token_created_at";
const LEGACY_LAST_USED_KEY = "mcp_token_last_used_at";

const TOKEN_BYTES = 32;

// Debounce last-used persistence per token: recording it on every MCP request
// would write to SQLite on every tool call. In-memory map, keyed by token id.
const USAGE_PERSIST_INTERVAL_MS = 60_000;

export interface McpTokenToolPermission {
  name: string;
  category: string;
  title: string;
  description: string;
  readOnly: boolean;
  enabled: boolean;
  isOverride: boolean;
}

/** Per-category rollup of a token's resolved tool permissions, for the token list UI. */
export type McpTokenCategoryStatus = "full" | "none" | "partial";

export interface McpTokenSummary {
  id: number;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  accessLevel: McpTokenAccessLevel;
  status: "active" | "expired" | "revoked";
  categories: Record<string, McpTokenCategoryStatus>;
}

/** Rolls up per-tool resolution into one status per category, for a compact list-view badge. */
function computeCategorySummary(
  catalog: McpToolMeta[],
  accessLevel: McpTokenAccessLevel,
  overrides: Map<string, boolean>,
): Record<string, McpTokenCategoryStatus> {
  const enabledByCategory = new Map<string, boolean[]>();
  for (const tool of catalog) {
    const enabled = resolveToolEnabled(tool.readOnly, accessLevel, overrides.get(tool.name));
    const list = enabledByCategory.get(tool.category) ?? [];
    list.push(enabled);
    enabledByCategory.set(tool.category, list);
  }

  const result: Record<string, McpTokenCategoryStatus> = {};
  for (const [category, values] of enabledByCategory) {
    result[category] = values.every(Boolean)
      ? "full"
      : values.every((v) => !v)
        ? "none"
        : "partial";
  }
  return result;
}

function summarize(row: McpTokenRow, catalog: McpToolMeta[]): McpTokenSummary {
  const isExpired = !!row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now();
  const status: McpTokenSummary["status"] = row.revokedAt
    ? "revoked"
    : isExpired
      ? "expired"
      : "active";
  const overrides = new Map(
    McpTokenToolOverrideRepository.listForToken(row.id).map((o) => [o.toolName, o.enabled]),
  );
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    accessLevel: row.accessLevel,
    status,
    categories: computeCategorySummary(catalog, row.accessLevel, overrides),
  };
}

class McpAuthService {
  private lastPersistedUseMsById = new Map<number, number>();
  private legacyMigrationDone = false;

  /**
   * One-time migration from the old single-token AppConfig entry to a named
   * row in mcp_tokens, preserving its original created/last-used timestamps.
   * Safe to call on every boot: no-op once the legacy keys are gone.
   */
  migrateLegacyTokenIfNeeded(): void {
    if (this.legacyMigrationDone) return;
    this.legacyMigrationDone = true;

    const legacyHash = AppConfigRepository.get(LEGACY_TOKEN_HASH_KEY);
    if (!legacyHash) return;

    const createdAt = AppConfigRepository.get(LEGACY_CREATED_AT_KEY) ?? new Date().toISOString();
    const lastUsedAt = AppConfigRepository.get(LEGACY_LAST_USED_KEY);
    McpTokenRepository.insertLegacy("Migrated (legacy)", legacyHash, createdAt, lastUsedAt);

    AppConfigRepository.delete(LEGACY_TOKEN_HASH_KEY);
    AppConfigRepository.delete(LEGACY_CREATED_AT_KEY);
    AppConfigRepository.delete(LEGACY_LAST_USED_KEY);
  }

  /**
   * Generate a new named token and return its plaintext value. The caller
   * (API route or CLI script) is responsible for displaying it once: it is
   * never persisted or retrievable in plaintext again.
   */
  generateToken(
    name: string,
    expiresAt: Date | null,
    accessLevel: McpTokenAccessLevel = "full",
  ): { token: string; summary: McpTokenSummary } {
    const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");
    const row = McpTokenRepository.create(name, this.hash(token), expiresAt, accessLevel);
    if (!row) {
      throw new Error(
        "Failed to persist the MCP token to the database: the token was NOT saved and will not work. " +
          "This usually means the database file is not writable by the current user (see server logs above for the underlying error).",
      );
    }
    return { token, summary: summarize(row, getToolCatalog()) };
  }

  listTokens(): McpTokenSummary[] {
    const catalog = getToolCatalog();
    return McpTokenRepository.listAll().map((row) => summarize(row, catalog));
  }

  revokeToken(id: number): boolean {
    this.lastPersistedUseMsById.delete(id);
    return McpTokenRepository.revoke(id);
  }

  /**
   * Permanently removes a token row (and its overrides). Refuses to purge a
   * still-active token: it must be revoked first, so a client relying on it
   * always loses access explicitly rather than via an unrelated cleanup click.
   */
  purgeToken(id: number): { purged: boolean; reason?: "not_found" | "still_active" } {
    const row = McpTokenRepository.findById(id);
    if (!row) return { purged: false, reason: "not_found" };

    const isExpired = !!row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now();
    const isActive = !row.revokedAt && !isExpired;
    if (isActive) return { purged: false, reason: "still_active" };

    this.lastPersistedUseMsById.delete(id);
    return { purged: McpTokenRepository.purge(id) };
  }

  setTokenAccessLevel(id: number, accessLevel: McpTokenAccessLevel): boolean {
    return McpTokenRepository.setAccessLevel(id, accessLevel);
  }

  /** Tool catalog merged with this token's resolved permissions, for the admin UI. */
  getTokenToolPermissions(id: number): McpTokenToolPermission[] | null {
    const token = McpTokenRepository.findById(id);
    if (!token) return null;

    const overrides = new Map(
      McpTokenToolOverrideRepository.listForToken(id).map((o) => [o.toolName, o.enabled]),
    );

    return getToolCatalog().map((tool) => {
      const override = overrides.get(tool.name);
      return {
        ...tool,
        enabled: resolveToolEnabled(tool.readOnly, token.accessLevel, override),
        isOverride: override !== undefined,
      };
    });
  }

  setTokenToolOverride(tokenId: number, toolName: string, enabled: boolean): boolean {
    return McpTokenToolOverrideRepository.setOverride(tokenId, toolName, enabled);
  }

  clearTokenToolOverride(tokenId: number, toolName: string): boolean {
    return McpTokenToolOverrideRepository.clearOverride(tokenId, toolName);
  }

  isConfigured(): boolean {
    return McpTokenRepository.hasActive();
  }

  /**
   * Runtime kill switch, independent of the MCP_ENABLED env var (which only
   * takes effect on the next restart). Toggled instantly from the admin UI,
   * e.g. to cut MCP access immediately if a client machine holding a token is
   * suspected compromised, without touching docker-compose.yml.
   * Absent key = enabled (default), so existing deployments aren't affected.
   */
  isRuntimeEnabled(): boolean {
    return AppConfigRepository.get(RUNTIME_DISABLED_KEY) !== "true";
  }

  setRuntimeEnabled(enabled: boolean): void {
    const saved = enabled
      ? AppConfigRepository.delete(RUNTIME_DISABLED_KEY)
      : AppConfigRepository.set(RUNTIME_DISABLED_KEY, "true");
    if (!saved) {
      throw new Error(
        "Failed to persist the MCP enabled/disabled state to the database.",
      );
    }
  }

  /** Returns the matched token's id on success, so callers can record usage. */
  verifyToken(candidate: string): number | null {
    if (!candidate) return null;
    const candidateBuf = Buffer.from(this.hash(candidate), "hex");

    for (const row of McpTokenRepository.listActive()) {
      const storedBuf = Buffer.from(row.tokenHash, "hex");
      if (storedBuf.length !== candidateBuf.length) continue;
      if (crypto.timingSafeEqual(storedBuf, candidateBuf)) return row.id;
    }
    return null;
  }

  /** Called by mcpAuthMiddleware after a successful token check. Debounced to ~1/min per token. */
  recordUsage(id: number): void {
    const now = Date.now();
    const lastPersisted = this.lastPersistedUseMsById.get(id) ?? 0;
    if (now - lastPersisted < USAGE_PERSIST_INTERVAL_MS) return;
    this.lastPersistedUseMsById.set(id, now);
    McpTokenRepository.touchLastUsed(id);
  }

  getStatus(): {
    configured: boolean;
    runtimeEnabled: boolean;
  } {
    return {
      configured: this.isConfigured(),
      runtimeEnabled: this.isRuntimeEnabled(),
    };
  }

  private hash(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
  }
}

export const mcpAuthService = new McpAuthService();
