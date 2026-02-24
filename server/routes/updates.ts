/**
 * Update Check Routes
 *
 * Handles checking for new Docker image versions from GitHub Container Registry.
 * Uses updateCheckService (12h cache + scheduler).
 */

import express from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getDatabase } from '../database/connection.js';
import { getCheckResult, startScheduler, stopScheduler } from '../services/updateCheckService.js';

const router = express.Router();

/**
 * GET /api/updates/check
 * Returns cached result (12h TTL) or runs check. Includes lastCheckAt (ISO date).
 */
router.get('/check', requireAuth, asyncHandler(async (_req: AuthenticatedRequest, res) => {
  const result = await getCheckResult();
  res.json({ success: true, result });
}));

/**
 * GET /api/updates/config
 * Get update check configuration
 */
router.get('/config', requireAuth, asyncHandler(async (_req: AuthenticatedRequest, res) => {
  const db = getDatabase();
  const stmt = db.prepare('SELECT value FROM app_config WHERE key = ?');
  const row = stmt.get('update_check_config') as { value: string } | undefined;

  let config = { enabled: false };
  if (row) {
    try {
      config = JSON.parse(row.value);
    } catch (error) {
      console.error('[Updates] Error parsing update_check_config:', error);
    }
  }

  res.json({
    success: true,
    result: config
  });
}));

/**
 * POST /api/updates/config
 * Update update check configuration. Starts/stops 12h scheduler.
 */
router.post('/config', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { enabled } = req.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({
      success: false,
      error: {
        message: 'enabled must be a boolean',
        code: 'INVALID_INPUT'
      }
    });
  }

  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO app_config (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `);

  const config = { enabled };
  stmt.run('update_check_config', JSON.stringify(config));

  if (enabled) {
    startScheduler();
  } else {
    stopScheduler();
  }

  res.json({
    success: true,
    result: config
  });
}));

export default router;
