/**
 * Authentication middleware
 * 
 * Protects routes by verifying JWT tokens
 */

import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService.js';
import { UserRepository } from '../database/models/User.js';

export interface AuthenticatedRequest extends Request {
    user?: {
        userId: number;
        username: string;
        role: 'admin' | 'user' | 'viewer';
    };
}

/**
 * Middleware to require authentication
 * Adds user info to request object if token is valid
 */
export const requireAuth = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                success: false,
                error: {
                    code: 'NO_TOKEN',
                    message: 'No authentication token provided'
                }
            });
            return;
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify token
        const payload = await authService.verifyToken(token);

        // Verify user still exists and is enabled
        const user = UserRepository.findById(payload.userId);
        if (!user || !user.enabled) {
            res.status(401).json({
                success: false,
                error: {
                    code: 'USER_DISABLED',
                    message: 'User account is disabled'
                }
            });
            return;
        }

        // Add user info to request
        req.user = {
            userId: payload.userId,
            username: payload.username,
            role: payload.role as 'admin' | 'user' | 'viewer'
        };

        next();
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Authentication failed';
        res.status(401).json({
            success: false,
            error: {
                code: 'AUTH_FAILED',
                message
            }
        });
    }
};

/**
 * Middleware to require admin role
 * Must be used after requireAuth
 */
export const requireAdmin = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): void => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            error: {
                code: 'NOT_AUTHENTICATED',
                message: 'Authentication required'
            }
        });
        return;
    }

    if (req.user.role !== 'admin') {
        res.status(403).json({
            success: false,
            error: {
                code: 'FORBIDDEN',
                message: 'Admin access required'
            }
        });
        return;
    }

    next();
};

/**
 * Optional authentication middleware
 * Adds user info if token is present, but doesn't fail if missing
 */
export const optionalAuth = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const payload = await authService.verifyToken(token);
            const user = UserRepository.findById(payload.userId);
            
            if (user && user.enabled) {
                req.user = {
                    userId: payload.userId,
                    username: payload.username,
                    role: payload.role as 'admin' | 'user' | 'viewer'
                };
            }
        }
    } catch {
        // Ignore errors for optional auth
    }
    
    next();
};

