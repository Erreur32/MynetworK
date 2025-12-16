/**
 * Plugins Management Section
 * 
 * Component for managing plugins within Administration settings
 */

import React, { useEffect, useState } from 'react';
import { Settings, Power, CheckCircle, XCircle, RefreshCw, AlertCircle } from 'lucide-react';
import { usePluginStore, type Plugin } from '../stores/pluginStore';
import { useAuthStore } from '../stores/authStore';
import { Section, SettingRow } from '../pages/SettingsPage';
import { PluginConfigModal } from './modals/PluginConfigModal';
import { LoginModal } from './modals/LoginModal';

export const PluginsManagementSection: React.FC = () => {
    const { plugins, isLoading, fetchPlugins, updatePluginConfig, testPluginConnection } = usePluginStore();
    const { checkAuth: checkFreeboxAuth, isRegistered: isFreeboxRegistered, isLoggedIn: isFreeboxLoggedIn } = useAuthStore();
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
        }
    }, [isFreeboxRegistered, isFreeboxLoggedIn]);

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

    return (
        <>
            <Section title="Gestion des plugins" icon={Settings}>
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
                <div className="space-y-4">
                    {plugins.map((plugin) => (
                        <div
                            key={plugin.id}
                            className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                        <Settings size={20} className="text-blue-400" />
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-white">{plugin.name}</h4>
                                        <p className="text-xs text-gray-400">Version {plugin.version}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {plugin.connectionStatus ? (
                                        <div className="flex items-center gap-1 text-green-400 text-xs">
                                            <CheckCircle size={14} />
                                            <span>Connecté</span>
                                        </div>
                                    ) : plugin.enabled ? (
                                        <div className="flex items-center gap-1 text-yellow-400 text-xs">
                                            <AlertCircle size={14} />
                                            <span>Non connecté</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1 text-gray-500 text-xs">
                                            <XCircle size={14} />
                                            <span>Désactivé</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-400">Activer</span>
                                    <button
                                        onClick={() => handleToggle(plugin.id, !plugin.enabled)}
                                        className={`relative w-11 h-6 rounded-full transition-colors ${
                                            plugin.enabled ? 'bg-emerald-500' : 'bg-gray-600'
                                        }`}
                                    >
                                        <span
                                            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                                                plugin.enabled ? 'translate-x-5' : 'translate-x-0'
                                            }`}
                                        />
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    {plugin.enabled && (
                                        <button
                                            onClick={() => handleTest(plugin.id)}
                                            disabled={testingPlugin === plugin.id}
                                            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors disabled:opacity-50 flex items-center gap-1"
                                        >
                                            {testingPlugin === plugin.id ? (
                                                <RefreshCw size={12} className="animate-spin" />
                                            ) : (
                                                <RefreshCw size={12} />
                                            )}
                                            Tester
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleConfigure(plugin.id)}
                                        className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors flex items-center gap-1"
                                    >
                                        <Settings size={12} />
                                        Configurer
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

