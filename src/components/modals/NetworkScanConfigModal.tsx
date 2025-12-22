/**
 * Network Scan Configuration Modal
 * 
 * Modal for configuring automatic network scan and refresh settings
 */

import React, { useState, useEffect } from 'react';
import { X, Settings, Play, RefreshCw, Save, Clock, CheckCircle, XCircle, Network, HelpCircle } from 'lucide-react';
import { api } from '../../api/client';

interface AutoScanConfig {
    enabled: boolean;
    interval: number;
    scanType: 'full' | 'quick';
}

interface AutoRefreshConfig {
    enabled: boolean;
    interval: number;
}

// New unified configuration structure
interface UnifiedAutoScanConfig {
    enabled: boolean; // Master switch
    fullScan?: {
        enabled: boolean;
        interval: number; // minutes: 15, 30, 60, 120, 360, 720, 1440
        scanType: 'full' | 'quick';
    };
    refresh?: {
        enabled: boolean;
        interval: number; // minutes: 5, 10, 15, 30, 60
    };
}

interface DefaultScanConfig {
    defaultRange: string;
    defaultScanType: 'full' | 'quick';
    defaultAutoDetect: boolean;
}

interface NetworkScanConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const NetworkScanConfigModal: React.FC<NetworkScanConfigModalProps> = ({ isOpen, onClose }) => {
    // New unified config
    const [unifiedConfig, setUnifiedConfig] = useState<UnifiedAutoScanConfig>({ 
        enabled: false,
        fullScan: { enabled: false, interval: 1440, scanType: 'full' },
        refresh: { enabled: false, interval: 10 }
    });
    
    // Keep old configs for backward compatibility during transition
    const [autoConfig, setAutoConfig] = useState<AutoScanConfig>({ enabled: false, interval: 30, scanType: 'quick' });
    const [refreshConfig, setRefreshConfig] = useState<AutoRefreshConfig>({ enabled: false, interval: 15 });
    const [defaultConfig, setDefaultConfig] = useState<DefaultScanConfig>({ defaultRange: '192.168.1.0/24', defaultScanType: 'full', defaultAutoDetect: false });
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showHelpModal, setShowHelpModal] = useState(false);
    const [useUnifiedConfig, setUseUnifiedConfig] = useState(true); // Use new unified config by default

    useEffect(() => {
        if (isOpen) {
            fetchConfigs();
        }
    }, [isOpen]);

    const fetchConfigs = async () => {
        setIsLoading(true);
        try {
            // Try to fetch unified config first
            try {
                const unifiedResponse = await api.get<UnifiedAutoScanConfig>('/api/network-scan/unified-config');
                if (unifiedResponse.success && unifiedResponse.result) {
                    setUnifiedConfig(unifiedResponse.result);
                    setUseUnifiedConfig(true);
                }
            } catch {
                // Fallback to old configs if unified doesn't exist
                setUseUnifiedConfig(false);
            }

            // Always fetch old configs for backward compatibility
            const [scanResponse, refreshResponse, defaultResponse] = await Promise.all([
                api.get<AutoScanConfig>('/api/network-scan/config').catch(() => ({ success: false, result: null })),
                api.get<AutoRefreshConfig>('/api/network-scan/refresh-config').catch(() => ({ success: false, result: null })),
                api.get<DefaultScanConfig>('/api/network-scan/default-config')
            ]);

            if (scanResponse.success && scanResponse.result) {
                setAutoConfig(scanResponse.result);
            }
            if (refreshResponse.success && refreshResponse.result) {
                setRefreshConfig(refreshResponse.result);
            }
            if (defaultResponse.success && defaultResponse.result) {
                setDefaultConfig(defaultResponse.result);
            }
        } catch (error) {
            console.error('Failed to fetch configs:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleSaveScanConfig = async () => {
        setIsSaving(true);
        setSaveMessage(null);
        try {
            const response = await api.post<AutoScanConfig>('/api/network-scan/config', autoConfig);
            if (response.success && response.result) {
                setAutoConfig(response.result);
                setSaveMessage({ type: 'success', text: 'Configuration de scan sauvegardée' });
                setTimeout(() => setSaveMessage(null), 3000);
            } else {
                setSaveMessage({ type: 'error', text: response.error?.message || 'Erreur lors de la sauvegarde' });
            }
        } catch (error: any) {
            console.error('Save scan config failed:', error);
            setSaveMessage({ type: 'error', text: 'Erreur lors de la sauvegarde: ' + (error.message || 'Erreur inconnue') });
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveRefreshConfig = async () => {
        setIsSaving(true);
        setSaveMessage(null);
        try {
            const response = await api.post<AutoRefreshConfig>('/api/network-scan/refresh-config', refreshConfig);
            if (response.success && response.result) {
                setRefreshConfig(response.result);
                setSaveMessage({ type: 'success', text: 'Configuration de rafraîchissement sauvegardée' });
                setTimeout(() => setSaveMessage(null), 3000);
            } else {
                setSaveMessage({ type: 'error', text: response.error?.message || 'Erreur lors de la sauvegarde' });
            }
        } catch (error: any) {
            console.error('Save refresh config failed:', error);
            setSaveMessage({ type: 'error', text: 'Erreur lors de la sauvegarde: ' + (error.message || 'Erreur inconnue') });
        } finally {
            setIsSaving(false);
        }
    };

    // New unified save handler
    const handleSaveUnifiedConfig = async () => {
        setIsSaving(true);
        setSaveMessage(null);
        try {
            // Ensure we always send fullScan and refresh objects, even if disabled
            // This ensures the backend receives a complete configuration structure
            // If master switch is disabled, we still send the configs but with enabled: false
            const configToSave: UnifiedAutoScanConfig = {
                enabled: unifiedConfig.enabled,
                fullScan: unifiedConfig.fullScan ? {
                    enabled: unifiedConfig.enabled ? (unifiedConfig.fullScan.enabled || false) : false,
                    interval: unifiedConfig.fullScan.interval || 1440,
                    scanType: unifiedConfig.fullScan.scanType || 'full'
                } : {
                    enabled: false,
                    interval: 1440,
                    scanType: 'full'
                },
                refresh: unifiedConfig.refresh ? {
                    enabled: unifiedConfig.enabled ? (unifiedConfig.refresh.enabled || false) : false,
                    interval: unifiedConfig.refresh.interval || 10
                } : {
                    enabled: false,
                    interval: 10
                }
            };
            
            console.log('Saving unified config:', configToSave);
            const response = await api.post<UnifiedAutoScanConfig>('/api/network-scan/unified-config', configToSave);
            if (response.success && response.result) {
                console.log('Config saved successfully:', response.result);
                setUnifiedConfig(response.result);
                setSaveMessage({ type: 'success', text: 'Configuration sauvegardée avec succès' });
                // Re-fetch configs to ensure we have the latest data
                await fetchConfigs();
                setTimeout(() => {
                    setSaveMessage(null);
                    onClose(); // Auto-close on success
                }, 1500);
            } else {
                console.error('Save failed:', response.error);
                setSaveMessage({ type: 'error', text: response.error?.message || 'Erreur lors de la sauvegarde' });
            }
        } catch (error: any) {
            console.error('Save unified config failed:', error);
            setSaveMessage({ type: 'error', text: 'Erreur lors de la sauvegarde: ' + (error.message || 'Erreur inconnue') });
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveDefaultConfig = async () => {
        setIsSaving(true);
        setSaveMessage(null);
        try {
            const response = await api.post<DefaultScanConfig>('/api/network-scan/default-config', defaultConfig);
            if (response.success && response.result) {
                setDefaultConfig(response.result);
                setSaveMessage({ type: 'success', text: 'Configuration par défaut sauvegardée' });
                setTimeout(() => setSaveMessage(null), 3000);
            } else {
                setSaveMessage({ type: 'error', text: response.error?.message || 'Erreur lors de la sauvegarde' });
            }
        } catch (error: any) {
            console.error('Save default config failed:', error);
            setSaveMessage({ type: 'error', text: 'Erreur lors de la sauvegarde: ' + (error.message || 'Erreur inconnue') });
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#121212] border border-gray-700 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/20 rounded-lg">
                            <Settings size={24} className="text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-white">Configuration Scan Réseau</h2>
                            <p className="text-sm text-gray-400 mt-1">Paramètres des scans automatiques</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {saveMessage && (
                        <div className={`mb-4 px-4 py-3 rounded-lg border-2 flex items-center gap-3 ${
                            saveMessage.type === 'success'
                                ? 'border-green-600 bg-green-900/40 text-green-100'
                                : 'border-red-600 bg-red-900/40 text-red-100'
                        }`}>
                            {saveMessage.type === 'success' ? (
                                <CheckCircle size={18} className="text-green-400 flex-shrink-0" />
                            ) : (
                                <XCircle size={18} className="text-red-400 flex-shrink-0" />
                            )}
                            <div className="flex-1 text-sm">{saveMessage.text}</div>
                        </div>
                    )}
                    {isLoading ? (
                        <div className="flex items-center justify-center py-16">
                            <RefreshCw size={32} className="text-gray-400 animate-spin" />
                        </div>
                    ) : (
                        <>
                        {/* Nouvelle interface unifiée */}
                        <div className="space-y-6">
                            {/* Master switch - Scan automatique */}
                            <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-purple-500/20 rounded-lg">
                                            <Play size={18} className="text-purple-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-semibold text-white">Scan automatique</h3>
                                            <p className="text-xs text-gray-400 mt-1">Activez les scans automatiques du réseau</p>
                                        </div>
                                    </div>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={unifiedConfig.enabled}
                                            onChange={(e) => {
                                                const newEnabled = e.target.checked;
                                                // When disabling master switch, preserve sub-configs but ensure they exist
                                                setUnifiedConfig({ 
                                                    ...unifiedConfig, 
                                                    enabled: newEnabled,
                                                    fullScan: unifiedConfig.fullScan || { enabled: false, interval: 1440, scanType: 'full' },
                                                    refresh: unifiedConfig.refresh || { enabled: false, interval: 10 }
                                                });
                                            }}
                                            className="w-5 h-5 rounded border-gray-600 bg-[#1a1a1a] text-purple-500 focus:ring-purple-500 focus:ring-2"
                                        />
                                        <span className="text-sm font-medium text-gray-300">
                                            {unifiedConfig.enabled ? 'Activé' : 'Désactivé'}
                                        </span>
                                    </label>
                                </div>

                                {unifiedConfig.enabled && (
                                    <div className="space-y-4 pt-4 border-t border-gray-800">
                                        {/* Full Scan Section */}
                                        <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <Play size={14} className="text-green-400" />
                                                    <h4 className="text-sm font-semibold text-gray-300">Full Scan</h4>
                                                </div>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={unifiedConfig.fullScan?.enabled ?? false}
                                                        onChange={(e) => setUnifiedConfig({
                                                            ...unifiedConfig,
                                                            fullScan: {
                                                                ...unifiedConfig.fullScan,
                                                                enabled: e.target.checked,
                                                                interval: unifiedConfig.fullScan?.interval ?? 1440,
                                                                scanType: unifiedConfig.fullScan?.scanType ?? 'full'
                                                            }
                                                        })}
                                                        className="w-4 h-4"
                                                    />
                                                    <span className="text-xs text-gray-400">Activer</span>
                                                </label>
                                            </div>
                                            <p className="text-xs text-gray-500 mb-3">
                                                Découvre de nouvelles IPs sur le réseau (scan complet de la plage choisie)
                                            </p>
                                            
                                            {unifiedConfig.fullScan?.enabled && (
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="block text-xs text-gray-400 mb-1.5">Intervalle</label>
                                                        <select
                                                            value={unifiedConfig.fullScan.interval}
                                                            onChange={(e) => setUnifiedConfig({
                                                                ...unifiedConfig,
                                                                fullScan: {
                                                                    ...unifiedConfig.fullScan!,
                                                                    interval: parseInt(e.target.value)
                                                                }
                                                            })}
                                                            className="w-full px-3 py-2 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-green-500"
                                                        >
                                                            <option value="15">15 minutes</option>
                                                            <option value="30">30 minutes</option>
                                                            <option value="60">1 heure</option>
                                                            <option value="120">2 heures</option>
                                                            <option value="360">6 heures</option>
                                                            <option value="720">12 heures</option>
                                                            <option value="1440">24 heures (1 fois par jour)</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-gray-400 mb-1.5">Type de scan</label>
                                                        <select
                                                            value={unifiedConfig.fullScan.scanType}
                                                            onChange={(e) => setUnifiedConfig({
                                                                ...unifiedConfig,
                                                                fullScan: {
                                                                    ...unifiedConfig.fullScan!,
                                                                    scanType: e.target.value as 'full' | 'quick'
                                                                }
                                                            })}
                                                            className="w-full px-3 py-2 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-green-500"
                                                        >
                                                            <option value="quick">Rapide (ping uniquement)</option>
                                                            <option value="full">Complet (ping + MAC + hostname)</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Refresh Section */}
                                        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <RefreshCw size={14} className="text-blue-400" />
                                                    <h4 className="text-sm font-semibold text-gray-300">Rafraîchissement</h4>
                                                </div>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={unifiedConfig.refresh?.enabled ?? false}
                                                        onChange={(e) => setUnifiedConfig({
                                                            ...unifiedConfig,
                                                            refresh: {
                                                                ...unifiedConfig.refresh,
                                                                enabled: e.target.checked,
                                                                interval: unifiedConfig.refresh?.interval ?? 10
                                                            }
                                                        })}
                                                        className="w-4 h-4"
                                                    />
                                                    <span className="text-xs text-gray-400">Activer</span>
                                                </label>
                                            </div>
                                            <p className="text-xs text-gray-500 mb-3">
                                                Met à jour uniquement les IPs déjà connues (plus rapide, ne découvre pas de nouvelles IPs)
                                            </p>
                                            
                                            {unifiedConfig.refresh?.enabled && (
                                                <div>
                                                    <label className="block text-xs text-gray-400 mb-1.5">Intervalle</label>
                                                    <select
                                                        value={unifiedConfig.refresh.interval}
                                                        onChange={(e) => setUnifiedConfig({
                                                            ...unifiedConfig,
                                                            refresh: {
                                                                ...unifiedConfig.refresh!,
                                                                interval: parseInt(e.target.value)
                                                            }
                                                        })}
                                                        className="w-full px-3 py-2 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500"
                                                    >
                                                        <option value="5">5 minutes</option>
                                                        <option value="10">10 minutes</option>
                                                        <option value="15">15 minutes</option>
                                                        <option value="30">30 minutes</option>
                                                        <option value="60">1 heure</option>
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Save button - Always visible, even when master switch is disabled */}
                                <button
                                    onClick={handleSaveUnifiedConfig}
                                    disabled={isSaving}
                                    className={`w-full px-4 py-3 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-colors ${!unifiedConfig.enabled ? 'mt-4' : ''}`}
                                >
                                    <Save size={18} />
                                    Sauvegarder la configuration
                                </button>
                            </div>
                        </div>

                        {/* Configuration par défaut du scan */}
                        <div className="mt-6 bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-4">
                                <Network size={14} className="text-blue-400" />
                                <span>Configuration par défaut du scan</span>
                            </h3>
                            <p className="text-xs text-gray-500 mb-4">
                                Paramètres par défaut utilisés lors des scans manuels depuis la page de scan
                            </p>
                            
                            <div className="space-y-4">
                                <div className="flex items-center gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={defaultConfig.defaultAutoDetect}
                                            onChange={(e) => setDefaultConfig({ ...defaultConfig, defaultAutoDetect: e.target.checked })}
                                            className="w-4 h-4"
                                        />
                                        <span className="text-sm">Auto-détection </span>
                                    </label>
                                </div>

                                {!defaultConfig.defaultAutoDetect && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <label className="block text-sm text-gray-400">Plage IP par défaut</label>
                                            <button
                                                onClick={() => setShowHelpModal(true)}
                                                className="p-1 hover:bg-blue-500/10 text-blue-400 rounded-lg transition-colors"
                                                title="Aide réseau"
                                            >
                                                <HelpCircle size={14} />
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            value={defaultConfig.defaultRange}
                                            onChange={(e) => setDefaultConfig({ ...defaultConfig, defaultRange: e.target.value })}
                                            placeholder="192.168.1.0/24"
                                            className="w-full px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm text-gray-400 mb-2">Type de scan par défaut</label>
                                    <select
                                        value={defaultConfig.defaultScanType}
                                        onChange={(e) => setDefaultConfig({ ...defaultConfig, defaultScanType: e.target.value as 'full' | 'quick' })}
                                        className="w-full px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500"
                                    >
                                        <option value="quick">Rapide (ping uniquement)</option>
                                        <option value="full">Complet (ping + MAC + hostname)</option>
                                    </select>
                                </div>

                                <button
                                    onClick={handleSaveDefaultConfig}
                                    disabled={isSaving}
                                    className="w-full px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    <Save size={16} />
                                    Sauvegarder
                                </button>
                            </div>
                        </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end p-6 border-t border-gray-800">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-500/10 hover:bg-gray-500/20 text-gray-400 rounded-lg border border-gray-500/30 transition-colors"
                    >
                        Fermer
                    </button>
                </div>
            </div>

            {/* Help Modal for Network Range */}
            {showHelpModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-[#121212] border border-gray-700 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-gray-800">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-purple-500/20 rounded-lg">
                                    <Network size={24} className="text-purple-400" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-semibold text-white">Aide - Format de plage réseau</h2>
                                    <p className="text-sm text-gray-400 mt-1">Comment spécifier une plage d'IPs à scanner</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowHelpModal(false)}
                                className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-lg"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-4">
                            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                                <h3 className="text-lg font-semibold text-purple-400 mb-3">Format de plage réseau</h3>
                                <div className="space-y-3 text-sm text-gray-300">
                                    <div>
                                        <p className="font-semibold text-purple-300 mb-1">Notation CIDR (recommandé) :</p>
                                        <code className="block bg-[#1a1a1a] px-3 py-2 rounded text-emerald-400 font-mono text-xs my-2">
                                            192.168.1.0/24
                                        </code>
                                        <p className="text-gray-400 text-xs">
                                            Scanne les IPs de 192.168.1.1 à 192.168.1.254 (254 IPs)
                                        </p>
                                    </div>
                                    <div>
                                        <p className="font-semibold text-purple-300 mb-1">Notation par plage :</p>
                                        <code className="block bg-[#1a1a1a] px-3 py-2 rounded text-emerald-400 font-mono text-xs my-2">
                                            192.168.1.1-254
                                        </code>
                                        <p className="text-gray-400 text-xs">
                                            Scanne les IPs de 192.168.1.1 à 192.168.1.254
                                        </p>
                                    </div>
                                    <div className="bg-[#1a1a1a] rounded p-3 mt-3">
                                        <p className="font-semibold text-yellow-400 mb-2 text-xs">Masques réseau courants :</p>
                                        <ul className="space-y-1 text-xs text-gray-400">
                                            <li><code className="text-emerald-400">/24</code> = 254 IPs (192.168.1.1-254) - Réseau local standard</li>
                                            <li><code className="text-emerald-400">/25</code> = 126 IPs (192.168.1.1-192.168.1.126)</li>
                                            <li><code className="text-emerald-400">/26</code> = 62 IPs (192.168.1.1-192.168.1.62)</li>
                                            <li><code className="text-red-400">/16</code> = 65534 IPs - Trop large, non supporté</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex justify-end p-6 border-t border-gray-800">
                            <button
                                onClick={() => setShowHelpModal(false)}
                                className="px-4 py-2 bg-gray-500/10 hover:bg-gray-500/20 text-gray-400 rounded-lg border border-gray-500/30 transition-colors"
                            >
                                Fermer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

