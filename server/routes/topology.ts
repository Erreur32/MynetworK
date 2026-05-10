import { Router } from 'express';
import { requireAuth, requireAdmin, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { topologyService } from '../services/topologyService.js';
import { TopologyNodePositionRepository, type NodePosition } from '../database/models/TopologyNodePosition.js';

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

// GET /api/topology/positions - Stored manual placements (id → {x, y})
router.get('/positions', requireAuth, asyncHandler(async (_req: AuthenticatedRequest, res) => {
    const map = TopologyNodePositionRepository.getAll();
    const out: Record<string, { x: number; y: number }> = {};
    for (const [id, pos] of map) out[id] = pos;
    res.json({ success: true, result: out });
}));

// POST /api/topology/positions - Persist one or many node positions
router.post('/positions', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = req.body as { nodeId?: string; x?: number; y?: number; positions?: NodePosition[] };
    if (Array.isArray(body.positions) && body.positions.length > 0) {
        const valid = body.positions.filter(p =>
            typeof p?.nodeId === 'string' && typeof p?.x === 'number' && typeof p?.y === 'number'
        );
        if (valid.length === 0) throw createError('No valid positions provided', 400, 'INVALID_PAYLOAD');
        TopologyNodePositionRepository.setMany(valid);
        res.json({ success: true, result: { saved: valid.length } });
        return;
    }
    if (typeof body.nodeId !== 'string' || typeof body.x !== 'number' || typeof body.y !== 'number') {
        throw createError('nodeId / x / y required', 400, 'INVALID_PAYLOAD');
    }
    TopologyNodePositionRepository.set(body.nodeId, body.x, body.y);
    res.json({ success: true });
}));

// DELETE /api/topology/positions - Clear all manual placements (revert to dagre)
router.delete('/positions', requireAuth, requireAdmin, asyncHandler(async (_req: AuthenticatedRequest, res) => {
    TopologyNodePositionRepository.clear();
    res.json({ success: true });
}));

export default router;
