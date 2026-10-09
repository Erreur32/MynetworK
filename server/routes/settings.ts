import { Router, type Request } from 'express';
import { freeboxApi } from '../services/freeboxApi.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getDatabase } from '../database/connection.js';
import { requireAuth, requireAdmin, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { param } from '../utils/params.js';

const router = Router();
router.use(requireAuth);

// Most routes here relay a single Freebox API call and return its result as-is
const relay = (call: (req: Request) => Promise<unknown>) =>
  asyncHandler(async (req, res) => {
    res.json(await call(req));
  });

// ===== DHCP =====

// GET /api/settings/dhcp - Get DHCP config
router.get('/dhcp', relay(() => freeboxApi.getDhcpConfig()));

// PUT /api/settings/dhcp - Update DHCP config
router.put('/dhcp', requireAdmin, relay((req) => freeboxApi.updateDhcpConfig(req.body)));

// GET /api/settings/dhcp/leases - Get DHCP leases
router.get('/dhcp/leases', relay(() => freeboxApi.getDhcpLeases()));

// GET /api/settings/dhcp/static - Get static leases
router.get('/dhcp/static', relay(() => freeboxApi.getDhcpStaticLeases()));

// POST /api/settings/dhcp/static - Create static lease
router.post('/dhcp/static', requireAdmin, relay((req) => {
  const { mac, ip, comment } = req.body;
  return freeboxApi.addDhcpStaticLease(mac, ip, comment);
}));

// DELETE /api/settings/dhcp/static/:id - Delete static lease
router.delete('/dhcp/static/:id', requireAdmin, relay((req) => freeboxApi.deleteDhcpStaticLease(param(req, 'id'))));

// ===== FTP =====

// GET /api/settings/ftp - Get FTP config
router.get('/ftp', relay(() => freeboxApi.getFtpConfig()));

// PUT /api/settings/ftp - Update FTP config
router.put('/ftp', requireAdmin, relay((req) => freeboxApi.updateFtpConfig(req.body)));

// ===== VPN Server =====

// GET /api/settings/vpn/servers - List all VPN servers (openvpn_routed, openvpn_bridge, pptp)
router.get('/vpn/servers', relay(() => freeboxApi.getVpnServers()));

// GET /api/settings/vpn/servers/:id - Get specific VPN server
router.get('/vpn/servers/:id', relay((req) => freeboxApi.getVpnServer(param(req, 'id'))));

// GET /api/settings/vpn/servers/:id/config - Get VPN server config
router.get('/vpn/servers/:id/config', requireAdmin, relay((req) => freeboxApi.getVpnServerConfig(param(req, 'id'))));

// PUT /api/settings/vpn/servers/:id/config - Update VPN server config
router.put('/vpn/servers/:id/config', requireAdmin, relay((req) => freeboxApi.updateVpnServerConfig(param(req, 'id'), req.body)));

// POST /api/settings/vpn/servers/:id/start - Start VPN server
router.post('/vpn/servers/:id/start', requireAdmin, relay((req) => freeboxApi.startVpnServer(param(req, 'id'))));

// POST /api/settings/vpn/servers/:id/stop - Stop VPN server
router.post('/vpn/servers/:id/stop', requireAdmin, relay((req) => freeboxApi.stopVpnServer(param(req, 'id'))));

// Legacy route for backward compatibility
router.get('/vpn/server', relay(() => freeboxApi.getVpnServers()));

// PUT /api/settings/vpn/server - Update VPN server config (legacy)
router.put('/vpn/server', requireAdmin, relay((req) => freeboxApi.updateVpnServerConfig('openvpn_routed', req.body)));

// GET /api/settings/vpn/users - Get VPN users
router.get('/vpn/users', requireAdmin, relay(() => freeboxApi.getVpnUsers()));

// POST /api/settings/vpn/users - Create VPN user
router.post('/vpn/users', requireAdmin, relay((req) => freeboxApi.createVpnUser(req.body)));

// DELETE /api/settings/vpn/users/:login - Delete VPN user
router.delete('/vpn/users/:login', requireAdmin, relay((req) => freeboxApi.deleteVpnUser(param(req, 'login'))));

// GET /api/settings/vpn/connections - Get active VPN connections
router.get('/vpn/connections', relay(() => freeboxApi.getVpnConnections()));

// ===== VPN Client =====

// GET /api/settings/vpn/client - Get VPN client configs
router.get('/vpn/client', requireAdmin, relay(() => freeboxApi.getVpnClientConfigs()));

// GET /api/settings/vpn/client/status - Get VPN client status
router.get('/vpn/client/status', relay(() => freeboxApi.getVpnClientStatus()));

// ===== Port Forwarding =====

// GET /api/settings/nat/redirections - Get port forwarding rules
router.get('/nat/redirections', relay(() => freeboxApi.getPortForwardingRules()));

// POST /api/settings/nat/redirections - Create port forwarding rule
router.post('/nat/redirections', requireAdmin, relay((req) => freeboxApi.createPortForwardingRule(req.body)));

// PUT /api/settings/nat/redirections/:id - Update port forwarding rule
router.put('/nat/redirections/:id', requireAdmin, relay((req) => freeboxApi.updatePortForwardingRule(parseInt(param(req, 'id')), req.body)));

// DELETE /api/settings/nat/redirections/:id - Delete port forwarding rule
router.delete('/nat/redirections/:id', requireAdmin, relay((req) => freeboxApi.deletePortForwardingRule(parseInt(param(req, 'id')))));

// GET /api/settings/nat/dmz - Get DMZ config
router.get('/nat/dmz', relay(() => freeboxApi.getDmzConfig()));

// PUT /api/settings/nat/dmz - Update DMZ config
router.put('/nat/dmz', requireAdmin, relay((req) => freeboxApi.updateDmzConfig(req.body)));

// ===== Switch / Ports =====

// GET /api/settings/switch - Get switch status
router.get('/switch', relay(() => freeboxApi.getSwitchStatus()));

// GET /api/settings/switch/ports - Get switch ports
router.get('/switch/ports', relay(() => freeboxApi.getSwitchPorts()));

// ===== LCD =====

// GET /api/settings/lcd - Get LCD config
router.get('/lcd', relay(() => freeboxApi.getLcdConfig()));

// PUT /api/settings/lcd - Update LCD config
router.put('/lcd', requireAdmin, relay((req) => freeboxApi.updateLcdConfig(req.body)));

// ===== Freeplugs =====

// GET /api/settings/freeplugs - Get freeplugs
router.get('/freeplugs', relay(() => freeboxApi.getFreeplugs()));

// ===== Connection / IP Config =====

// GET /api/settings/connection - Get connection config
router.get('/connection', relay(() => freeboxApi.getConnectionConfig()));

// PUT /api/settings/connection - Update connection config
router.put('/connection', requireAdmin, relay((req) => freeboxApi.updateConnectionConfig(req.body)));

// GET /api/settings/connection/ipv6 - Get IPv6 config
router.get('/connection/ipv6', relay(() => freeboxApi.getIpv6Config()));

// PUT /api/settings/connection/ipv6 - Update IPv6 config
router.put('/connection/ipv6', requireAdmin, relay((req) => freeboxApi.updateIpv6Config(req.body)));

// GET /api/settings/connection/ftth - Get FTTH info
router.get('/connection/ftth', relay(() => freeboxApi.getFtthInfo()));

// ===== LAN Config =====

// GET /api/settings/lan - Get LAN config
router.get('/lan', relay(() => freeboxApi.getLanConfig()));

// PUT /api/settings/lan - Update LAN config
router.put('/lan', requireAdmin, relay((req) => freeboxApi.updateLanConfig(req.body)));

// ===== THEME =====

// GET /api/settings/theme - Get theme configuration
router.get('/theme', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const db = getDatabase();
  const stmt = db.prepare('SELECT value FROM app_config WHERE key = ?');
  const row = stmt.get('theme_config') as { value: string } | undefined;
  
  if (row) {
    const config = JSON.parse(row.value);
    res.json({
      success: true,
      result: config
    });
  } else {
    // Return default theme
    res.json({
      success: true,
      result: {
        theme: 'dark',
        customColors: undefined
      }
    });
  }
}));

// POST /api/settings/theme - Save theme configuration
router.post('/theme', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { theme, customColors } = req.body;
  
  if (!theme || !['dark', 'glass', 'modern', 'nightly', 'neon', 'elegant'].includes(theme)) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid theme. Must be one of: dark, glass, modern, nightly, neon, elegant',
        code: 'INVALID_THEME'
      }
    });
  }
  
  const db = getDatabase();
  const config = {
    theme,
    customColors: customColors || undefined
  };
  
  const stmt = db.prepare(`
    INSERT INTO app_config (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  stmt.run('theme_config', JSON.stringify(config));
  
  res.json({
    success: true,
    result: config
  });
}));

export default router;