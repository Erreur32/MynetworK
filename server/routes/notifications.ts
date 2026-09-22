import { Router } from 'express';
import { freeboxApi } from '../services/freeboxApi.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

// GET /api/notifications - Get notifications
router.get('/', requireAuth, asyncHandler(async (_req, res) => {
  const result = await freeboxApi.getNotifications();
  res.json(result);
}));

export default router;