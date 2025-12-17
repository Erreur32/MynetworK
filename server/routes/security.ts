/**
 * Security routes
 * 
 * Handles security audit, notifications, and brute force management
 */

import { Router } from 'express';
import { requireAuth, requireAdmin, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { securityAuditService } from '../services/securityAuditService.js';
import { bruteForceProtection } from '../services/bruteForceProtection.js';
import { securityNotificationService } from '../services/securityNotificationService.js';
import { autoLog } from '../middleware/loggingMiddleware.js';

const router = Router();

// GET /api/security/audit - Get security audit logs
router.get('/audit', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const action = req.query.action as string;
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    const level = req.query.level as 'info' | 'warning' | 'error';
    const startDate = req.query.startDate ? parseInt(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? parseInt(req.query.endDate as string) : undefined;

    const logs = await securityAuditService.getAuditLogs({
        limit,
        offset,
        action,
        userId,
        level,
        startDate,
        endDate
    });

    res.json({
        success: true,
        result: logs
    });
}), autoLog('security.audit.view', 'security'));

// GET /api/security/audit/stats - Get security audit statistics
router.get('/audit/stats', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const stats = await securityAuditService.getAuditStats();

    res.json({
        success: true,
        result: stats
    });
}), autoLog('security.audit.stats', 'security'));

// GET /api/security/audit/export - Export security audit logs
router.get('/audit/export', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const format = (req.query.format as 'json' | 'csv') || 'json';
    const startDate = req.query.startDate ? parseInt(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? parseInt(req.query.endDate as string) : undefined;

    const exportData = await securityAuditService.exportAuditLogs({
        format,
        startDate,
        endDate
    });

    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="security-audit-${Date.now()}.${format}"`);
    res.send(exportData);
}), autoLog('security.audit.export', 'security'));

// GET /api/security/notifications - Get recent security notifications
router.get('/notifications', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const type = req.query.type as string;
    const severity = req.query.severity as 'info' | 'warning' | 'error' | 'critical';

    let notifications;
    if (type) {
        notifications = securityNotificationService.getNotificationsByType(type as any, limit);
    } else if (severity) {
        notifications = securityNotificationService.getNotificationsBySeverity(severity, limit);
    } else {
        notifications = securityNotificationService.getRecentNotifications(limit);
    }

    res.json({
        success: true,
        result: notifications
    });
}), autoLog('security.notifications.view', 'security'));

// GET /api/security/blocked - Get all blocked IPs and usernames
router.get('/blocked', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const blocked = bruteForceProtection.getBlockedIdentifiers();

    res.json({
        success: true,
        result: blocked
    });
}), autoLog('security.blocked.view', 'security'));

// POST /api/security/blocked/:identifier/unblock - Unblock an IP or username
router.post('/blocked/:identifier/unblock', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const identifier = decodeURIComponent(req.params.identifier);

    const unblocked = bruteForceProtection.unblock(identifier);

    if (!unblocked) {
        throw createError('Identifier not found or not blocked', 404, 'NOT_FOUND');
    }

    await securityNotificationService.notifyIpUnblocked(identifier);

    res.json({
        success: true,
        result: {
            message: `Identifier "${identifier}" has been unblocked`
        }
    });
}), autoLog('security.blocked.unblock', 'security', (req) => req.params.identifier));

export default router;

