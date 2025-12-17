/**
 * Debug Configuration Routes
 * 
 * Handles debug logging configuration
 */

import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { logBuffer } from '../utils/logBuffer.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * GET /api/debug/config
 * Get debug configuration
 */
router.get('/config', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const config = logger.getConfig();
  
  res.json({
    success: true,
    result: config
  });
}));

/**
 * POST /api/debug/config
 * Update debug configuration
 */
router.post('/config', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { debug, verbose } = req.body;
  
  if (typeof debug !== 'boolean') {
    return res.status(400).json({
      success: false,
      error: {
        message: 'debug must be a boolean',
        code: 'INVALID_INPUT'
      }
    });
  }
  
  if (verbose !== undefined && typeof verbose !== 'boolean') {
    return res.status(400).json({
      success: false,
      error: {
        message: 'verbose must be a boolean',
        code: 'INVALID_INPUT'
      }
    });
  }
  
  logger.setConfig(debug, verbose || false);
  logger.reloadConfig();
  
  res.json({
    success: true,
    result: logger.getConfig()
  });
}));

/**
 * GET /api/debug/logs
 * Get application logs
 */
router.get('/logs', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const limit = parseInt(req.query.limit as string) || 500;
  const level = req.query.level as string | undefined;
  
  let logs = logBuffer.getRecent(limit);
  
  // Filter by level if specified
  if (level && level !== 'all') {
    logs = logs.filter(log => log.level === level);
  }
  
  res.json({
    success: true,
    result: {
      logs,
      total: logBuffer.getCount()
    }
  });
}));

/**
 * DELETE /api/debug/logs
 * Clear application logs
 */
router.delete('/logs', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
  logBuffer.clear();
  
  res.json({
    success: true,
    result: { message: 'Logs cleared' }
  });
}));

export default router;
