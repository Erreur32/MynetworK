/**
 * Plugin Configuration Modal
 * 
 * Modal for configuring plugins (UniFi, etc.)
 * Reusable for any plugin that needs configuration
 */

import React, { useState, useEffect } from 'react';
import { X, Settings, CheckCircle, XCircle, RefreshCw, AlertCircle, Save, Eye, EyeOff } from 'lucide-react';
import { usePluginStore, type Plugin } from '../../stores/pluginStore';
import { Button } from '../ui/Button';

interface PluginConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    pluginId: string;
}

export const PluginConfigModal: React.FC<PluginConfigModalProps> = ({ isOpen, onClose, pluginId }) => {
    const { plugins, updatePluginConfig, testPluginConnection, fetchPlugins } = usePluginStore();
    const [isSaving, setIsSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    const plugin = plugins.find(p => p.id === pluginId);

    // Form state based on plugin type
    const [formData, setFormData] = useState<Record<string, string>>({
        apiMode: 'controller',
        url: '',
        username: '',
        password: '',
        site: 'default',
        apiKey: ''
    });

    // Initialize form with plugin settings
    useEffect(() => {
        if (plugin && plugin.settings) {
            setFormData({
                apiMode: (plugin.settings.apiMode as string) || 'controller',
                url: (plugin.settings.url as string) || '',
                username: (plugin.settings.username as string) || '',
                password: (plugin.settings.password as string) || '',
                site: (plugin.settings.site as string) || 'default',
                apiKey: (plugin.settings.apiKey as string) || ''
            });
        }
    }, [plugin]);

    if (!isOpen || !plugin) return null;

    const handleInputChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setTestResult(null);
    };

    // Validate form data
    const validateForm = (): { valid: boolean; error?: string } => {
        if (pluginId === 'unifi') {
            const apiMode = formData.apiMode || 'controller';
            
            if (apiMode === 'site-manager') {
                // Site Manager API requires apiKey
                if (!formData.apiKey || !formData.apiKey.trim()) {
                    return { valid: false, error: 'La clé API (apiKey) est requise pour le mode Site Manager' };
                }
            } else {
                // Controller API requires url, username, password, site
                if (!formData.url || !formData.url.trim()) {
                    return { valid: false, error: 'L\'URL est requise' };
                }
                
                // Validate URL format
                try {
                    const url = new URL(formData.url);
                    if (!['http:', 'https:'].includes(url.protocol)) {
                        return { valid: false, error: 'L\'URL doit commencer par http:// ou https://' };
                    }
                } catch {
                    return { valid: false, error: 'Format d\'URL invalide' };
                }

                if (!formData.username || !formData.username.trim()) {
                    return { valid: false, error: 'Le nom d\'utilisateur est requis' };
                }

                if (!formData.password || !formData.password.trim()) {
                    return { valid: false, error: 'Le mot de passe est requis' };
                }
                
                if (!formData.site || !formData.site.trim()) {
                    return { valid: false, error: 'Le nom du site est requis' };
                }
            }
        }

        return { valid: true };
    };

    const handleTest = async () => {
        setIsTesting(true);
        setTestResult(null);

        // Validate form first
        const validation = validateForm();
        if (!validation.valid) {
            setTestResult({
                success: false,
                message: validation.error || 'Veuillez remplir tous les champs requis'
            });
            setIsTesting(false);
            return;
        }

        try {
            // Prepare config based on API mode
            const apiMode = formData.apiMode || 'controller';
            const configToTest: Record<string, any> = {
                apiMode
            };

            if (apiMode === 'site-manager') {
                configToTest.apiKey = formData.apiKey;
            } else {
                configToTest.url = formData.url;
                configToTest.username = formData.username;
                configToTest.password = formData.password;
                configToTest.site = formData.site;
            }

            // First save the config temporarily
            await updatePluginConfig(pluginId, {
                settings: formData
            });

            // Then test
            const result = await testPluginConnection(pluginId);
            if (result) {
                setTestResult({
                    success: result.connected,
                    message: result.message || (result.connected
                        ? 'Connexion réussie ! Vous pouvez maintenant sauvegarder.'
                        : 'Échec de la connexion. Vérifiez vos identifiants et l\'URL.')
                });
            } else {
                setTestResult({
                    success: false,
                    message: 'Test de connexion impossible (voir logs backend)'
                });
            }

            // Refresh plugins to update connection status
            await fetchPlugins();
        } catch (error) {
            setTestResult({
                success: false,
                message: error instanceof Error ? error.message : 'Erreur lors du test de connexion'
            });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        setTestResult(null);

        // Validate form first
        const validation = validateForm();
        if (!validation.valid) {
            setTestResult({
                success: false,
                message: validation.error || 'Veuillez remplir tous les champs requis'
            });
            setIsSaving(false);
            return;
        }

        try {
            const success = await updatePluginConfig(pluginId, {
                settings: formData
            });

            if (success) {
                await fetchPlugins();
                // Test connection after save
                await testPluginConnection(pluginId);
                await fetchPlugins();
                onClose();
            } else {
                setTestResult({
                    success: false,
                    message: 'Erreur lors de la sauvegarde de la configuration'
                });
            }
        } catch (error) {
            setTestResult({
                success: false,
                message: error instanceof Error ? error.message : 'Erreur lors de la sauvegarde'
            });
        } finally {
            setIsSaving(false);
        }
    };

    const getPluginIcon = () => {
        switch (pluginId) {
            case 'unifi':
                return '📡';
            case 'freebox':
                return '📦';
            default:
                return '🔌';
        }
    };

    const getPluginColor = () => {
        switch (pluginId) {
            case 'unifi':
                return 'purple';
            case 'freebox':
                return 'blue';
            default:
                return 'gray';
        }
    };

    const colorClass = getPluginColor();
    const colorBg = colorClass === 'purple' ? 'bg-purple-500/20' : colorClass === 'blue' ? 'bg-blue-500/20' : 'bg-gray-500/20';
    const colorText = colorClass === 'purple' ? 'text-purple-400' : colorClass === 'blue' ? 'text-blue-400' : 'text-gray-400';
    const colorBorder = colorClass === 'purple' ? 'border-purple-700' : colorClass === 'blue' ? 'border-blue-700' : 'border-gray-700';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className={`bg-[#151515] w-full max-w-md rounded-2xl border border-gray-800 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto`}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-[#1a1a1a]">
                    <div className="flex items-center gap-2">
                        <div className={`p-1.5 ${colorBg} rounded-lg`}>
                            <Settings size={20} className={colorText} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Configuration {plugin.name}</h2>
                            <p className="text-xs text-gray-500">Paramètres de connexion</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="p-4 space-y-4">
                    {/* API Mode Selection (UniFi only) */}
                    {pluginId === 'unifi' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Mode de connexion
                            </label>
                            <select
                                value={formData.apiMode || 'controller'}
                                onChange={(e) => handleInputChange('apiMode', e.target.value)}
                                className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            >
                                <option value="controller">Controller Local (URL/User/Pass)</option>
                                <option value="site-manager">Site Manager API (Clé API)</option>
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                {formData.apiMode === 'site-manager' 
                                    ? 'Utilise l\'API cloud UniFi Site Manager (unifi.ui.com)'
                                    : 'Utilise l\'API locale du Controller UniFi'}
                            </p>
                        </div>
                    )}

                    {/* Site Manager API Key */}
                    {pluginId === 'unifi' && formData.apiMode === 'site-manager' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Clé API Site Manager <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={formData.apiKey || ''}
                                    onChange={(e) => handleInputChange('apiKey', e.target.value)}
                                    placeholder="Votre clé API UniFi Site Manager"
                                    className={`w-full px-3 py-2 bg-[#1a1a1a] border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 pr-10 ${
                                        !formData.apiKey || !formData.apiKey.trim() 
                                            ? 'border-red-600 focus:ring-red-500' 
                                            : 'border-gray-700'
                                    }`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            {(!formData.apiKey || !formData.apiKey.trim()) && (
                                <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                                    <div className="flex items-center gap-2 text-red-400 text-xs">
                                        <AlertCircle size={14} />
                                        <span>⚠️ La clé API est requise pour le mode Site Manager</span>
                                    </div>
                                </div>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                                Obtenez votre clé API sur{' '}
                                <a 
                                    href="https://unifi.ui.com/api" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-purple-400 hover:underline"
                                >
                                    unifi.ui.com/api
                                </a>
                                {' '}(Documentation:{' '}
                                <a 
                                    href="https://developer.ui.com/site-manager-api/gettingstarted/" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-purple-400 hover:underline"
                                >
                                    Site Manager API
                                </a>
                                )
                            </p>
                        </div>
                    )}

                    {/* Controller API Fields */}
                    {pluginId === 'unifi' && formData.apiMode === 'controller' && (
                        <>
                            {/* URL */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    URL du Contrôleur UniFi <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="url"
                                    value={formData.url}
                                    onChange={(e) => handleInputChange('url', e.target.value)}
                                    placeholder="https://unifi.example.com:8443"
                                    className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                                    required
                                    pattern="https?://.+"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Inclure le port (généralement 8443).{' '}
                                    <span className="text-yellow-400">⚠️ Utilisez un compte administrateur LOCAL (pas un compte cloud) pour éviter les problèmes de 2FA.</span>
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                    Documentation:{' '}
                                    <a 
                                        href="https://help.ui.com/hc/en-us/articles/30076656117655-Getting-Started-with-the-Official-UniFi-API" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:underline"
                                    >
                                        UniFi Controller API
                                    </a>
                                </p>
                            </div>

                            {/* Username */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Nom d'utilisateur <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => handleInputChange('username', e.target.value)}
                                    placeholder="admin"
                                    className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                                    required
                                />
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Mot de passe <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={formData.password}
                                        onChange={(e) => handleInputChange('password', e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full px-3 py-2 pr-10 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white transition-colors"
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            {/* Site */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Site UniFi
                                </label>
                                <input
                                    type="text"
                                    value={formData.site}
                                    onChange={(e) => handleInputChange('site', e.target.value)}
                                    placeholder="default"
                                    className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Nom du site UniFi (généralement "default")
                                </p>
                            </div>
                        </>
                    )}

                    {/* Freebox info */}
                    {pluginId === 'freebox' && (
                        <div className="p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
                            <div className="flex items-start gap-2">
                                <AlertCircle size={20} className="text-blue-400 mt-0.5" />
                                <div className="text-sm text-gray-300">
                                    <p className="font-medium mb-1">Configuration Freebox</p>
                                    <p className="text-gray-400">
                                        Le plugin Freebox utilise l'authentification Freebox existante.
                                        Configurez la connexion via l'onglet "Paramètres" ou utilisez l'API Freebox directement.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Test Result */}
                    {testResult && (
                        <div className={`p-3 rounded-lg border ${
                            testResult.success
                                ? 'bg-green-900/20 border-green-700'
                                : 'bg-red-900/20 border-red-700'
                        }`}>
                            <div className="flex items-center gap-2">
                                {testResult.success ? (
                                    <CheckCircle size={16} className="text-green-400" />
                                ) : (
                                    <XCircle size={16} className="text-red-400" />
                                )}
                                <span className={`text-sm ${
                                    testResult.success ? 'text-green-400' : 'text-red-400'
                                }`}>
                                    {testResult.message}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Connection Status */}
                    {plugin.connectionStatus && (
                        <div className="p-3 bg-green-900/20 border border-green-700 rounded-lg">
                            <div className="flex items-center gap-2">
                                <CheckCircle size={16} className="text-green-400" />
                                <span className="text-sm text-green-400">Plugin connecté et opérationnel</span>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-4 border-t border-gray-700">
                        <Button
                            type="button"
                            onClick={handleTest}
                            disabled={isTesting || isSaving}
                            variant="secondary"
                            className="flex-1"
                        >
                            {isTesting ? (
                                <>
                                    <RefreshCw size={16} className="animate-spin" />
                                    Test en cours...
                                </>
                            ) : (
                                <>
                                    <RefreshCw size={16} />
                                    Tester
                                </>
                            )}
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSaving || isTesting}
                            className="flex-1"
                        >
                            {isSaving ? (
                                <>
                                    <RefreshCw size={16} className="animate-spin" />
                                    Sauvegarde...
                                </>
                            ) : (
                                <>
                                    <Save size={16} />
                                    Sauvegarder
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

