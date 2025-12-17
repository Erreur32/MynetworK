/**
 * User management routes
 * 
 * Handles user CRUD operations and authentication
 */

import { Router } from 'express';
import { authService } from '../services/authService.js';
import { UserRepository, type CreateUserInput, type UpdateUserInput } from '../database/models/User.js';
import { loggingService } from '../services/loggingService.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { requireAuth, requireAdmin, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { autoLog } from '../middleware/loggingMiddleware.js';

const router = Router();

// POST /api/users/register - Register new user (public, but can be restricted)
router.post('/register', asyncHandler(async (req, res) => {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password) {
        throw createError('Username, email and password are required', 400, 'MISSING_FIELDS');
    }

    // Validate password strength
    if (password.length < 8) {
        throw createError('Password must be at least 8 characters long', 400, 'WEAK_PASSWORD');
    }

    // Only allow 'user' role for self-registration (admin can create admins via admin route)
    const userRole = role === 'admin' ? 'user' : (role || 'user');

    const user = await authService.register({
        username,
        email,
        password,
        role: userRole
    });

    // Log registration
    await loggingService.log({
        action: 'user.register',
        resource: 'user',
        resourceId: user.id.toString(),
        username: user.username,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent') || undefined,
        level: 'info'
    });

    res.json({
        success: true,
        result: {
            message: 'User registered successfully',
            user
        }
    });
}));

// POST /api/users/login - Login user
router.post('/login', asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        throw createError('Username and password are required', 400, 'MISSING_CREDENTIALS');
    }

    // Get client IP address
    const clientIp = req.ip || req.socket.remoteAddress || req.headers['x-forwarded-for']?.toString().split(',')[0] || undefined;
    const result = await authService.login(username, password, clientIp);

    // Log login
    await loggingService.log({
        action: 'user.login',
        resource: 'user',
        resourceId: result.user.id.toString(),
        username: result.user.username,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent') || undefined,
        level: 'info'
    });

    res.json({
        success: true,
        result: {
            token: result.token,
            user: result.user,
            message: 'Login successful'
        }
    });
}));

// GET /api/users/me - Get current user info
router.get('/me', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = UserRepository.findById(req.user!.userId);
    
    if (!user) {
        throw createError('User not found', 404, 'USER_NOT_FOUND');
    }

    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json({
        success: true,
        result: userWithoutPassword
    });
}));

// GET /api/users - Get all users (admin only)
router.get('/', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const users = UserRepository.findAll();
    
    // Remove password hashes from response
    const usersWithoutPasswords = users.map(user => {
        const { passwordHash: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
    });

    res.json({
        success: true,
        result: usersWithoutPasswords
    });
}), autoLog('user.list', 'user'));

// GET /api/users/:id - Get user by ID (admin only)
router.get('/:id', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = parseInt(req.params.id, 10);
    
    if (isNaN(userId)) {
        throw createError('Invalid user ID', 400, 'INVALID_USER_ID');
    }

    const user = UserRepository.findById(userId);
    
    if (!user) {
        throw createError('User not found', 404, 'USER_NOT_FOUND');
    }

    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json({
        success: true,
        result: userWithoutPassword
    });
}), autoLog('user.get', 'user', (req) => req.params.id));

// POST /api/users - Create user (admin only)
router.post('/', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password) {
        throw createError('Username, email and password are required', 400, 'MISSING_FIELDS');
    }

    if (password.length < 8) {
        throw createError('Password must be at least 8 characters long', 400, 'WEAK_PASSWORD');
    }

    const user = await authService.register({
        username,
        email,
        password,
        role: role || 'user'
    });

    await loggingService.logUserAction(
        req.user!.userId,
        req.user!.username,
        'user.create',
        'user',
        {
            resourceId: user.id.toString(),
            details: { createdUsername: username, role: role || 'user' }
        }
    );

    res.json({
        success: true,
        result: {
            message: 'User created successfully',
            user
        }
    });
}), autoLog('user.create', 'user'));

// PUT /api/users/:id - Update user (admin only, or self for non-sensitive fields)
router.put('/:id', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = parseInt(req.params.id, 10);
    
    if (isNaN(userId)) {
        throw createError('Invalid user ID', 400, 'INVALID_USER_ID');
    }

    const isAdmin = req.user!.role === 'admin';
    const isSelf = req.user!.userId === userId;

    if (!isAdmin && !isSelf) {
        throw createError('You can only update your own account', 403, 'FORBIDDEN');
    }

    const updateData: UpdateUserInput = {};
    
    // Non-admins can only update email, password, username, and avatar
    if (isAdmin) {
        if (req.body.email !== undefined) updateData.email = req.body.email;
        if (req.body.role !== undefined) updateData.role = req.body.role;
        if (req.body.enabled !== undefined) updateData.enabled = req.body.enabled;
        if (req.body.username !== undefined) updateData.username = req.body.username;
    }
    
    // Everyone can update their email, username, and avatar
    if (req.body.email !== undefined) {
        updateData.email = req.body.email;
    }
    if (req.body.username !== undefined) {
        updateData.username = req.body.username;
    }
    if (req.body.avatar !== undefined) {
        updateData.avatar = req.body.avatar; // Base64 encoded image
    }

    // Password change requires old password
    if (req.body.password && req.body.oldPassword) {
        await authService.changePassword(userId, req.body.oldPassword, req.body.password);
    }

    const user = UserRepository.update(userId, updateData);
    
    if (!user) {
        throw createError('User not found', 404, 'USER_NOT_FOUND');
    }

    await loggingService.logUserAction(
        req.user!.userId,
        req.user!.username,
        'user.update',
        'user',
        {
            resourceId: userId.toString(),
            details: { updatedFields: Object.keys(updateData) }
        }
    );

    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json({
        success: true,
        result: {
            message: 'User updated successfully',
            user: userWithoutPassword
        }
    });
}), autoLog('user.update', 'user', (req) => req.params.id));

// DELETE /api/users/:id - Delete user (admin only)
router.delete('/:id', requireAuth, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = parseInt(req.params.id, 10);
    
    if (isNaN(userId)) {
        throw createError('Invalid user ID', 400, 'INVALID_USER_ID');
    }

    if (userId === req.user!.userId) {
        throw createError('You cannot delete your own account', 400, 'CANNOT_DELETE_SELF');
    }

    const deleted = UserRepository.delete(userId);
    
    if (!deleted) {
        throw createError('User not found', 404, 'USER_NOT_FOUND');
    }

    await loggingService.logUserAction(
        req.user!.userId,
        req.user!.username,
        'user.delete',
        'user',
        {
            resourceId: userId.toString()
        }
    );

    res.json({
        success: true,
        result: {
            message: 'User deleted successfully'
        }
    });
}), autoLog('user.delete', 'user', (req) => req.params.id));

export default router;

