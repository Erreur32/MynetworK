// Freebox MCP tools (phase 1) — read + non-destructive actions only.
// Each tool wraps a freeboxApi method; no business logic lives here.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { freeboxApi } from "../../services/freeboxApi.js";

interface FreeboxLikeResponse {
  success: boolean;
  result?: unknown;
  error_code?: string;
  msg?: string;
}

function toToolResult(response: FreeboxLikeResponse) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(response, null, 2),
      },
    ],
    isError: !response.success,
  };
}

export function registerFreeboxTools(server: McpServer): void {
  server.registerTool(
    "freebox_get_system_info",
    {
      title: "Freebox system info",
      description: "Get Freebox hardware/firmware system information.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => toToolResult(await freeboxApi.getSystemInfo()),
  );

  server.registerTool(
    "freebox_get_connection_status",
    {
      title: "Freebox connection status",
      description:
        "Get the WAN connection status (state, bandwidth, IP addresses).",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => toToolResult(await freeboxApi.getConnectionStatus()),
  );

  server.registerTool(
    "freebox_get_wifi_status",
    {
      title: "Freebox WiFi status",
      description:
        "Get the global WiFi configuration (enabled/disabled, MAC filter mode).",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => toToolResult(await freeboxApi.getWifiConfig()),
  );

  server.registerTool(
    "freebox_get_wifi_stations",
    {
      title: "Freebox WiFi stations",
      description: "List devices currently connected over WiFi.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => toToolResult(await freeboxApi.getWifiStations()),
  );

  server.registerTool(
    "freebox_get_lan_hosts",
    {
      title: "Freebox LAN hosts",
      description: "List devices on the LAN, across all browser interfaces.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const interfaces = await freeboxApi.getLanBrowserInterfaces();
      if (!interfaces.success || !Array.isArray(interfaces.result)) {
        return toToolResult(interfaces);
      }

      const allHosts: unknown[] = [];
      for (const iface of interfaces.result as Array<{ name: string }>) {
        const hosts = await freeboxApi.getLanHosts(iface.name);
        if (hosts.success && Array.isArray(hosts.result)) {
          for (const host of hosts.result) {
            allHosts.push({ ...(host as object), interface: iface.name });
          }
        }
      }

      return toToolResult({ success: true, result: allHosts });
    },
  );

  server.registerTool(
    "freebox_get_dhcp_config",
    {
      title: "Freebox DHCP config",
      description:
        "Get the DHCP server configuration (range, gateway, lease duration).",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => toToolResult(await freeboxApi.getDhcpConfig()),
  );

  server.registerTool(
    "freebox_get_dhcp_leases",
    {
      title: "Freebox DHCP leases",
      description: "List current dynamic DHCP leases.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => toToolResult(await freeboxApi.getDhcpLeases()),
  );

  server.registerTool(
    "freebox_get_switch_ports",
    {
      title: "Freebox switch ports",
      description: "Get the status of the Freebox Ethernet switch ports.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => toToolResult(await freeboxApi.getSwitchPorts()),
  );

  server.registerTool(
    "freebox_get_call_log",
    {
      title: "Freebox call log",
      description: "Get the phone call log (incoming/outgoing/missed).",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => toToolResult(await freeboxApi.getCallLog()),
  );

  server.registerTool(
    "freebox_get_contacts",
    {
      title: "Freebox contacts",
      description: "Get the phone contacts list, read-only.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => toToolResult(await freeboxApi.getContacts()),
  );

  server.registerTool(
    "freebox_reboot",
    {
      title: "Reboot the Freebox",
      description:
        "Reboot the Freebox now. Disruptive: the network and all connected devices will briefly go offline (typically 1-2 minutes). Not destructive to data.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => toToolResult(await freeboxApi.reboot()),
  );

  server.registerTool(
    "freebox_set_wifi_enabled",
    {
      title: "Enable/disable Freebox WiFi",
      description: "Turn the Freebox WiFi radios on or off globally.",
      inputSchema: {
        enabled: z
          .boolean()
          .describe("true to enable WiFi, false to disable it"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ enabled }) =>
      toToolResult(await freeboxApi.setWifiConfig(enabled)),
  );

  server.registerTool(
    "freebox_toggle_wifi_bss",
    {
      title: "Enable/disable a WiFi BSS",
      description:
        "Turn a specific WiFi network (BSS, e.g. the guest network) on or off.",
      inputSchema: {
        bssId: z
          .string()
          .describe("BSS identifier, as returned by freebox_get_wifi_status"),
        enabled: z
          .boolean()
          .describe("true to enable this BSS, false to disable it"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ bssId, enabled }) =>
      toToolResult(await freeboxApi.updateWifiBss(bssId, { enabled })),
  );

  server.registerTool(
    "freebox_add_dhcp_static_lease",
    {
      title: "Add a DHCP static lease",
      description:
        "Reserve a fixed IP address for a device (by MAC address) on the DHCP server. Additive only: does not update or delete existing leases.",
      inputSchema: {
        mac: z.string().describe("Device MAC address, e.g. aa:bb:cc:dd:ee:ff"),
        ip: z.string().describe("IP address to reserve for this device"),
        comment: z
          .string()
          .optional()
          .describe("Optional label for this lease"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ mac, ip, comment }) =>
      toToolResult(await freeboxApi.addDhcpStaticLease(mac, ip, comment)),
  );
}
