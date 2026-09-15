// Streamable HTTP transport for the MCP server, mounted at /api/mcp.
// Session lifecycle follows the official SDK pattern: a session is created
// on `initialize`, then reused via the Mcp-Session-Id header. Idle sessions
// (no activity for 30 min) are swept periodically so a client that vanishes
// without sending DELETE doesn't leak memory.
import { randomUUID } from "crypto";
import { Router, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createMynetworkMcpServer } from "../mcp/server.js";
import {
  mcpAuthMiddleware,
  McpAuthenticatedRequest,
} from "../middleware/mcpAuthMiddleware.js";
import {
  registerMcpSession,
  touchMcpSession,
  unregisterMcpSession,
  getMcpSessionInfo,
  getActiveMcpSessions,
} from "../mcp/sessionRegistry.js";
import { logger } from "../utils/logger.js";

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function sessionOwnershipError(res: Response): void {
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Invalid or missing session ID" },
    id: null,
  });
}

// Transport objects live only here, never in sessionRegistry: the registry
// exposes session metadata (token, IP, user-agent, activity) to the admin
// UI, but transport internals stay private to this router.
const transports = new Map<string, StreamableHTTPServerTransport>();

function closeSession(sessionId: string): void {
  const transport = transports.get(sessionId);
  if (!transport) return;
  transports.delete(sessionId);
  unregisterMcpSession(sessionId);
  transport.close().catch((error: Error) => {
    logger.warn("MCP", `Error closing session ${sessionId}: ${error.message}`);
  });
}

const sweepInterval = setInterval(() => {
  const now = Date.now();
  for (const info of getActiveMcpSessions()) {
    if (now - info.lastActivity > SESSION_IDLE_TIMEOUT_MS) {
      logger.debug("MCP", `Closing idle session ${info.sessionId}`);
      closeSession(info.sessionId);
    }
  }
}, SESSION_SWEEP_INTERVAL_MS);
sweepInterval.unref();

const router = Router();
router.use(mcpAuthMiddleware);

router.post("/", async (req: McpAuthenticatedRequest, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports.has(sessionId)) {
    const info = getMcpSessionInfo(sessionId);
    if (!info || info.tokenId !== req.mcpTokenId) {
      sessionOwnershipError(res);
      return;
    }
    touchMcpSession(sessionId);
    transport = transports.get(sessionId)!;
  } else if (!sessionId && isInitializeRequest(req.body)) {
    const tokenId = req.mcpTokenId;
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";
    const server = createMynetworkMcpServer(tokenId);
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId: string) => {
        transports.set(newSessionId, transport);
        registerMcpSession(newSessionId, tokenId, ip, userAgent);
        logger.info("MCP", `Session initialized: ${newSessionId}`);
      },
      onsessionclosed: (closedSessionId: string) => {
        closeSession(closedSessionId);
      },
    });

    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: no valid session ID provided",
      },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

async function handleSessionRequest(
  req: McpAuthenticatedRequest,
  res: Response,
): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? transports.get(sessionId) : undefined;
  const info = sessionId ? getMcpSessionInfo(sessionId) : undefined;

  if (!transport || !info) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Invalid or missing session ID" },
      id: null,
    });
    return;
  }

  if (info.tokenId !== req.mcpTokenId) {
    sessionOwnershipError(res);
    return;
  }

  touchMcpSession(sessionId!);
  await transport.handleRequest(req, res);
}

router.get("/", handleSessionRequest);
router.delete("/", handleSessionRequest);

export default router;
