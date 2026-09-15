// Tracks live MCP Streamable HTTP sessions for the admin UI: who is
// connected (token, IP, user-agent) and since when, without exposing
// transport internals to routes outside server/routes/mcp.ts.

export interface McpSessionInfo {
  sessionId: string;
  tokenId: number | undefined;
  ip: string;
  userAgent: string;
  connectedAt: number;
  lastActivity: number;
}

const sessions = new Map<string, McpSessionInfo>();

export function registerMcpSession(
  sessionId: string,
  tokenId: number | undefined,
  ip: string,
  userAgent: string,
): void {
  const now = Date.now();
  sessions.set(sessionId, {
    sessionId,
    tokenId,
    ip,
    userAgent,
    connectedAt: now,
    lastActivity: now,
  });
}

export function touchMcpSession(sessionId: string): void {
  const entry = sessions.get(sessionId);
  if (entry) entry.lastActivity = Date.now();
}

export function unregisterMcpSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function getMcpSessionInfo(sessionId: string): McpSessionInfo | undefined {
  return sessions.get(sessionId);
}

export function getActiveMcpSessions(): McpSessionInfo[] {
  return Array.from(sessions.values());
}
