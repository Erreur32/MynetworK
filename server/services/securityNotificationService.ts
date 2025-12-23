/**
 * Security Notification Service
 * 
 * Handles security-related notifications (login attempts, blocked IPs, etc.)
 * Can send notifications via logging, in-app notifications, or future email/webhook
 */

import { logger } from '../utils/logger.js';
import { loggingService } from './loggingService.js';
import { metricsCollector } from './metricsCollector.js';

export type SecurityEventType =
    | 'login_failed'
    | 'login_success'
    | 'login_blocked'
    | 'ip_blocked'
    | 'ip_unblocked'
    | 'password_changed'
    | 'security_settings_changed'
    | 'user_created'
    | 'user_deleted'
    | 'user_disabled'
    | 'user_enabled'
    | 'new_ip_login'
    | 'jwt_secret_warning';

export interface SecurityNotification {
    type: SecurityEventType;
    severity: 'info' | 'warning' | 'error' | 'critical';
    title: string;
    message: string;
    userId?: number;
    username?: string;
    ipAddress?: string;
    metadata?: Record<string, unknown>;
    timestamp: number;
}

class SecurityNotificationService {
    private notifications: SecurityNotification[] = [];
    private maxNotifications = 1000; // Keep last 1000 notifications in memory

    /**
     * Send a security notification
     */
    async notify(notification: Omit<SecurityNotification, 'timestamp'>): Promise<void> {
        const fullNotification: SecurityNotification = {
            ...notification,
            timestamp: Date.now()
        };

        // Add to in-memory list
        this.notifications.unshift(fullNotification);
        if (this.notifications.length > this.maxNotifications) {
            this.notifications = this.notifications.slice(0, this.maxNotifications);
        }

        // Log to console with appropriate level
        const logMessage = `[Security] ${fullNotification.title}: ${fullNotification.message}${fullNotification.ipAddress ? ` (IP: ${fullNotification.ipAddress})` : ''}${fullNotification.username ? ` (User: ${fullNotification.username})` : ''}`;
        
        switch (fullNotification.severity) {
            case 'critical':
            case 'error':
                logger.error('Security', logMessage);
                break;
            case 'warning':
                logger.warn('Security', logMessage);
                break;
            default:
                logger.info('Security', logMessage);
        }

        // Record metrics (aggregated by level only, no username/IP)
        const level = fullNotification.severity === 'critical' || fullNotification.severity === 'error' ? 'error' : fullNotification.severity === 'warning' ? 'warning' : 'info';
        metricsCollector.recordSecurityEvent(level);
        
        // Record specific security events
        if (fullNotification.type === 'security_settings_changed') {
            metricsCollector.recordSecuritySettingsChanged();
        }
        if (fullNotification.type === 'ip_blocked') {
            metricsCollector.recordIpBlocked();
        }

        // Log to database via loggingService
        if (fullNotification.userId) {
            await loggingService.log({
                action: `security.${fullNotification.type}`,
                resource: 'security',
                resourceId: fullNotification.userId.toString(),
                username: fullNotification.username,
                ipAddress: fullNotification.ipAddress,
                level: level,
                details: fullNotification.metadata
            }).catch(err => {
                console.error('[SecurityNotification] Failed to log to database:', err);
            });
        }

        // TODO: Future implementations
        // - Send email notification (if configured)
        // - Send webhook notification (if configured)
        // - Send in-app notification to admins
    }

    /**
     * Notify about failed login attempt
     */
    async notifyFailedLogin(username: string, ipAddress?: string, attemptCount?: number): Promise<void> {
        await this.notify({
            type: 'login_failed',
            severity: attemptCount && attemptCount >= 3 ? 'warning' : 'info',
            title: 'Échec de connexion',
            message: `Tentative de connexion échouée pour l'utilisateur "${username}"${attemptCount ? ` (tentative #${attemptCount})` : ''}`,
            username,
            ipAddress,
            metadata: { attemptCount }
        });
    }

    /**
     * Notify about successful login
     */
    async notifySuccessfulLogin(userId: number, username: string, ipAddress?: string, isNewIp?: boolean): Promise<void> {
        await this.notify({
            type: isNewIp ? 'new_ip_login' : 'login_success',
            severity: isNewIp ? 'warning' : 'info',
            title: isNewIp ? 'Connexion depuis une nouvelle IP' : 'Connexion réussie',
            message: `Connexion réussie pour l'utilisateur "${username}"${isNewIp ? ' depuis une nouvelle adresse IP' : ''}`,
            userId,
            username,
            ipAddress,
            metadata: { isNewIp }
        });
    }

    /**
     * Notify about blocked login attempt
     */
    async notifyBlockedLogin(identifier: string, ipAddress?: string, reason?: string): Promise<void> {
        await this.notify({
            type: 'login_blocked',
            severity: 'error',
            title: 'Tentative de connexion bloquée',
            message: `Tentative de connexion bloquée pour "${identifier}"${reason ? `: ${reason}` : ''}`,
            username: identifier.includes('@') ? undefined : identifier,
            ipAddress,
            metadata: { reason }
        });
    }

    /**
     * Notify about IP block
     */
    async notifyIpBlocked(ipAddress: string, reason: string, duration?: number): Promise<void> {
        await this.notify({
            type: 'ip_blocked',
            severity: 'error',
            title: 'Adresse IP bloquée',
            message: `L'adresse IP ${ipAddress} a été bloquée${reason ? `: ${reason}` : ''}${duration ? ` pour ${duration} minutes` : ''}`,
            ipAddress,
            metadata: { reason, duration }
        });
    }

    /**
     * Notify about IP unblock
     */
    async notifyIpUnblocked(ipAddress: string): Promise<void> {
        await this.notify({
            type: 'ip_unblocked',
            severity: 'info',
            title: 'Adresse IP débloquée',
            message: `L'adresse IP ${ipAddress} a été débloquée`,
            ipAddress
        });
    }

    /**
     * Notify about password change
     */
    async notifyPasswordChanged(userId: number, username: string, ipAddress?: string): Promise<void> {
        await this.notify({
            type: 'password_changed',
            severity: 'info',
            title: 'Mot de passe modifié',
            message: `Le mot de passe de l'utilisateur "${username}" a été modifié`,
            userId,
            username,
            ipAddress
        });
    }

    /**
     * Notify about security settings change
     */
    async notifySecuritySettingsChanged(userId: number, username: string, changes: Record<string, unknown>): Promise<void> {
        await this.notify({
            type: 'security_settings_changed',
            severity: 'warning',
            title: 'Paramètres de sécurité modifiés',
            message: `Les paramètres de sécurité ont été modifiés par "${username}"`,
            userId,
            username,
            metadata: { changes }
        });
    }

    /**
     * Notify about user creation
     */
    async notifyUserCreated(userId: number, username: string, createdBy: string): Promise<void> {
        await this.notify({
            type: 'user_created',
            severity: 'info',
            title: 'Utilisateur créé',
            message: `L'utilisateur "${username}" a été créé par "${createdBy}"`,
            userId,
            username,
            metadata: { createdBy }
        });
    }

    /**
     * Notify about user deletion
     */
    async notifyUserDeleted(username: string, deletedBy: string): Promise<void> {
        await this.notify({
            type: 'user_deleted',
            severity: 'warning',
            title: 'Utilisateur supprimé',
            message: `L'utilisateur "${username}" a été supprimé par "${deletedBy}"`,
            username,
            metadata: { deletedBy }
        });
    }

    /**
     * Notify about user enabled/disabled
     */
    async notifyUserStatusChanged(userId: number, username: string, enabled: boolean, changedBy: string): Promise<void> {
        await this.notify({
            type: enabled ? 'user_enabled' : 'user_disabled',
            severity: 'warning',
            title: enabled ? 'Utilisateur activé' : 'Utilisateur désactivé',
            message: `L'utilisateur "${username}" a été ${enabled ? 'activé' : 'désactivé'} par "${changedBy}"`,
            userId,
            username,
            metadata: { enabled, changedBy }
        });
    }

    /**
     * Notify about JWT secret warning
     */
    async notifyJwtSecretWarning(): Promise<void> {
        await this.notify({
            type: 'jwt_secret_warning',
            severity: 'critical',
            title: 'Avertissement JWT Secret',
            message: 'Le secret JWT par défaut est utilisé. Changez-le en production !'
        });
    }

    /**
     * Get recent security notifications
     */
    getRecentNotifications(limit: number = 50): SecurityNotification[] {
        return this.notifications.slice(0, limit);
    }

    /**
     * Get notifications by type
     */
    getNotificationsByType(type: SecurityEventType, limit: number = 50): SecurityNotification[] {
        return this.notifications
            .filter(n => n.type === type)
            .slice(0, limit);
    }

    /**
     * Get notifications by severity
     */
    getNotificationsBySeverity(severity: SecurityNotification['severity'], limit: number = 50): SecurityNotification[] {
        return this.notifications
            .filter(n => n.severity === severity)
            .slice(0, limit);
    }
}

// Export singleton instance
export const securityNotificationService = new SecurityNotificationService();

