// Resolves which tools a given MCP token may use, and applies that
// resolution to a live McpServer instance. Re-evaluated on every new
// session, and on open sessions whenever an admin edits the token's
// permissions, from the token's current access_level + overrides, never a
// snapshot taken at token-creation time: a future write tool added to the
// codebase is automatically blocked for existing read_only tokens.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpTokenRepository, McpTokenAccessLevel } from "../database/models/McpToken.js";
import { McpTokenToolOverrideRepository } from "../database/models/McpTokenToolOverride.js";

interface RegisteredToolLike {
  enabled: boolean;
  annotations?: { readOnlyHint?: boolean };
  enable: () => void;
  disable: () => void;
}

export function resolveToolEnabled(
  readOnly: boolean,
  accessLevel: McpTokenAccessLevel,
  override: boolean | undefined,
): boolean {
  if (override !== undefined) return override;
  if (accessLevel === "read_only") return readOnly;
  return true;
}

/**
 * Applies a token's permissions to an MCP server: a freshly created one
 * before it is connected, or a live session's one after an admin changed
 * the token's permissions. Only tools whose state changes are toggled, since
 * each toggle on a connected server emits a tools/list_changed notification.
 * No-op if the token can't be found, since verifyToken() already guaranteed
 * it exists and is active.
 */
export function applyTokenToolPermissions(server: McpServer, tokenId: number): void {
  const token = McpTokenRepository.findById(tokenId);
  if (!token) return;

  const overrides = new Map(
    McpTokenToolOverrideRepository.listForToken(tokenId).map((o) => [o.toolName, o.enabled]),
  );

  const registered = (server as unknown as {
    _registeredTools: Record<string, RegisteredToolLike>;
  })._registeredTools;

  for (const [name, tool] of Object.entries(registered)) {
    const readOnly = tool.annotations?.readOnlyHint ?? false;
    const enabled = resolveToolEnabled(readOnly, token.accessLevel, overrides.get(name));
    if (enabled === tool.enabled) continue;
    if (enabled) tool.enable();
    else tool.disable();
  }
}
