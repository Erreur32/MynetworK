/**
 * Logging service
 * 
 * Handles logging of user actions and system events to database
 */

import { LogRepository, type CreateLogInput } from '../database/models/Log.js';

export interface LogParams {
    userId?: number;
    username?: string;
    pluginId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    level?: 'info' | 'warning' | 'error';
}

export class LoggingService {
    /**
     * Create a log entry
     */
    async log(params: LogParams): Promise<void> {
        try {
            const input: CreateLogInput = {
                userId: params.userId,
                username: params.username,
                pluginId: params.pluginId,
                action: params.action,
                resource: params.resource,
                resourceId: params.resourceId,
                details: params.details,
                ipAddress: params.ipAddress,
                userAgent: params.userAgent,
                level: params.level || 'info'
            };

            LogRepository.create(input);

            // Also log to console in development
            if (process.env.NODE_ENV !== 'production') {
                const level = params.level || 'info';
                const prefix = `[${level.toUpperCase()}]`;
                console.log(`${prefix} ${params.action} on ${params.resource}`, params.details || '');
            }
        } catch (error) {
            // Don't throw - logging should never break the application
            console.error('[Logging] Failed to create log entry:', error);
        }
    }

    /**
     * Log user action
     */
    async logUserAction(
        userId: number,
        username: string,
        action: string,
        resource: string,
        options?: {
            resourceId?: string;
            details?: Record<string, unknown>;
            ipAddress?: string;
            userAgent?: string;
            level?: 'info' | 'warning' | 'error';
        }
    ): Promise<void> {
        await this.log({
            userId,
            username,
            action,
            resource,
            resourceId: options?.resourceId,
            details: options?.details,
            ipAddress: options?.ipAddress,
            userAgent: options?.userAgent,
            level: options?.level || 'info'
        });
    }

    /**
     * Log plugin action
     */
    async logPluginAction(
        pluginId: string,
        action: string,
        resource: string,
        options?: {
            userId?: number;
            username?: string;
            resourceId?: string;
            details?: Record<string, unknown>;
            ipAddress?: string;
            userAgent?: string;
            level?: 'info' | 'warning' | 'error';
        }
    ): Promise<void> {
        await this.log({
            pluginId,
            userId: options?.userId,
            username: options?.username,
            action,
            resource,
            resourceId: options?.resourceId,
            details: options?.details,
            ipAddress: options?.ipAddress,
            userAgent: options?.userAgent,
            level: options?.level || 'info'
        });
    }

    /**
     * Get logs with filters
     */
    getLogs(filters: {
        userId?: number;
        pluginId?: string;
        action?: string;
        resource?: string;
        level?: string;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        offset?: number;
    }) {
        return LogRepository.find(filters);
    }

    /**
     * Count logs with filters
     */
    countLogs(filters: {
        userId?: number;
        pluginId?: string;
        action?: string;
        resource?: string;
        level?: string;
        startDate?: Date;
        endDate?: Date;
    }): number {
        return LogRepository.count(filters);
    }

    /**
     * Cleanup old logs (older than specified days)
     */
    cleanupOldLogs(daysToKeep: number = 90): number {
        return LogRepository.deleteOld(daysToKeep);
    }

    /**
     * Delete all logs
     */
    deleteAllLogs(): number {
        return LogRepository.deleteAll();
    }
}

export const loggingService = new LoggingService();

