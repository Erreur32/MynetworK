// UniFi MCP tools (phase 2) — read + a few non-destructive write actions.
// Each tool wraps existing/new UniFiApiService methods; no business logic lives here.
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { pluginManager } from '../../services/pluginManager.js';
import type { UniFiPlugin } from '../../plugins/unifi/UniFiPlugin.js';
import type { UniFiApiService } from '../../plugins/unifi/UniFiApiService.js';
import { wrapAsync } from './shared.js';
import { isValidMac } from '../../utils/networkValidation.js';

function getUnifiApiService(): UniFiApiService {
  const plugin = pluginManager.getPlugin('unifi') as UniFiPlugin | undefined;
  if (!plugin) {
    throw new Error('UniFi plugin is not available (not configured or not enabled).');
  }
  return plugin.getApiService();
}

function assertValidMac(mac: string): void {
  if (!isValidMac(mac)) {
    throw new Error(`Invalid MAC address: ${mac}`);
  }
}

export function registerUnifiTools(server: McpServer): void {
  server.registerTool(
    'unifi_get_devices',
    {
      title: 'UniFi devices',
      description: 'List UniFi devices (access points, switches, gateways) with status and stats.',
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => wrapAsync(() => getUnifiApiService().getDevices())
  );

  server.registerTool(
    'unifi_get_clients',
    {
      title: 'UniFi clients',
      description: 'List clients (stations) currently connected to the UniFi network.',
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => wrapAsync(() => getUnifiApiService().getClients())
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
      description: 'Get a WAN download/upload bandwidth time series for a given time range.',
      inputSchema: {
        rangeSeconds: z.number().int().positive().describe('Time range in seconds, e.g. 3600 for the last hour')
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
