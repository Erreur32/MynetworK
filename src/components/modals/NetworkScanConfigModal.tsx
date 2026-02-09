/**
 * Network Scan Configuration Modal
 * 
 * Modal for configuring automatic network scan and refresh settings
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Settings, Play, RefreshCw, Save, Clock, CheckCircle, XCircle, Network, HelpCircle, Plug, ArrowUp, ArrowDown, HardDrive, ExternalLink, Download } from 'lucide-react';
import { api } from '../../api/client';
import { usePluginStore } from '../../stores/pluginStore';

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
        portScanEnabled?: boolean; // run nmap on online hosts after full scan (background)
    };
    refresh?: {
        enabled: boolean;
        interval: number; // minutes: 5, 10, 15, 30, 60
        scanType: 'full' | 'quick'; // Choix entre quick et full pour refresh
    };
}

interface DefaultScanConfig {
    defaultRange: string;
    // defaultScanType retiré - scan complet toujours en mode 'full'
    defaultAutoDetect: boolean;
}

interface NetworkScanConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDataChanged?: () => void; // Callback when data is changed (e.g., scans cleared)
    onVendorUpdate?: () => void; // Callback when vendor database is updated
}

interface DatabaseConfig {
    wiresharkAutoUpdate?: boolean;
}

interface VendorUpdateResponse {
    updateSource?: 'downloaded' | 'local' | 'plugins';
    vendorCount?: number;
    stats?: {
        totalVendors: number;
    };
}

interface ClearScansResponse {
    deletedScans?: number;
    deletedHistory?: number;
}

export const NetworkScanConfigModal: React.FC<NetworkScanConfigModalProps> = ({ isOpen, onClose, onDataChanged, onVendorUpdate }) => {
    const { t, i18n } = useTranslation();
    const { plugins } = usePluginStore();
    const dateLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';
    // New unified config
    const [unifiedConfig, setUnifiedConfig] = useState<UnifiedAutoScanConfig>({ 
        enabled: false,
        fullScan: { enabled: false, interval: 1440, portScanEnabled: false },
        refresh: { enabled: false, interval: 10, scanType: 'quick' }
    });
    
    // Plugin priority config
    const [pluginPriorityConfig, setPluginPriorityConfig] = useState({
        hostnamePriority: ['freebox', 'unifi', 'scanner'] as ('freebox' | 'unifi' | 'scanner')[],
        vendorPriority: ['freebox', 'unifi', 'scanner'] as ('freebox' | 'unifi' | 'scanner')[],
        overwriteExisting: {
            hostname: true,
            vendor: true
        }
    });
    const [isLoadingPriority, setIsLoadingPriority] = useState(false);
    
    // Keep old configs for backward compatibility during transition
    const [autoConfig, setAutoConfig] = useState<AutoScanConfig>({ enabled: false, interval: 30, scanType: 'quick' });
    const [refreshConfig, setRefreshConfig] = useState<AutoRefreshConfig>({ enabled: false, interval: 15 });
    const [defaultConfig, setDefaultConfig] = useState<DefaultScanConfig>({ defaultRange: '192.168.1.0/24', defaultAutoDetect: false });
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showHelpModal, setShowHelpModal] = useState(false);
    const [useUnifiedConfig, setUseUnifiedConfig] = useState(true); // Use new unified config by default
    const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    
    // Wireshark vendor database stats
    const [wiresharkVendorStats, setWiresharkVendorStats] = useState<{ totalVendors: number; lastUpdate: string | null } | null>(null);
    const [isUpdatingVendors, setIsUpdatingVendors] = useState(false);
    const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);

    // Initial states for change detection
    const [initialUnifiedConfig, setInitialUnifiedConfig] = useState<UnifiedAutoScanConfig | null>(null);
    const [initialDefaultConfig, setInitialDefaultConfig] = useState<DefaultScanConfig | null>(null);
    const [initialPluginPriorityConfig, setInitialPluginPriorityConfig] = useState<any>(null);
    const [initialAutoUpdateEnabled, setInitialAutoUpdateEnabled] = useState<boolean | null>(null);

    // Check if there are unsaved changes
    const hasUnsavedChanges = (): boolean => {
        if (!initialUnifiedConfig || !initialDefaultConfig || initialPluginPriorityConfig === null || initialAutoUpdateEnabled === null) {
            return false;
        }
        
        // Check unified config changes
        const unifiedChanged = JSON.stringify(unifiedConfig) !== JSON.stringify(initialUnifiedConfig);
        
        // Check default config changes
        const defaultChanged = JSON.stringify(defaultConfig) !== JSON.stringify(initialDefaultConfig);
        
        // Check plugin priority config changes
        const pluginPriorityChanged = JSON.stringify(pluginPriorityConfig) !== JSON.stringify(initialPluginPriorityConfig);
        
        // Check auto-update enabled changes
        const autoUpdateChanged = autoUpdateEnabled !== initialAutoUpdateEnabled;
        
        return unifiedChanged || defaultChanged || pluginPriorityChanged || autoUpdateChanged;
    };

    useEffect(() => {
        if (isOpen) {
            fetchConfigs();
            fetchPluginPriorityConfig();
            fetchWiresharkVendorStats();
            loadAutoUpdateConfig();
        }
    }, [isOpen]);
    
    const loadAutoUpdateConfig = async () => {
        try {
            const response = await api.get<DatabaseConfig>('/api/database/config');
            if (response.success && response.result?.wiresharkAutoUpdate !== undefined) {
                setAutoUpdateEnabled(response.result.wiresharkAutoUpdate);
                setInitialAutoUpdateEnabled(response.result.wiresharkAutoUpdate);
            }
        } catch (error) {
            console.error('Failed to load auto-update config:', error);
        }
    };
    
    const handleToggleAutoUpdate = () => {
        const newValue = !autoUpdateEnabled;
        setAutoUpdateEnabled(newValue);
        // Don't save automatically, wait for global save
    };
    
    const fetchWiresharkVendorStats = async () => {
        try {
            const response = await api.get<{ totalVendors: number; lastUpdate: string | null }>('/api/network-scan/wireshark-vendor-stats');
            if (response.success && response.result) {
                setWiresharkVendorStats(response.result);
            }
        } catch (error) {
            console.error('Failed to load Wireshark vendor stats:', error);
        }
    };
    
    const handleUpdateWiresharkVendors = async () => {
        setIsUpdatingVendors(true);
        setSaveMessage(null);
        try {
            const response = await api.post<VendorUpdateResponse>('/api/network-scan/update-wireshark-vendors');
            if (response.success && response.result) {
                const source = response.result.updateSource || 'unknown';
                const vendorCount = response.result.vendorCount || response.result.stats?.totalVendors || 0;
                
                let message = '';
                if (source === 'downloaded') {
                    message = `Base téléchargée depuis IEEE OUI : ${vendorCount} vendors chargés`;
                } else if (source === 'local') {
                    message = `Base chargée depuis le fichier local : ${vendorCount} vendors chargés`;
                } else if (source === 'plugins') {
                    message = `Base chargée depuis les plugins : ${vendorCount} vendors chargés`;
                } else {
                    message = `Base mise à jour : ${vendorCount} vendors chargés`;
                }
                
                setSaveMessage({ 
                    type: 'success', 
                    text: message
                });
                await fetchWiresharkVendorStats();
                // Notify parent component to refresh vendor stats
                if (onVendorUpdate) {
                    onVendorUpdate();
                }
                setTimeout(() => setSaveMessage(null), 5000);
            } else {
                setSaveMessage({ 
                    type: 'error', 
                    text: response.error?.message || 'Erreur lors de la mise à jour' 
                });
            }
        } catch (error: any) {
            console.error('Failed to update Wireshark vendors:', error);
            setSaveMessage({ type: 'error', text: 'Erreur lors de la mise à jour' });
        } finally {
            setIsUpdatingVendors(false);
        }
    };
    
    const fetchPluginPriorityConfig = async () => {
        setIsLoadingPriority(true);
        try {
            const response = await api.get<{ hostnamePriority: ('freebox' | 'unifi' | 'scanner')[]; vendorPriority: ('freebox' | 'unifi' | 'scanner')[]; overwriteExisting: { hostname: boolean; vendor: boolean } }>('/api/network-scan/plugin-priority-config');
            if (response.success && response.result) {
                setPluginPriorityConfig(response.result);
                setInitialPluginPriorityConfig(JSON.parse(JSON.stringify(response.result))); // Deep copy
            }
        } catch (error) {
            console.error('Failed to load plugin priority config:', error);
        } finally {
            setIsLoadingPriority(false);
        }
    };
    
    const handleSavePluginPriority = async () => {
        setIsSaving(true);
        try {
            const response = await api.post('/api/network-scan/plugin-priority-config', pluginPriorityConfig);
            if (response.success) {
                setSaveMessage({ type: 'success', text: t('config.prioritySaveSuccess') });
                setTimeout(() => setSaveMessage(null), 3000);
            } else {
                setSaveMessage({ type: 'error', text: response.error?.message || 'Erreur lors de la sauvegarde' });
            }
        } catch (error: any) {
            console.error('Save plugin priority failed:', error);
            setSaveMessage({ type: 'error', text: 'Erreur lors de la sauvegarde' });
        } finally {
            setIsSaving(false);
        }
    };
    
    const movePriority = (type: 'hostname' | 'vendor', index: number, direction: 'up' | 'down') => {
        const priority = [...pluginPriorityConfig[`${type}Priority`]];
        if (direction === 'up' && index > 0) {
            [priority[index], priority[index - 1]] = [priority[index - 1], priority[index]];
        } else if (direction === 'down' && index < priority.length - 1) {
            [priority[index], priority[index + 1]] = [priority[index + 1], priority[index]];
        }
        setPluginPriorityConfig({ ...pluginPriorityConfig, [`${type}Priority`]: priority });
    };
    
    const getPluginLabel = (pluginId: string): string => {
        if (pluginId === 'scanner') return 'Scanner système';
        const plugin = plugins.find(p => p.id === pluginId);
        return plugin?.name || pluginId;
    };
    
    const isPluginEnabled = (pluginId: string): boolean => {
        if (pluginId === 'scanner') return true;
        const plugin = plugins.find(p => p.id === pluginId);
        return plugin?.enabled || false;
    };

    const fetchConfigs = async () => {
        setIsLoading(true);
        try {
            // Try to fetch unified config first
            try {
                const unifiedResponse = await api.get<UnifiedAutoScanConfig>('/api/network-scan/unified-config');
                if (unifiedResponse.success && unifiedResponse.result) {
                    // Nettoyer scanType de fullScan si présent (compatibilité avec anciennes configs)
                    const cleanedConfig = {
                        ...unifiedResponse.result,
                        fullScan: unifiedResponse.result.fullScan ? {
                            enabled: unifiedResponse.result.fullScan.enabled,
                            interval: unifiedResponse.result.fullScan.interval,
                            portScanEnabled: unifiedResponse.result.fullScan.portScanEnabled === true
                        } : undefined
                    };
                    setUnifiedConfig(cleanedConfig);
                    setInitialUnifiedConfig(JSON.parse(JSON.stringify(cleanedConfig))); // Deep copy
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
                setInitialDefaultConfig(JSON.parse(JSON.stringify(defaultResponse.result))); // Deep copy
            }
        } catch (error) {
            console.error('Failed to fetch configs:', error);
        } finally {
            setIsLoading(false);
        }
    };

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
                    portScanEnabled: unifiedConfig.fullScan.portScanEnabled === true
                } : {
                    enabled: false,
                    interval: 1440,
                    portScanEnabled: false
                },
                refresh: unifiedConfig.refresh ? {
                    enabled: unifiedConfig.enabled ? (unifiedConfig.refresh.enabled || false) : false,
                    interval: unifiedConfig.refresh.interval || 10,
                    scanType: unifiedConfig.refresh.scanType || 'quick'
                } : {
                    enabled: false,
                    interval: 10,
                    scanType: 'quick'
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

    // Global save function that saves all configurations
    const handleSaveAll = async () => {
        setIsSaving(true);
        setSaveMessage(null);
        const errors: string[] = [];

        try {
            // Save unified config
            try {
                const configToSave: UnifiedAutoScanConfig = {
                    enabled: unifiedConfig.enabled,
                    fullScan: unifiedConfig.fullScan ? {
                        enabled: unifiedConfig.enabled ? (unifiedConfig.fullScan.enabled || false) : false,
                        interval: unifiedConfig.fullScan.interval || 1440,
                        portScanEnabled: unifiedConfig.fullScan.portScanEnabled === true
                    } : {
                        enabled: false,
                        interval: 1440,
                        portScanEnabled: false
                    },
                    refresh: unifiedConfig.refresh ? {
                        enabled: unifiedConfig.enabled ? (unifiedConfig.refresh.enabled || false) : false,
                        interval: unifiedConfig.refresh.interval || 10,
                        scanType: unifiedConfig.refresh.scanType || 'quick'
                    } : {
                        enabled: false,
                        interval: 10,
                        scanType: 'quick'
                    }
                };
                const unifiedResponse = await api.post<UnifiedAutoScanConfig>('/api/network-scan/unified-config', configToSave);
                if (unifiedResponse.success && unifiedResponse.result) {
                    setUnifiedConfig(unifiedResponse.result);
                    setInitialUnifiedConfig(JSON.parse(JSON.stringify(unifiedResponse.result)));
                } else {
                    errors.push('Configuration de scan automatique');
                }
            } catch (error: any) {
                console.error('Save unified config failed:', error);
                errors.push('Configuration de scan automatique');
            }

            // Save default config
            try {
                const defaultResponse = await api.post<DefaultScanConfig>('/api/network-scan/default-config', defaultConfig);
                if (defaultResponse.success && defaultResponse.result) {
                    setDefaultConfig(defaultResponse.result);
                    setInitialDefaultConfig(JSON.parse(JSON.stringify(defaultResponse.result)));
                } else {
                    errors.push('Configuration par défaut');
                }
            } catch (error: any) {
                console.error('Save default config failed:', error);
                errors.push('Configuration par défaut');
            }

            // Save plugin priority config
            try {
                const priorityResponse = await api.post('/api/network-scan/plugin-priority-config', pluginPriorityConfig);
                if (priorityResponse.success) {
                    setInitialPluginPriorityConfig(JSON.parse(JSON.stringify(pluginPriorityConfig)));
                } else {
                    errors.push('Priorité des plugins');
                }
            } catch (error: any) {
                console.error('Save plugin priority failed:', error);
                errors.push('Priorité des plugins');
            }

            // Save auto-update config
            try {
                const autoUpdateResponse = await api.post('/api/database/config', {
                    wiresharkAutoUpdate: autoUpdateEnabled
                });
                if (autoUpdateResponse.success) {
                    setInitialAutoUpdateEnabled(autoUpdateEnabled);
                } else {
                    errors.push('Mise à jour automatique vendors');
                }
            } catch (error: any) {
                console.error('Save auto-update config failed:', error);
                errors.push('Mise à jour automatique vendors');
            }

            if (errors.length === 0) {
                setSaveMessage({ type: 'success', text: 'Toutes les configurations ont été sauvegardées avec succès' });
                setTimeout(() => {
                    setSaveMessage(null);
                    onClose(); // Auto-close on success
                }, 1500);
            } else {
                setSaveMessage({ type: 'error', text: `Erreurs lors de la sauvegarde: ${errors.join(', ')}` });
            }
        } catch (error: any) {
            console.error('Save all failed:', error);
            setSaveMessage({ type: 'error', text: 'Erreur lors de la sauvegarde: ' + (error.message || 'Erreur inconnue') });
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#121212] border border-gray-700 rounded-lg w-full max-w-7xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/20 rounded-lg">
                            <Settings size={24} className="text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-white">{t('config.scanConfig')}</h2>
                            <p className="text-sm text-gray-400 mt-1">{t('config.autoScanParams')}</p>
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
                    {hasUnsavedChanges() && (
                        <div className="mb-4 px-4 py-3 rounded-lg border-2 border-orange-600 bg-orange-900/40 text-orange-100 flex items-center gap-3">
                            <XCircle size={18} className="text-orange-400 flex-shrink-0" />
                            <div className="flex-1 text-sm">{t('config.unsavedWarning')}</div>
                        </div>
                    )}
                    {isLoading ? (
                        <div className="flex items-center justify-center py-16">
                            <RefreshCw size={32} className="text-gray-400 animate-spin" />
                        </div>
                    ) : (
                        <>
                        {/* Nouvelle interface unifiée - Layout en colonnes */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Colonne gauche - Scan automatique */}
                            <div className="space-y-6">
                            {/* Master switch - Scan automatique */}
                            <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-purple-500/20 rounded-lg">
                                            <Play size={18} className="text-purple-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-semibold text-white">{t('config.autoScan')}</h3>
                                            <p className="text-xs text-gray-400 mt-1">{t('config.autoScanDesc')}</p>
                                        </div>
                                    </div>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            id="auto-scan-enabled"
                                            name="auto-scan-enabled"
                                            type="checkbox"
                                            checked={unifiedConfig.enabled}
                                            onChange={(e) => {
                                                const newEnabled = e.target.checked;
                                                // When disabling master switch, preserve sub-configs but ensure they exist
                                                setUnifiedConfig({ 
                                                    ...unifiedConfig, 
                                                    enabled: newEnabled,
                                                      fullScan: unifiedConfig.fullScan || { enabled: false, interval: 1440, portScanEnabled: false },
                                                      refresh: unifiedConfig.refresh || { enabled: false, interval: 10, scanType: 'quick' }
                                                });
                                            }}
                                            className="w-5 h-5 rounded border-gray-600 bg-[#1a1a1a] text-purple-500 focus:ring-purple-500 focus:ring-2"
                                        />
                                        <span className="text-sm font-medium text-gray-300">
                                            {unifiedConfig.enabled ? t('config.enabled') : t('config.disabled')}
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
                                                    <h4 className="text-sm font-semibold text-gray-300">{t('networkScan.scanTypes.fullScan')}</h4>
                                                </div>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        id="full-scan-enabled"
                                                        name="full-scan-enabled"
                                                        type="checkbox"
                                                        checked={unifiedConfig.fullScan?.enabled ?? false}
                                                        onChange={(e) => setUnifiedConfig({
                                                            ...unifiedConfig,
                                                            fullScan: {
                                                                ...unifiedConfig.fullScan,
                                                                enabled: e.target.checked,
                                                                interval: unifiedConfig.fullScan?.interval ?? 1440
                                                                // scanType retiré - scan complet toujours en mode 'full'
                                                            }
                                                        })}
                                                        className="w-4 h-4"
                                                    />
                                                    <span className="text-xs text-gray-400">{t('config.enable')}</span>
                                                </label>
                                            </div>
                                            <p className="text-xs text-gray-500 mb-3">
                                                {t('config.fullScanDesc')}
                                            </p>
                                            
                                            {unifiedConfig.fullScan?.enabled && (
                                                <div className="space-y-3">
                                                    <div>
                                                        <label htmlFor="full-scan-interval" className="block text-xs text-gray-400 mb-1.5">{t('config.interval')}</label>
                                                        <select
                                                            id="full-scan-interval"
                                                            name="full-scan-interval"
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
                                                            <option value="15">{t('config.interval15min')}</option>
                                                            <option value="30">{t('config.interval30min')}</option>
                                                            <option value="60">{t('config.interval1h')}</option>
                                                            <option value="120">{t('config.interval2h')}</option>
                                                            <option value="360">{t('config.interval6h')}</option>
                                                            <option value="720">{t('config.interval12h')}</option>
                                                            <option value="1440">{t('config.interval24h')}</option>
                                                        </select>
                                                    </div>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            id="full-scan-port-scan"
                                                            name="full-scan-port-scan"
                                                            type="checkbox"
                                                            checked={unifiedConfig.fullScan?.portScanEnabled ?? false}
                                                            onChange={(e) => setUnifiedConfig({
                                                                ...unifiedConfig,
                                                                fullScan: {
                                                                    ...unifiedConfig.fullScan!,
                                                                    portScanEnabled: e.target.checked
                                                                }
                                                            })}
                                                            className="w-4 h-4"
                                                        />
                                                        <span className="text-xs text-gray-400">{t('config.portScanAfterFull')}</span>
                                                    </label>
                                                    <p className="text-xs text-gray-500">
                                                        {t('config.portScanDesc')}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Refresh Section */}
                                        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <RefreshCw size={14} className="text-blue-400" />
                                                    <h4 className="text-sm font-semibold text-gray-300">{t('config.refreshLabel')}</h4>
                                                </div>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        id="refresh-enabled"
                                                        name="refresh-enabled"
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
                                                    <span className="text-xs text-gray-400">{t('config.enable')}</span>
                                                </label>
                                            </div>
                                            <p className="text-xs text-gray-500 mb-3">
                                                {t('config.refreshDesc')}
                                            </p>
                                            
                                            {unifiedConfig.refresh?.enabled && (
                                                <div className="space-y-3">
                                                    <div>
                                                        <label htmlFor="refresh-interval" className="block text-xs text-gray-400 mb-1.5">{t('config.interval')}</label>
                                                        <select
                                                            id="refresh-interval"
                                                            name="refresh-interval"
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
                                                            <option value="5">{t('config.interval5min')}</option>
                                                            <option value="10">{t('config.interval10min')}</option>
                                                            <option value="15">{t('config.interval15min')}</option>
                                                            <option value="30">{t('config.interval30min')}</option>
                                                            <option value="60">{t('config.interval1h')}</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label htmlFor="refresh-scan-type" className="block text-xs text-gray-400 mb-1.5">{t('config.refreshType')}</label>
                                                        <select
                                                            id="refresh-scan-type"
                                                            name="refresh-scan-type"
                                                            value={unifiedConfig.refresh.scanType || 'quick'}
                                                            onChange={(e) => setUnifiedConfig({
                                                                ...unifiedConfig,
                                                                refresh: {
                                                                    ...unifiedConfig.refresh!,
                                                                    scanType: e.target.value as 'full' | 'quick'
                                                                }
                                                            })}
                                                            className="w-full px-3 py-2 text-sm bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500"
                                                        >
                                                            <option value="quick">{t('config.quickOption')}</option>
                                                            <option value="full">{t('config.fullOption')}</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Réinitialisation des scans */}
                            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-3">
                                    <XCircle size={14} className="text-red-400" />
                                    <span>{t('config.clearScans')}</span>
                                </h3>
                                <p className="text-xs text-gray-500 mb-3">
                                    {t('config.clearScansDesc')}
                                </p>
                                
                                <button
                                    onClick={async () => {
                                        if (!confirm(`⚠️ ${t('config.confirmClear')}`)) {
                                            return;
                                        }
                                        try {
                                            console.log('[NetworkScanConfigModal] Starting clear operation...');
                                            const response = await api.delete<ClearScansResponse>('/api/network-scan/clear');
                                            console.log('[NetworkScanConfigModal] Clear response:', response);
                                            
                                            if (response.success && response.result) {
                                                const deletedScans = response.result.deletedScans || 0;
                                                const deletedHistory = response.result.deletedHistory || 0;
                                                
                                                console.log(`[NetworkScanConfigModal] Successfully deleted ${deletedScans} scans and ${deletedHistory} history entries`);
                                                
                                                setSaveMessage({ 
                                                    type: 'success', 
                                                    text: t('config.clearSuccess', { scans: deletedScans, history: deletedHistory }) 
                                                });
                                                
                                                if (onDataChanged) {
                                                    console.log('[NetworkScanConfigModal] Calling onDataChanged callback...');
                                                    try {
                                                        await onDataChanged();
                                                        console.log('[NetworkScanConfigModal] onDataChanged callback completed');
                                                    } catch (callbackError) {
                                                        console.error('[NetworkScanConfigModal] Error in onDataChanged callback:', callbackError);
                                                    }
                                                } else {
                                                    console.warn('[NetworkScanConfigModal] onDataChanged callback not provided - data will not refresh automatically');
                                                }
                                                
                                                setTimeout(() => setSaveMessage(null), 5000);
                                                
                                                setTimeout(() => {
                                                    onClose();
                                                }, 2000);
                                            } else {
                                                console.error('[NetworkScanConfigModal] Clear failed:', response.error);
                                                setSaveMessage({ 
                                                    type: 'error', 
                                                    text: response.error?.message || t('config.clearError') 
                                                });
                                            }
                                        } catch (error: any) {
                                            console.error('[NetworkScanConfigModal] Failed to clear scan data:', error);
                                            setSaveMessage({ type: 'error', text: t('config.clearError') });
                                        }
                                    }}
                                    className="w-full px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/30 flex items-center justify-center gap-2 text-sm transition-colors"
                                >
                                    <XCircle size={14} />
                                    <span>{t('config.deleteAllScans')}</span>
                                </button>
                            </div>
                            </div>
                            
                            {/* Colonne droite - Priorité plugins et Base vendors */}
                            <div className="space-y-6">
                            {/* Plugin Priority Configuration */}
                            <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-5">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-purple-500/20 rounded-lg">
                                    <Plug size={18} className="text-purple-400" />
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold text-white">{t('config.pluginPriority')}</h3>
                                    <p className="text-xs text-gray-400 mt-1">{t('config.pluginPriorityDesc')}</p>
                                </div>
                            </div>
                            
                            {isLoadingPriority ? (
                                <div className="flex items-center justify-center py-4">
                                    <RefreshCw size={20} className="text-gray-400 animate-spin" />
                                </div>
                            ) : (
                                <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Hostname Priority */}
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
                                            <Network size={14} />
                                            {t('config.hostnamePriority')}
                                        </h4>
                                        <div className="space-y-2">
                                            {pluginPriorityConfig.hostnamePriority.map((pluginId, index) => (
                                                <div key={pluginId} className="flex items-center gap-2 p-2 bg-[#0f0f0f] rounded border border-gray-800">
                                                    <span className="text-xs text-gray-500 w-6">{index + 1}.</span>
                                                    <span className={`text-sm flex-1 ${isPluginEnabled(pluginId) ? 'text-gray-200' : 'text-gray-500'}`}>
                                                        {getPluginLabel(pluginId)}
                                                        {!isPluginEnabled(pluginId) && pluginId !== 'scanner' && (
                                                            <span className="text-xs text-orange-400 ml-2">{t('config.disabledPlugin')}</span>
                                                        )}
                                                    </span>
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => movePriority('hostname', index, 'up')}
                                                            disabled={index === 0}
                                                            className="p-1 hover:bg-blue-500/10 text-blue-400 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                                            title={t('config.moveUp')}
                                                        >
                                                            <ArrowUp size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => movePriority('hostname', index, 'down')}
                                                            disabled={index === pluginPriorityConfig.hostnamePriority.length - 1}
                                                            className="p-1 hover:bg-blue-500/10 text-blue-400 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                                            title={t('config.moveDown')}
                                                        >
                                                            <ArrowDown size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    {/* Vendor Priority */}
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
                                            <HardDrive size={14} />
                                            {t('config.vendorPriority')}
                                        </h4>
                                        <div className="space-y-2">
                                            {pluginPriorityConfig.vendorPriority.map((pluginId, index) => (
                                                <div key={pluginId} className="flex items-center gap-2 p-2 bg-[#0f0f0f] rounded border border-gray-800">
                                                    <span className="text-xs text-gray-500 w-6">{index + 1}.</span>
                                                    <span className={`text-sm flex-1 ${isPluginEnabled(pluginId) ? 'text-gray-200' : 'text-gray-500'}`}>
                                                        {getPluginLabel(pluginId)}
                                                        {!isPluginEnabled(pluginId) && pluginId !== 'scanner' && (
                                                            <span className="text-xs text-orange-400 ml-2">{t('config.disabledPlugin')}</span>
                                                        )}
                                                    </span>
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => movePriority('vendor', index, 'up')}
                                                            disabled={index === 0}
                                                            className="p-1 hover:bg-blue-500/10 text-blue-400 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                                            title={t('config.moveUp')}
                                                        >
                                                            <ArrowUp size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => movePriority('vendor', index, 'down')}
                                                            disabled={index === pluginPriorityConfig.vendorPriority.length - 1}
                                                            className="p-1 hover:bg-blue-500/10 text-blue-400 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                                            title={t('config.moveDown')}
                                                        >
                                                            <ArrowDown size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                    
                                {/* Overwrite Options */}
                                <div className="pt-4 border-t border-gray-800 mt-4">
                                    <h4 className="text-sm font-semibold text-gray-300 mb-3">{t('config.overwriteData')}</h4>
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={pluginPriorityConfig.overwriteExisting.hostname}
                                                onChange={(e) => setPluginPriorityConfig({
                                                    ...pluginPriorityConfig,
                                                    overwriteExisting: { ...pluginPriorityConfig.overwriteExisting, hostname: e.target.checked }
                                                })}
                                                className="w-4 h-4 rounded border-gray-600 bg-[#1a1a1a] text-purple-500 focus:ring-purple-500"
                                            />
                                            <span className="text-sm text-gray-300">{t('config.overwriteHostname')}</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={pluginPriorityConfig.overwriteExisting.vendor}
                                                onChange={(e) => setPluginPriorityConfig({
                                                    ...pluginPriorityConfig,
                                                    overwriteExisting: { ...pluginPriorityConfig.overwriteExisting, vendor: e.target.checked }
                                                })}
                                                className="w-4 h-4 rounded border-gray-600 bg-[#1a1a1a] text-purple-500 focus:ring-purple-500"
                                            />
                                            <span className="text-sm text-gray-300">{t('config.overwriteVendor')}</span>
                                        </label>
                                    </div>
                                </div>
                                </>
                            )}
                            </div>
                            
                            {/* Base vendors IEEE OUI */}
                            <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <HardDrive size={14} className="text-cyan-400" />
                                        <div>
                                            <h3 className="text-sm font-semibold text-gray-300">{t('config.vendorDb')}</h3>
                                            <p className="text-xs text-gray-500 mt-0.5">{t('config.vendorDbDesc')}</p>
                                        </div>
                                    </div>
                                    <label className="flex items-center gap-2 cursor-pointer shrink-0">
                                        <input
                                            type="checkbox"
                                            checked={autoUpdateEnabled}
                                            onChange={handleToggleAutoUpdate}
                                            className="w-4 h-4 rounded border-gray-600 bg-[#1a1a1a] text-cyan-500 focus:ring-cyan-500"
                                        />
                                        <span className="text-sm text-gray-300">{t('config.autoUpdate')}</span>
                                    </label>
                                </div>
                                
                                {wiresharkVendorStats ? (
                                    <div className="space-y-2 mb-3">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-gray-400">{t('config.vendorsLoaded')}</span>
                                            <span className="text-emerald-400 font-medium">
                                                {wiresharkVendorStats.totalVendors > 0 ? wiresharkVendorStats.totalVendors.toLocaleString() : t('networkScan.status.none')}
                                            </span>
                                        </div>
                                        {wiresharkVendorStats.lastUpdate && (
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-gray-400">{t('config.lastUpdateLabel')}</span>
                                                <span className="text-gray-300">
                                                    {new Date(wiresharkVendorStats.lastUpdate).toLocaleDateString(dateLocale, {
                                                        day: '2-digit',
                                                        month: '2-digit',
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-xs text-orange-400 mb-3">{t('networkScan.status.loading')}</div>
                                )}
                                
                                <div className="space-y-3">
                                    <button
                                        onClick={handleUpdateWiresharkVendors}
                                        disabled={isUpdatingVendors}
                                        className="w-full px-3 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-lg border border-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm transition-colors"
                                    >
                                        {isUpdatingVendors ? (
                                            <>
                                                <RefreshCw size={14} className="animate-spin" />
                                                <span>{t('config.updating')}</span>
                                            </>
                                        ) : (
                                            <>
                                                <Download size={14} />
                                                <span>{t('config.updateNow')}</span>
                                            </>
                                        )}
                                    </button>
                                    
                                    <div className="space-y-2 pt-2 border-t border-gray-800">
                                        <a
                                            href="https://standards-oui.ieee.org/oui/oui.txt"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                                        >
                                            <ExternalLink size={12} />
                                            <span className="truncate">{t('config.sourceIeee')}</span>
                                        </a>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Configuration par défaut du scan */}
                            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-4">
                                    <Network size={14} className="text-blue-400" />
                                    <span>{t('config.defaultScanConfig')}</span>
                                </h3>
                                <p className="text-xs text-gray-500 mb-4">
                                    {t('config.defaultParamsDesc')}
                                </p>
                                
                                <div className="space-y-4">
                                    <div className="flex items-center gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                id="default-auto-detect"
                                                name="default-auto-detect"
                                                type="checkbox"
                                                checked={defaultConfig.defaultAutoDetect}
                                                onChange={(e) => setDefaultConfig({ ...defaultConfig, defaultAutoDetect: e.target.checked })}
                                                className="w-4 h-4"
                                            />
                                            <span className="text-sm">{t('networkScan.scanTypes.autoDetect')} </span>
                                        </label>
                                    </div>

                                    {!defaultConfig.defaultAutoDetect && (
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <label htmlFor="default-range" className="block text-sm text-gray-400">{t('config.defaultRangeLabel')}</label>
                                                <button
                                                    onClick={() => setShowHelpModal(true)}
                                                    className="p-1 hover:bg-blue-500/10 text-blue-400 rounded-lg transition-colors"
                                                    title={t('config.helpNetwork')}
                                                >
                                                    <HelpCircle size={14} />
                                                </button>
                                            </div>
                                            <input
                                                id="default-range"
                                                name="default-range"
                                                type="text"
                                                value={defaultConfig.defaultRange}
                                                onChange={(e) => setDefaultConfig({ ...defaultConfig, defaultRange: e.target.value })}
                                                placeholder="192.168.1.0/24"
                                                className="w-full px-4 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500"
                                            />
                                        </div>
                                    )}

                                </div>
                            </div>
                            </div>
                        </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-6 border-t border-gray-800">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-500/10 hover:bg-gray-500/20 text-gray-400 rounded-lg border border-gray-500/30 transition-colors"
                    >
                        {t('config.close')}
                    </button>
                    <button
                        onClick={handleSaveAll}
                        disabled={isSaving || !hasUnsavedChanges()}
                        className="px-6 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors font-medium"
                    >
                        {isSaving ? (
                            <>
                                <RefreshCw size={18} className="animate-spin" />
                                {t('config.saving')}
                            </>
                        ) : (
                            <>
                                <Save size={18} />
                                {t('config.saveAll')}
                            </>
                        )}
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
                                    <h2 className="text-xl font-semibold text-white">{t('networkScan.help.title')}</h2>
                                    <p className="text-sm text-gray-400 mt-1">{t('networkScan.help.subtitle')}</p>
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
                                <h3 className="text-lg font-semibold text-purple-400 mb-3">{t('networkScan.help.networkRangeFormat')}</h3>
                                <div className="space-y-3 text-sm text-gray-300">
                                    <div>
                                        <p className="font-semibold text-purple-300 mb-1">{t('networkScan.help.cidrNotation')}</p>
                                        <code className="block bg-[#1a1a1a] px-3 py-2 rounded text-emerald-400 font-mono text-xs my-2">
                                            192.168.1.0/24
                                        </code>
                                        <p className="text-gray-400 text-xs">
                                            {t('networkScan.help.cidrExample')}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="font-semibold text-purple-300 mb-1">{t('networkScan.help.rangeNotation')}</p>
                                        <code className="block bg-[#1a1a1a] px-3 py-2 rounded text-emerald-400 font-mono text-xs my-2">
                                            192.168.1.1-254
                                        </code>
                                        <p className="text-gray-400 text-xs">
                                            {t('networkScan.help.rangeExample')}
                                        </p>
                                    </div>
                                    <div className="bg-[#1a1a1a] rounded p-3 mt-3">
                                        <p className="font-semibold text-yellow-400 mb-2 text-xs">{t('networkScan.help.commonMasks')}</p>
                                        <ul className="space-y-1 text-xs text-gray-400">
                                            <li>{t('networkScan.help.mask24')}</li>
                                            <li>{t('networkScan.help.mask25')}</li>
                                            <li>{t('networkScan.help.mask26')}</li>
                                            <li>{t('networkScan.help.mask16')}</li>
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
                                {t('config.close')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

