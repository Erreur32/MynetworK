/**
 * Plugins Management Section
 * 
 * Component for managing plugins within Administration settings
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Power, CheckCircle, XCircle, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';
import { usePluginStore, type Plugin } from '../stores/pluginStore';
import { useAuthStore } from '../stores/authStore';
import { Section, SettingRow } from '../pages/SettingsPage';
import { PluginConfigModal } from './modals/PluginConfigModal';
import { LoginModal } from './modals/LoginModal';
import { NetworkScanConfigModal } from './modals/NetworkScanConfigModal';
import { getFreeboxSettingsUrl } from '../utils/permissions';

export const PluginsManagementSection: React.FC = () => {
    const { t } = useTranslation();
    const { plugins, pluginStats, isLoading, fetchPlugins, fetchAllStats, updatePluginConfig, testPluginConnection } = usePluginStore();
    // Get Freebox plugin once for reuse
    const freeboxPlugin = plugins.find(p => p.id === 'freebox');
    const { checkAuth: checkFreeboxAuth, isRegistered: isFreeboxRegistered, isLoggedIn: isFreeboxLoggedIn, permissions, freeboxUrl } = useAuthStore();
    const [testingPlugin, setTestingPlugin] = useState<string | null>(null);
    const [configModalOpen, setConfigModalOpen] = useState(false);
    const [selectedPluginId, setSelectedPluginId] = useState<string>('');
    const [freeboxLoginModalOpen, setFreeboxLoginModalOpen] = useState(false);
    const [networkScanConfigModalOpen, setNetworkScanConfigModalOpen] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Load plugins and stats once on mount (with cache check)
    useEffect(() => {
        fetchPlugins();
        fetchAllStats(); // Also fetch stats to get API versions
    }, []); // Empty deps - load once only
    
    // Refresh plugins and stats periodically to update connection status (silent refresh)
    // DISABLED when config modal is open to prevent form reset during editing
    useEffect(() => {
        // Don't refresh if modal is open
        if (configModalOpen) {
            return;
        }
        
        const interval = setInterval(async () => {
            setIsRefreshing(true);
            try {
                // Silent refresh - don't show global loading state
                await Promise.all([
                    fetchPlugins(true), // Force refresh
                    fetchAllStats() // Refresh stats to get updated API versions
                ]);
            } catch (error) {
                console.error('Silent refresh error:', error);
            } finally {
                setIsRefreshing(false);
            }
        }, 30000); // Refresh every 30 seconds (less frequent)
        
        return () => clearInterval(interval);
    }, [fetchPlugins, fetchAllStats, configModalOpen]);

    // Check Freebox auth status when Freebox plugin is enabled (only when plugin enabled state changes)
    useEffect(() => {
        const freeboxEnabled = freeboxPlugin?.enabled ?? false;
        
        if (freeboxEnabled) {
            // Only check auth if not already registered/logged in to avoid unnecessary calls
            const authState = useAuthStore.getState();
            if (!authState.isRegistered && !authState.isRegistering) {
                checkFreeboxAuth().then(() => {
                    const updatedAuthState = useAuthStore.getState();
                    if (!updatedAuthState.isRegistered && !updatedAuthState.isRegistering) {
                        setFreeboxLoginModalOpen(true);
                    } else if (updatedAuthState.isRegistered && updatedAuthState.isLoggedIn) {
                        setFreeboxLoginModalOpen(false);
                    }
                });
            }
        } else {
            setFreeboxLoginModalOpen(false);
        }
    }, [freeboxPlugin?.enabled, checkFreeboxAuth]); // Depend on plugin enabled state

    const handleToggle = async (pluginId: string, enabled: boolean) => {
        // updatePluginConfig already refreshes plugins internally, no need to call fetchPlugins again
        const success = await updatePluginConfig(pluginId, { enabled });
        
        if (success && pluginId === 'freebox' && enabled) {
            await checkFreeboxAuth();
            const authState = useAuthStore.getState();
            if (!authState.isRegistered) {
                setFreeboxLoginModalOpen(true);
            }
        } else if (pluginId === 'freebox' && !enabled) {
            setFreeboxLoginModalOpen(false);
        }
    };

    const [lastTestMessage, setLastTestMessage] = useState<string | null>(null);
    const [lastTestSuccess, setLastTestSuccess] = useState<boolean | null>(null);

    const handleTest = async (pluginId: string) => {
        setTestingPlugin(pluginId);
        const result = await testPluginConnection(pluginId);
        if (result) {
            setLastTestSuccess(result.connected);
            setLastTestMessage(result.message);
            // Force refresh plugins and stats to update connection status after test
            await (fetchPlugins as (force?: boolean) => Promise<void>)(true); // Force refresh to get updated connection status
            await fetchAllStats(); // Also refresh stats to get updated API versions
        } else {
            setLastTestSuccess(false);
            setLastTestMessage(t('admin.plugins.testImpossible'));
        }
        setTimeout(() => setTestingPlugin(null), 2000);
    };

    const handleConfigure = (pluginId: string) => {
        setSelectedPluginId(pluginId);
        setConfigModalOpen(true);
    };

    const handleConfigClose = () => {
        setConfigModalOpen(false);
        setSelectedPluginId('');
        // Force refresh plugins after config change to get updated settings
        (fetchPlugins as (force?: boolean) => Promise<void>)(true); // Force refresh
        fetchAllStats(); // Also refresh stats
    };

    // Only show full loading on initial load, not on silent refresh
    if (isLoading && plugins.length === 0) {
        return (
            <div className="flex items-center justify-center py-16">
                <RefreshCw size={32} className="text-gray-400 animate-spin" />
            </div>
        );
    }

    // Check if Freebox plugin has missing permissions
    const hasSettingsPermission = permissions.settings === true;
    const showFreeboxPermissionWarning = freeboxPlugin?.enabled && !hasSettingsPermission;

    const permissionLabel = t('admin.plugins.permissionSettings');

    return (
        <>
            <Section title={t('admin.plugins.sectionTitle')} icon={Settings} iconColor="emerald">
                {/* Discreet refresh indicator */}
                {isRefreshing && (
                    <div className="absolute top-4 right-4 z-10">
                        <RefreshCw size={14} className="text-gray-500 animate-spin" title={t('admin.plugins.refreshing')} />
                    </div>
                )}
                {/* Freebox Permission Warning */}
                {showFreeboxPermissionWarning && (
                    <div className="mb-4 p-4 bg-orange-500/10 border-2 border-orange-500/30 rounded-lg">
                        <div className="flex items-start gap-3">
                            <AlertCircle size={20} className="text-orange-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-orange-400 mb-1.5">
                                    {t('admin.plugins.freeboxPermissionMissing')}
                                </div>
                                <div className="text-xs text-orange-300/90 mb-3">
                                    {t('admin.plugins.freeboxPermissionRequired', { permission: permissionLabel })}
                                </div>
                                <div className="text-xs text-orange-300/80 mb-2">
                                    <strong>{t('admin.plugins.toEnablePermission')}</strong>
                                </div>
                                <ol className="text-xs text-orange-300/80 list-decimal list-inside space-y-1 mb-3">
                                    <li>{t('admin.plugins.stepOpenFreebox')}</li>
                                    <li>{t('admin.plugins.stepGoToSettings')}</li>
                                    <li>{t('admin.plugins.stepSelectApp')}</li>
                                    <li>{t('admin.plugins.stepEnablePermission', { permission: permissionLabel })}</li>
                                </ol>
                                <a
                                    href={getFreeboxSettingsUrl(freeboxUrl)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/50 rounded-lg text-xs text-orange-300 hover:text-orange-200 transition-colors"
                                >
                                    {t('admin.plugins.openFreeboxSettings')}
                                    <ExternalLink size={14} />
                                </a>
                            </div>
                        </div>
                    </div>
                )}
                {lastTestMessage && (
                    <div
                        className={`mb-4 px-4 py-3 rounded-lg border-2 flex items-center gap-3 ${
                            lastTestSuccess
                                ? 'border-green-600 bg-green-900/40 text-green-100'
                                : 'border-red-600 bg-red-900/40 text-red-100'
                        }`}
                    >
                        {lastTestSuccess ? (
                            <CheckCircle size={18} className="text-green-400 flex-shrink-0" />
                        ) : (
                            <XCircle size={18} className="text-red-400 flex-shrink-0" />
                        )}
                        <div className="flex-1">
                            <div className="font-semibold text-sm mb-0.5">
                                {lastTestSuccess ? t('admin.plugins.testSuccess') : t('admin.plugins.testFailed')}
                            </div>
                            <div className="text-xs opacity-90">{lastTestMessage}</div>
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {plugins.map((plugin) => (
                        <div
                            key={plugin.id}
                            className={`rounded-lg p-3 border transition-all hover:shadow-lg flex flex-col ${
                                plugin.enabled && plugin.connectionStatus
                                    ? 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50 hover:shadow-emerald-500/20'
                                    : plugin.enabled
                                        ? 'bg-yellow-500/10 border-yellow-500/30 hover:border-yellow-500/50 hover:shadow-yellow-500/20'
                                        : 'bg-gray-500/10 border-gray-500/30 hover:border-gray-500/50 hover:shadow-gray-500/20'
                            }`}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between mb-2.5">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                        plugin.enabled && plugin.connectionStatus 
                                            ? 'bg-emerald-500/20 border border-emerald-500/30' 
                                            : plugin.enabled 
                                                ? 'bg-yellow-500/20 border border-yellow-500/30'
                                                : 'bg-gray-500/20 border border-gray-500/30'
                                    }`}>
                                        <Settings size={16} className={
                                            plugin.enabled && plugin.connectionStatus 
                                                ? 'text-emerald-400' 
                                                : plugin.enabled 
                                                    ? 'text-yellow-400'
                                                    : 'text-gray-400'
                                        } />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-semibold text-theme-primary text-sm truncate">{plugin.name}</h4>
                                        <p className="text-[10px] text-theme-tertiary">v{plugin.version}</p>
                                    </div>
                                </div>
                                {/* Status badge - top right */}
                                <div className="flex-shrink-0">
                                    {plugin.connectionStatus ? (
                                        <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded text-emerald-400 text-[10px] font-medium">
                                            <CheckCircle size={11} />
                                            <span>{t('admin.plugins.statusConnected')}</span>
                                        </div>
                                    ) : plugin.enabled ? (
                                        <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded text-yellow-400 text-[10px] font-medium">
                                            <AlertCircle size={11} />
                                            <span>{t('admin.plugins.statusNotConnected')}</span>
                                        </div>
                                    ) : (
                                        <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-500/20 border border-gray-500/30 rounded text-gray-400 text-[10px] font-medium">
                                            <XCircle size={11} />
                                            <span>{t('admin.plugins.statusDisabled')}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Plugin-specific info */}
                            {plugin.connectionStatus && (
                                <div className="mb-2.5 flex flex-wrap gap-1.5">
                                    {plugin.id === 'freebox' && (() => {
                                        // Get all Freebox versions from pluginStats.system (where they're actually stored)
                                        const stats = pluginStats?.[plugin.id]?.system as any;
                                        const firmware = stats?.firmware || stats?.firmware_version || stats?.version || plugin.firmware;
                                        const playerFirmware = stats?.playerFirmware || stats?.player_firmware || stats?.player_firmware_version || stats?.player_version || plugin.playerFirmware;
                                        const apiVersion = stats?.apiVersion || plugin.apiVersion;
                                        
                                        return (
                                            <>
                                                {firmware && (
                                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded text-blue-400 text-[10px] font-medium">
                                                        <span className="text-blue-300/70">{t('admin.plugins.labelBox')}:</span>
                                                        <span className="font-mono">{firmware}</span>
                                                    </div>
                                                )}
                                                {playerFirmware && (
                                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-500/20 border border-purple-500/30 rounded text-purple-400 text-[10px] font-medium">
                                                        <span className="text-purple-300/70">{t('admin.plugins.labelPlayer')}:</span>
                                                        <span className="font-mono">{playerFirmware}</span>
                                                    </div>
                                                )}
                                                {apiVersion && (
                                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-500/20 border border-cyan-500/30 rounded text-cyan-400 text-[10px] font-medium">
                                                        <span className="text-cyan-300/70">{t('admin.plugins.labelApi')}:</span>
                                                        <span className="font-mono">{apiVersion}</span>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                    {plugin.id === 'unifi' && (() => {
                                        // Get UniFi deployment type and versions from pluginStats.system
                                        const stats = pluginStats?.[plugin.id]?.system as any;
                                        const deploymentType = stats?.deploymentType;
                                        const apiMode = plugin.settings?.apiMode as string || stats?.apiMode;
                                        const controllerFirmware = stats?.version || plugin.controllerFirmware;
                                        const apiVersion = stats?.apiVersion || plugin.apiVersion;
                                        
                                        // Determine deployment display text
                                        let deploymentLabel = '';
                                        let deploymentColor = 'purple';
                                        
                                        if (apiMode === 'site-manager') {
                                            deploymentLabel = t('admin.plugins.deploymentSiteManager');
                                            deploymentColor = 'indigo';
                                        } else if (deploymentType === 'unifios') {
                                            deploymentLabel = t('admin.plugins.deploymentUniFiOS');
                                            deploymentColor = 'purple';
                                        } else if (deploymentType === 'controller') {
                                            deploymentLabel = t('admin.plugins.deploymentController');
                                            deploymentColor = 'blue';
                                        } else if (deploymentType === 'cloud') {
                                            deploymentLabel = t('admin.plugins.deploymentCloud');
                                            deploymentColor = 'indigo';
                                        }
                                        
                                        return (
                                            <>
                                                {deploymentLabel && (
                                                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 ${
                                                        deploymentColor === 'indigo' ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400' :
                                                        deploymentColor === 'purple' ? 'bg-purple-500/20 border-purple-500/30 text-purple-400' :
                                                        'bg-blue-500/20 border-blue-500/30 text-blue-400'
                                                    } border rounded text-[10px] font-medium`}>
                                                        <span className={
                                                            deploymentColor === 'indigo' ? 'text-indigo-300/70' :
                                                            deploymentColor === 'purple' ? 'text-purple-300/70' :
                                                            'text-blue-300/70'
                                                        }>{t('admin.plugins.labelType')}:</span>
                                                        <span>{deploymentLabel}</span>
                                                    </div>
                                                )}
                                                {controllerFirmware && (
                                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded text-blue-400 text-[10px] font-medium">
                                                        <span className="text-blue-300/70">{t('admin.plugins.labelFirmware')}:</span>
                                                        <span className="font-mono">{controllerFirmware}</span>
                                                    </div>
                                                )}
                                                {apiVersion && (
                                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-500/20 border border-cyan-500/30 rounded text-cyan-400 text-[10px] font-medium">
                                                        <span className="text-cyan-300/70">{t('admin.plugins.labelApi')}:</span>
                                                        <span className="font-mono">{apiVersion}</span>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                    {plugin.id === 'scan-reseau' && (() => {
                                        const stats = pluginStats?.['scan-reseau']?.system as any;
                                        if (!stats) return null;
                                        const scannerVersion = stats?.version || stats?.scannerVersion;
                                        return (
                                            <>
                                                {scannerVersion && (
                                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-500/20 border border-cyan-500/30 rounded text-cyan-400 text-[10px] font-medium">
                                                        <span className="text-cyan-300/70">{t('admin.plugins.labelVersion')}:</span>
                                                        <span className="font-mono">{scannerVersion}</span>
                                                    </div>
                                                )}
                                                <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-500/20 border border-gray-500/30 rounded text-gray-300 text-[10px] font-medium">
                                                    <span className="text-gray-400">{t('admin.plugins.labelTotal')}:</span>
                                                    <span className="font-mono font-semibold">{stats.totalIps || 0}</span>
                                                </div>
                                                <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded text-emerald-400 text-[10px] font-medium">
                                                    <span className="text-emerald-300/70">{t('admin.plugins.labelOnline')}:</span>
                                                    <span className="font-mono font-semibold">{stats.onlineIps || 0}</span>
                                                </div>
                                                <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/20 border border-red-500/30 rounded text-red-400 text-[10px] font-medium">
                                                    <span className="text-red-300/70">{t('admin.plugins.labelOffline')}:</span>
                                                    <span className="font-mono font-semibold">{stats.offlineIps || 0}</span>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center justify-between pt-2.5 mt-auto">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-theme-tertiary font-medium">{t('admin.plugins.active')}</span>
                                    <button
                                        onClick={() => handleToggle(plugin.id, !plugin.enabled)}
                                        className={`relative w-9 h-5 rounded-full transition-all ${
                                            plugin.enabled ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-gray-600'
                                        }`}
                                    >
                                        <span
                                            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-md ${
                                                plugin.enabled ? 'translate-x-4' : 'translate-x-0'
                                            }`}
                                        />
                                    </button>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {plugin.id === 'scan-reseau' ? (
                                        <button
                                            onClick={() => setNetworkScanConfigModalOpen(true)}
                                            className="p-1.5 bg-theme-secondary border border-theme hover:bg-theme-primary hover:border-purple-500/50 rounded-lg text-theme-primary transition-all hover:shadow-lg hover:shadow-purple-500/10"
                                            title={t('admin.plugins.titleConfigureScans')}
                                        >
                                            <Settings size={12} />
                                        </button>
                                    ) : (
                                        <>
                                    <button
                                        onClick={() => handleTest(plugin.id)}
                                        disabled={testingPlugin === plugin.id}
                                        className="p-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-blue-500/30"
                                        title={t('admin.plugins.titleTestConnection')}
                                    >
                                        {testingPlugin === plugin.id ? (
                                            <RefreshCw size={12} className="animate-spin" />
                                        ) : (
                                            <RefreshCw size={12} />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => handleConfigure(plugin.id)}
                                        className="p-1.5 bg-theme-secondary border border-theme hover:bg-theme-primary hover:border-emerald-500/50 rounded-lg text-theme-primary transition-all hover:shadow-lg hover:shadow-emerald-500/10"
                                        title={t('admin.plugins.titleConfigure')}
                                    >
                                        <Settings size={12} />
                                    </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </Section>

            {/* Plugin Config Modal */}
            {configModalOpen && selectedPluginId && (
                <PluginConfigModal
                    isOpen={configModalOpen}
                    onClose={handleConfigClose}
                    pluginId={selectedPluginId}
                />
            )}

            {/* Freebox Login Modal */}
            {freeboxLoginModalOpen && (
                <LoginModal
                    isOpen={freeboxLoginModalOpen}
                    onClose={() => setFreeboxLoginModalOpen(false)}
                />
            )}

            {/* Network Scan Config Modal */}
            {networkScanConfigModalOpen && (
                <NetworkScanConfigModal
                    isOpen={networkScanConfigModalOpen}
                    onClose={() => setNetworkScanConfigModalOpen(false)}
                />
            )}
        </>
    );
};

