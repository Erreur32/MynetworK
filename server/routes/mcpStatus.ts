// Read-only MCP status + the runtime enable/disable toggle for the admin UI.
// Guarded by the existing JWT auth (requireAuth + requireAdmin), NOT by
// mcpAuthMiddleware: this endpoint never exposes the token itself, only
// whether one is configured.
import { Router, Response } from "express";
import { config } from "../config.js";
import { mcpAuthService } from "../services/mcpAuthService.js";
import {
  requireAuth,
  requireAdmin,
  AuthenticatedRequest,
} from "../middleware/authMiddleware.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import { getActiveMcpSessionCount } from "../mcp/sessionRegistry.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    const status = mcpAuthService.getStatus();
    res.json({
      success: true,
      result: {
        enabled: config.mcp.enabled,
        runtimeEnabled: status.runtimeEnabled,
        configured: status.configured,
        endpoint: "/api/mcp",
        createdAt: status.createdAt,
        lastUsedAt: status.lastUsedAt,
        // LAN-reachable host/port, not the container's internal address:
        // same env vars and fallback as scripts/mcp-token.ts and the
        // server startup banner. hostIp is null when HOST_IP isn't set.
        hostIp: process.env.HOST_IP || null,
        dashboardPort: process.env.DASHBOARD_PORT || "7505",
        activeSessions: getActiveMcpSessionCount(),
      },
    });
  }),
);

// Instant kill switch, independent of the MCP_ENABLED env var (which only
// takes effect on the next container restart), e.g. to cut MCP access
// immediately if a client machine holding the token is suspected compromised.
router.post(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== "boolean") {
      res.status(400).json({ success: false, error: "'enabled' must be a boolean" });
      return;
    }

    mcpAuthService.setRuntimeEnabled(enabled);
    logger.warn(
      "MCP",
      `MCP runtime access ${enabled ? "re-enabled" : "disabled"} by ${req.user?.username ?? "admin"} via the admin panel`,
    );

    res.json({ success: true, result: { runtimeEnabled: enabled } });
  }),
);

export default router;
