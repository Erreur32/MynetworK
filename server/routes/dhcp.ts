import { Router } from 'express';
import { freeboxApi } from '../services/freeboxApi.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { param } from '../utils/params.js';
import { parseCompactQuery, compactList, summarizeDhcpLease } from '../utils/freeboxExtras.js';

import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();
router.use(requireAuth);

// GET /api/dhcp/config - Get DHCP configuration
router.get('/config', asyncHandler(async (_req, res) => {
  const result = await freeboxApi.getDhcpConfig();
  res.json(result);
}));

// PUT /api/dhcp/config - Update DHCP configuration
router.put('/config', requireAdmin, asyncHandler(async (req, res) => {
  const result = await freeboxApi.updateDhcpConfig(req.body);
  res.json(result);
}));

// GET /api/dhcp/leases - Get dynamic DHCP leases (no configuration)
// Opt-in compact output: ?compact=1[&active=1][&limit=N][&search=text]
router.get('/leases', asyncHandler(async (req, res) => {
  const result = await freeboxApi.getDhcpLeases();
  const query = parseCompactQuery(req.query);
  if (query.compact && result.success && Array.isArray(result.result)) {
    res.json(compactList(result.result, query, {
      isActive: (l) => (l.host as { active?: unknown } | undefined)?.active === true,
      searchFields: (l) => [l.hostname, (l.host as { primary_name?: unknown } | undefined)?.primary_name, l.mac, l.ip],
      project: summarizeDhcpLease,
    }));
    return;
  }
  res.json(result);
}));

// GET /api/dhcp/static-leases - Get all static leases
router.get('/static-leases', asyncHandler(async (_req, res) => {
  const result = await freeboxApi.getDhcpStaticLeases();
  res.json(result);
}));

// GET /api/dhcp/static-leases/:id - Get a specific static lease
router.get('/static-leases/:id', asyncHandler(async (req, res) => {
  const result = await freeboxApi.getDhcpStaticLease(param(req, 'id'));
  res.json(result);
}));

// POST /api/dhcp/static-leases - Add a new static lease
router.post('/static-leases', requireAdmin, asyncHandler(async (req, res) => {
  const { mac, ip, comment } = req.body;
  const result = await freeboxApi.addDhcpStaticLease(mac, ip, comment);
  res.json(result);
}));

// PUT /api/dhcp/static-leases/:id - Update a static lease
router.put('/static-leases/:id', requireAdmin, asyncHandler(async (req, res) => {
  const result = await freeboxApi.updateDhcpStaticLease(param(req, 'id'), req.body);
  res.json(result);
}));

// DELETE /api/dhcp/static-leases/:id - Delete a static lease
router.delete('/static-leases/:id', requireAdmin, asyncHandler(async (req, res) => {
  const result = await freeboxApi.deleteDhcpStaticLease(param(req, 'id'));
  res.json(result);
}));

export default router;
