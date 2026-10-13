import { Router } from 'express';
import { freeboxApi } from '../services/freeboxApi.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { param } from '../utils/params.js';

import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';
import { redactForNonAdmin } from '../utils/redactSecrets.js';
import { summarizeFreebox } from '../utils/freeboxSummary.js';
import { freeboxFirmwareCheckService } from '../services/freeboxFirmwareCheckService.js';
import { normalizeSystemInfo } from '../services/apiNormalizer.js';

const router = Router();
router.use(requireAuth);

// GET /api/connection - Get connection status
router.get('/', asyncHandler(async (_req, res) => {
  const result = await freeboxApi.getConnectionStatus();
  res.json(result);
}));

// GET /api/connection/summary - Line state, rates and box health in one call (API tokens: no IP, serial or MAC)
router.get('/summary', asyncHandler(async (_req, res) => {
    const [conn, system, version] = await Promise.all([
        freeboxApi.getConnectionStatus(),
        freeboxApi.getSystemInfo(),
        freeboxApi.getApiVersion()
    ]);
    if (!conn.success && !system.success) {
        res.json(conn);
        return;
    }
    const sys = system.success && system.result
        ? normalizeSystemInfo({ ...(system.result as Record<string, unknown>), box_model_name: (version.result as Record<string, unknown> | undefined)?.box_model_name })
        : null;
    const latest = freeboxFirmwareCheckService.getLatestFirmwareInfo()?.server.latestVersion;
    res.json({ success: true, result: summarizeFreebox(conn.success ? conn.result : null, sys, latest) });
}));

// GET /api/connection/config - Get connection config
router.get('/config', asyncHandler(async (_req, res) => {
  const result = await freeboxApi.getConnectionConfig();
  res.json(result);
}));

// GET /api/connection/ipv6 - Get IPv6 config
router.get('/ipv6', asyncHandler(async (_req, res) => {
  const result = await freeboxApi.getIpv6Config();
  res.json(result);
}));

// GET /api/connection/history - Get bandwidth history (RRD)
router.get('/history', asyncHandler(async (req, res) => {
  const { start, end } = req.query;
  const dateStart = start ? parseInt(start as string, 10) : undefined;
  const dateEnd = end ? parseInt(end as string, 10) : undefined;

  // Request all net fields - the API will return rate_down, rate_up, bw_down, bw_up
  const result = await freeboxApi.getRrdData('net', dateStart, dateEnd);

  res.json(result);
}));

// GET /api/connection/temp-history - Get temperature history (RRD)
router.get('/temp-history', asyncHandler(async (req, res) => {
  const { start, end } = req.query;
  const dateStart = start ? parseInt(start as string, 10) : undefined;
  const dateEnd = end ? parseInt(end as string, 10) : undefined;

  const result = await freeboxApi.getRrdData('temp', dateStart, dateEnd);

  res.json(result);
}));

// GET /api/connection/logs - Get connection logs
router.get('/logs', asyncHandler(async (_req, res) => {
  const result = await freeboxApi.getConnectionLogs();
  res.json(result);
}));

// PUT /api/connection/config - Update connection config
router.put('/config', requireAdmin, asyncHandler(async (req, res) => {
  const result = await freeboxApi.updateConnectionConfig(req.body);
  res.json(result);
}));

// ===== DynDNS =====

// GET /api/connection/ddns/:provider - Get DynDNS config
router.get('/ddns/:provider', asyncHandler(async (req, res) => {
  const provider = param(req, 'provider');
  if (!['ovh', 'dyndns', 'noip'].includes(provider)) {
    return res.status(400).json({
      success: false,
      error_code: 'invalid_provider',
      msg: 'Invalid provider. Must be one of: ovh, dyndns, noip'
    });
  }
  const result = await freeboxApi.getDdnsConfig(provider as 'ovh' | 'dyndns' | 'noip');
  res.json(redactForNonAdmin(req, result));
}));

// PUT /api/connection/ddns/:provider - Update DynDNS config
router.put('/ddns/:provider', requireAdmin, asyncHandler(async (req, res) => {
  const provider = param(req, 'provider');
  if (!['ovh', 'dyndns', 'noip'].includes(provider)) {
    return res.status(400).json({
      success: false,
      error_code: 'invalid_provider',
      msg: 'Invalid provider. Must be one of: ovh, dyndns, noip'
    });
  }
  const result = await freeboxApi.updateDdnsConfig(provider as 'ovh' | 'dyndns' | 'noip', req.body);
  res.json(result);
}));

// GET /api/connection/ddns/:provider/status - Get DynDNS status
router.get('/ddns/:provider/status', asyncHandler(async (req, res) => {
  const provider = param(req, 'provider');
  if (!['ovh', 'dyndns', 'noip'].includes(provider)) {
    return res.status(400).json({
      success: false,
      error_code: 'invalid_provider',
      msg: 'Invalid provider. Must be one of: ovh, dyndns, noip'
    });
  }
  const result = await freeboxApi.getDdnsStatus(provider as 'ovh' | 'dyndns' | 'noip');
  res.json(result);
}));

export default router;