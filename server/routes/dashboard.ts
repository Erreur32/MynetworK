/**
 * Dashboard routes - aggregated data for the main dashboard (e.g. network summary)
 */

import { Router, type RequestHandler } from 'express';
import { freeboxApi } from '../services/freeboxApi.js';
import { pluginManager } from '../services/pluginManager.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.js';

const router = Router();

/** Detect UniFi gateway device (UGW, UDM, UCG, etc.) from devices list */
function findUniFiGateway(devices: any[]): { ip: string; name: string } | null {
  if (!devices || !Array.isArray(devices)) return null;
  const gateway = devices.find((d: any) => {
    const type = (d.type || '').toString().toLowerCase();
    const model = (d.model || '').toString().toLowerCase();
    return (
      type.includes('ugw') ||
      type.includes('udm') ||
      type.includes('ucg') ||
      type.includes('gateway') ||
      model.includes('ugw') ||
      model.includes('udm') ||
      model.includes('ucg') ||
      model.includes('gateway')
    );
  });
  if (!gateway?.ip) return null;
  return {
    ip: gateway.ip,
    name: gateway.name || gateway.model || 'UniFi Gateway'
  };
}

// network-summary is polled every 30s by two widgets: one shared computation per TTL
// (concurrent requests wait for the running one), dropped as soon as a Freebox write went through
const SUMMARY_TTL_MS = 30_000;
type SummaryBody = { success?: boolean };
let summaryCache: { key: string; at: number; generation: number; body: SummaryBody } | null = null;
const summaryInFlight = new Map<string, Promise<SummaryBody | null>>();

const networkSummaryCache: RequestHandler = (_req, res, next) => {
  const enabled = (id: string) => !!pluginManager.getPlugin(id)?.isEnabled();
  const key = `${enabled('freebox')}:${enabled('unifi')}`;
  const generation = freeboxApi.getWriteGeneration();
  const cached = summaryCache;
  if (cached && cached.key === key && cached.generation === generation && Date.now() - cached.at < SUMMARY_TTL_MS) {
    res.json(cached.body);
    return;
  }
  const pending = summaryInFlight.get(key);
  if (pending !== undefined) {
    // A failed computation lets this request compute on its own
    pending.then((body) => (body ? res.json(body) : next()), next);
    return;
  }

  let settle: (body: SummaryBody | null) => void = () => undefined;
  const promise = new Promise<SummaryBody | null>((resolve) => { settle = resolve; });
  summaryInFlight.set(key, promise);
  const done = (body: SummaryBody | null) => {
    if (summaryInFlight.get(key) === promise) summaryInFlight.delete(key);
    settle(body);
  };
  // The handler below answers through res.json: capture its body (errors resolve to null)
  const json = res.json.bind(res);
  res.json = ((body: SummaryBody) => {
    const ok = body?.success === true;
    if (ok) summaryCache = { key, at: Date.now(), generation, body };
    done(ok ? body : null);
    return json(body);
  }) as typeof res.json;
  res.on('close', () => done(null));
  next();
};

/**
 * GET /api/dashboard/network-summary
 * Aggregates Freebox (LAN, DMZ, DHCP, NAT) + UniFi (gateway, deployment) and deduces
 * who manages the network (freebox | unifi | unifi_via_dmz).
 */
router.get(
  '/network-summary',
  requireAuth,
  networkSummaryCache,
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    const freeboxPlugin = pluginManager.getPlugin('freebox');
    const unifiPlugin = pluginManager.getPlugin('unifi');
    const hasFreebox = !!(freeboxPlugin && freeboxPlugin.isEnabled());
    const hasUniFi = !!(unifiPlugin && unifiPlugin.isEnabled());

    type Role = 'freebox' | 'unifi' | 'unifi_via_dmz';
    type DhcpServerEntry = { source: 'freebox' | 'unifi'; active: boolean; detail?: string };
    type NatRule = { id?: number; comment?: string; enabled: boolean; proto?: string; wanPort?: string; lanIp?: string; lanPort?: number };

    let role: Role = 'freebox';
    let gateway = 'N/A';
    let subnet = 'N/A';
    const freebox: {
      mode?: string;
      ip?: string;
      dmz?: { enabled: boolean; ip?: string };
      dhcp?: { enabled: boolean; ipStart?: string; ipEnd?: string; range?: string; netmask?: string };
      // DHCP config couldn't be read (API error), so "inactive" would be misleading
      dhcpUnavailable?: boolean;
      natRules: NatRule[];
    } = { natRules: [] };
    const unifi: {
      gatewayIp?: string;
      gatewayName?: string;
      deploymentType?: string;
      natRules?: NatRule[];
      dhcpEnabled?: boolean;
      clientsCount?: number;
      dhcpRange?: string;
    } = {};
    const dhcpServers: DhcpServerEntry[] = [];

    // --- Freebox data (only when plugin enabled) ---
    if (hasFreebox) {
      // Independent reads fired together (the box already gets such bursts from /api/connection/summary).
      // The no-op catch only marks them handled: each one is still awaited in its own try below
      const started = <T>(p: Promise<T>): Promise<T> => { p.catch(() => undefined); return p; };
      const lanP = started(freeboxApi.getLanConfig());
      const dmzP = started(freeboxApi.getDmzConfig());
      const dhcpP = started(freeboxApi.getDhcpConfig());
      const natP = started(freeboxApi.getPortForwardingRules());

      try {
        const lanRes = await lanP;
        if (lanRes.success && lanRes.result) {
          const lan = lanRes.result as any;
          freebox.mode = lan.mode || lan.type || 'router';
          freebox.ip = lan.ip;
          if (lan.ip && !gateway) gateway = lan.ip;
        }
      } catch {
        // partial: keep defaults
      }

      try {
        const dmzRes = await dmzP;
        if (dmzRes.success && dmzRes.result) {
          const dmz = dmzRes.result as any;
          freebox.dmz = {
            enabled: dmz.enabled === true,
            ip: dmz.ip || dmz.dmz_ip
          };
        }
      } catch {
        freebox.dmz = { enabled: false };
      }

      try {
        const dhcpRes = await dhcpP;
        if (dhcpRes.success && dhcpRes.result) {
          const raw = dhcpRes.result as any;
          const dhcp = raw.dhcp || raw;
          const enabled = dhcp.enabled === true;
          const ipStart = dhcp.ip_start || dhcp.ip_range_start;
          const ipEnd = dhcp.ip_end || dhcp.ip_range_end;
          freebox.dhcp = {
            enabled,
            ipStart,
            ipEnd,
            range: ipStart && ipEnd ? `${ipStart} → ${ipEnd}` : undefined,
            netmask: dhcp.netmask
          };
          if (freebox.mode === 'bridge') {
            dhcpServers.push({ source: 'freebox', active: false, detail: 'Inactif (mode bridge)' });
          } else {
            dhcpServers.push({
              source: 'freebox',
              active: enabled,
              detail: enabled ? (ipStart && ipEnd ? `${ipStart} - ${ipEnd}` : 'Actif') : 'Inactif'
            });
          }
          // Lease counts for IP manager when DHCP enabled
          if (enabled && ipStart && ipEnd) {
            try {
              const [leasesRes, staticRes] = await Promise.all([
                freeboxApi.getDhcpLeases(),
                freeboxApi.getDhcpStaticLeases()
              ]);
              const ipToNumber = (ip: string): number => {
                const parts = ip.split('.').map(Number);
                return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
              };
              const startNum = ipToNumber(ipStart);
              const endNum = ipToNumber(ipEnd);
              const totalIps = endNum - startNum + 1;
              const usedIpSet = new Set<string>();
              const addLeases = (arr: any[]) => {
                (arr || []).forEach((lease: any) => {
                  const ip = lease.ip || lease.static_lease?.ip;
                  if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
                    const n = ipToNumber(ip);
                    if (n >= startNum && n <= endNum) usedIpSet.add(ip);
                  }
                });
              };
              if (leasesRes.success && Array.isArray(leasesRes.result)) addLeases(leasesRes.result as any[]);
              if (staticRes.success && Array.isArray(staticRes.result)) addLeases(staticRes.result as any[]);
              const usedIps = usedIpSet.size;
              (freebox.dhcp as any).totalIps = totalIps;
              (freebox.dhcp as any).usedIps = usedIps;
              (freebox.dhcp as any).freeIps = totalIps - usedIps;
              (freebox.dhcp as any).usagePercentage = totalIps > 0 ? Math.round((usedIps / totalIps) * 100) : 0;
            } catch {
              // leave counts undefined
            }
          }
        } else {
          freebox.dhcpUnavailable = true;
          dhcpServers.push({ source: 'freebox', active: false, detail: 'Unavailable' });
        }
      } catch {
        freebox.dhcpUnavailable = true;
        dhcpServers.push({ source: 'freebox', active: false, detail: 'Unavailable' });
      }

      try {
        const natRes = await natP;
        if (natRes.success && Array.isArray(natRes.result)) {
          const rules = natRes.result as any[];
          freebox.natRules = rules.map((r: any) => ({
            id: r.id,
            comment: r.comment || '',
            enabled: r.enabled !== false,
            proto: r.ip_proto || 'tcp',
            wanPort: r.wan_port_end != null ? `${r.wan_port_start}-${r.wan_port_end}` : String(r.wan_port_start),
            lanIp: r.lan_ip,
            lanPort: r.lan_port
          }));
        }
      } catch {
        // keep freebox.natRules []
      }
    }

    // --- UniFi data (only when plugin enabled) ---
    let unifiGateway: { ip: string; name: string } | null = null;
    if (hasUniFi) {
      try {
        const unifiStats = await pluginManager.getPluginStats('unifi');
        const devices = (unifiStats?.devices || []) as any[];
        unifiGateway = findUniFiGateway(devices);
        if (unifiGateway) {
          unifi.gatewayIp = unifiGateway.ip;
          unifi.gatewayName = unifiGateway.name;
        }
        const sys = unifiStats?.system as any;
        if (sys?.dhcpEnabled === true || sys?.dhcpEnabled === false) {
          unifi.dhcpEnabled = sys.dhcpEnabled === true;
        } else {
          // Fallback: UniFiOS gateway typically runs DHCP for LAN when no networkconf available
          unifi.dhcpEnabled = !!unifiGateway;
        }
        // DHCP range from network config
        if (sys?.dhcpRange) {
          unifi.dhcpRange = sys.dhcpRange;
        }
        // Count clients (devices with type 'client' and an IP) = IPs used on UniFi network
        const clientsWithIp = devices.filter((d: any) => (d.type === 'client' || (d as any).type === 'client') && d.ip && /^\d+\.\d+\.\d+\.\d+$/.test(String(d.ip)));
        const uniqueClientIps = new Set(clientsWithIp.map((d: any) => String(d.ip)));
        unifi.clientsCount = uniqueClientIps.size;
        if (sys?.deploymentType) unifi.deploymentType = sys.deploymentType;
        unifi.natRules = [];
      } catch {
        // partial: leave unifi empty
      }
      dhcpServers.push({
        source: 'unifi',
        active: !!(unifiGateway && unifi.dhcpEnabled),
        detail: unifiGateway ? (unifi.clientsCount != null ? `Gateway: ${unifiGateway.ip}, ${unifi.clientsCount} client(s)` : `Gateway: ${unifiGateway.ip}`) : 'Aucun gateway détecté'
      });
    }

    // --- Deduce role and gateway/subnet ---
    if (hasUniFi && !hasFreebox && unifiGateway) {
      role = 'unifi';
      gateway = unifiGateway.ip;
      subnet = unifi.gatewayIp ? `${unifi.gatewayIp.split('.').slice(0, 3).join('.')}.0/24` : 'N/A';
    } else if (hasFreebox && hasUniFi && unifiGateway) {
      const freeboxMode = freebox.mode || 'router';
      const dmzEnabled = freebox.dmz?.enabled === true;
      const dmzIp = (freebox.dmz?.ip || '').trim();
      const unifiIp = (unifiGateway.ip || '').trim();
      if (freeboxMode === 'bridge' && dmzEnabled && dmzIp && unifiIp && dmzIp === unifiIp) {
        role = 'unifi_via_dmz';
        gateway = unifiGateway.ip;
        subnet = unifi.gatewayIp ? `${unifi.gatewayIp.split('.').slice(0, 3).join('.')}.0/24` : 'N/A';
      } else {
        role = 'freebox';
        if (freebox.ip) gateway = freebox.ip;
        if (freebox.dhcp?.ipStart && freebox.dhcp?.netmask) {
          const base = freebox.dhcp.ipStart.split('.').slice(0, 3).join('.');
          subnet = `${base}.0/${netmaskToCidr(freebox.dhcp.netmask)}`;
        } else if (freebox.dhcp?.ipStart) {
          const base = freebox.dhcp.ipStart.split('.').slice(0, 3).join('.');
          subnet = `${base}.0/24`;
        }
      }
    } else if (hasUniFi && !hasFreebox) {
      // UniFi present but no gateway device found (APs/switches-only setup) and no Freebox:
      // role is still 'unifi', just without a measurable gateway/subnet (both stay 'N/A').
      role = 'unifi';
    } else if (hasFreebox) {
      role = 'freebox';
      if (freebox.ip) gateway = freebox.ip;
      if (freebox.dhcp?.ipStart && freebox.dhcp?.netmask) {
        const base = freebox.dhcp.ipStart.split('.').slice(0, 3).join('.');
        subnet = `${base}.0/${netmaskToCidr(freebox.dhcp.netmask)}`;
      } else if (freebox.dhcp?.ipStart) {
        const base = freebox.dhcp.ipStart.split('.').slice(0, 3).join('.');
        subnet = `${base}.0/24`;
      }
    }

    const finalSubnet = subnet !== 'N/A' ? subnet : (freebox.dhcp?.ipStart ? `${freebox.dhcp.ipStart.split('.').slice(0, 3).join('.')}.0/24` : 'N/A');

    res.json({
      success: true,
      result: {
        role,
        gateway,
        subnet: finalSubnet,
        freebox: hasFreebox ? freebox : undefined,
        unifi: hasUniFi ? unifi : undefined,
        dhcpServers
      }
    });
  })
);

function netmaskToCidr(netmask: string): number {
  const parts = netmask.split('.').map(Number);
  if (parts.length !== 4) return 24;
  let cidr = 0;
  for (const p of parts) {
    if (p === 255) cidr += 8;
    else if (p === 254) cidr += 7;
    else if (p === 252) cidr += 6;
    else if (p === 248) cidr += 5;
    else if (p === 240) cidr += 4;
    else if (p === 224) cidr += 3;
    else if (p === 192) cidr += 2;
    else if (p === 128) cidr += 1;
    else break;
  }
  return cidr || 24;
}

export default router;
