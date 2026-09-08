// Tracks the number of live MCP Streamable HTTP sessions, without exposing
// transport internals to routes outside server/routes/mcp.ts.
let activeSessionCount = 0;

export function registerMcpSession(): void {
  activeSessionCount++;
}

export function unregisterMcpSession(): void {
  activeSessionCount = Math.max(0, activeSessionCount - 1);
}

export function getActiveMcpSessionCount(): number {
  return activeSessionCount;
}
