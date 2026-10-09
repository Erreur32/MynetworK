/**
 * Authentication middleware
 * 
 * Protects routes by verifying JWT tokens
 */

import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService.js';
import { UserRepository } from '../database/models/User.js';
import { tokenBlacklistService } from '../services/tokenBlacklistService.js';

export interface AuthenticatedUser {
    userId: number;
    username: string;
    role: 'admin' | 'user' | 'viewer';
}

export interface AuthenticatedRequest extends Request {
    user?: AuthenticatedUser;
}

class AuthError extends Error {
    constructor(readonly code: string, message: string) {
        super(message);
    }
}

/**
 * Resolve a bearer token to its user. Rejects revoked tokens (logout/ban),
 * invalid signatures and disabled accounts. Shared by the HTTP middlewares
 * and the WebSocket upgrade handler so both enforce the same rules.
 */
export const authenticateToken = async (token: string): Promise<AuthenticatedUser> => {
    if (tokenBlacklistService.isRevoked(token)) {
        throw new AuthError('TOKEN_REVOKED', 'Token has been revoked');
    }

    const payload = await authService.verifyToken(token);

    const user = UserRepository.findById(payload.userId);
    if (!user || !user.enabled) {
        throw new AuthError('USER_DISABLED', 'User account is disabled');
    }

    // Role and username come from the database, not the token payload, so a
    // demotion or rename takes effect immediately instead of at token expiry.
    return {
        userId: user.id,
        username: user.username,
        role: user.role
    };
};

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
        req.user = await authenticateToken(token);
        next();
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Authentication failed';
        res.status(401).json({
            success: false,
            error: {
                code: error instanceof AuthError ? error.code : 'AUTH_FAILED',
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
            req.user = await authenticateToken(authHeader.substring(7));
        }
    } catch {
        // Ignore errors for optional auth
    }
    
    next();
};

