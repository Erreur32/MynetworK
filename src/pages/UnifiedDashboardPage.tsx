/**
 * Unified Dashboard Page
 * 
 * Main dashboard showing overview of all active plugins + system info
 */

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MultiSourceWidget, SystemServerWidget, PluginSummaryCard, BandwidthHistoryWidget, NetworkScanWidget, NetworkSummaryDashboardWidget } from '../components/widgets';
import { TrafficHistoryModal } from '../components/modals';
import { usePluginStore } from '../stores/pluginStore';
import { usePolling } from '../hooks/usePolling';
import { POLLING_INTERVALS } from '../utils/constants';

interface UnifiedDashboardPageProps {
    onNavigateToFreebox?: () => void;
    onNavigateToUniFi?: () => void;
    onNavigateToPlugins?: (pluginId?: string) => void;
    onNavigateToNetworkScan?: () => void;
}

export const UnifiedDashboardPage: React.FC<UnifiedDashboardPageProps> = ({
    onNavigateToFreebox,
    onNavigateToUniFi,
    onNavigateToPlugins,
    onNavigateToNetworkScan
}) => {
    const { t } = useTranslation();
    const { plugins, fetchPlugins, fetchAllStats } = usePluginStore();

    useEffect(() => {
        fetchPlugins();
    }, [fetchPlugins]);

    // Fetch stats immediately after plugins are loaded to display firmware/apiVersion info
    useEffect(() => {
        if (plugins.length > 0 && plugins.some(p => p.enabled)) {
            fetchAllStats();
        }
    }, [plugins, fetchAllStats]);

    // Poll plugin stats every 30 seconds
    usePolling(fetchAllStats, {
        enabled: plugins.some(p => p.enabled),
        interval: POLLING_INTERVALS.system
    });

    const activePlugins = plugins.filter(p => p.enabled && p.connectionStatus);
    const hasUniFi = activePlugins.some(p => p.id === 'unifi');
    // Freebox is available only if it's enabled AND connected (same condition as the Freebox card)
    const hasFreebox = activePlugins.some(p => p.id === 'freebox');
    // Scan-réseau n'a pas besoin de connexion externe, donc on vérifie seulement si activé
    const hasScanReseau = plugins.some(p => p.id === 'scan-reseau' && p.enabled);
    const hasAnyPlugin = plugins.some(p => p.configured);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

            {/* Column 1 - à gauche (état des plugins + récapitulatif réseau + système serveur) */}
            <div className="flex flex-col gap-6">
                <MultiSourceWidget onPluginClick={() => onNavigateToPlugins?.()} />
                {(hasFreebox || hasUniFi) && <NetworkSummaryDashboardWidget />}
                <SystemServerWidget />
            </div>

            {/* Colonnes 2-3-4 - bande passante en haut, cartes Freebox / UniFi + évènements réseau en dessous */}
            <div className="md:col-span-1 xl:col-span-3 flex flex-col gap-6">
                {/* Bande passante (ligne du haut, large) - uniquement si Freebox est actif et connecté (même condition que la carte Freebox) */}
                {hasFreebox && <BandwidthHistoryWidget />}

                {/* Message si aucun plugin configuré */}
                {!hasAnyPlugin && (
                    <div className="bg-[#1a1a1a] rounded-lg p-8 border border-gray-800 text-center">
                        <p className="text-gray-400 text-lg">{t('dashboard.noPluginConfigured')}</p>
                        <p className="text-gray-500 text-sm mt-2">
                            {t('dashboard.configurePluginInSettings')}
                        </p>
                    </div>
                )}

                {/* Ligne du dessous: cartes Freebox / UniFi / Scan Réseau + évènements réseau alignés sous la bande passante */}
                {hasAnyPlugin && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {activePlugins.find(p => p.id === 'freebox') && (
                        <PluginSummaryCard 
                            pluginId="freebox" 
                            onViewDetails={onNavigateToFreebox}
                        />
                    )}
                    {hasUniFi && (
                        <PluginSummaryCard 
                            pluginId="unifi" 
                            onViewDetails={onNavigateToUniFi}
                        />
                    )}
                    {hasScanReseau && (
                        <NetworkScanWidget 
                            onViewDetails={onNavigateToNetworkScan}
                        />
                    )}
                </div>
                )}
            </div>
        </div>
    );
};
