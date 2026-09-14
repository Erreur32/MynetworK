// Factory for a per-session MyNetwork MCP server. A new instance is created
// for each Streamable HTTP session (see server/routes/mcp.ts).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerFreeboxTools } from './tools/freebox.js';
import { registerUnifiTools } from './tools/unifi.js';
import { registerScannerTools } from './tools/scanner.js';
import { applyTokenToolPermissions } from './toolPermissions.js';

// tokenId is omitted when building the catalog-introspection instance used
// by server/mcp/toolCatalog.ts (full access, never connected to a transport).
export function createMynetworkMcpServer(tokenId?: number): McpServer {
  const server = new McpServer({
    name: 'mynetwork',
    version: '1.0.0'
  });

  registerFreeboxTools(server);
  registerUnifiTools(server);
  registerScannerTools(server);

  if (tokenId !== undefined) {
    applyTokenToolPermissions(server, tokenId);
  }

  return server;
}
