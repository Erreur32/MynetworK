/**
 * Security Section
 * 
 * Component for security settings within Administration
 * Organized in blocks with multiple columns
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Lock, AlertTriangle, Save, Loader2, CheckCircle, XCircle, Info, Trash2, RefreshCw, Plus, Globe } from 'lucide-react';
import { Section, SettingRow } from '../pages/SettingsPage';
import { LogsManagementSection } from './LogsManagementSection';
import { api } from '../api/client';
import { useUserAuthStore } from '../stores/userAuthStore';

export const SecuritySection: React.FC = () => {
    const { t } = useTranslation();
    const { user } = useUserAuthStore();
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    
    // Security settings state
    const [jwtSecretWarning, setJwtSecretWarning] = useState(false);
    const [maxLoginAttempts, setMaxLoginAttempts] = useState(5);
    const [lockoutDuration, setLockoutDuration] = useState(15); // minutes
    const [trackingWindow, setTrackingWindow] = useState(30); // minutes
    const [sessionTimeoutHours, setSessionTimeoutHours] = useState(168); // hours (7 days default)
    const [showSessionWarning, setShowSessionWarning] = useState(false);
    
    // Blocked IPs state
    const [blockedIPs, setBlockedIPs] = useState<Array<{
        identifier: string;
        count: number;
        blockedUntil: number;
        remainingTime: number;
    }>>([]);
    const [isLoadingBlockedIPs, setIsLoadingBlockedIPs] = useState(false);
    
    // CORS configuration state
    const [corsConfig, setCorsConfig] = useState<{
        allowedOrigins?: string[];
        allowCredentials?: boolean;
        allowedMethods?: string[];
        allowedHeaders?: string[];
    } | null>(null);
    const [newOrigin, setNewOrigin] = useState('');
    const [newMethod, setNewMethod] = useState('');
    const [newHeader, setNewHeader] = useState('');

    // Track initial values to detect unsaved changes
    const [initialSecuritySettings, setInitialSecuritySettings] = useState<{
        maxLoginAttempts: number;
        lockoutDuration: number;
        trackingWindow: number;
        sessionTimeoutHours: number;
    } | null>(null);
    const [initialCorsConfig, setInitialCorsConfig] = useState<{
        allowedOrigins?: string[];
        allowCredentials?: boolean;
        allowedMethods?: string[];
        allowedHeaders?: string[];
    } | null>(null);

    // Check if there are unsaved changes
    const hasUnsavedSecurityChanges = initialSecuritySettings && (
        maxLoginAttempts !== initialSecuritySettings.maxLoginAttempts ||
        lockoutDuration !== initialSecuritySettings.lockoutDuration ||
        trackingWindow !== initialSecuritySettings.trackingWindow ||
        sessionTimeoutHours !== initialSecuritySettings.sessionTimeoutHours
    );

    const hasUnsavedCorsChanges = initialCorsConfig && corsConfig && (
        JSON.stringify(corsConfig.allowedOrigins?.sort()) !== JSON.stringify(initialCorsConfig.allowedOrigins?.sort()) ||
        corsConfig.allowCredentials !== initialCorsConfig.allowCredentials ||
        JSON.stringify(corsConfig.allowedMethods?.sort()) !== JSON.stringify(initialCorsConfig.allowedMethods?.sort()) ||
        JSON.stringify(corsConfig.allowedHeaders?.sort()) !== JSON.stringify(initialCorsConfig.allowedHeaders?.sort())
    );

    const hasUnsavedChanges = hasUnsavedSecurityChanges || hasUnsavedCorsChanges;

    useEffect(() => {
        checkSecuritySettings();
        loadBlockedIPs();
        loadCorsConfig();
    }, []);

    const checkSecuritySettings = async () => {
        try {
            const response = await api.get<{
                jwtSecretIsDefault: boolean;
                sessionTimeout: number;
                requireHttps: boolean;
                rateLimitEnabled: boolean;
                maxLoginAttempts: number;
                lockoutDuration: number;
                trackingWindow: number;
            }>('/api/system/security');
            if (response.success && response.result) {
                setJwtSecretWarning(response.result.jwtSecretIsDefault || false);
                const maxAttempts = response.result.maxLoginAttempts || 5;
                const lockout = response.result.lockoutDuration || 15;
                const timeout = response.result.sessionTimeout || 168;
                setMaxLoginAttempts(maxAttempts);
                setLockoutDuration(lockout);
                const tracking = response.result.trackingWindow ?? 30;
                setTrackingWindow(tracking);
                setSessionTimeoutHours(timeout);
                // Store initial values
                setInitialSecuritySettings({
                    maxLoginAttempts: maxAttempts,
                    lockoutDuration: lockout,
                    trackingWindow: tracking,
                    sessionTimeoutHours: timeout
                });
            }
        } catch (error) {
            console.log('Security settings endpoint not available');
        }
    };

    const handleSaveSecuritySettings = async () => {
        setIsLoading(true);
        setMessage(null);
        
        try {
            const response = await api.post('/api/system/security', {
                maxLoginAttempts,
                lockoutDuration,
                trackingWindow,
                sessionTimeoutHours
            });
            
            if (response.success) {
                const result = response.result as { message?: string } | undefined;
                const messageText = result?.message 
                    ? result.message 
                    : t('admin.security.saveSuccess');
                setMessage({ type: 'success', text: messageText });
                // Reload settings to get updated values
                await checkSecuritySettings();
                setShowSessionWarning(false);
                // Reset initial values after save
                setInitialSecuritySettings({
                    maxLoginAttempts,
                    lockoutDuration,
                    trackingWindow,
                    sessionTimeoutHours
                });
            } else {
                const error = response.error as { message?: string } | undefined;
                setMessage({ type: 'error', text: error?.message || t('admin.security.saveError') });
            }
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : t('admin.security.saveError') });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSessionTimeoutChange = (value: number) => {
        setSessionTimeoutHours(value);
        // Show warning if changing from default or if value is significantly different
        if (value !== 168) {
            setShowSessionWarning(true);
        } else {
            setShowSessionWarning(false);
        }
    };

    const loadBlockedIPs = async () => {
        setIsLoadingBlockedIPs(true);
        try {
            const response = await api.get<Array<{
                identifier: string;
                count: number;
                blockedUntil: number;
                remainingTime: number;
            }>>('/api/security/blocked');
            if (response.success && response.result) {
                setBlockedIPs(response.result);
            }
        } catch (error) {
            console.error('Failed to load blocked IPs:', error);
        } finally {
            setIsLoadingBlockedIPs(false);
        }
    };

    const handleUnblock = async (identifier: string) => {
        try {
            const response = await api.post(`/api/security/blocked/${encodeURIComponent(identifier)}/unblock`);
            if (response.success) {
                // Reload the list
                await loadBlockedIPs();
                setMessage({ type: 'success', text: t('admin.security.unblockSuccess', { identifier }) });
                setTimeout(() => setMessage(null), 3000);
            }
        } catch (error: unknown) {
            const errorMessage = (error as any)?.response?.data?.error?.message || t('admin.security.unblockError');
            setMessage({ 
                type: 'error', 
                text: errorMessage
            });
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const formatRemainingTime = (seconds: number): string => {
        if (seconds <= 0) return t('admin.security.expired');
        const minutes = Math.ceil(seconds / 60);
        if (minutes < 60) return `${minutes} ${t('admin.security.minutesShort')}`;
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        if (remainingMinutes === 0) {
            return `${hours}${t('admin.security.hoursShort')}`;
        }
        return `${hours}${t('admin.security.hoursShort')} ${remainingMinutes}${t('admin.security.minutesShort')}`;
    };

    const loadCorsConfig = async () => {
        try {
            const response = await api.get<{ corsConfig?: {
                allowedOrigins?: string[];
                allowCredentials?: boolean;
                allowedMethods?: string[];
                allowedHeaders?: string[];
            } }>('/api/system/general');
            if (response.success && response.result) {
                const config = response.result.corsConfig || null;
                setCorsConfig(config);
                // Store initial values (deep copy)
                setInitialCorsConfig(config ? JSON.parse(JSON.stringify(config)) : null);
            }
        } catch (error) {
            console.error('Failed to load CORS config:', error);
        }
    };

    const handleSaveCorsConfig = async () => {
        setIsLoading(true);
        setMessage(null);
        
        try {
            const response = await api.put('/api/system/general', {
                corsConfig: corsConfig || {
                    allowedOrigins: [],
                    allowCredentials: true,
                    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
                    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
                }
            });
            
            if (response.success) {
                setMessage({ type: 'success', text: t('admin.security.corsSaveSuccess') });
                setTimeout(() => setMessage(null), 5000);
                // Reload CORS config to get updated values
                await loadCorsConfig();
            } else {
                const error = response.error as { message?: string } | undefined;
                setMessage({ type: 'error', text: error?.message || t('admin.security.saveError') });
            }
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : t('admin.security.saveError') });
        } finally {
            setIsLoading(false);
        }
    };

    const addOrigin = () => {
        if (newOrigin.trim()) {
            const origins = corsConfig?.allowedOrigins || [];
            if (!origins.includes(newOrigin.trim())) {
                setCorsConfig({
                    ...corsConfig,
                    allowedOrigins: [...origins, newOrigin.trim()],
                    allowCredentials: corsConfig?.allowCredentials !== undefined ? corsConfig.allowCredentials : true,
                    allowedMethods: corsConfig?.allowedMethods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
                    allowedHeaders: corsConfig?.allowedHeaders || ['Content-Type', 'Authorization', 'X-Requested-With']
                });
                setNewOrigin('');
            }
        }
    };

    const removeOrigin = (origin: string) => {
        const origins = corsConfig?.allowedOrigins || [];
        setCorsConfig({
            ...corsConfig,
            allowedOrigins: origins.filter(o => o !== origin),
            allowCredentials: corsConfig?.allowCredentials !== undefined ? corsConfig.allowCredentials : true,
            allowedMethods: corsConfig?.allowedMethods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
            allowedHeaders: corsConfig?.allowedHeaders || ['Content-Type', 'Authorization', 'X-Requested-With']
        });
    };

    const addMethod = () => {
        if (newMethod.trim()) {
            const methods = corsConfig?.allowedMethods || [];
            if (!methods.includes(newMethod.trim().toUpperCase())) {
                setCorsConfig({
                    ...corsConfig,
                    allowedMethods: [...methods, newMethod.trim().toUpperCase()],
                    allowedOrigins: corsConfig?.allowedOrigins || [],
                    allowCredentials: corsConfig?.allowCredentials !== undefined ? corsConfig.allowCredentials : true,
                    allowedHeaders: corsConfig?.allowedHeaders || ['Content-Type', 'Authorization', 'X-Requested-With']
                });
                setNewMethod('');
            }
        }
    };

    const removeMethod = (method: string) => {
        const methods = corsConfig?.allowedMethods || [];
        setCorsConfig({
            ...corsConfig,
            allowedMethods: methods.filter(m => m !== method),
            allowedOrigins: corsConfig?.allowedOrigins || [],
            allowCredentials: corsConfig?.allowCredentials !== undefined ? corsConfig.allowCredentials : true,
            allowedHeaders: corsConfig?.allowedHeaders || ['Content-Type', 'Authorization', 'X-Requested-With']
        });
    };

    const addHeader = () => {
        if (newHeader.trim()) {
            const headers = corsConfig?.allowedHeaders || [];
            if (!headers.includes(newHeader.trim())) {
                setCorsConfig({
                    ...corsConfig,
                    allowedHeaders: [...headers, newHeader.trim()],
                    allowedOrigins: corsConfig?.allowedOrigins || [],
                    allowCredentials: corsConfig?.allowCredentials !== undefined ? corsConfig.allowCredentials : true,
                    allowedMethods: corsConfig?.allowedMethods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
                });
                setNewHeader('');
            }
        }
    };

    const removeHeader = (header: string) => {
        const headers = corsConfig?.allowedHeaders || [];
        setCorsConfig({
            ...corsConfig,
            allowedHeaders: headers.filter(h => h !== header),
            allowedOrigins: corsConfig?.allowedOrigins || [],
            allowCredentials: corsConfig?.allowCredentials !== undefined ? corsConfig.allowCredentials : true,
            allowedMethods: corsConfig?.allowedMethods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
        });
    };

    return (
        <div className="space-y-6">
            {/* Unsaved Changes Notification */}
            {hasUnsavedChanges && (
                <div className="p-4 bg-amber-900/20 border border-amber-700/50 rounded-lg flex items-start gap-3">
                    <AlertTriangle size={20} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                        <h4 className="text-sm font-medium text-amber-400 mb-1">
                            {t('admin.security.unsavedChangesTitle')}
                        </h4>
                        <p className="text-xs text-amber-300">
                            {t('admin.security.unsavedChangesHint')}
                        </p>
                    </div>
                </div>
            )}

            {/* Message Banner */}
            {message && (
                <div className={`p-3 rounded-lg flex items-center gap-2 ${
                    message.type === 'success' 
                        ? 'bg-green-900/20 border border-green-700 text-green-400' 
                        : 'bg-red-900/20 border border-red-700 text-red-400'
                }`}>
                    {message.type === 'success' ? (
                        <CheckCircle size={16} />
                    ) : (
                        <AlertTriangle size={16} />
                    )}
                    <span className="text-sm">{message.text}</span>
                </div>
            )}

            {/* JWT Secret Warning - Full Width Alert */}
            {jwtSecretWarning && (
                <div className="p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                    <div className="flex items-start gap-3">
                        <AlertTriangle size={20} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                            <h4 className="text-sm font-medium text-yellow-400 mb-1">
                                {t('admin.security.jwtDefaultTitle')}
                            </h4>
                            <p className="text-xs text-yellow-300 mb-2">
                                {t('admin.security.jwtDefaultDesc')} <code className="bg-yellow-900/30 px-1.5 py-0.5 rounded">JWT_SECRET</code> {t('admin.security.jwtDefaultDescSuffix')}
                            </p>
                            <p className="text-xs text-gray-400">
                                {t('admin.security.jwtProductionHint')}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Two columns: Event log (left first), Security settings (right) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left column: Event log first (also first on mobile), then Blocked IPs */}
                <div className="space-y-6 order-1">
                    <LogsManagementSection />
                    {/* Blocked IPs and accounts */}
                    <Section title={t('admin.security.blockedTitle')} icon={Shield} iconColor="red">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <div>
                                    <p className="text-sm text-gray-400">
                                        {t('admin.security.blockedListDesc')}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {t('admin.security.blockedListHint')}
                                    </p>
                                </div>
                                <button
                                    onClick={loadBlockedIPs}
                                    disabled={isLoadingBlockedIPs}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <RefreshCw size={14} className={isLoadingBlockedIPs ? 'animate-spin' : ''} />
                                    <span>{t('admin.security.refresh')}</span>
                                </button>
                            </div>

                            {isLoadingBlockedIPs ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="animate-spin text-blue-400" size={20} />
                                </div>
                            ) : blockedIPs.length === 0 ? (
                                <div className="py-8 text-center">
                                    <CheckCircle size={32} className="text-green-400 mx-auto mb-2" />
                                    <p className="text-sm text-gray-400">{t('admin.security.noBlocked')}</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {blockedIPs.map((item) => (
                                        <div
                                            key={item.identifier}
                                            className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-lg border border-gray-800 hover:border-red-700/50 transition-colors"
                                        >
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-sm font-medium text-white font-mono">
                                                        {item.identifier}
                                                    </span>
                                                    <span className="px-2 py-0.5 bg-red-900/30 text-red-400 text-xs rounded">
                                                        {item.count} {item.count > 1 ? t('admin.security.attempts') : t('admin.security.attempt')}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {t('admin.security.blockedFor')} <span className="text-orange-400 font-medium">{formatRemainingTime(item.remainingTime)}</span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleUnblock(item.identifier)}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"
                                                title={t('admin.security.unblockTitle')}
                                            >
                                                <Trash2 size={14} />
                                                <span>{t('admin.security.unblock')}</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </Section>

                    {/* Active features */}
                    <div className="p-4 bg-blue-900/10 border border-blue-700/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                            <CheckCircle size={18} className="text-blue-400" />
                            <h4 className="text-sm font-medium text-blue-400">{t('admin.security.activeFeaturesTitle')}</h4>
                        </div>
                        <ul className="space-y-1 text-xs text-gray-400">
                            <li>• {t('admin.security.activeFeatureBruteforce')}</li>
                            <li>• {t('admin.security.activeFeatureBlocking')}</li>
                            <li>• {t('admin.security.activeFeatureNotifications')}</li>
                        </ul>
                    </div>
                </div>

                {/* Right column: Security settings */}
                <div className="space-y-6 order-2">
                    {/* Protection Brute Force */}
                    <Section title={t('admin.security.attackProtectionTitle')} icon={Shield} iconColor="red">
                        <div className="space-y-4">
                            <SettingRow
                                label={t('admin.security.maxLoginAttempts')}
                                description={t('admin.security.maxLoginAttemptsDesc')}
                            >
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="3"
                                        max="10"
                                        value={maxLoginAttempts}
                                        onChange={(e) => setMaxLoginAttempts(parseInt(e.target.value) || 5)}
                                        className="w-20 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:outline-none"
                                    />
                                    <span className="text-sm text-gray-400">{t('admin.security.attemptsUnit')}</span>
                                </div>
                            </SettingRow>

                            <SettingRow
                                label={t('admin.security.lockoutDuration')}
                                description={t('admin.security.lockoutDurationDesc')}
                            >
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="5"
                                        max="60"
                                        value={lockoutDuration}
                                        onChange={(e) => setLockoutDuration(parseInt(e.target.value) || 15)}
                                        className="w-20 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:outline-none"
                                    />
                                    <span className="text-sm text-gray-400">{t('admin.security.minutes')}</span>
                                </div>
                            </SettingRow>

                            <SettingRow
                                label={t('admin.security.trackingWindow')}
                                description={t('admin.security.trackingWindowDesc')}
                            >
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="15"
                                        max="120"
                                        value={trackingWindow}
                                        onChange={(e) => setTrackingWindow(parseInt(e.target.value) || 30)}
                                        className="w-20 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                                    />
                                    <span className="text-sm text-gray-400">{t('admin.security.minutes')}</span>
                                </div>
                            </SettingRow>

                            <div className="mt-4 p-3 bg-green-900/10 border border-green-700/30 rounded-lg">
                                <div className="flex items-start gap-2">
                                    <CheckCircle size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-xs text-green-400 font-medium mb-1">{t('admin.security.protectionActive')}</p>
                                        <p className="text-xs text-gray-400">
                                            {t('admin.security.protectionActiveDesc', { max: maxLoginAttempts, duration: lockoutDuration })}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Section>

                    {/* Authentification */}
                    <Section title={t('admin.security.authTitle')} icon={Lock} iconColor="blue">
                        <div className="space-y-4">
                            <SettingRow
                                label={t('admin.security.sessionTimeout')}
                                description={t('admin.security.sessionTimeoutDesc')}
                            >
                                <div className="flex items-center gap-2 flex-wrap">
                                    <input
                                        type="number"
                                        min="1"
                                        max="168"
                                        value={sessionTimeoutHours}
                                        onChange={(e) => handleSessionTimeoutChange(parseInt(e.target.value) || 168)}
                                        className="w-20 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:outline-none"
                                    />
                                    <span className="text-sm text-gray-400">{t('admin.security.hours')}</span>
                                    {sessionTimeoutHours >= 24 && (
                                        <span className="text-sm text-blue-400 font-medium">
                                            ({sessionTimeoutHours % 24 === 0 
                                                ? `${sessionTimeoutHours / 24} ${sessionTimeoutHours >= 48 ? t('admin.security.days') : t('admin.security.day')}`
                                                : `${Math.round((sessionTimeoutHours / 24) * 10) / 10} ${sessionTimeoutHours >= 48 ? t('admin.security.days') : t('admin.security.day')}`
                                            })
                                        </span>
                                    )}
                                </div>
                                {showSessionWarning && (
                                    <div className="mt-2 flex items-start gap-2 p-2 bg-yellow-900/20 rounded border border-yellow-700/50">
                                        <AlertTriangle size={14} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                                        <p className="text-xs text-yellow-300">
                                            {t('admin.security.sessionWarning')}
                                        </p>
                                    </div>
                                )}
                                <div className="mt-2 flex items-start gap-2 p-2 bg-gray-900/50 rounded border border-gray-800">
                                    <Info size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs text-gray-500">
                                        {t('admin.security.sessionStorageHintPrefix')}<code className="bg-gray-800 px-1 rounded">JWT_EXPIRES_IN</code>{t('admin.security.sessionStorageHintSuffix')}
                                    </p>
                                </div>
                            </SettingRow>
                        </div>
                    </Section>

                    {/* Sécurité réseau */}
                    <Section title={t('admin.security.networkSecurityTitle')} icon={Shield}>
                        <div className="space-y-4">
                            <SettingRow
                                label={t('admin.security.rateLimit')}
                                description={t('admin.security.rateLimitDesc')}
                            >
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={false}
                                        disabled
                                        className="w-4 h-4 text-blue-600 bg-[#1a1a1a] border-gray-700 rounded opacity-50 cursor-not-allowed"
                                    />
                                    <span className="text-sm text-gray-500">{t('admin.security.notImplemented')}</span>
                                </div>
                                <div className="mt-2 flex items-start gap-2 p-2 bg-gray-900/50 rounded border border-gray-800">
                                    <XCircle size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs text-gray-500">
                                        {t('admin.security.rateLimitHintPrefix')}<code className="bg-gray-800 px-1 rounded">express-rate-limit</code>{t('admin.security.rateLimitHintSuffix')}
                                    </p>
                                </div>
                            </SettingRow>
                        </div>
                    </Section>

                    {/* CORS Configuration */}
                    <Section title={t('admin.security.corsTitle')} icon={Globe} iconColor="cyan">
                <div className="space-y-4">
                    <div className="p-3 bg-blue-900/10 border border-blue-700/30 rounded-lg">
                        <div className="flex items-start gap-2">
                            <Info size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                                <p className="text-xs text-blue-300 mb-1">
                                    <strong>{t('admin.security.corsIntroTitle')}</strong>
                                </p>
                                <p className="text-xs text-gray-400">
                                    {t('admin.security.corsIntroDesc')}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Allowed Origins */}
                    <SettingRow
                        label={t('admin.security.allowedOrigins')}
                        description={t('admin.security.allowedOriginsDesc')}
                    >
                        <div className="w-full space-y-3 max-w-xl">
                            <p className="text-xs text-gray-500 leading-relaxed max-w-lg">
                                {t('admin.security.allowedOriginsVsPublicUrl')}
                            </p>
                            <div className="flex gap-2 flex-wrap items-center">
                                <input
                                    type="text"
                                    value={newOrigin}
                                    onChange={(e) => setNewOrigin(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && addOrigin()}
                                    placeholder={t('admin.security.originPlaceholder')}
                                    className="w-full min-w-0 max-w-sm px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                                />
                                <button
                                    onClick={addOrigin}
                                    className="flex-shrink-0 min-w-[90px] px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <Plus size={14} />
                                    <span>{t('admin.security.add')}</span>
                                </button>
                            </div>
                            {corsConfig?.allowedOrigins && corsConfig.allowedOrigins.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {corsConfig.allowedOrigins.map((origin) => (
                                        <div
                                            key={origin}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg"
                                        >
                                            <span className="text-sm text-white font-mono">{origin}</span>
                                            <button
                                                onClick={() => removeOrigin(origin)}
                                                className="text-red-400 hover:text-red-300 transition-colors"
                                                title={t('admin.security.remove')}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {(!corsConfig?.allowedOrigins || corsConfig.allowedOrigins.length === 0) && (
                                <div className="space-y-1.5 rounded-lg bg-gray-900/40 border border-gray-800 p-2.5 max-w-lg">
                                    <p className="text-xs text-gray-400 leading-relaxed">
                                        {t('admin.security.noOriginsConfigured')}
                                    </p>
                                    <p className="text-xs text-gray-500 leading-relaxed">
                                        {t('admin.security.corsDefaultsDesc')}
                                    </p>
                                </div>
                            )}
                        </div>
                    </SettingRow>

                    {/* Allow Credentials */}
                    <SettingRow
                        label={t('admin.security.allowCredentials')}
                        description={t('admin.security.allowCredentialsDesc')}
                    >
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={corsConfig?.allowCredentials !== undefined ? corsConfig.allowCredentials : true}
                                onChange={(e) => setCorsConfig({
                                    ...corsConfig,
                                    allowCredentials: e.target.checked,
                                    allowedOrigins: corsConfig?.allowedOrigins || [],
                                    allowedMethods: corsConfig?.allowedMethods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
                                    allowedHeaders: corsConfig?.allowedHeaders || ['Content-Type', 'Authorization', 'X-Requested-With']
                                })}
                                className="w-4 h-4 text-blue-600 bg-[#1a1a1a] border-gray-700 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-400">
                                {corsConfig?.allowCredentials !== undefined && corsConfig.allowCredentials ? t('admin.security.enabled') : t('admin.security.disabled')}
                            </span>
                        </div>
                    </SettingRow>

                    {/* Allowed Methods */}
                    <SettingRow
                        label={t('admin.security.allowedMethods')}
                        description={t('admin.security.allowedMethodsDesc')}
                    >
                        <div className="w-full space-y-2">
                            <div className="flex gap-2 items-center">
                                <input
                                    type="text"
                                    value={newMethod}
                                    onChange={(e) => setNewMethod(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && addMethod()}
                                    placeholder={t('admin.security.methodsPlaceholder')}
                                    className="flex-1 min-w-0 max-w-sm px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                                />
                                <button
                                    onClick={addMethod}
                                    className="flex-shrink-0 min-w-[90px] px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <Plus size={14} />
                                    <span>{t('admin.security.add')}</span>
                                </button>
                            </div>
                            {corsConfig?.allowedMethods && corsConfig.allowedMethods.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {corsConfig.allowedMethods.map((method) => (
                                        <div
                                            key={method}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg"
                                        >
                                            <span className="text-sm text-white font-mono">{method}</span>
                                            <button
                                                onClick={() => removeMethod(method)}
                                                className="text-red-400 hover:text-red-300 transition-colors"
                                                title={t('admin.security.remove')}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </SettingRow>

                    {/* Allowed Headers */}
                    <SettingRow
                        label={t('admin.security.allowedHeaders')}
                        description={t('admin.security.allowedHeadersDesc')}
                    >
                        <div className="w-full space-y-2">
                            <div className="flex gap-2 items-center">
                                <input
                                    type="text"
                                    value={newHeader}
                                    onChange={(e) => setNewHeader(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && addHeader()}
                                    placeholder={t('admin.security.headersPlaceholder')}
                                    className="flex-1 min-w-0 max-w-sm px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                                />
                                <button
                                    onClick={addHeader}
                                    className="flex-shrink-0 min-w-[90px] px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <Plus size={14} />
                                    <span>{t('admin.security.add')}</span>
                                </button>
                            </div>
                            {corsConfig?.allowedHeaders && corsConfig.allowedHeaders.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {corsConfig.allowedHeaders.map((header) => (
                                        <div
                                            key={header}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg"
                                        >
                                            <span className="text-sm text-white font-mono">{header}</span>
                                            <button
                                                onClick={() => removeHeader(header)}
                                                className="text-red-400 hover:text-red-300 transition-colors"
                                                title={t('admin.security.remove')}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </SettingRow>

                    {/* Save CORS Config Button */}
                    <div className="flex justify-end pt-2 border-t border-gray-800">
                        <button
                            onClick={handleSaveCorsConfig}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            <span>{t('admin.security.saveCors')}</span>
                        </button>
                    </div>
                </div>
            </Section>

                    {/* Save Button */}
                    <div className="flex justify-end pt-4 border-t border-gray-800">
                        <button
                            onClick={handleSaveSecuritySettings}
                            disabled={isLoading}
                            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            <span>{t('admin.security.saveSettings')}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
