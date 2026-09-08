// Read-only MCP status for the admin UI. Guarded by the existing JWT auth
// (requireAuth + requireAdmin), NOT by mcpAuthMiddleware — this endpoint
// never exposes the token itself, only whether one is configured.
import { Router, Response } from "express";
import { config } from "../config.js";
import { mcpAuthService } from "../services/mcpAuthService.js";
import {
  requireAuth,
  requireAdmin,
  AuthenticatedRequest,
} from "../middleware/authMiddleware.js";
import { asyncHandler } from "../middleware/errorHandler.js";

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
        configured: status.configured,
        endpoint: "/api/mcp",
        createdAt: status.createdAt,
        lastUsedAt: status.lastUsedAt,
      },
    });
  }),
);

export default router;
