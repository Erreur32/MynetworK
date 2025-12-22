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
    const [autoConfig, setAutoConfig] = useState<AutoScanConfig>({ enabled: false, interval: 30, scanType: 'quick' });
    const [refreshConfig, setRefreshConfig] = useState<AutoRefreshConfig>({ enabled: false, interval: 15 });
    const [defaultConfig, setDefaultConfig] = useState<DefaultScanConfig>({ defaultRange: '192.168.1.0/24', defaultScanType: 'full', defaultAutoDetect: false });
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showHelpModal, setShowHelpModal] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchConfigs();
        }
    }, [isOpen]);

    const fetchConfigs = async () => {
        setIsLoading(true);
        try {
            const [scanResponse, refreshResponse, defaultResponse] = await Promise.all([
                api.get<AutoScanConfig>('/api/network-scan/config'),
                api.get<AutoRefreshConfig>('/api/network-scan/refresh-config'),
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Scan automatique */}
                            <div className="space-y-4 bg-green-500/5 border border-green-500/20 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                    <Play size={14} className="text-green-400" />
                                    Scan automatique
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Découvre de nouvelles IPs sur le réseau (scan complet de la plage choisie)
                                </p>
                                <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={autoConfig.enabled}
                                            onChange={(e) => setAutoConfig({ ...autoConfig, enabled: e.target.checked })}
                                            className="w-4 h-4"
                                        />
                                        <span className="text-sm">Activer</span>
                                    </label>
                                </div>

                                {autoConfig.enabled && (
                                    <>
                                        <div>
                                            <label className="block text-sm text-gray-400 mb-2">Intervalle</label>
                                            <select
                                                value={autoConfig.interval}
                                                onChange={(e) => setAutoConfig({ ...autoConfig, interval: parseInt(e.target.value) })}
                                                className="w-full px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-green-500"
                                            >
                                                <option value="15">15 minutes</option>
                                                <option value="30">30 minutes</option>
                                                <option value="60">1 heure</option>
                                                <option value="120">2 heures</option>
                                                <option value="360">6 heures</option>
                                                <option value="720">12 heures</option>
                                                <option value="1440">24 heures</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm text-gray-400 mb-2">Type de scan</label>
                                            <select
                                                value={autoConfig.scanType}
                                                onChange={(e) => setAutoConfig({ ...autoConfig, scanType: e.target.value as 'full' | 'quick' })}
                                                className="w-full px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-green-500"
                                            >
                                                <option value="quick">Rapide (ping uniquement)</option>
                                                <option value="full">Complet (ping + MAC + hostname)</option>
                                            </select>
                                        </div>

                                        <button
                                            onClick={handleSaveScanConfig}
                                            disabled={isSaving}
                                            className="w-full px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg border border-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            <Save size={16} />
                                            Sauvegarder
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Rafraîchissement automatique */}
                            <div className="space-y-4 bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                    <RefreshCw size={14} className="text-blue-400" />
                                    Rafraîchissement automatique
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Met à jour uniquement les IPs déjà connues (plus rapide, ne découvre pas de nouvelles IPs)
                                </p>
                                <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={refreshConfig.enabled}
                                            onChange={(e) => setRefreshConfig({ ...refreshConfig, enabled: e.target.checked })}
                                            className="w-4 h-4"
                                        />
                                        <span className="text-sm">Activer</span>
                                    </label>
                                </div>

                                {refreshConfig.enabled && (
                                    <>
                                        <div>
                                            <label className="block text-sm text-gray-400 mb-2">Intervalle</label>
                                            <select
                                                value={refreshConfig.interval}
                                                onChange={(e) => setRefreshConfig({ ...refreshConfig, interval: parseInt(e.target.value) })}
                                                className="w-full px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500"
                                            >
                                                <option value="5">5 minutes</option>
                                                <option value="10">10 minutes</option>
                                                <option value="15">15 minutes</option>
                                                <option value="30">30 minutes</option>
                                                <option value="60">1 heure</option>
                                            </select>
                                        </div>

                                        <div className="text-xs text-gray-500 bg-[#1a1a1a] rounded p-2">
                                            ⚡ Rafraîchit uniquement les IPs déjà découvertes (ne découvre pas de nouvelles IPs)
                                        </div>

                                        <button
                                            onClick={handleSaveRefreshConfig}
                                            disabled={isSaving}
                                            className="w-full px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            <Save size={16} />
                                            Sauvegarder
                                        </button>
                                    </>
                                )}
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
                                        <span className="text-sm">Auto-détection par défaut</span>
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

