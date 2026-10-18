// UniFi MCP tools (phase 2): read + a few write actions. Disruptive ones carry
// destructiveHint: true so MCP clients ask the user before running them.
// Each tool wraps existing/new UniFiApiService methods; no business logic lives here.
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { pluginManager } from '../../services/pluginManager.js';
import type { UniFiPlugin } from '../../plugins/unifi/UniFiPlugin.js';
import type { UniFiApiService } from '../../plugins/unifi/UniFiApiService.js';
import { UniFiClientTrafficRepository } from '../../database/models/UniFiClientTraffic.js';
import { wrapAsync, toListResult, matchesSearch, searchParam, rawParam, limitParam, type ListResult } from './shared.js';
import { isValidMac } from '../../utils/networkValidation.js';

// Max range for unifi_get_bandwidth_report: 7 days of hourly buckets (168 points).
const MAX_BANDWIDTH_RANGE_SECONDS = 7 * 24 * 3600;

const GATEWAY_TYPES = new Set(['ugw', 'udm', 'uxg']);

function isGatewayDevice(d: any): boolean {
  return GATEWAY_TYPES.has((d.type || '').toString().toLowerCase());
}

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
function normalizeMac(mac: unknown): string {
  return typeof mac === 'string' ? mac.toLowerCase().replace(/[:-]/g, '') : '';
}

function summarizeClient(c: any, switches: Map<string, { name?: string; ip?: string }> = new Map()) {
  const sw = switches.get(normalizeMac(c.sw_mac));
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
    switch_name: sw?.name,
    switch_ip: sw?.ip,
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

// system-stats values arrive as strings ("88.1"); anything non-numeric becomes undefined.
function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Firmware update state. null means "unknown" (controller sent nothing), which
// API consumers must be able to tell apart from "up to date" (false).
// Same rule as the UI badges: some controllers only fill upgrade_to_firmware.
function firmwareUpgrade(d: any): { upgradable: boolean | null; upgrade_to_firmware: string | null } {
  const target = typeof d.upgrade_to_firmware === 'string' && d.upgrade_to_firmware !== '' && d.upgrade_to_firmware !== d.version
    ? d.upgrade_to_firmware
    : null;
  if (d.upgradable === true || target) return { upgradable: true, upgrade_to_firmware: target };
  if (d.upgradable === false) return { upgradable: false, upgrade_to_firmware: null };
  return { upgradable: null, upgrade_to_firmware: null };
}

// A gateway's ip is often its WAN address: expose the main LAN address separately.
// Prefer the default LAN (attr_no_delete) in network_table, then any LAN, then config_network.ip.
function gatewayLanIp(d: any): string | null {
  const lans: any[] = Array.isArray(d.network_table)
    ? d.network_table.filter((n: any) => n?.purpose === 'corporate' && typeof n.ip === 'string' && n.ip !== '')
    : [];
  const lan = lans.find((n) => n.attr_no_delete === true) ?? lans[0];
  return lan?.ip ?? (typeof d.config_network?.ip === 'string' && d.config_network.ip !== '' ? d.config_network.ip : null);
}

// Highest reading of the temperatures array (gateways, some switches), else general_temperature.
function maxTemperature(d: any): number | undefined {
  const values = (Array.isArray(d.temperatures) ? d.temperatures : [])
    .map((t: any) => toNumber(t?.value))
    .filter((v: number | undefined): v is number => v !== undefined);
  return values.length ? Math.max(...values) : toNumber(d.general_temperature);
}

export function summarizeDevice(d: any) {
  const ports: any[] = Array.isArray(d.port_table) ? d.port_table : [];
  const radios: any[] = Array.isArray(d.radio_table_stats) ? d.radio_table_stats : [];
  const isGateway = isGatewayDevice(d);
  return {
    name: d.name || d.model,
    model: d.model,
    type: d.type,
    mac: d.mac,
    ip: d.ip,
    state: d.state === 1 ? 'connected' : d.state,
    version: d.version,
    ...firmwareUpgrade(d),
    lan_ip: isGateway ? gatewayLanIp(d) : undefined,
    uptime: d.uptime,
    clients: d.num_sta,
    satisfaction: d.satisfaction,
    cpu_pct: toNumber(d['system-stats']?.cpu),
    mem_pct: toNumber(d['system-stats']?.mem),
    temperature: maxTemperature(d),
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

// Devices the front-panel cards can draw: switches, gateways, access points. No clients.
const CARD_DEVICE_TYPES = new Set(['usw', 'ugw', 'udm', 'uxg', 'uck', 'uap', 'u6', 'u7']);

const cardString = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const cardBool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
const cardMac = (v: unknown): string => (typeof v === 'string' ? v.toLowerCase().replace(/[^0-9a-f]/g, '') : '');

// Only the listed keys are copied (never the raw controller object): UniFi devices embed credentials.
function cardPortRow(row: any, knownMacs: Set<string>) {
  // LLDP neighbours are kept only when they are UniFi devices we know, so other machines' MACs stay out.
  const neighbours = (Array.isArray(row?.lldp_table) ? row.lldp_table : [])
    .filter((n: any) => knownMacs.has(cardMac(n?.chassis_id)))
    .map((n: any) => ({ chassis_id: n.chassis_id }));
  return {
    port_idx: toNumber(row?.port_idx),
    name: cardString(row?.name),
    ifname: cardString(row?.ifname),
    up: cardBool(row?.up),
    speed: toNumber(row?.speed),
    media: cardString(row?.media),
    is_uplink: cardBool(row?.is_uplink),
    port_poe: cardBool(row?.port_poe),
    poe_enable: cardBool(row?.poe_enable),
    poe_power: toNumber(row?.poe_power),
    'rx_bytes-r': toNumber(row?.['rx_bytes-r']),
    'tx_bytes-r': toNumber(row?.['tx_bytes-r']),
    lldp_table: neighbours.length ? neighbours : undefined
  };
}

function cardWan(link: any) {
  if (!link || typeof link !== 'object') return undefined;
  return {
    name: cardString(link.name),
    ifname: cardString(link.ifname),
    port_idx: toNumber(link.port_idx),
    up: cardBool(link.up),
    speed: toNumber(link.speed),
    type: cardString(link.type)
  };
}

/** Projection read by the CARD tab adapter, served to API tokens by GET /api/plugins/unifi/card-devices. */
export function summarizeCardDevice(d: any, knownMacs: Set<string>) {
  const stats = d['system-stats'];
  const rows = [d.port_table, d.eth_port_table, d.ports].find((r) => Array.isArray(r) && r.length) ?? [];
  const cpuTemperature = toNumber(stats?.temps?.CPU);
  return {
    mac: cardString(d.mac),
    name: cardString(d.name),
    model: cardString(d.model),
    model_name: cardString(d.model_name),
    shortname: cardString(d.shortname),
    hw_version: cardString(d.hw_version),
    type: cardString(d.type),
    // A gateway's own ip is often its public WAN address: only its LAN address is exposed.
    ip: isGatewayDevice(d) ? gatewayLanIp(d) ?? undefined : cardString(d.ip),
    state: toNumber(d.state),
    version: cardString(d.version),
    uptime: toNumber(d.uptime),
    num_sta: toNumber(d.num_sta),
    'user-num_sta': toNumber(d['user-num_sta']),
    num_port: toNumber(d.num_port),
    general_temperature: toNumber(d.general_temperature),
    'system-stats': stats
      ? {
          cpu: toNumber(stats.cpu),
          mem: toNumber(stats.mem),
          temps: cpuTemperature === undefined ? undefined : { CPU: cpuTemperature }
        }
      : undefined,
    uplink: d.uplink && typeof d.uplink === 'object'
      ? {
          type: cardString(d.uplink.type),
          uplink_mac: cardString(d.uplink.uplink_mac),
          uplink_remote_port: toNumber(d.uplink.uplink_remote_port),
          port_idx: toNumber(d.uplink.port_idx),
          speed: toNumber(d.uplink.speed)
        }
      : undefined,
    upgradable: cardBool(d.upgradable),
    upgrade_to_firmware: cardString(d.upgrade_to_firmware),
    wan1: cardWan(d.wan1),
    wan2: cardWan(d.wan2),
    port_table: rows.map((row: any) => cardPortRow(row, knownMacs))
  };
}

export function summarizeCardDevices(devices: any[]) {
  const cardDevices = devices.filter((d) => CARD_DEVICE_TYPES.has(String(d?.type ?? '').toLowerCase()));
  const knownMacs = new Set(cardDevices.map((d) => cardMac(d.mac)).filter(Boolean));
  return cardDevices.map((d) => summarizeCardDevice(d, knownMacs));
}

// A consumer polling every few seconds must not turn into a controller request each time.
const CARD_DEVICES_TTL_MS = 3000;
let cardDevicesCache: { at: number; items: ReturnType<typeof summarizeCardDevices> } | null = null;

export async function listUnifiCardDevices() {
  const now = Date.now();
  if (cardDevicesCache && now - cardDevicesCache.at < CARD_DEVICES_TTL_MS) return cardDevicesCache.items;
  const items = summarizeCardDevices(await getUnifiApiService().getDevices());
  cardDevicesCache = { at: now, items };
  return items;
}

// Gateway WAN links: state, negotiated speed, latency. Public IPs are never returned.
function summarizeWan(gw: any) {
  const links = ['wan1', 'wan2']
    .filter((k) => gw?.[k] && typeof gw[k] === 'object')
    .map((k) => ({
      name: k.toUpperCase(),
      up: typeof gw[k].up === 'boolean' ? gw[k].up : null,
      speed_mbps: toNumber(gw[k].speed) ?? null,
      latency_ms: toNumber(gw[k].latency) ?? null
    }));
  // The gateway reports the active uplink's latency once, on `uplink`
  const uplinkLatency = toNumber(gw?.uplink?.latency);
  if (links.length > 0 && uplinkLatency !== undefined && links[0].latency_ms === null) links[0].latency_ms = uplinkLatency;
  return links;
}

// Last speed test run by the gateway, null when it never ran one
function summarizeSpeedtest(gw: any) {
  const st = gw?.['speedtest-status'];
  const download = toNumber(st?.xput_download);
  if (!st || download === undefined) return null;
  return {
    download_mbps: download,
    upload_mbps: toNumber(st.xput_upload) ?? null,
    latency_ms: toNumber(st.latency) ?? null,
    date: toNumber(st.rundate) ?? null
  };
}

// Compact controller summary: stat/sysinfo (UniFi Network application) plus the
// gateway's health. The raw sysinfo object carries SSO app ids/secrets and
// controller IPs, so only the fields below are ever returned.
export function summarizeSystem(sysinfo: any, devices: any[]) {
  const gw = devices.find(isGatewayDevice);
  const g = gw ? summarizeDevice(gw) : null;
  const sysStats = gw?.sys_stats;
  return {
    name: sysinfo?.name ?? null,
    hostname: sysinfo?.hostname ?? null,
    version: sysinfo?.version ?? null,
    previous_version: sysinfo?.previous_version ?? null,
    update_available: typeof sysinfo?.update_available === 'boolean' ? sysinfo.update_available : null,
    update_downloaded: typeof sysinfo?.update_downloaded === 'boolean' ? sysinfo.update_downloaded : null,
    console_version: sysinfo?.console_display_version ?? sysinfo?.udm_version ?? null,
    uptime: toNumber(sysinfo?.uptime) ?? null,
    gateway: g
      ? {
          name: g.name,
          model: g.model,
          type: g.type,
          version: g.version,
          upgradable: g.upgradable,
          upgrade_to_firmware: g.upgrade_to_firmware,
          lan_ip: g.lan_ip,
          uptime: g.uptime,
          cpu_pct: g.cpu_pct,
          mem_pct: g.mem_pct,
          mem_total: toNumber(sysStats?.mem_total),
          mem_used: toNumber(sysStats?.mem_used),
          temperature: g.temperature,
          wan: summarizeWan(gw),
          speedtest: summarizeSpeedtest(gw)
        }
      : null
  };
}

export async function getUnifiSystemSummary() {
  const api = getUnifiApiService();
  const [sysinfo, devices] = await Promise.all([api.getSystemInfo(), api.getDevices()]);
  return summarizeSystem(sysinfo, devices);
}

function deviceMatchesType(d: any, type: 'all' | 'ap' | 'switch' | 'gateway'): boolean {
  const t = (d.type || '').toString().toLowerCase();
  if (type === 'ap') return t === 'uap';
  if (type === 'switch') return t === 'usw';
  if (type === 'gateway') return isGatewayDevice(d);
  return true;
}

export type UnifiDeviceType = 'all' | 'ap' | 'switch' | 'gateway';
export type UnifiClientType = 'all' | 'wifi' | 'wired';

interface UnifiListOptions<T> {
  type: T;
  search?: string;
  limit?: number;
  raw?: boolean;
}

// Shared by the MCP tools and the read-only REST routes (GET /api/plugins/unifi/devices|clients)
export async function listUnifiDevices({ type, search, limit, raw }: UnifiListOptions<UnifiDeviceType>): Promise<ListResult> {
  return toListResult(await getUnifiApiService().getDevices(), {
    filter: (d: any) => deviceMatchesType(d, type) && matchesSearch(search, d.name, d.model, d.ip, d.mac),
    limit,
    project: raw ? undefined : summarizeDevice
  });
}

export async function listUnifiClients({ type, search, limit, raw }: UnifiListOptions<UnifiClientType>): Promise<ListResult> {
  const api = getUnifiApiService();
  // Devices only resolve the switch name/IP of wired clients: a failure must not break the client list.
  const [clients, devices] = await Promise.all([api.getClients(), raw ? [] : api.getDevices().catch(() => [])]);
  const switches = new Map<string, { name?: string; ip?: string }>();
  for (const d of devices as any[]) {
    if (d.mac) switches.set(normalizeMac(d.mac), { name: d.name || d.model, ip: d.ip });
  }
  return toListResult(clients, {
    filter: (c: any) =>
      (type === 'all' || (type === 'wired') === (c.is_wired === true)) &&
      matchesSearch(search, c.name, c.hostname, c.ip, c.mac),
    limit,
    project: raw ? undefined : (c: any) => summarizeClient(c, switches)
  });
}

export type UnifiTrafficMode = 'live' | 'today' | 'alltime';

// Shared by the MCP tool and GET /api/plugins/unifi/top-traffic.
// 'live' asks the controller, 'today' and 'alltime' read the local accumulation tables.
export async function getUnifiTopTraffic(mode: UnifiTrafficMode, limit?: number) {
  const resolvedLimit = limit ?? 10;
  if (mode === 'live') return getUnifiPlugin().fetchTopClients(resolvedLimit);
  return mode === 'alltime'
    ? UniFiClientTrafficRepository.getTopAllTime(resolvedLimit)
    : UniFiClientTrafficRepository.getTopToday(resolvedLimit);
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
    async ({ type, search, limit, raw }) => wrapAsync(() => listUnifiDevices({ type, search, limit, raw }))
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
      wrapAsync(() => listUnifiClients({ type, search, limit, raw }))
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
    async ({ mode, limit }) => wrapAsync(() => getUnifiTopTraffic(mode, limit))
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
      description:
        'Get UniFi controller system information as a compact summary: UniFi Network version and pending update, UniFi OS console version, gateway firmware/update, uptime, CPU, memory and temperature. Use raw=true only if a field is missing.',
      inputSchema: { raw: rawParam },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ raw }) => wrapAsync(() => (raw ? getUnifiApiService().getSystemInfo() : getUnifiSystemSummary()))
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
        destructiveHint: true,
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
        destructiveHint: true,
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
        destructiveHint: true,
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
