// MCP token management for the admin UI: lifecycle (list, create, revoke,
// purge, see tokenLifecycle.ts) plus MCP-only access level and per-tool overrides.
// Guarded by requireAuth + requireAdmin, same as mcpStatus.ts. Creating a
// token here is a sensitive action (it mints a working MCP credential), so
// every create/revoke is logged with the acting admin's username.
import { Router, Response } from "express";
import { mcpAuthService } from "../services/mcpAuthService.js";
import { getToolCatalog } from "../mcp/toolCatalog.js";
import { reapplyMcpTokenPermissions } from "./mcp.js";
import {
  requireAuth,
  requireAdmin,
  AuthenticatedRequest,
} from "../middleware/authMiddleware.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import { parseStrictIntParam } from "../utils/params.js";
import {
  registerTokenLifecycleRoutes,
  isValidAccessLevel,
  VALID_ACCESS_LEVELS,
} from "./tokenLifecycle.js";

const router = Router();

registerTokenLifecycleRoutes(router, "mcp");

router.patch(
  "/:id/access-level",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = parseStrictIntParam(req, "id");
    if (id === null) {
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
    reapplyMcpTokenPermissions(id);

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
    const id = parseStrictIntParam(req, "id");
    if (id === null) {
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

/**
 * Shared id + toolName validation for the /:id/tools/:name routes below.
 * Writes the 400/404 error response itself and returns null on failure,
 * mirroring parseStrictIntParam's non-throwing convention.
 */
function validateIdAndToolName(req: AuthenticatedRequest, res: Response): { id: number; toolName: string } | null {
  const id = parseStrictIntParam(req, "id");
  if (id === null) {
    res.status(400).json({ success: false, error: "Invalid token id" });
    return null;
  }

  const toolName = findToolName(req.params.name);
  if (!toolName) {
    res.status(404).json({ success: false, error: "Unknown tool" });
    return null;
  }

  return { id, toolName };
}

router.put(
  "/:id/tools/:name",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const validated = validateIdAndToolName(req, res);
    if (!validated) return;
    const { id, toolName } = validated;

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
    reapplyMcpTokenPermissions(id);

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
    const validated = validateIdAndToolName(req, res);
    if (!validated) return;
    const { id, toolName } = validated;

    const cleared = mcpAuthService.clearTokenToolOverride(id, toolName);
    if (!cleared) {
      res.status(500).json({ success: false, error: "Failed to clear override" });
      return;
    }
    reapplyMcpTokenPermissions(id);

    logger.warn(
      "MCP",
      `MCP token #${id} tool override "${toolName}" cleared by ${req.user?.username ?? "admin"}`,
    );
    res.json({ success: true, result: { id, toolName } });
  }),
);

export default router;
