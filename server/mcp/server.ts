// Factory for a per-session MyNetwork MCP server. A new instance is created
// for each Streamable HTTP session (see server/routes/mcp.ts).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerFreeboxTools } from './tools/freebox.js';
import { registerUnifiTools } from './tools/unifi.js';
import { registerScannerTools } from './tools/scanner.js';

export function createMynetworkMcpServer(): McpServer {
  const server = new McpServer({
    name: 'mynetwork',
    version: '1.0.0'
  });

  registerFreeboxTools(server);
  registerUnifiTools(server);
  registerScannerTools(server);

  return server;
}
