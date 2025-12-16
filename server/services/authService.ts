/**
 * Authentication service
 * 
 * Handles user authentication using JWT tokens and bcrypt for password hashing
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { UserRepository, type User, type CreateUserInput } from '../database/models/User.js';

export interface LoginResult {
    token: string;
    user: Omit<User, 'passwordHash'>;
}

export interface TokenPayload {
    userId: number;
    username: string;
    role: string;
}

export class AuthService {
    private jwtSecret: string;
    private jwtExpiresIn: string;

    constructor() {
        this.jwtSecret = process.env.JWT_SECRET || 'change-me-in-production-please-use-strong-secret';
        this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
        
        if (this.jwtSecret === 'change-me-in-production-please-use-strong-secret') {
            console.warn('[Auth] WARNING: Using default JWT secret. Please set JWT_SECRET environment variable in production!');
        }
    }

    /**
     * Hash a password using bcrypt
     */
    async hashPassword(password: string): Promise<string> {
        const saltRounds = 10;
        return bcrypt.hash(password, saltRounds);
    }

    /**
     * Verify a password against a hash
     */
    async verifyPassword(password: string, hash: string): Promise<boolean> {
        return bcrypt.compare(password, hash);
    }

    /**
     * Register a new user
     */
    async register(input: CreateUserInput): Promise<Omit<User, 'passwordHash'>> {
        // Check if username already exists
        if (UserRepository.usernameExists(input.username)) {
            throw new Error('Username already exists');
        }

        // Check if email already exists
        if (UserRepository.emailExists(input.email)) {
            throw new Error('Email already exists');
        }

        // Hash password
        const passwordHash = await this.hashPassword(input.password);

        // Create user
        const user = UserRepository.create(input, passwordHash);

        // Return user without password hash
        const { passwordHash: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    /**
     * Login user and return JWT token
     */
    async login(username: string, password: string): Promise<LoginResult> {
        // Find user by username
        const user = UserRepository.findByUsername(username);
        
        if (!user) {
            throw new Error('Invalid credentials');
        }

        if (!user.enabled) {
            throw new Error('User account is disabled');
        }

        // Verify password
        const valid = await this.verifyPassword(password, user.passwordHash);
        if (!valid) {
            throw new Error('Invalid credentials');
        }

        // Update last login
        UserRepository.updateLastLogin(user.id);

        // Generate JWT token
        const payload: TokenPayload = {
            userId: user.id,
            username: user.username,
            role: user.role
        };

        const token = jwt.sign(payload, this.jwtSecret, {
            expiresIn: this.jwtExpiresIn
        });

        // Return token and user (without password hash)
        const { passwordHash: _, ...userWithoutPassword } = user;
        return {
            token,
            user: userWithoutPassword
        };
    }

    /**
     * Verify JWT token and return payload
     */
    async verifyToken(token: string): Promise<TokenPayload> {
        try {
            const payload = jwt.verify(token, this.jwtSecret) as TokenPayload;
            return payload;
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                throw new Error('Token expired');
            }
            if (error instanceof jwt.JsonWebTokenError) {
                throw new Error('Invalid token');
            }
            throw new Error('Token verification failed');
        }
    }

    /**
     * Get user from token
     */
    async getUserFromToken(token: string): Promise<User | null> {
        try {
            const payload = await this.verifyToken(token);
            return UserRepository.findById(payload.userId);
        } catch {
            return null;
        }
    }

    /**
     * Change user password
     */
    async changePassword(userId: number, oldPassword: string, newPassword: string): Promise<boolean> {
        const user = UserRepository.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Verify old password
        const valid = await this.verifyPassword(oldPassword, user.passwordHash);
        if (!valid) {
            throw new Error('Current password is incorrect');
        }

        // Hash new password
        const newPasswordHash = await this.hashPassword(newPassword);

        // Update password
        UserRepository.update(userId, { password: newPasswordHash });
        return true;
    }
}

export const authService = new AuthService();

