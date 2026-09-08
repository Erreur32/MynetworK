// Network scanner MCP tools (phase 2) — read + non-destructive actions only.
// Each tool wraps existing networkScanService/NetworkScanRepository/ipBlacklistService methods;
// no business logic lives here.
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { networkScanService } from '../../services/networkScanService.js';
import { NetworkScanRepository } from '../../database/models/NetworkScan.js';
import { ipBlacklistService } from '../../services/ipBlacklistService.js';
import { isValidIp } from '../../utils/networkValidation.js';
import { wrapAsync } from './shared.js';

function assertValidIp(ip: string): void {
  if (!isValidIp(ip)) {
    throw new Error(`Invalid IP address: ${ip}`);
  }
}

export function registerScannerTools(server: McpServer): void {
  server.registerTool(
    'scan_get_stats',
    {
      title: 'Network scan statistics',
      description:
        'Get aggregate stats about the network scan history (total/online/offline/unknown hosts, last scan date).',
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => wrapAsync(() => networkScanService.getStats())
  );

  server.registerTool(
    'scan_get_devices',
    {
      title: 'List scanned devices',
      description: 'List devices discovered by the network scanner (up to 1000 most recently seen).',
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => wrapAsync(() => NetworkScanRepository.find({ limit: 1000, sortBy: 'last_seen', sortOrder: 'desc' }))
  );

  server.registerTool(
    'scan_get_device_by_ip',
    {
      title: 'Get a scanned device by IP',
      description: 'Get the scan record for a specific IP address, if known.',
      inputSchema: {
        ip: z.string().describe('IP address to look up, e.g. 192.168.1.42')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ ip }) =>
      wrapAsync(() => {
        assertValidIp(ip);
        return NetworkScanRepository.findByIp(ip);
      })
  );

  server.registerTool(
    'scan_get_blacklist',
    {
      title: 'Get the scan blacklist',
      description: 'List IP addresses excluded from network scans.',
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => wrapAsync(() => ipBlacklistService.getBlacklist())
  );

  server.registerTool(
    'scan_trigger_scan',
    {
      title: 'Trigger a network scan',
      description:
        'Launch a full network scan (ping + MAC + hostname for every host). Can take from a few seconds to several minutes depending on the range size. If no range is given, the network range is auto-detected.',
      inputSchema: {
        range: z.string().optional().describe('Network range to scan, e.g. 192.168.1.0/24. Auto-detected if omitted.')
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ range }) =>
      wrapAsync(async () => {
        const scanRange = range || networkScanService.getNetworkRange();
        if (!scanRange) {
          throw new Error('Could not auto-detect network range. Provide one explicitly, e.g. 192.168.1.0/24.');
        }
        return networkScanService.scanNetwork(scanRange, 'full');
      })
  );

  server.registerTool(
    'scan_rescan_ip',
    {
      title: 'Rescan a single IP',
      description: 'Rescan a single IP address (ping + MAC + hostname + port scan).',
      inputSchema: {
        ip: z.string().describe('IP address to rescan')
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ ip }) =>
      wrapAsync(async () => {
        assertValidIp(ip);
        const result = await networkScanService.rescanSingleIpWithPorts(ip);
        if (!result) {
          throw new Error(`Failed to rescan ${ip} (may be blacklisted or unreachable)`);
        }
        return result;
      })
  );

  server.registerTool(
    'scan_add_manual_ip',
    {
      title: 'Add an IP manually',
      description: 'Manually add and scan an IP address, optionally with a known MAC address and/or hostname.',
      inputSchema: {
        ip: z.string().describe('IP address to add'),
        mac: z.string().optional().describe('Known MAC address, if any'),
        hostname: z.string().optional().describe('Known hostname, if any')
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ ip, mac, hostname }) =>
      wrapAsync(async () => {
        assertValidIp(ip);
        const result = await networkScanService.scanSingleIp(ip, true, mac, hostname);
        if (!result) {
          throw new Error(`Failed to scan ${ip}`);
        }
        return result;
      })
  );

  server.registerTool(
    'scan_update_hostname',
    {
      title: 'Rename a scanned device',
      description: 'Set or clear the hostname for a known IP address.',
      inputSchema: {
        ip: z.string().describe('IP address to rename'),
        hostname: z.string().nullable().describe('New hostname, or null to clear it')
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ ip, hostname }) =>
      wrapAsync(() => {
        assertValidIp(ip);
        const updated = NetworkScanRepository.update(ip, {
          hostname: hostname && hostname.trim() ? hostname.trim() : '',
          hostnameSource: hostname && hostname.trim() ? 'manual' : ''
        });
        if (!updated) {
          throw new Error(`IP not found: ${ip}`);
        }
        return updated;
      })
  );

  server.registerTool(
    'scan_blacklist_add',
    {
      title: 'Add an IP to the scan blacklist',
      description: 'Exclude an IP address from future scans. Also removes it from the current scan history.',
      inputSchema: {
        ip: z.string().describe('IP address to blacklist')
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ ip }) =>
      wrapAsync(() => {
        assertValidIp(ip);
        const added = ipBlacklistService.addToBlacklist(ip);
        if (!added) {
          throw new Error(`Failed to blacklist ${ip}`);
        }
        try {
          NetworkScanRepository.delete(ip);
        } catch {
          // Ignore: IP may not have an existing scan record
        }
        return { ip, blacklisted: true };
      })
  );

  server.registerTool(
    'scan_blacklist_remove',
    {
      title: 'Remove an IP from the scan blacklist',
      description: 'Allow an IP address to be scanned again.',
      inputSchema: {
        ip: z.string().describe('IP address to remove from the blacklist')
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ ip }) =>
      wrapAsync(() => {
        assertValidIp(ip);
        const removed = ipBlacklistService.removeFromBlacklist(ip);
        if (!removed) {
          throw new Error(`Failed to remove ${ip} from blacklist`);
        }
        return { ip, blacklisted: false };
      })
  );
}
