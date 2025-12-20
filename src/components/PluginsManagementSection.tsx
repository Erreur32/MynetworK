/**
 * Plugins Management Section
 * 
 * Component for managing plugins within Administration settings
 */

import React, { useEffect, useState } from 'react';
import { Settings, Power, CheckCircle, XCircle, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';
import { usePluginStore, type Plugin } from '../stores/pluginStore';
import { useAuthStore } from '../stores/authStore';
import { Section, SettingRow } from '../pages/SettingsPage';
import { PluginConfigModal } from './modals/PluginConfigModal';
import { LoginModal } from './modals/LoginModal';
import { getFreeboxSettingsUrl, PERMISSION_LABELS } from '../utils/permissions';

export const PluginsManagementSection: React.FC = () => {
    const { plugins, isLoading, fetchPlugins, updatePluginConfig, testPluginConnection } = usePluginStore();
    const { checkAuth: checkFreeboxAuth, isRegistered: isFreeboxRegistered, isLoggedIn: isFreeboxLoggedIn, permissions, freeboxUrl } = useAuthStore();
    const [testingPlugin, setTestingPlugin] = useState<string | null>(null);
    const [configModalOpen, setConfigModalOpen] = useState(false);
    const [selectedPluginId, setSelectedPluginId] = useState<string>('');
    const [freeboxLoginModalOpen, setFreeboxLoginModalOpen] = useState(false);

    useEffect(() => {
        fetchPlugins();
    }, [fetchPlugins]);

    // Check Freebox auth status when Freebox plugin is enabled
    useEffect(() => {
        const freeboxPlugin = plugins.find(p => p.id === 'freebox');
        if (freeboxPlugin?.enabled) {
            checkFreeboxAuth().then(() => {
                const authState = useAuthStore.getState();
                if (!authState.isRegistered && !authState.isRegistering) {
                    setFreeboxLoginModalOpen(true);
                } else if (authState.isRegistered && authState.isLoggedIn) {
                    setFreeboxLoginModalOpen(false);
                }
            });
        } else {
            setFreeboxLoginModalOpen(false);
        }
    }, [plugins, checkFreeboxAuth]);
    
    useEffect(() => {
        if (isFreeboxRegistered && isFreeboxLoggedIn) {
            setFreeboxLoginModalOpen(false);
            // Refresh plugins to update connection status after successful login
            // This ensures the plugin is recognized as connected without requiring a restart
            fetchPlugins();
        }
    }, [isFreeboxRegistered, isFreeboxLoggedIn, fetchPlugins]);

    const handleToggle = async (pluginId: string, enabled: boolean) => {
        await updatePluginConfig(pluginId, { enabled });
        await fetchPlugins();
        
        if (pluginId === 'freebox' && enabled) {
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
        } else {
            setLastTestSuccess(false);
            setLastTestMessage('Test de connexion impossible (voir logs backend)');
        }
        setTimeout(() => setTestingPlugin(null), 2000);
        await fetchPlugins();
    };

    const handleConfigure = (pluginId: string) => {
        setSelectedPluginId(pluginId);
        setConfigModalOpen(true);
    };

    const handleConfigClose = () => {
        setConfigModalOpen(false);
        setSelectedPluginId('');
        fetchPlugins();
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <RefreshCw size={32} className="text-gray-400 animate-spin" />
            </div>
        );
    }

    // Check if Freebox plugin has missing permissions
    const freeboxPlugin = plugins.find(p => p.id === 'freebox');
    const hasSettingsPermission = permissions.settings === true;
    const showFreeboxPermissionWarning = freeboxPlugin?.enabled && !hasSettingsPermission;

    return (
        <>
            <Section title="Gestion des plugins" icon={Settings} iconColor="emerald">
                {/* Freebox Permission Warning */}
                {showFreeboxPermissionWarning && (
                    <div className="mb-4 p-4 bg-orange-500/10 border-2 border-orange-500/30 rounded-lg">
                        <div className="flex items-start gap-3">
                            <AlertCircle size={20} className="text-orange-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-orange-400 mb-1.5">
                                    Permission manquante pour le plugin Freebox
                                </div>
                                <div className="text-xs text-orange-300/90 mb-3">
                                    La permission <span className="font-medium text-orange-200">"{PERMISSION_LABELS.settings || 'settings'}"</span> est requise pour accéder à certaines fonctionnalités de la Freebox (historique RRD, statistiques étendues, etc.).
                                </div>
                                <div className="text-xs text-orange-300/80 mb-2">
                                    <strong>Pour activer cette permission :</strong>
                                </div>
                                <ol className="text-xs text-orange-300/80 list-decimal list-inside space-y-1 mb-3">
                                    <li>Ouvrez l'interface Freebox OS</li>
                                    <li>Allez dans <span className="font-medium">Paramètres → Gestion des accès → Applications</span></li>
                                    <li>Sélectionnez <span className="font-medium">"MynetworK Dashboard"</span></li>
                                    <li>Activez la permission <span className="font-medium">"{PERMISSION_LABELS.settings || 'settings'}"</span></li>
                                </ol>
                                <a
                                    href={getFreeboxSettingsUrl(freeboxUrl)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/50 rounded-lg text-xs text-orange-300 hover:text-orange-200 transition-colors"
                                >
                                    Ouvrir les paramètres Freebox OS
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
                                {lastTestSuccess ? 'Test de connexion réussi' : 'Test de connexion échoué'}
                            </div>
                            <div className="text-xs opacity-90">{lastTestMessage}</div>
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {plugins.map((plugin) => (
                        <div
                            key={plugin.id}
                            className={`rounded-lg p-3 border transition-all hover:shadow-lg ${
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
                                            <span>Connecté</span>
                                        </div>
                                    ) : plugin.enabled ? (
                                        <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded text-yellow-400 text-[10px] font-medium">
                                            <AlertCircle size={11} />
                                            <span>Non connecté</span>
                                        </div>
                                    ) : (
                                        <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-500/20 border border-gray-500/30 rounded text-gray-400 text-[10px] font-medium">
                                            <XCircle size={11} />
                                            <span>Désactivé</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Plugin-specific info */}
                            {plugin.connectionStatus && (
                                <div className="mb-2.5 space-y-1.5 p-2 bg-theme-primary/50 rounded border border-theme">
                                    {plugin.id === 'freebox' && (
                                        <>
                                            {plugin.firmware && (
                                                <div className="text-[10px] text-theme-secondary">
                                                    <span className="text-theme-tertiary">Box:</span> <span className="text-theme-primary font-mono font-medium">{plugin.firmware}</span>
                                                </div>
                                            )}
                                            {plugin.playerFirmware && (
                                                <div className="text-[10px] text-theme-secondary">
                                                    <span className="text-theme-tertiary">Player:</span> <span className="text-theme-primary font-mono font-medium">{plugin.playerFirmware}</span>
                                                </div>
                                            )}
                                            {plugin.apiVersion && (
                                                <div className="text-[10px] text-theme-secondary">
                                                    <span className="text-theme-tertiary">API:</span> <span className="text-cyan-400 font-mono font-medium">{plugin.apiVersion}</span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                    {plugin.id === 'unifi' && (
                                        <>
                                            {plugin.controllerFirmware && (
                                                <div className="text-[10px] text-theme-secondary">
                                                    <span className="text-theme-tertiary">Firmware:</span> <span className="text-theme-primary font-mono font-medium">{plugin.controllerFirmware}</span>
                                                </div>
                                            )}
                                            {plugin.apiMode && (
                                                <div className="text-[10px] text-theme-secondary">
                                                    <span className="text-theme-tertiary">Mode:</span> <span className="text-purple-400 font-mono font-medium">{plugin.apiMode}</span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center justify-between pt-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-theme-tertiary font-medium">Actif</span>
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
                                    {plugin.enabled && (
                                        <button
                                            onClick={() => handleTest(plugin.id)}
                                            disabled={testingPlugin === plugin.id}
                                            className="p-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-blue-500/30"
                                            title="Tester la connexion"
                                        >
                                            {testingPlugin === plugin.id ? (
                                                <RefreshCw size={12} className="animate-spin" />
                                            ) : (
                                                <RefreshCw size={12} />
                                            )}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleConfigure(plugin.id)}
                                        className="p-1.5 bg-theme-secondary border border-theme hover:bg-theme-primary hover:border-emerald-500/50 rounded-lg text-theme-primary transition-all hover:shadow-lg hover:shadow-emerald-500/10"
                                        title="Configurer"
                                    >
                                        <Settings size={12} />
                                    </button>
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
        </>
    );
};

