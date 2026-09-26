// Freebox MCP tools (phase 1) — read + non-destructive actions only.
// Each tool wraps a freeboxApi method; no business logic lives here.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { freeboxApi } from "../../services/freeboxApi.js";
import {
  textResult,
  toListResult,
  matchesSearch,
  searchParam,
  rawParam,
  limitParam,
  listToolResult,
  MAX_SEARCH_LENGTH,
  type ListOptions,
} from "./shared.js";

const DEFAULT_CALL_LOG_LIMIT = 50;
const DEFAULT_CONTACTS_LIMIT = 100;

interface FreeboxLikeResponse {
  success: boolean;
  result?: unknown;
  error_code?: string;
  msg?: string;
}

function toToolResult(response: FreeboxLikeResponse) {
  return textResult(response, !response.success);
}

// Applies list options to a Freebox array response; errors/non-array results pass through untouched.
function listResponse(response: FreeboxLikeResponse, options: ListOptions<any>) {
  if (!response.success || !Array.isArray(response.result)) {
    return toToolResult(response);
  }
  return listToolResult(toListResult(response.result, options));
}

function hostIpv4(host: any): string[] {
  const l3: any[] = Array.isArray(host?.l3connectivities) ? host.l3connectivities : [];
  return l3.filter((c) => c.af === "ipv4").map((c) => c.addr);
}

// Compact LAN host summary: the raw object carries every name source, IPv6
// address and access point detail ever seen for the host.
function summarizeLanHost(h: any) {
  const ap = h.access_point;
  const wifi = ap?.wifi_information;
  return {
    name: h.primary_name,
    type: h.host_type,
    mac: h.l2ident?.id,
    vendor: h.vendor_name || undefined,
    ipv4: hostIpv4(h),
    active: h.active,
    reachable: h.reachable,
    last_activity: h.last_activity,
    interface: h.interface,
    connection: ap?.connectivity_type,
    ssid: wifi?.ssid,
    band: wifi?.band,
    signal_dbm: wifi?.signal,
  };
}

function summarizeWifiStation(s: any) {
  return {
    name: s.hostname || s.host?.primary_name,
    mac: s.mac,
    ipv4: hostIpv4(s.host),
    vendor: s.host?.vendor_name || undefined,
    bssid: s.bssid,
    state: s.state,
    signal_dbm: s.signal,
    rx_rate: s.rx_rate,
    tx_rate: s.tx_rate,
    rx_bytes: s.rx_bytes,
    tx_bytes: s.tx_bytes,
    conn_duration: s.conn_duration,
    inactive: s.inactive,
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
      description:
        "List devices currently connected over WiFi, as a compact summary. Use raw=true only if a field is missing.",
      inputSchema: {
        search: searchParam,
        limit: limitParam(),
        raw: rawParam,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ search, limit, raw }) =>
      listResponse(await freeboxApi.getWifiStations(), {
        filter: (s: any) =>
          matchesSearch(search, s.hostname, s.host?.primary_name, s.mac, ...hostIpv4(s.host)),
        limit,
        project: raw ? undefined : summarizeWifiStation,
      }),
  );

  server.registerTool(
    "freebox_get_lan_hosts",
    {
      title: "Freebox LAN hosts",
      description:
        "List devices known to the Freebox LAN browser, across all interfaces, as a compact summary. By default only currently active hosts are returned (the Freebox also remembers every host ever seen). Use raw=true only if a field is missing.",
      inputSchema: {
        activeOnly: z
          .boolean()
          .default(true)
          .describe("true (default) = only currently active hosts; false = include inactive, remembered hosts"),
        search: searchParam,
        limit: limitParam(),
        raw: rawParam,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ activeOnly, search, limit, raw }) => {
      const interfaces = await freeboxApi.getLanBrowserInterfaces();
      if (!interfaces.success || !Array.isArray(interfaces.result)) {
        return toToolResult(interfaces);
      }

      const allHosts: any[] = [];
      for (const iface of interfaces.result as Array<{ name: string }>) {
        const hosts = await freeboxApi.getLanHosts(iface.name);
        if (hosts.success && Array.isArray(hosts.result)) {
          for (const host of hosts.result) {
            allHosts.push({ ...(host as object), interface: iface.name });
          }
        }
      }

      return listToolResult(
        toListResult(allHosts, {
          filter: (h) =>
            (!activeOnly || h.active === true) &&
            matchesSearch(search, h.primary_name, h.l2ident?.id, ...hostIpv4(h)),
          limit,
          project: raw ? undefined : summarizeLanHost,
        }),
      );
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
      description:
        "Get the phone call log (accepted/incoming/missed/outgoing), most recent first.",
      inputSchema: {
        type: z
          .enum(["all", "accepted", "incoming", "missed", "outgoing"])
          .default("all")
          .describe("Filter by call type"),
        search: z
          .string()
          .max(MAX_SEARCH_LENGTH)
          .optional()
          .describe("Case-insensitive substring match on caller name or number"),
        limit: limitParam(DEFAULT_CALL_LOG_LIMIT),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ type, search, limit }) => {
      const response = await freeboxApi.getCallLog();
      if (Array.isArray(response.result)) {
        response.result.sort((a: any, b: any) => (b.datetime ?? 0) - (a.datetime ?? 0));
      }
      return listResponse(response, {
        filter: (c: any) =>
          (type === "all" || c.type === type) && matchesSearch(search, c.name, c.number),
        limit: limit ?? DEFAULT_CALL_LOG_LIMIT,
      });
    },
  );

  server.registerTool(
    "freebox_get_contacts",
    {
      title: "Freebox contacts",
      description: "Get the phone contacts list, read-only.",
      inputSchema: {
        search: z
          .string()
          .max(MAX_SEARCH_LENGTH)
          .optional()
          .describe("Case-insensitive substring match on contact name or company"),
        limit: limitParam(DEFAULT_CONTACTS_LIMIT),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ search, limit }) =>
      listResponse(await freeboxApi.getContacts(), {
        filter: (c: any) =>
          matchesSearch(search, c.display_name, c.first_name, c.last_name, c.company),
        limit: limit ?? DEFAULT_CONTACTS_LIMIT,
      }),
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
