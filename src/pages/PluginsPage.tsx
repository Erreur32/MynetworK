/**
 * Plugins Management Page
 * 
 * Page for managing plugins: view, configure, enable/disable
 */

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Settings, Power, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { usePluginStore, type Plugin } from '../stores/pluginStore';
import { useAuthStore } from '../stores/authStore';
import { useCapabilitiesStore } from '../stores/capabilitiesStore';
import { Card } from '../components/widgets/Card';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Toggle';
import { PluginConfigModal } from '../components/modals/PluginConfigModal';
import { LoginModal } from '../components/modals/LoginModal';

interface PluginsPageProps {
    onBack: () => void;
}

export const PluginsPage: React.FC<PluginsPageProps> = ({ onBack }) => {
    const { plugins, isLoading, fetchPlugins, updatePluginConfig, testPluginConnection } = usePluginStore();
    const { checkAuth: checkFreeboxAuth, isRegistered: isFreeboxRegistered, isLoggedIn: isFreeboxLoggedIn } = useAuthStore();
    const { capabilities, fetchCapabilities } = useCapabilitiesStore();
    const [testingPlugin, setTestingPlugin] = useState<string | null>(null);
    const [configModalOpen, setConfigModalOpen] = useState(false);
    const [selectedPluginId, setSelectedPluginId] = useState<string>('');
    const [freeboxLoginModalOpen, setFreeboxLoginModalOpen] = useState(false);

    useEffect(() => {
        fetchPlugins();
    }, [fetchPlugins]);

    // Check if we need to open a plugin config modal from dashboard click
    useEffect(() => {
        const pluginIdToOpen = sessionStorage.getItem('openPluginConfig');
        if (pluginIdToOpen) {
            sessionStorage.removeItem('openPluginConfig');
            // Wait for plugins to load before opening modal
            if (plugins.length > 0) {
                const plugin = plugins.find(p => p.id === pluginIdToOpen);
                if (plugin) {
                    if (plugin.id === 'freebox') {
                        // For Freebox, open login modal if not registered/logged in
                        checkFreeboxAuth().then(() => {
                            const authState = useAuthStore.getState();
                            if (!authState.isRegistered || !authState.isLoggedIn) {
                                setFreeboxLoginModalOpen(true);
                            }
                        });
                    } else {
                        // For other plugins, open config modal
                        setSelectedPluginId(pluginIdToOpen);
                        setConfigModalOpen(true);
                    }
                }
            }
        }
    }, [plugins, checkFreeboxAuth]);

    // Fetch Freebox capabilities when Freebox plugin is enabled and connected
    useEffect(() => {
        const freeboxPlugin = plugins.find(p => p.id === 'freebox');
        if (freeboxPlugin?.enabled && freeboxPlugin?.connectionStatus && isFreeboxLoggedIn) {
            fetchCapabilities();
        }
    }, [plugins, isFreeboxLoggedIn, fetchCapabilities]);

    // Check Freebox auth status when Freebox plugin is enabled
    useEffect(() => {
        const freeboxPlugin = plugins.find(p => p.id === 'freebox');
        if (freeboxPlugin?.enabled) {
            checkFreeboxAuth().then(() => {
                // If plugin is enabled but not registered, open login modal
                const authState = useAuthStore.getState();
                if (!authState.isRegistered && !authState.isRegistering) {
                    setFreeboxLoginModalOpen(true);
                } else if (authState.isRegistered && authState.isLoggedIn) {
                    // Close modal if successfully registered and logged in
                    setFreeboxLoginModalOpen(false);
                }
            });
        } else {
            // Close modal if plugin is disabled
            setFreeboxLoginModalOpen(false);
        }
    }, [plugins, checkFreeboxAuth]);
    
    // Monitor Freebox registration status to close modal when registration succeeds
    useEffect(() => {
        if (isFreeboxRegistered && isFreeboxLoggedIn) {
            setFreeboxLoginModalOpen(false);
        }
    }, [isFreeboxRegistered, isFreeboxLoggedIn]);

    const handleToggle = async (pluginId: string, enabled: boolean) => {
        await updatePluginConfig(pluginId, { enabled });
        await fetchPlugins(); // Refresh plugins to get updated state
        
        // If Freebox plugin is being enabled, check auth status and open modal if needed
        if (pluginId === 'freebox' && enabled) {
            await checkFreeboxAuth();
            const authState = useAuthStore.getState();
            if (!authState.isRegistered) {
                setFreeboxLoginModalOpen(true);
            }
        } else if (pluginId === 'freebox' && !enabled) {
            // Close modal if plugin is disabled
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
        await fetchPlugins(); // Refresh to update connection status
    };

    return (
        <div className="min-h-screen bg-[#050505] text-gray-300">
            <div className="max-w-7xl mx-auto p-6">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-[#1a1a1a] rounded transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-2xl font-semibold">Gestion des Plugins</h1>
                    <button
                        onClick={() => fetchPlugins()}
                        className="ml-auto p-2 hover:bg-[#1a1a1a] rounded transition-colors"
                        title="Actualiser"
                    >
                        <RefreshCw size={20} />
                    </button>
                </div>

                {/* Plugins List */}
                {isLoading ? (
                    <div className="text-center py-12 text-gray-500">Chargement...</div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                        {lastTestMessage && (
                            <div
                                className={`md:col-span-2 mb-4 px-4 py-3 rounded-lg border-2 flex items-center gap-3 ${
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
                        {plugins.map((plugin) => (
                            <Card key={plugin.id} title={plugin.name}>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-gray-400">Version {plugin.version}</p>
                                            <div className="flex items-center gap-2 mt-2">
                                                {plugin.connectionStatus ? (
                                                    <span className="flex items-center gap-1 text-xs text-green-400">
                                                        <CheckCircle size={12} />
                                                        Connecté
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-xs text-gray-500">
                                                        <XCircle size={12} />
                                                        Non connecté
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleTest(plugin.id)}
                                                disabled={testingPlugin === plugin.id}
                                                className="p-2 hover:bg-[#1a1a1a] rounded transition-colors disabled:opacity-50"
                                                title="Tester la connexion"
                                            >
                                                <RefreshCw 
                                                    size={16} 
                                                    className={testingPlugin === plugin.id ? 'animate-spin' : ''}
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                                        <span className="text-sm text-gray-400">Activer</span>
                                        <Toggle
                                            checked={plugin.enabled}
                                            onChange={(checked) => handleToggle(plugin.id, checked)}
                                        />
                                    </div>

                                    {/* Configure Button */}
                                    {plugin.id !== 'freebox' && (
                                        <button
                                            onClick={() => {
                                                setSelectedPluginId(plugin.id);
                                                setConfigModalOpen(true);
                                            }}
                                            className="w-full mt-3 px-3 py-2 bg-[#1a1a1a] hover:bg-[#252525] border border-gray-700 rounded-lg text-sm text-gray-300 hover:text-white transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Settings size={14} />
                                            Configurer
                                        </button>
                                    )}

                                    {plugin.id === 'freebox' && (
                                        <div className="pt-2 border-t border-gray-700 space-y-2">
                                            {plugin.enabled && plugin.connectionStatus && isFreeboxLoggedIn ? (
                                                <>
                                                    <div className="flex items-center gap-2 text-xs">
                                                        <CheckCircle size={12} className="text-green-400" />
                                                        <span className="text-green-400">Connecté</span>
                                                    </div>
                                                    {(() => {
                                                        const capabilities = useCapabilitiesStore.getState().capabilities;
                                                        const modelName = capabilities?.modelName || 'Freebox';
                                                        const apiVersion = capabilities ? 'API v8+' : 'API v6/v7';
                                                        return (
                                                            <>
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-gray-500">Modèle:</span>
                                                                    <span className="text-gray-300">{modelName}</span>
                                                                </div>
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-gray-500">API:</span>
                                                                    <span className="text-gray-300">{apiVersion}</span>
                                                                </div>
                                                            </>
                                                        );
                                                    })()}
                                                </>
                                            ) : (
                                                <div className="text-xs text-gray-500">
                                                    Le plugin Freebox nécessite une configuration via l'API Freebox.
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {plugin.id === 'unifi' && !plugin.enabled && (
                                        <div className="text-xs text-gray-500 pt-2 border-t border-gray-700">
                                            Configurez l'URL, le nom d'utilisateur et le mot de passe pour activer ce plugin.
                                        </div>
                                    )}
                                </div>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Plugin Config Modal */}
                <PluginConfigModal
                    isOpen={configModalOpen}
                    onClose={() => {
                        setConfigModalOpen(false);
                        setSelectedPluginId('');
                        fetchPlugins(); // Refresh after config
                    }}
                    pluginId={selectedPluginId}
                />

                {/* Freebox Login Modal - Opens automatically when Freebox plugin is enabled but not registered */}
                <LoginModal isOpen={freeboxLoginModalOpen} />
            </div>
        </div>
    );
};

