// MCP token management for the admin UI: list, create, revoke.
// Guarded by requireAuth + requireAdmin, same as mcpStatus.ts. Creating a
// token here is a sensitive action (it mints a working MCP credential), so
// every create/revoke is logged with the acting admin's username.
import { Router, Response } from "express";
import { mcpAuthService } from "../services/mcpAuthService.js";
import { McpTokenAccessLevel } from "../database/models/McpToken.js";
import { getToolCatalog } from "../mcp/toolCatalog.js";
import {
  requireAuth,
  requireAdmin,
  AuthenticatedRequest,
} from "../middleware/authMiddleware.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

const router = Router();

const NAME_MAX_LENGTH = 100;
const MAX_EXPIRES_IN_DAYS = 3650; // 10 years, well beyond the offered presets
const VALID_ACCESS_LEVELS: McpTokenAccessLevel[] = ["full", "read_only"];

function isValidAccessLevel(value: unknown): value is McpTokenAccessLevel {
  return typeof value === "string" && (VALID_ACCESS_LEVELS as string[]).includes(value);
}

router.get(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    res.json({ success: true, result: mcpAuthService.listTokens() });
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

    let resolvedAccessLevel: McpTokenAccessLevel = "full";
    if (accessLevel !== undefined) {
      if (!isValidAccessLevel(accessLevel)) {
        res.status(400).json({
          success: false,
          error: `'accessLevel' must be one of: ${VALID_ACCESS_LEVELS.join(", ")}`,
        });
        return;
      }
      resolvedAccessLevel = accessLevel;
    }

    let expiresAt: Date | null = null;
    if (expiresInDays !== null && expiresInDays !== undefined) {
      if (
        typeof expiresInDays !== "number" ||
        !Number.isInteger(expiresInDays) ||
        expiresInDays < 1 ||
        expiresInDays > MAX_EXPIRES_IN_DAYS
      ) {
        res.status(400).json({
          success: false,
          error: `'expiresInDays' must be an integer between 1 and ${MAX_EXPIRES_IN_DAYS}, or null for no expiry`,
        });
        return;
      }
      expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    }

    try {
      const { token, summary } = mcpAuthService.generateToken(
        trimmedName,
        expiresAt,
        resolvedAccessLevel,
      );
      logger.warn(
        "MCP",
        `MCP token "${trimmedName}" created by ${req.user?.username ?? "admin"}` +
          (expiresAt ? `, expires ${expiresAt.toISOString()}` : ", no expiry") +
          `, access level: ${resolvedAccessLevel}`,
      );
      res.json({ success: true, result: { ...summary, token } });
    } catch (error) {
      logger.error("MCP", "Failed to create MCP token:", error);
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
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ success: false, error: "Invalid token id" });
      return;
    }

    const revoked = mcpAuthService.revokeToken(id);
    if (!revoked) {
      res.status(404).json({ success: false, error: "Token not found or already revoked" });
      return;
    }

    logger.warn(
      "MCP",
      `MCP token #${id} revoked by ${req.user?.username ?? "admin"}`,
    );
    res.json({ success: true, result: { id } });
  }),
);

router.delete(
  "/:id/purge",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ success: false, error: "Invalid token id" });
      return;
    }

    const { purged, reason } = mcpAuthService.purgeToken(id);
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

    logger.warn("MCP", `MCP token #${id} permanently deleted by ${req.user?.username ?? "admin"}`);
    res.json({ success: true, result: { id } });
  }),
);

router.patch(
  "/:id/access-level",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ success: false, error: "Invalid token id" });
      return;
    }

    const { accessLevel } = req.body as { accessLevel?: unknown };
    if (!isValidAccessLevel(accessLevel)) {
      res.status(400).json({
        success: false,
        error: `'accessLevel' must be one of: ${VALID_ACCESS_LEVELS.join(", ")}`,
      });
      return;
    }

    const updated = mcpAuthService.setTokenAccessLevel(id, accessLevel);
    if (!updated) {
      res.status(404).json({ success: false, error: "Token not found" });
      return;
    }

    logger.warn(
      "MCP",
      `MCP token #${id} access level set to "${accessLevel}" by ${req.user?.username ?? "admin"}`,
    );
    res.json({ success: true, result: { id, accessLevel } });
  }),
);

router.get(
  "/:id/tools",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ success: false, error: "Invalid token id" });
      return;
    }

    const permissions = mcpAuthService.getTokenToolPermissions(id);
    if (!permissions) {
      res.status(404).json({ success: false, error: "Token not found" });
      return;
    }
    res.json({ success: true, result: permissions });
  }),
);

function findToolName(name: string | string[]): string | undefined {
  if (Array.isArray(name)) return undefined;
  return getToolCatalog().find((tool) => tool.name === name)?.name;
}

router.put(
  "/:id/tools/:name",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ success: false, error: "Invalid token id" });
      return;
    }

    const toolName = findToolName(req.params.name);
    if (!toolName) {
      res.status(404).json({ success: false, error: "Unknown tool" });
      return;
    }

    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== "boolean") {
      res.status(400).json({ success: false, error: "'enabled' must be a boolean" });
      return;
    }

    const saved = mcpAuthService.setTokenToolOverride(id, toolName, enabled);
    if (!saved) {
      res.status(500).json({ success: false, error: "Failed to save override" });
      return;
    }

    logger.warn(
      "MCP",
      `MCP token #${id} tool override "${toolName}" set to ${enabled} by ${req.user?.username ?? "admin"}`,
    );
    res.json({ success: true, result: { id, toolName, enabled } });
  }),
);

router.delete(
  "/:id/tools/:name",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ success: false, error: "Invalid token id" });
      return;
    }

    const toolName = findToolName(req.params.name);
    if (!toolName) {
      res.status(404).json({ success: false, error: "Unknown tool" });
      return;
    }

    const cleared = mcpAuthService.clearTokenToolOverride(id, toolName);
    if (!cleared) {
      res.status(500).json({ success: false, error: "Failed to clear override" });
      return;
    }

    logger.warn(
      "MCP",
      `MCP token #${id} tool override "${toolName}" cleared by ${req.user?.username ?? "admin"}`,
    );
    res.json({ success: true, result: { id, toolName } });
  }),
);

export default router;
