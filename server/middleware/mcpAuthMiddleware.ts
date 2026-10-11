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
import {
  isPrivateNetworkIp,
  isTailscaleIp,
  isValidIp,
  isIpInCidrs,
  parseIpv4Cidrs,
  unwrapIpv4Mapped,
  type Ipv4Cidr,
} from "../utils/networkValidation.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

export interface McpAuthenticatedRequest extends Request {
  mcpTokenId?: number;
}

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

const { cidrs: TRUSTED_PROXIES, invalid: INVALID_PROXY_ENTRIES } = parseIpv4Cidrs(
  config.mcp.trustedProxies,
);
if (INVALID_PROXY_ENTRIES.length > 0) {
  logger.warn(
    "MCP",
    `MCP_TRUSTED_PROXIES: ignoring invalid entries: ${INVALID_PROXY_ENTRIES.join(", ")}`,
  );
}

/**
 * Address of the client as the LAN-only check must see it. By default the
 * actual TCP peer, not req.ip (derived from the spoofable X-Forwarded-For
 * header via trust proxy): this app is also reachable on a directly-published
 * Docker port, bypassing the reverse proxy entirely, so an attacker on that
 * path could set X-Forwarded-For to any private IP.
 *
 * Only when the TCP peer is listed in MCP_TRUSTED_PROXIES is X-Forwarded-For
 * read, walking it from the right and skipping trusted proxies: the first
 * other entry was appended by our own proxy chain, entries to its left are
 * client-supplied. Returns "" (refused) when no usable address is found.
 */
export function resolveClientIp(
  req: Request,
  trustedProxies: readonly Ipv4Cidr[] = TRUSTED_PROXIES,
): string {
  const peer = req.socket.remoteAddress || "";
  if (trustedProxies.length === 0 || !isIpInCidrs(peer, trustedProxies)) return peer;

  const forwarded = String(req.headers["x-forwarded-for"] ?? "")
    .split(",")
    .map((entry) => unwrapIpv4Mapped(entry.trim()))
    .reverse();
  for (const entry of forwarded) {
    if (!isValidIp(entry)) return "";
    if (!isIpInCidrs(entry, trustedProxies)) return entry;
  }
  return "";
}

/** Bearer-token clients (MCP and REST API tokens) are only accepted from the local network or Tailscale. */
export function isTrustedNetworkClient(req: Request): boolean {
  const clientIp = resolveClientIp(req);
  return isPrivateNetworkIp(clientIp) || isTailscaleIp(clientIp);
}

export const mcpAuthMiddleware = (
  req: McpAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void => {
  if (!mcpAuthService.isRuntimeEnabled()) {
    jsonRpcError(
      res,
      503,
      -32000,
      "MCP access has been disabled by the administrator.",
    );
    return;
  }

  if (!isTrustedNetworkClient(req)) {
    jsonRpcError(
      res,
      403,
      -32000,
      "MCP access is restricted to the local network and Tailscale",
    );
    return;
  }

  if (!mcpAuthService.isConfigured()) {
    jsonRpcError(
      res,
      503,
      -32000,
      "No MCP token configured. Create one from the admin panel (MCP > Setup).",
    );
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    jsonRpcError(res, 401, -32000, "Missing bearer token");
    return;
  }

  const token = authHeader.substring(7);
  const tokenRow = mcpAuthService.verifyToken(token, "mcp");
  if (!tokenRow) {
    jsonRpcError(res, 401, -32000, "Invalid bearer token");
    return;
  }

  mcpAuthService.recordUsage(tokenRow.id);
  req.mcpTokenId = tokenRow.id;
  next();
};
