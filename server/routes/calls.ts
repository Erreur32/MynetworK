import { Router } from 'express';
import { freeboxApi } from '../services/freeboxApi.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { param } from '../utils/params.js';

const router = Router();

// GET /api/calls - Get call log
router.get('/', asyncHandler(async (_req, res) => {
  const result = await freeboxApi.getCallLog();
  res.json(result);
}));

// POST /api/calls/mark-read - Mark all calls as read
router.post('/mark-read', asyncHandler(async (_req, res) => {
  const result = await freeboxApi.markCallsAsRead();
  res.json(result);
}));

// DELETE /api/calls - Delete all calls
router.delete('/', asyncHandler(async (_req, res) => {
  const result = await freeboxApi.deleteAllCalls();
  res.json(result);
}));

// DELETE /api/calls/:id - Delete specific call
router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await freeboxApi.deleteCall(parseInt(param(req, 'id')));
  res.json(result);
}));

export default router;