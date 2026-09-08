/**
 * MCP authentication service
 *
 * Manages the single bearer token used to authenticate MCP clients.
 * Separate from the JWT auth used by the web UI: this token is long-lived
 * (no expiry) and stored as a SHA-256 hash via the generic AppConfig
 * key/value store, mirroring the TokenBlacklist hashing pattern.
 */
import crypto from "crypto";
import { AppConfigRepository } from "../database/models/AppConfig.js";

const TOKEN_HASH_KEY = "mcp_token_hash";
const CREATED_AT_KEY = "mcp_token_created_at";
const LAST_USED_KEY = "mcp_token_last_used_at";
const RUNTIME_DISABLED_KEY = "mcp_runtime_disabled";

const TOKEN_BYTES = 32;

// AppConfigRepository.set() checkpoints the WAL on every call, so recording
// "last used" on every MCP request would force a checkpoint per tool call.
// Debounce persistence instead; in-memory reads (getStatus) are unaffected.
const USAGE_PERSIST_INTERVAL_MS = 60_000;

class McpAuthService {
  private lastPersistedUseMs = 0;

  /**
   * Generate a new token, store its hash, and return the plaintext value.
   * The caller (scripts/mcp-token.ts) is responsible for displaying it once.
   * Re-running this rotates/revokes the previous token.
   *
   * Throws if the hash can't be persisted, e.g. a read-only database file
   * (common when `docker exec` runs as a different user than the app's
   * process, which owns the SQLite file), rather than returning a token
   * that looks valid but was never actually saved.
   */
  generateToken(): string {
    const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");
    const hashSaved = AppConfigRepository.set(TOKEN_HASH_KEY, this.hash(token));
    if (!hashSaved) {
      throw new Error(
        "Failed to persist the MCP token hash to the database: the token was NOT saved and will not work. " +
          "This usually means the database file is not writable by the current user (see server logs above for the underlying error).",
      );
    }
    AppConfigRepository.set(CREATED_AT_KEY, new Date().toISOString());
    AppConfigRepository.delete(LAST_USED_KEY);
    this.lastPersistedUseMs = 0;
    return token;
  }

  revokeToken(): void {
    AppConfigRepository.delete(TOKEN_HASH_KEY);
    AppConfigRepository.delete(CREATED_AT_KEY);
    AppConfigRepository.delete(LAST_USED_KEY);
    this.lastPersistedUseMs = 0;
  }

  isConfigured(): boolean {
    return !!AppConfigRepository.get(TOKEN_HASH_KEY);
  }

  /**
   * Runtime kill switch, independent of the MCP_ENABLED env var (which only
   * takes effect on the next restart). Toggled instantly from the admin UI,
   * e.g. to cut MCP access immediately if a client machine holding the token
   * is suspected compromised, without touching docker-compose.yml.
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

  verifyToken(candidate: string): boolean {
    const storedHash = AppConfigRepository.get(TOKEN_HASH_KEY);
    if (!storedHash || !candidate) return false;

    const candidateHash = this.hash(candidate);
    const storedBuf = Buffer.from(storedHash, "hex");
    const candidateBuf = Buffer.from(candidateHash, "hex");
    if (storedBuf.length !== candidateBuf.length) return false;

    return crypto.timingSafeEqual(storedBuf, candidateBuf);
  }

  /** Called by mcpAuthMiddleware after a successful token check. Debounced to ~1/min. */
  recordUsage(): void {
    const now = Date.now();
    if (now - this.lastPersistedUseMs < USAGE_PERSIST_INTERVAL_MS) return;
    this.lastPersistedUseMs = now;
    AppConfigRepository.set(LAST_USED_KEY, new Date().toISOString());
  }

  getStatus(): {
    configured: boolean;
    createdAt: string | null;
    lastUsedAt: string | null;
    runtimeEnabled: boolean;
  } {
    return {
      configured: this.isConfigured(),
      createdAt: AppConfigRepository.get(CREATED_AT_KEY),
      lastUsedAt: AppConfigRepository.get(LAST_USED_KEY),
      runtimeEnabled: this.isRuntimeEnabled(),
    };
  }

  private hash(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
  }
}

export const mcpAuthService = new McpAuthService();
