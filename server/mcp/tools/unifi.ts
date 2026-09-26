// UniFi MCP tools (phase 2): read + a few non-destructive write actions.
// Each tool wraps existing/new UniFiApiService methods; no business logic lives here.
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { pluginManager } from '../../services/pluginManager.js';
import type { UniFiPlugin } from '../../plugins/unifi/UniFiPlugin.js';
import type { UniFiApiService } from '../../plugins/unifi/UniFiApiService.js';
import { UniFiClientTrafficRepository } from '../../database/models/UniFiClientTraffic.js';
import { wrapAsync, toListResult, matchesSearch, searchParam, rawParam, limitParam } from './shared.js';
import { isValidMac } from '../../utils/networkValidation.js';

// Max range for unifi_get_bandwidth_report: 7 days of hourly buckets (168 points).
const MAX_BANDWIDTH_RANGE_SECONDS = 7 * 24 * 3600;

const GATEWAY_TYPES = new Set(['ugw', 'udm', 'uxg']);

function getUnifiPlugin(): UniFiPlugin {
  const plugin = pluginManager.getPlugin('unifi') as UniFiPlugin | undefined;
  if (!plugin) {
    throw new Error('UniFi plugin is not available (not configured or not enabled).');
  }
  return plugin;
}

function getUnifiApiService(): UniFiApiService {
  return getUnifiPlugin().getApiService();
}

function assertValidMac(mac: string): void {
  if (!isValidMac(mac)) {
    throw new Error(`Invalid MAC address: ${mac}`);
  }
}

// Compact client summary: the raw stat/sta object has ~90 fields per client.
// tx_rate/rx_rate are the negotiated link speed, not throughput: renamed so a model can't mix them up.
function summarizeClient(c: any) {
  const wired = c.is_wired === true;
  return {
    name: c.name || c.hostname || c.ip || c.mac,
    hostname: c.hostname,
    mac: c.mac,
    ip: c.ip,
    oui: c.oui,
    network: c.network,
    wired,
    guest: c.is_guest === true ? true : undefined,
    essid: c.essid,
    ap_mac: c.ap_mac,
    radio: c.radio,
    channel: c.channel,
    signal_dbm: c.signal,
    satisfaction: c.satisfaction,
    switch_mac: c.sw_mac,
    switch_port: c.sw_port,
    link_rx_rate_kbps: c.rx_rate,
    link_tx_rate_kbps: c.tx_rate,
    live_rx_bytes_per_sec: c['rx_bytes-r'] ?? c['wired-rx_bytes-r'],
    live_tx_bytes_per_sec: c['tx_bytes-r'] ?? c['wired-tx_bytes-r'],
    rx_bytes: c.rx_bytes ?? c['wired-rx_bytes'],
    tx_bytes: c.tx_bytes ?? c['wired-tx_bytes'],
    uptime: c.uptime,
    last_seen: c.last_seen
  };
}

function summarizeDevice(d: any) {
  const ports: any[] = Array.isArray(d.port_table) ? d.port_table : [];
  const radios: any[] = Array.isArray(d.radio_table_stats) ? d.radio_table_stats : [];
  return {
    name: d.name || d.model,
    model: d.model,
    type: d.type,
    mac: d.mac,
    ip: d.ip,
    state: d.state === 1 ? 'connected' : d.state,
    version: d.version,
    upgradable: d.upgradable === true ? true : undefined,
    uptime: d.uptime,
    clients: d.num_sta,
    satisfaction: d.satisfaction,
    cpu_pct: d['system-stats']?.cpu,
    mem_pct: d['system-stats']?.mem,
    temperature: d.general_temperature,
    uplink: d.uplink
      ? { type: d.uplink.type, mac: d.uplink.uplink_mac, port: d.uplink.uplink_remote_port, speed: d.uplink.speed }
      : undefined,
    ports: ports.length ? { total: ports.length, up: ports.filter((p) => p.up === true).length } : undefined,
    radios: radios.length
      ? radios.map((r) => ({ radio: r.radio, channel: r.channel, clients: r.num_sta, satisfaction: r.satisfaction }))
      : undefined,
    last_seen: d.last_seen
  };
}

function deviceMatchesType(d: any, type: 'all' | 'ap' | 'switch' | 'gateway'): boolean {
  const t = (d.type || '').toString().toLowerCase();
  if (type === 'ap') return t === 'uap';
  if (type === 'switch') return t === 'usw';
  if (type === 'gateway') return GATEWAY_TYPES.has(t);
  return true;
}

export function registerUnifiTools(server: McpServer): void {
  server.registerTool(
    'unifi_get_devices',
    {
      title: 'UniFi devices',
      description:
        'List UniFi devices (access points, switches, gateways) as a compact summary: status, firmware, uptime, client count, uplink, port/radio overview. Use raw=true only if a field is missing.',
      inputSchema: {
        type: z.enum(['all', 'ap', 'switch', 'gateway']).default('all').describe('Filter by device type'),
        search: searchParam,
        limit: limitParam(),
        raw: rawParam
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ type, search, limit, raw }) =>
      wrapAsync(async () =>
        toListResult(await getUnifiApiService().getDevices(), {
          filter: (d: any) => deviceMatchesType(d, type) && matchesSearch(search, d.name, d.model, d.ip, d.mac),
          limit,
          project: raw ? undefined : summarizeDevice
        })
      )
  );

  server.registerTool(
    'unifi_get_clients',
    {
      title: 'UniFi clients',
      description:
        'List clients (stations) currently connected to the UniFi network, as a compact summary. link_*_rate_kbps is the negotiated WiFi/port speed; live_*_bytes_per_sec is the actual current throughput. Use raw=true only if a field is missing.',
      inputSchema: {
        type: z.enum(['all', 'wifi', 'wired']).default('all').describe('Filter by connection type'),
        search: searchParam,
        limit: limitParam(),
        raw: rawParam
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ type, search, limit, raw }) =>
      wrapAsync(async () =>
        toListResult(await getUnifiApiService().getClients(), {
          filter: (c: any) =>
            (type === 'all' || (type === 'wired') === (c.is_wired === true)) &&
            matchesSearch(search, c.name, c.hostname, c.ip, c.mac),
          limit,
          project: raw ? undefined : summarizeClient
        })
      )
  );

  server.registerTool(
    'unifi_get_top_traffic',
    {
      title: 'UniFi top traffic consumers',
      description:
        "List the UniFi clients using the most traffic, ranked by combined download+upload. mode='live' returns instantaneous throughput right now, straight from the controller's own real-time rate fields (not the negotiated WiFi/port link speed, that's a different, unrelated number). mode='today' or 'alltime' return accumulated data volume (bytes) since midnight or since tracking started, from the background history service.",
      inputSchema: {
        mode: z.enum(['live', 'today', 'alltime']).default('live').describe(
          "'live' = instantaneous rate right now; 'today' = volume accumulated since midnight; 'alltime' = volume accumulated since the tracking service started (no retroactive history)"
        ),
        limit: z.number().int().positive().max(50).optional().describe('Max number of clients to return (default 10)')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ mode, limit }) =>
      wrapAsync(async () => {
        const resolvedLimit = limit ?? 10;
        if (mode === 'live') return getUnifiPlugin().fetchTopClients(resolvedLimit);
        return mode === 'alltime'
          ? UniFiClientTrafficRepository.getTopAllTime(resolvedLimit)
          : UniFiClientTrafficRepository.getTopToday(resolvedLimit);
      })
  );

  server.registerTool(
    'unifi_get_wlans',
    {
      title: 'UniFi WLANs',
      description: 'List configured WLANs (WiFi networks), including their id (needed for unifi_set_wlan_enabled).',
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => wrapAsync(() => getUnifiApiService().getWlans())
  );

  server.registerTool(
    'unifi_get_network_config',
    {
      title: 'UniFi network config',
      description: 'Get the LAN network configuration (DHCP enabled, DHCP range).',
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => wrapAsync(() => getUnifiApiService().getNetworkConfig())
  );

  server.registerTool(
    'unifi_get_port_forwarding_rules',
    {
      title: 'UniFi port forwarding rules',
      description: 'List configured port forwarding rules.',
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => wrapAsync(() => getUnifiApiService().getPortForwardingRules())
  );

  server.registerTool(
    'unifi_get_bandwidth_report',
    {
      title: 'UniFi WAN bandwidth report',
      description:
        'Get a WAN download/upload bandwidth time series (KB/s) for a given time range: 5-minute buckets up to 24h, hourly buckets beyond (max 7 days).',
      inputSchema: {
        rangeSeconds: z
          .number()
          .int()
          .positive()
          .max(MAX_BANDWIDTH_RANGE_SECONDS)
          .describe('Time range in seconds, e.g. 3600 for the last hour (max 604800 = 7 days)')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ rangeSeconds }) => wrapAsync(() => getUnifiApiService().getBandwidthReport(rangeSeconds))
  );

  server.registerTool(
    'unifi_get_system_info',
    {
      title: 'UniFi system info',
      description: 'Get UniFi controller/site system information.',
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => wrapAsync(() => getUnifiApiService().getSystemInfo())
  );

  server.registerTool(
    'unifi_get_sites',
    {
      title: 'UniFi sites',
      description: 'List UniFi sites available to this controller/account.',
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => wrapAsync(() => getUnifiApiService().getSites())
  );

  server.registerTool(
    'unifi_block_client',
    {
      title: 'Block a UniFi client',
      description:
        'Block a client (by MAC address) from the network. Requires a local controller connection (not the Site Manager cloud API).',
      inputSchema: {
        mac: z.string().describe('Client MAC address, e.g. aa:bb:cc:dd:ee:ff')
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ mac }) =>
      wrapAsync(async () => {
        assertValidMac(mac);
        await getUnifiApiService().blockClient(mac);
        return { mac, blocked: true };
      })
  );

  server.registerTool(
    'unifi_unblock_client',
    {
      title: 'Unblock a UniFi client',
      description:
        'Unblock a previously blocked client (by MAC address). Requires a local controller connection (not the Site Manager cloud API).',
      inputSchema: {
        mac: z.string().describe('Client MAC address, e.g. aa:bb:cc:dd:ee:ff')
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ mac }) =>
      wrapAsync(async () => {
        assertValidMac(mac);
        await getUnifiApiService().unblockClient(mac);
        return { mac, blocked: false };
      })
  );

  server.registerTool(
    'unifi_set_wlan_enabled',
    {
      title: 'Enable/disable a UniFi WLAN',
      description:
        'Turn a WiFi network (WLAN) on or off. Get the wlanId from unifi_get_wlans. Requires a local controller connection (not the Site Manager cloud API).',
      inputSchema: {
        wlanId: z.string().describe('WLAN id, as returned by unifi_get_wlans'),
        enabled: z.boolean().describe('true to enable this WLAN, false to disable it')
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ wlanId, enabled }) =>
      wrapAsync(async () => {
        await getUnifiApiService().setWlanEnabled(wlanId, enabled);
        return { wlanId, enabled };
      })
  );

  server.registerTool(
    'unifi_restart_device',
    {
      title: 'Restart a UniFi device',
      description:
        'Restart a UniFi device (access point, switch, or gateway) by MAC address. Disruptive: the device and anything connected through it will briefly go offline. Not destructive to data. Requires a local controller connection (not the Site Manager cloud API).',
      inputSchema: {
        mac: z.string().describe('Device MAC address, e.g. aa:bb:cc:dd:ee:ff')
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ mac }) =>
      wrapAsync(async () => {
        assertValidMac(mac);
        await getUnifiApiService().restartDevice(mac);
        return { mac, restarted: true };
      })
  );
}
