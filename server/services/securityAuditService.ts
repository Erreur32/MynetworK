/**
 * Security Audit Service
 * 
 * Provides detailed security audit logs and statistics
 * Complements the logging service with security-specific features
 */

import { loggingService } from './loggingService.js';
import { bruteForceProtection } from './bruteForceProtection.js';
import { UserRepository } from '../database/models/User.js';
import { logger } from '../utils/logger.js';

export interface SecurityAuditEntry {
    id: number;
    timestamp: number;
    action: string;
    resource: string;
    resourceId?: string;
    userId?: number;
    username?: string;
    ipAddress?: string;
    userAgent?: string;
    level: 'info' | 'warning' | 'error';
    metadata?: Record<string, unknown>;
}

export interface SecurityAuditStats {
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsBySeverity: {
        info: number;
        warning: number;
        error: number;
    };
    failedLogins: number;
    blockedAttempts: number;
    uniqueBlockedIPs: number;
    recentBlockedIPs: Array<{
        identifier: string;
        count: number;
        blockedUntil: number;
        remainingTime: number;
    }>;
    last24Hours: {
        logins: number;
        failedLogins: number;
        blockedAttempts: number;
        securityChanges: number;
    };
}

class SecurityAuditService {
    /**
     * Get security audit logs
     */
    async getAuditLogs(options: {
        limit?: number;
        offset?: number;
        action?: string;
        userId?: number;
        level?: 'info' | 'warning' | 'error';
        startDate?: number;
        endDate?: number;
    } = {}): Promise<SecurityAuditEntry[]> {
        const {
            limit = 100,
            offset = 0,
            action,
            userId,
            level,
            startDate,
            endDate
        } = options;

        try {
            // Get logs from logging service
            const allLogs = await loggingService.getLogs({
                limit: limit + offset,
                resource: 'security',
                action: action ? `security.${action}` : undefined,
                userId,
                level,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined
            });

            // Filter and format for security audit
            const securityLogs: SecurityAuditEntry[] = allLogs
                .filter(log => log.resource === 'security' || log.action?.startsWith('security.'))
                .slice(offset, offset + limit)
                .map(log => ({
                    id: log.id,
                    timestamp: log.timestamp.getTime(),
                    action: log.action?.replace('security.', '') || log.action || 'unknown',
                    resource: log.resource,
                    resourceId: log.resourceId,
                    userId: log.userId,
                    username: log.username,
                    ipAddress: log.ipAddress,
                    userAgent: log.userAgent,
                    level: log.level || 'info',
                    metadata: log.details
                }));

            return securityLogs;
        } catch (error) {
            logger.error('SecurityAudit', 'Failed to get audit logs:', error);
            return [];
        }
    }

    /**
     * Get security audit statistics
     */
    async getAuditStats(): Promise<SecurityAuditStats> {
        try {
            const now = new Date();
            const last24Hours = new Date(now.getTime() - (24 * 60 * 60 * 1000));

            // Get all security logs from last 24 hours
            const recentLogs = await loggingService.getLogs({
                limit: 10000,
                resource: 'security',
                startDate: last24Hours
            });

            // Get blocked IPs
            const blockedIPs = bruteForceProtection.getBlockedIdentifiers();

            // Calculate statistics
            const eventsByType: Record<string, number> = {};
            const eventsBySeverity = {
                info: 0,
                warning: 0,
                error: 0
            };

            let failedLogins = 0;
            let blockedAttempts = 0;
            let logins = 0;
            let securityChanges = 0;

            for (const log of recentLogs) {
                // Count by type
                const action = log.action?.replace('security.', '') || 'unknown';
                eventsByType[action] = (eventsByType[action] || 0) + 1;

                // Count by severity
                const severity = log.level || 'info';
                eventsBySeverity[severity]++;

                // Count specific events
                if (action === 'login_failed') {
                    failedLogins++;
                } else if (action === 'login_blocked' || action === 'ip_blocked') {
                    blockedAttempts++;
                } else if (action === 'login_success' || action === 'new_ip_login') {
                    logins++;
                } else if (action === 'security_settings_changed') {
                    securityChanges++;
                }
            }

            // Get unique blocked IPs
            const uniqueBlockedIPs = new Set(blockedIPs.map(b => b.identifier)).size;

            return {
                totalEvents: recentLogs.length,
                eventsByType,
                eventsBySeverity,
                failedLogins,
                blockedAttempts,
                uniqueBlockedIPs,
                recentBlockedIPs: blockedIPs,
                last24Hours: {
                    logins,
                    failedLogins,
                    blockedAttempts,
                    securityChanges
                }
            };
        } catch (error) {
            logger.error('SecurityAudit', 'Failed to get audit stats:', error);
            return {
                totalEvents: 0,
                eventsByType: {},
                eventsBySeverity: { info: 0, warning: 0, error: 0 },
                failedLogins: 0,
                blockedAttempts: 0,
                uniqueBlockedIPs: 0,
                recentBlockedIPs: [],
                last24Hours: {
                    logins: 0,
                    failedLogins: 0,
                    blockedAttempts: 0,
                    securityChanges: 0
                }
            };
        }
    }

    /**
     * Get failed login attempts for a specific user
     */
    async getFailedLoginAttempts(username: string, limit: number = 10): Promise<SecurityAuditEntry[]> {
        const user = UserRepository.findByUsername(username);
        if (!user) {
            return [];
        }

        return this.getAuditLogs({
            limit,
            action: 'login_failed',
            userId: user.id
        });
    }

    /**
     * Get all blocked IPs and usernames
     */
    getBlockedIdentifiers(): Array<{
        identifier: string;
        count: number;
        blockedUntil: number;
        remainingTime: number;
    }> {
        return bruteForceProtection.getBlockedIdentifiers();
    }

    /**
     * Export audit logs (for compliance/reporting)
     */
    async exportAuditLogs(options: {
        format?: 'json' | 'csv';
        startDate?: number;
        endDate?: number;
    } = {}): Promise<string> {
        const { format = 'json', startDate, endDate } = options;

        const logs = await this.getAuditLogs({
            limit: 10000,
            startDate,
            endDate
        });

        if (format === 'csv') {
            // Convert to CSV
            const headers = ['Timestamp', 'Action', 'Resource', 'User ID', 'Username', 'IP Address', 'Level', 'Metadata'];
            const rows = logs.map(log => [
                new Date(log.timestamp).toISOString(),
                log.action,
                log.resource,
                log.userId?.toString() || '',
                log.username || '',
                log.ipAddress || '',
                log.level,
                JSON.stringify(log.metadata || {})
            ]);

            return [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
            ].join('\n');
        }

        // JSON format
        return JSON.stringify(logs, null, 2);
    }
}

// Export singleton instance
export const securityAuditService = new SecurityAuditService();

