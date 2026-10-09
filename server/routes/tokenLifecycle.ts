// Token lifecycle routes (list, create, revoke, purge) shared by the MCP
// token admin page (/api/mcp/tokens) and the REST API token page
// (/api/api-tokens). Each mount only sees and manages its own kind of token.
// Creating a token mints a working credential, so every create/revoke/purge
// is logged with the acting admin's username.
import { Router, Response } from "express";
import { mcpAuthService } from "../services/mcpAuthService.js";
import { McpTokenAccessLevel, McpTokenKind } from "../database/models/McpToken.js";
import {
  requireAuth,
  requireAdmin,
  AuthenticatedRequest,
} from "../middleware/authMiddleware.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import { parseStrictIntParam } from "../utils/params.js";

const NAME_MAX_LENGTH = 100;
const MAX_EXPIRES_IN_DAYS = 3650; // 10 years, well beyond the offered presets

export const VALID_ACCESS_LEVELS: McpTokenAccessLevel[] = ["full", "read_only"];

export function isValidAccessLevel(value: unknown): value is McpTokenAccessLevel {
  return typeof value === "string" && (VALID_ACCESS_LEVELS as string[]).includes(value);
}

// REST API tokens are read-only by design (GET allowlist enforced in
// apiTokenAuth.ts); MCP tokens pick their level at creation.
const ALLOWED_LEVELS_BY_KIND: Record<McpTokenKind, McpTokenAccessLevel[]> = {
  mcp: VALID_ACCESS_LEVELS,
  api: ["read_only"],
};
const DEFAULT_LEVEL_BY_KIND: Record<McpTokenKind, McpTokenAccessLevel> = {
  mcp: "full",
  api: "read_only",
};
const LOG_LABEL: Record<McpTokenKind, string> = { mcp: "MCP", api: "API token" };

function parseExpiresAt(expiresInDays: unknown): Date | null | undefined {
  if (expiresInDays === null || expiresInDays === undefined) return null;
  if (
    typeof expiresInDays !== "number" ||
    !Number.isInteger(expiresInDays) ||
    expiresInDays < 1 ||
    expiresInDays > MAX_EXPIRES_IN_DAYS
  ) {
    return undefined;
  }
  return new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
}

export function registerTokenLifecycleRoutes(router: Router, kind: McpTokenKind): void {
  const label = LOG_LABEL[kind];
  const allowedLevels = ALLOWED_LEVELS_BY_KIND[kind];

  router.get(
    "/",
    requireAuth,
    requireAdmin,
    asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
      res.json({ success: true, result: mcpAuthService.listTokens(kind) });
    }),
  );

  router.post(
    "/",
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { name, expiresInDays, accessLevel } = req.body as {
        name?: unknown;
        expiresInDays?: unknown;
        accessLevel?: unknown;
      };

      if (typeof name !== "string" || !name.trim()) {
        res.status(400).json({ success: false, error: "'name' is required" });
        return;
      }
      const trimmedName = name.trim().slice(0, NAME_MAX_LENGTH);

      const resolvedAccessLevel = accessLevel ?? DEFAULT_LEVEL_BY_KIND[kind];
      if (!isValidAccessLevel(resolvedAccessLevel) || !allowedLevels.includes(resolvedAccessLevel)) {
        res.status(400).json({
          success: false,
          error: `'accessLevel' must be one of: ${allowedLevels.join(", ")}`,
        });
        return;
      }

      const expiresAt = parseExpiresAt(expiresInDays);
      if (expiresAt === undefined) {
        res.status(400).json({
          success: false,
          error: `'expiresInDays' must be an integer between 1 and ${MAX_EXPIRES_IN_DAYS}, or null for no expiry`,
        });
        return;
      }

      try {
        const { token, summary } = mcpAuthService.generateToken(
          trimmedName,
          expiresAt,
          resolvedAccessLevel,
          kind,
        );
        logger.warn(
          "MCP",
          `${label} "${trimmedName}" created by ${req.user?.username ?? "admin"}` +
            (expiresAt ? `, expires ${expiresAt.toISOString()}` : ", no expiry") +
            `, access level: ${resolvedAccessLevel}`,
        );
        res.json({ success: true, result: { ...summary, token } });
      } catch (error) {
        logger.error("MCP", `Failed to create ${label}:`, error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Failed to create token",
        });
      }
    }),
  );

  router.delete(
    "/:id",
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const id = parseStrictIntParam(req, "id");
      if (id === null) {
        res.status(400).json({ success: false, error: "Invalid token id" });
        return;
      }

      if (!mcpAuthService.revokeToken(id, kind)) {
        res.status(404).json({ success: false, error: "Token not found or already revoked" });
        return;
      }

      logger.warn("MCP", `${label} #${id} revoked by ${req.user?.username ?? "admin"}`);
      res.json({ success: true, result: { id } });
    }),
  );

  router.delete(
    "/:id/purge",
    requireAuth,
    requireAdmin,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const id = parseStrictIntParam(req, "id");
      if (id === null) {
        res.status(400).json({ success: false, error: "Invalid token id" });
        return;
      }

      const { purged, reason } = mcpAuthService.purgeToken(id, kind);
      if (!purged) {
        if (reason === "still_active") {
          res.status(409).json({
            success: false,
            error: "Token is still active: revoke it first before deleting it",
          });
          return;
        }
        res.status(404).json({ success: false, error: "Token not found" });
        return;
      }

      logger.warn("MCP", `${label} #${id} permanently deleted by ${req.user?.username ?? "admin"}`);
      res.json({ success: true, result: { id } });
    }),
  );
}
