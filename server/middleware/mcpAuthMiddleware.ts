/**
 * MCP authentication middleware
 *
 * Dedicated gate for /api/mcp, fully self-contained (does not rely on any
 * existing route-level auth, since most Freebox REST routes have none today).
 * Order: IP allowlist -> token-configured check -> bearer token check.
 * Errors are formatted as JSON-RPC 2.0, since this only guards the MCP transport.
 */
import { Request, Response, NextFunction } from "express";
import { mcpAuthService } from "../services/mcpAuthService.js";
import { isPrivateNetworkIp } from "../utils/networkValidation.js";

function jsonRpcError(
  res: Response,
  status: number,
  code: number,
  message: string,
) {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

export const mcpAuthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const clientIp = req.ip || req.socket.remoteAddress || "";

  if (!isPrivateNetworkIp(clientIp)) {
    jsonRpcError(
      res,
      403,
      -32000,
      "MCP access is restricted to the local network",
    );
    return;
  }

  if (!mcpAuthService.isConfigured()) {
    jsonRpcError(
      res,
      503,
      -32000,
      "MCP token not configured. Run 'npm run mcp:token' on the server host.",
    );
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    jsonRpcError(res, 401, -32000, "Missing bearer token");
    return;
  }

  const token = authHeader.substring(7);
  if (!mcpAuthService.verifyToken(token)) {
    jsonRpcError(res, 401, -32000, "Invalid bearer token");
    return;
  }

  mcpAuthService.recordUsage();
  next();
};
