import { Router } from 'express';
import { requireAuth, requireAdmin, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { topologyService } from '../services/topologyService.js';

const router = Router();

// GET /api/topology - Return the latest stored snapshot (or null on first run)
router.get('/', requireAuth, asyncHandler(async (_req: AuthenticatedRequest, res) => {
    const graph = await topologyService.getStored();
    if (!graph) {
        res.json({
            success: true,
            result: null,
            message: 'No topology snapshot yet. Trigger a refresh.'
        });
        return;
    }
    res.json({ success: true, result: graph });
}));

// POST /api/topology/refresh - Recompute the snapshot now (admin only)
router.post('/refresh', requireAuth, requireAdmin, asyncHandler(async (_req: AuthenticatedRequest, res) => {
    const graph = await topologyService.buildAndSave();
    res.json({ success: true, result: graph });
}));

export default router;
