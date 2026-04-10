/**
 * Security Section
 * 
 * Component for security settings within Administration
 * Organized in blocks with multiple columns
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Lock, AlertTriangle, Save, Loader2, CheckCircle, Info, Trash2, RefreshCw, Plus, Globe } from 'lucide-react';
import { Section, SettingRow } from '../pages/SettingsPage';
import { LogsManagementSection } from './LogsManagementSection';
import { api } from '../api/client';

type SecInnerTab = 'auth' | 'network' | 'logs';

export const SecuritySection: React.FC<{
  activeSubTab?: string;
  onSubTabChange?: (sub: string) => void;
}> = ({ activeSubTab, onSubTabChange }) => {
    const { t } = useTranslation();
    const VALID_SEC_TABS: SecInnerTab[] = ['auth', 'network', 'logs'];
    const secTab: SecInnerTab = (VALID_SEC_TABS as string[]).includes(activeSubTab || '')
      ? activeSubTab as SecInnerTab : 'auth';
    const setSecTab = (tab: SecInnerTab) => {
      if (onSubTabChange) onSubTabChange(tab);
    };
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

    // Iframe origins configuration state
    const [iframeOrigins, setIframeOrigins] = useState<string[]>([]);
    const [newIframeOrigin, setNewIframeOrigin] = useState('');
    const [initialIframeOrigins, setInitialIframeOrigins] = useState<string[]>([]);

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
        JSON.stringify([...(corsConfig.allowedOrigins || [])].sort()) !== JSON.stringify([...(initialCorsConfig.allowedOrigins || [])].sort()) ||
        corsConfig.allowCredentials !== initialCorsConfig.allowCredentials ||
        JSON.stringify([...(corsConfig.allowedMethods || [])].sort()) !== JSON.stringify([...(initialCorsConfig.allowedMethods || [])].sort()) ||
        JSON.stringify([...(corsConfig.allowedHeaders || [])].sort()) !== JSON.stringify([...(initialCorsConfig.allowedHeaders || [])].sort())
    );

    const hasUnsavedIframeChanges = JSON.stringify([...iframeOrigins].sort()) !== JSON.stringify([...initialIframeOrigins].sort());

    const hasUnsavedChanges = hasUnsavedSecurityChanges || hasUnsavedCorsChanges || hasUnsavedIframeChanges;

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
            }; iframeOrigins?: string[] }>('/api/system/general');
            if (response.success && response.result) {
                const config = response.result.corsConfig || null;
                setCorsConfig(config);
                setInitialCorsConfig(config ? JSON.parse(JSON.stringify(config)) : null);
                const origins = response.result.iframeOrigins || [];
                setIframeOrigins(origins);
                setInitialIframeOrigins([...origins]);
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

    const handleSaveIframeConfig = async () => {
        setIsLoading(true);
        setMessage(null);

        try {
            const response = await api.put('/api/system/general', {
                iframeOrigins
            });

            if (response.success) {
                setMessage({ type: 'success', text: t('admin.security.iframeSaveSuccess') });
                setTimeout(() => setMessage(null), 5000);
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

    const addIframeOrigin = () => {
        if (newIframeOrigin.trim()) {
            const trimmed = newIframeOrigin.trim();
            if (!iframeOrigins.includes(trimmed)) {
                setIframeOrigins([...iframeOrigins, trimmed]);
                setNewIframeOrigin('');
            }
        }
    };

    const removeIframeOrigin = (origin: string) => {
        setIframeOrigins(iframeOrigins.filter(o => o !== origin));
    };

    // Helper to update CORS config while preserving defaults for unset fields
    const updateCorsConfig = (updates: Partial<NonNullable<typeof corsConfig>>) => {
        setCorsConfig({
            allowedOrigins: corsConfig?.allowedOrigins || [],
            allowCredentials: corsConfig?.allowCredentials !== undefined ? corsConfig.allowCredentials : true,
            allowedMethods: corsConfig?.allowedMethods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
            allowedHeaders: corsConfig?.allowedHeaders || ['Content-Type', 'Authorization', 'X-Requested-With'],
            ...updates
        });
    };

    const addOrigin = () => {
        if (newOrigin.trim()) {
            const origins = corsConfig?.allowedOrigins || [];
            if (!origins.includes(newOrigin.trim())) {
                updateCorsConfig({ allowedOrigins: [...origins, newOrigin.trim()] });
                setNewOrigin('');
            }
        }
    };

    const removeOrigin = (origin: string) => {
        updateCorsConfig({ allowedOrigins: (corsConfig?.allowedOrigins || []).filter(o => o !== origin) });
    };

    const addMethod = () => {
        if (newMethod.trim()) {
            const methods = corsConfig?.allowedMethods || [];
            if (!methods.includes(newMethod.trim().toUpperCase())) {
                updateCorsConfig({ allowedMethods: [...methods, newMethod.trim().toUpperCase()] });
                setNewMethod('');
            }
        }
    };

    const removeMethod = (method: string) => {
        updateCorsConfig({ allowedMethods: (corsConfig?.allowedMethods || []).filter(m => m !== method) });
    };

    const addHeader = () => {
        if (newHeader.trim()) {
            const headers = corsConfig?.allowedHeaders || [];
            if (!headers.includes(newHeader.trim())) {
                updateCorsConfig({ allowedHeaders: [...headers, newHeader.trim()] });
                setNewHeader('');
            }
        }
    };

    const removeHeader = (header: string) => {
        updateCorsConfig({ allowedHeaders: (corsConfig?.allowedHeaders || []).filter(h => h !== header) });
    };

    const secTabs: { id: SecInnerTab; label: string; icon: React.ElementType }[] = [
        { id: 'auth', label: t('admin.security.tabAuth'), icon: Shield },
        { id: 'network', label: t('admin.security.tabNetwork'), icon: Globe },
        { id: 'logs', label: t('admin.security.tabLogs'), icon: Lock },
    ];

    return (
        <div className="space-y-4">
            {/* Global alerts — toujours visibles */}
            {jwtSecretWarning && (
                <div className="p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-xl flex items-start gap-3">
                    <AlertTriangle size={18} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                        <h4 className="text-sm font-medium text-yellow-400 mb-1">{t('admin.security.jwtDefaultTitle')}</h4>
                        <p className="text-xs text-yellow-300 mb-1">
                            {t('admin.security.jwtDefaultDesc')} <code className="bg-yellow-900/30 px-1.5 py-0.5 rounded">JWT_SECRET</code> {t('admin.security.jwtDefaultDescSuffix')}
                        </p>
                        <p className="text-xs text-gray-400">{t('admin.security.jwtProductionHint')}</p>
                    </div>
                </div>
            )}

            {hasUnsavedChanges && (
                <div className="p-3 bg-amber-900/20 border border-amber-700/50 rounded-xl flex items-center gap-3">
                    <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
                    <div className="flex-1">
                        <span className="text-sm font-medium text-amber-400">{t('admin.security.unsavedChangesTitle')} </span>
                        <span className="text-xs text-amber-300">{t('admin.security.unsavedChangesHint')}</span>
                    </div>
                </div>
            )}

            {message && (
                <div className={`p-3 rounded-xl flex items-center gap-2 ${
                    message.type === 'success'
                        ? 'bg-green-900/20 border border-green-700 text-green-400'
                        : 'bg-red-900/20 border border-red-700 text-red-400'
                }`}>
                    {message.type === 'success' ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
                    <span className="text-sm">{message.text}</span>
                </div>
            )}

            {/* Panneau à onglets */}
            <div className="bg-theme-card rounded-xl border border-theme overflow-hidden" style={{ backdropFilter: 'var(--backdrop-blur)' }}>
                {/* Tab bar */}
                <div className="flex items-center gap-1 px-4 py-2 border-b border-theme bg-theme-primary overflow-x-auto">
                    <Shield size={16} className="text-red-400 mr-2 shrink-0" />
                    {secTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setSecTab(tab.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                                secTab === tab.id
                                    ? 'bg-red-600/20 text-red-300 border border-red-600/40'
                                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                            }`}
                        >
                            <tab.icon size={12} />
                            {tab.label}
                            {tab.id === 'auth' && blockedIPs.length > 0 && (
                                <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                                    {blockedIPs.length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="p-4 space-y-6">

                    {/* TAB: Auth & Protection */}
                    {secTab === 'auth' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Brute force */}
                                <Section title={t('admin.security.attackProtectionTitle')} icon={Shield} iconColor="red">
                                    <div className="space-y-4">
                                        <SettingRow label={t('admin.security.maxLoginAttempts')} description={t('admin.security.maxLoginAttemptsDesc')}>
                                            <div className="flex items-center gap-2">
                                                <input type="number" min="3" max="10" value={maxLoginAttempts}
                                                    onChange={(e) => setMaxLoginAttempts(parseInt(e.target.value) || 5)}
                                                    className="w-20 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none" />
                                                <span className="text-sm text-gray-400">{t('admin.security.attemptsUnit')}</span>
                                            </div>
                                        </SettingRow>
                                        <SettingRow label={t('admin.security.lockoutDuration')} description={t('admin.security.lockoutDurationDesc')}>
                                            <div className="flex items-center gap-2">
                                                <input type="number" min="5" max="60" value={lockoutDuration}
                                                    onChange={(e) => setLockoutDuration(parseInt(e.target.value) || 15)}
                                                    className="w-20 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none" />
                                                <span className="text-sm text-gray-400">{t('admin.security.minutes')}</span>
                                            </div>
                                        </SettingRow>
                                        <SettingRow label={t('admin.security.trackingWindow')} description={t('admin.security.trackingWindowDesc')}>
                                            <div className="flex items-center gap-2">
                                                <input type="number" min="15" max="120" value={trackingWindow}
                                                    onChange={(e) => setTrackingWindow(parseInt(e.target.value) || 30)}
                                                    className="w-20 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500" />
                                                <span className="text-sm text-gray-400">{t('admin.security.minutes')}</span>
                                            </div>
                                        </SettingRow>
                                        <div className="p-3 bg-green-900/10 border border-green-700/30 rounded-lg flex items-start gap-2">
                                            <CheckCircle size={15} className="text-green-400 mt-0.5 flex-shrink-0" />
                                            <div>
                                                <p className="text-xs text-green-400 font-medium mb-0.5">{t('admin.security.protectionActive')}</p>
                                                <p className="text-xs text-gray-400">{t('admin.security.protectionActiveDesc', { max: maxLoginAttempts, duration: lockoutDuration })}</p>
                                            </div>
                                        </div>
                                    </div>
                                </Section>

                                {/* Session */}
                                <Section title={t('admin.security.authTitle')} icon={Lock} iconColor="blue">
                                    <div className="space-y-4">
                                        <SettingRow label={t('admin.security.sessionTimeout')} description={t('admin.security.sessionTimeoutDesc')}>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <input type="number" min="1" max="168" value={sessionTimeoutHours}
                                                    onChange={(e) => handleSessionTimeoutChange(parseInt(e.target.value) || 168)}
                                                    className="w-20 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none" />
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
                                                    <AlertTriangle size={13} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                                                    <p className="text-xs text-yellow-300">{t('admin.security.sessionWarning')}</p>
                                                </div>
                                            )}
                                            <div className="mt-2 flex items-start gap-2 p-2 bg-gray-900/50 rounded border border-gray-800">
                                                <Info size={13} className="text-gray-500 mt-0.5 flex-shrink-0" />
                                                <p className="text-xs text-gray-500">
                                                    {t('admin.security.sessionStorageHintPrefix')}<code className="bg-gray-800 px-1 rounded">JWT_EXPIRES_IN</code>{t('admin.security.sessionStorageHintSuffix')}
                                                </p>
                                            </div>
                                        </SettingRow>
                                    </div>
                                </Section>
                            </div>

                            {/* Features actives */}
                            <div className="p-3 bg-blue-900/10 border border-blue-700/30 rounded-lg flex items-start gap-3">
                                <CheckCircle size={16} className="text-blue-400 mt-0.5 shrink-0" />
                                <div>
                                    <h4 className="text-sm font-medium text-blue-400 mb-1">{t('admin.security.activeFeaturesTitle')}</h4>
                                    <ul className="space-y-0.5 text-xs text-gray-400">
                                        <li>• {t('admin.security.activeFeatureBruteforce')}</li>
                                        <li>• {t('admin.security.activeFeatureBlocking')}</li>
                                        <li>• {t('admin.security.activeFeatureNotifications')}</li>
                                    </ul>
                                </div>
                            </div>

                            {/* IPs bloquées */}
                            <Section title={t('admin.security.blockedTitle')} icon={Shield} iconColor="red">
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm text-gray-400">{t('admin.security.blockedListDesc')}</p>
                                        <button onClick={loadBlockedIPs} disabled={isLoadingBlockedIPs}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg disabled:opacity-50">
                                            <RefreshCw size={13} className={isLoadingBlockedIPs ? 'animate-spin' : ''} />
                                            {t('admin.security.refresh')}
                                        </button>
                                    </div>
                                    {isLoadingBlockedIPs ? (
                                        <div className="flex items-center justify-center py-6">
                                            <Loader2 className="animate-spin text-blue-400" size={20} />
                                        </div>
                                    ) : blockedIPs.length === 0 ? (
                                        <div className="py-6 text-center">
                                            <CheckCircle size={28} className="text-green-400 mx-auto mb-2" />
                                            <p className="text-sm text-gray-400">{t('admin.security.noBlocked')}</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {blockedIPs.map((item) => (
                                                <div key={item.identifier}
                                                    className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-lg border border-gray-800 hover:border-red-700/50 transition-colors">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className="text-sm font-medium text-white font-mono truncate">{item.identifier}</span>
                                                            <span className="shrink-0 px-2 py-0.5 bg-red-900/30 text-red-400 text-xs rounded">
                                                                {item.count} {item.count > 1 ? t('admin.security.attempts') : t('admin.security.attempt')}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            {t('admin.security.blockedFor')} <span className="text-orange-400 font-medium">{formatRemainingTime(item.remainingTime)}</span>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => handleUnblock(item.identifier)}
                                                        className="shrink-0 ml-3 flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">
                                                        <Trash2 size={13} />
                                                        {t('admin.security.unblock')}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </Section>

                            {/* Bouton sauvegarder auth */}
                            <div className="flex justify-end pt-2 border-t border-gray-800">
                                <button onClick={handleSaveSecuritySettings} disabled={isLoading}
                                    className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm transition-colors disabled:opacity-50 font-medium">
                                    {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    {t('admin.security.saveSettings')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TAB: Réseau & CORS */}
                    {secTab === 'network' && (
                        <div className="space-y-6">
                            {/* CORS */}
                            <Section title={t('admin.security.corsTitle')} icon={Globe} iconColor="cyan">
                                <div className="space-y-4">
                                    <div className="p-3 bg-blue-900/10 border border-blue-700/30 rounded-lg flex items-start gap-2">
                                        <Info size={15} className="text-blue-400 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-xs text-blue-300 font-semibold mb-0.5">{t('admin.security.corsIntroTitle')}</p>
                                            <p className="text-xs text-gray-400">{t('admin.security.corsIntroDesc')}</p>
                                        </div>
                                    </div>

                                    <SettingRow label={t('admin.security.allowedOrigins')} description={t('admin.security.allowedOriginsDesc')}>
                                        <div className="w-full space-y-2">
                                            <p className="text-xs text-gray-500">{t('admin.security.allowedOriginsVsPublicUrl')}</p>
                                            <div className="flex gap-2 items-center flex-wrap">
                                                <input type="text" value={newOrigin}
                                                    onChange={(e) => setNewOrigin(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && addOrigin()}
                                                    placeholder={t('admin.security.originPlaceholder')}
                                                    className="flex-1 min-w-0 max-w-sm px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                                                <button onClick={addOrigin}
                                                    className="shrink-0 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg flex items-center gap-1.5">
                                                    <Plus size={13} /> {t('admin.security.add')}
                                                </button>
                                            </div>
                                            <div className="flex flex-wrap gap-2 min-h-[2rem]">
                                                {corsConfig?.allowedOrigins && corsConfig.allowedOrigins.length > 0
                                                    ? corsConfig.allowedOrigins.map(origin => (
                                                        <div key={origin} className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg">
                                                            <span className="text-sm text-white font-mono">{origin}</span>
                                                            <button onClick={() => removeOrigin(origin)} className="text-red-400 hover:text-red-300"><Trash2 size={13} /></button>
                                                        </div>
                                                    ))
                                                    : <p className="text-xs text-gray-500 self-center">{t('admin.security.noOriginsConfigured')}</p>
                                                }
                                            </div>
                                        </div>
                                    </SettingRow>

                                    <SettingRow label={t('admin.security.allowCredentials')} description={t('admin.security.allowCredentialsDesc')}>
                                        <div className="flex items-center gap-2">
                                            <input type="checkbox"
                                                checked={corsConfig?.allowCredentials !== undefined ? corsConfig.allowCredentials : true}
                                                onChange={(e) => updateCorsConfig({ allowCredentials: e.target.checked })}
                                                className="w-4 h-4 text-blue-600 bg-[#1a1a1a] border-gray-700 rounded focus:ring-blue-500" />
                                            <span className="text-sm text-gray-400">
                                                {(corsConfig?.allowCredentials ?? true) ? t('admin.security.enabled') : t('admin.security.disabled')}
                                            </span>
                                        </div>
                                    </SettingRow>

                                    <SettingRow label={t('admin.security.allowedMethods')} description={t('admin.security.allowedMethodsDesc')}>
                                        <div className="w-full space-y-2">
                                            <div className="flex gap-2 items-center">
                                                <input type="text" value={newMethod}
                                                    onChange={(e) => setNewMethod(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && addMethod()}
                                                    placeholder={t('admin.security.methodsPlaceholder')}
                                                    className="flex-1 min-w-0 max-w-xs px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                                                <button onClick={addMethod} className="shrink-0 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg flex items-center gap-1.5">
                                                    <Plus size={13} /> {t('admin.security.add')}
                                                </button>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {corsConfig?.allowedMethods?.map(method => (
                                                    <div key={method} className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg">
                                                        <span className="text-sm text-white font-mono">{method}</span>
                                                        <button onClick={() => removeMethod(method)} className="text-red-400 hover:text-red-300"><Trash2 size={13} /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </SettingRow>

                                    <SettingRow label={t('admin.security.allowedHeaders')} description={t('admin.security.allowedHeadersDesc')}>
                                        <div className="w-full space-y-2">
                                            <div className="flex gap-2 items-center">
                                                <input type="text" value={newHeader}
                                                    onChange={(e) => setNewHeader(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && addHeader()}
                                                    placeholder={t('admin.security.headersPlaceholder')}
                                                    className="flex-1 min-w-0 max-w-xs px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                                                <button onClick={addHeader} className="shrink-0 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg flex items-center gap-1.5">
                                                    <Plus size={13} /> {t('admin.security.add')}
                                                </button>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {corsConfig?.allowedHeaders?.map(header => (
                                                    <div key={header} className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg">
                                                        <span className="text-sm text-white font-mono">{header}</span>
                                                        <button onClick={() => removeHeader(header)} className="text-red-400 hover:text-red-300"><Trash2 size={13} /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </SettingRow>

                                    <div className="flex justify-end pt-2 border-t border-gray-800">
                                        <button onClick={handleSaveCorsConfig} disabled={isLoading}
                                            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg disabled:opacity-50">
                                            {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                                            {t('admin.security.saveCors')}
                                        </button>
                                    </div>
                                </div>
                            </Section>

                            {/* Iframe / Embed */}
                            <Section title={t('admin.security.iframeTitle')} icon={Globe} iconColor="purple">
                                <div className="space-y-4">
                                    <div className="p-3 bg-purple-900/10 border border-purple-700/30 rounded-lg flex items-start gap-2">
                                        <Info size={15} className="text-purple-400 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-xs text-purple-300 font-semibold mb-0.5">{t('admin.security.iframeIntroTitle')}</p>
                                            <p className="text-xs text-gray-400">{t('admin.security.iframeIntroDesc')}</p>
                                        </div>
                                    </div>

                                    <SettingRow label={t('admin.security.iframeOrigins')} description={t('admin.security.iframeOriginsDesc')}>
                                        <div className="w-full space-y-2">
                                            <div className="flex gap-2 items-center flex-wrap">
                                                <input type="text" value={newIframeOrigin}
                                                    onChange={(e) => setNewIframeOrigin(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && addIframeOrigin()}
                                                    placeholder={t('admin.security.iframeOriginPlaceholder')}
                                                    className="flex-1 min-w-0 max-w-sm px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                                                <button onClick={addIframeOrigin}
                                                    className="shrink-0 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg flex items-center gap-1.5">
                                                    <Plus size={13} /> {t('admin.security.add')}
                                                </button>
                                            </div>
                                            <div className="flex flex-wrap gap-2 min-h-[2rem]">
                                                {iframeOrigins.length > 0
                                                    ? iframeOrigins.map(origin => (
                                                        <div key={origin} className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg">
                                                            <span className="text-sm text-white font-mono">{origin}</span>
                                                            <button onClick={() => removeIframeOrigin(origin)} className="text-red-400 hover:text-red-300"><Trash2 size={13} /></button>
                                                        </div>
                                                    ))
                                                    : <p className="text-xs text-gray-500 self-center">{t('admin.security.noIframeOriginsConfigured')}</p>
                                                }
                                            </div>
                                        </div>
                                    </SettingRow>

                                    <div className="flex justify-end pt-2 border-t border-gray-800">
                                        <button onClick={handleSaveIframeConfig} disabled={isLoading}
                                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg disabled:opacity-50">
                                            {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                                            {t('admin.security.saveIframe')}
                                        </button>
                                    </div>
                                </div>
                            </Section>
                        </div>
                    )}

                    {/* TAB: Journaux */}
                    {secTab === 'logs' && (
                        <LogsManagementSection />
                    )}

                </div>
            </div>
        </div>
    );
};
