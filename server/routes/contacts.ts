import { Router } from 'express';
import { freeboxApi } from '../services/freeboxApi.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { param } from '../utils/params.js';

import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();
router.use(requireAuth);

// GET /api/contacts - Get all contacts
router.get('/', asyncHandler(async (_req, res) => {
  const result = await freeboxApi.getContacts();
  res.json(result);
}));

// GET /api/contacts/:id - Get specific contact
router.get('/:id', asyncHandler(async (req, res) => {
  const result = await freeboxApi.getContact(parseInt(param(req, 'id')));
  res.json(result);
}));

// POST /api/contacts - Create contact
router.post('/', requireAdmin, asyncHandler(async (req, res) => {
  const result = await freeboxApi.createContact(req.body);
  res.json(result);
}));

// PUT /api/contacts/:id - Update contact
router.put('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const result = await freeboxApi.updateContact(parseInt(param(req, 'id')), req.body);
  res.json(result);
}));

// DELETE /api/contacts/:id - Delete contact
router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const result = await freeboxApi.deleteContact(parseInt(param(req, 'id')));
  res.json(result);
}));

export default router;