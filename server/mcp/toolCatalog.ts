// Single source of truth for "what tools does this server expose", built by
// introspecting a throwaway McpServer instance instead of hardcoding a
// duplicate list, so it can never drift from server/mcp/tools/*.ts.
import { createMynetworkMcpServer } from "./server.js";

export interface McpToolMeta {
  name: string;
  category: string;
  title: string;
  description: string;
  readOnly: boolean;
}

interface RegisteredToolLike {
  title?: string;
  description?: string;
  annotations?: { readOnlyHint?: boolean };
}

export function getToolCatalog(): McpToolMeta[] {
  const server = createMynetworkMcpServer();
  const registered = (server as unknown as {
    _registeredTools: Record<string, RegisteredToolLike>;
  })._registeredTools;

  const tools = Object.entries(registered).map(([name, tool]) => ({
    name,
    category: name.split("_")[0] ?? "other",
    title: tool.title ?? name,
    description: tool.description ?? "",
    readOnly: tool.annotations?.readOnlyHint ?? false,
  }));

  tools.sort((a, b) => a.name.localeCompare(b.name));
  return tools;
}
