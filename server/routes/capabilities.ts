// Capabilities API Route
// Provides Freebox model capabilities to the frontend

import { Router } from 'express';
import { modelDetection } from '../services/modelDetection.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

/**
 * GET /api/capabilities
 * Returns the detected Freebox capabilities
 * This endpoint can be called without prior detection - it will auto-detect
 */
router.get('/', asyncHandler(async (_req, res) => {
  const capabilities = await modelDetection.detectModel();

  res.json({
    success: true,
    result: capabilities
  });
}));

/**
 * POST /api/capabilities/refresh
 * Forces a refresh of the model detection
 * Useful after reconnection or when capabilities might have changed
 */
router.post('/refresh', asyncHandler(async (_req, res) => {
  const capabilities = await modelDetection.refreshCapabilities();

  res.json({
    success: true,
    result: capabilities
  });
}));

/**
 * GET /api/capabilities/features
 * Returns a simplified feature availability object
 * Useful for quick UI checks
 */
router.get('/features', asyncHandler(async (_req, res) => {
  const capabilities = await modelDetection.detectModel();

  res.json({
    success: true,
    result: {
      model: capabilities.model,
      modelName: capabilities.modelName,
      features: {
        vm: capabilities.vmSupport !== 'none',
        vmFull: capabilities.vmSupport === 'full',
        vmLimited: capabilities.vmSupport === 'limited',
        maxVms: capabilities.maxVms,
        wifi6ghz: capabilities.wifi6ghz,
        internalStorage: capabilities.hasInternalStorage,
        maxEthernetSpeed: capabilities.maxEthernetSpeed
      }
    }
  });
}));

export default router;
