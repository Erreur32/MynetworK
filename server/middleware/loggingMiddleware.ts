/**
 * Logging middleware
 * 
 * Automatically logs API requests
 */

import { Request, Response, NextFunction } from 'express';
import { loggingService } from '../services/loggingService.js';
import type { AuthenticatedRequest } from './authMiddleware.js';
import { getClientIp } from '../utils/getClientIp.js';

/**
 * Create middleware to automatically log an action
 */
export const autoLog = (
    action: string,
    resource: string,
    getResourceId?: (req: Request) => string | undefined
) => {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
        // Store original json method
        const originalJson = res.json.bind(res);

        // Override json method to log after response
        res.json = function (body: any) {
            // Only log successful requests (status < 400)
            if (res.statusCode < 400 && req.user) {
                const resourceId = getResourceId ? getResourceId(req) : undefined;
                
                // Log asynchronously (don't wait)
                loggingService.logUserAction(
                    req.user.userId,
                    req.user.username,
                    action,
                    resource,
                    {
                        resourceId,
                        ipAddress: getClientIp(req),
                        userAgent: req.get('user-agent') || undefined,
                        level: res.statusCode >= 400 ? 'error' : 'info'
                    }
                ).catch(err => {
                    console.error('[Logging] Failed to log action:', err);
                });
            }

            return originalJson(body);
        };

        next();
    };
};

/**
 * Middleware to log all API requests
 */
export const logAllRequests = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): void => {
    // Only log authenticated requests
    if (req.user) {
        const action = `${req.method} ${req.path}`;
        const resource = 'api';
        
        loggingService.logUserAction(
            req.user.userId,
            req.user.username,
            action,
            resource,
            {
                ipAddress: getClientIp(req),
                userAgent: req.get('user-agent') || undefined,
                level: 'info'
            }
        ).catch(err => {
            console.error('[Logging] Failed to log request:', err);
        });
    }

    next();
};

