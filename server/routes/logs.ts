/**
 * Logs routes
 * 
 * Handles retrieval of activity logs
 */

import { Router } from 'express';
import { loggingService } from '../services/loggingService.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { requireAuth, requireAdmin, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { autoLog } from '../middleware/loggingMiddleware.js';

const router = Router();

// GET /api/logs - Get logs with filters (admin only)
router.get('/', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const {
        userId,
        pluginId,
        action,
        resource,
        level,
        startDate,
        endDate,
        limit = '100',
        offset = '0'
    } = req.query;

    const filters: any = {};

    if (userId) {
        filters.userId = parseInt(userId as string, 10);
    }
    if (pluginId) {
        filters.pluginId = pluginId as string;
    }
    if (action) {
        filters.action = action as string;
    }
    if (resource) {
        filters.resource = resource as string;
    }
    if (level) {
        filters.level = level as string;
    }
    if (startDate) {
        filters.startDate = new Date(startDate as string);
    }
    if (endDate) {
        filters.endDate = new Date(endDate as string);
    }
    if (limit) {
        filters.limit = parseInt(limit as string, 10);
    }
    if (offset) {
        filters.offset = parseInt(offset as string, 10);
    }

    const logs = loggingService.getLogs(filters);
    const total = loggingService.countLogs(filters);

    res.json({
        success: true,
        result: {
            logs,
            total,
            limit: filters.limit,
            offset: filters.offset
        }
    });
}));

// GET /api/logs/count - Get log count with filters (admin only)
router.get('/count', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const {
        userId,
        pluginId,
        action,
        resource,
        level,
        startDate,
        endDate
    } = req.query;

    const filters: any = {};

    if (userId) {
        filters.userId = parseInt(userId as string, 10);
    }
    if (pluginId) {
        filters.pluginId = pluginId as string;
    }
    if (action) {
        filters.action = action as string;
    }
    if (resource) {
        filters.resource = resource as string;
    }
    if (level) {
        filters.level = level as string;
    }
    if (startDate) {
        filters.startDate = new Date(startDate as string);
    }
    if (endDate) {
        filters.endDate = new Date(endDate as string);
    }

    const count = loggingService.countLogs(filters);

    res.json({
        success: true,
        result: { count }
    });
}));

// DELETE /api/logs/cleanup - Cleanup old logs (admin only)
router.delete('/cleanup', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { daysToKeep = '90' } = req.query;
    const days = parseInt(daysToKeep as string, 10);

    if (isNaN(days) || days < 1) {
        throw createError('daysToKeep must be a positive number', 400, 'INVALID_DAYS');
    }

    const deletedCount = loggingService.cleanupOldLogs(days);

    // Log the action
    await loggingService.logUserAction(
        req.user!.userId,
        req.user!.username,
        'logs.cleanup',
        'logs',
        {
            details: { daysToKeep: days, deletedCount },
            level: 'info'
        }
    );

    res.json({
        success: true,
        result: {
            message: `Deleted ${deletedCount} old log entries`,
            deletedCount
        }
    });
}), autoLog('logs.cleanup', 'logs'));

// DELETE /api/logs - Delete all logs (admin only)
router.delete('/', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const deletedCount = loggingService.deleteAllLogs();

    // Log the action (before deletion, so it will be the last log)
    await loggingService.logUserAction(
        req.user!.userId,
        req.user!.username,
        'logs.deleteAll',
        'logs',
        {
            details: { deletedCount },
            level: 'warning'
        }
    );

    res.json({
        success: true,
        result: {
            message: `Deleted ${deletedCount} log entries`,
            deletedCount
        }
    });
}), autoLog('logs.deleteAll', 'logs'));

export default router;

