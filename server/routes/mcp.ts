// Streamable HTTP transport for the MCP server, mounted at /api/mcp.
// Session lifecycle follows the official SDK pattern: a session is created
// on `initialize`, then reused via the Mcp-Session-Id header. Idle sessions
// (no activity for 30 min) are swept periodically so a client that vanishes
// without sending DELETE doesn't leak memory.
import { randomUUID } from "crypto";
import { Router, Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createMynetworkMcpServer } from "../mcp/server.js";
import { mcpAuthMiddleware } from "../middleware/mcpAuthMiddleware.js";
import {
  registerMcpSession,
  unregisterMcpSession,
} from "../mcp/sessionRegistry.js";
import { logger } from "../utils/logger.js";

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
}

const sessions = new Map<string, SessionEntry>();

function touchSession(sessionId: string): void {
  const entry = sessions.get(sessionId);
  if (entry) entry.lastActivity = Date.now();
}

function closeSession(sessionId: string): void {
  const entry = sessions.get(sessionId);
  if (!entry) return;
  sessions.delete(sessionId);
  unregisterMcpSession();
  entry.transport.close().catch((error: Error) => {
    logger.warn("MCP", `Error closing session ${sessionId}: ${error.message}`);
  });
}

const sweepInterval = setInterval(() => {
  const now = Date.now();
  for (const [sessionId, entry] of sessions) {
    if (now - entry.lastActivity > SESSION_IDLE_TIMEOUT_MS) {
      logger.debug("MCP", `Closing idle session ${sessionId}`);
      closeSession(sessionId);
    }
  }
}, SESSION_SWEEP_INTERVAL_MS);
sweepInterval.unref();

const router = Router();
router.use(mcpAuthMiddleware);

router.post("/", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && sessions.has(sessionId)) {
    touchSession(sessionId);
    transport = sessions.get(sessionId)!.transport;
  } else if (!sessionId && isInitializeRequest(req.body)) {
    const server = createMynetworkMcpServer();
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId: string) => {
        sessions.set(newSessionId, { transport, lastActivity: Date.now() });
        registerMcpSession();
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
  req: Request,
  res: Response,
): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const entry = sessionId ? sessions.get(sessionId) : undefined;

  if (!entry) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Invalid or missing session ID" },
      id: null,
    });
    return;
  }

  touchSession(sessionId!);
  await entry.transport.handleRequest(req, res);
}

router.get("/", handleSessionRequest);
router.delete("/", handleSessionRequest);

export default router;
