/**
 * Unified Dashboard Page
 * 
 * Main dashboard showing overview of all active plugins + system info
 */

import React, { useEffect } from 'react';
import { MultiSourceWidget, SystemServerWidget, PluginSummaryCard, BandwidthHistoryWidget, NetworkEventsWidget } from '../components/widgets';
import { TrafficHistoryModal } from '../components/modals';
import { usePluginStore } from '../stores/pluginStore';
import { usePolling } from '../hooks/usePolling';
import { POLLING_INTERVALS } from '../utils/constants';

interface UnifiedDashboardPageProps {
    onNavigateToFreebox?: () => void;
    onNavigateToUniFi?: () => void;
    onNavigateToPlugins?: (pluginId?: string) => void;
}

export const UnifiedDashboardPage: React.FC<UnifiedDashboardPageProps> = ({ 
    onNavigateToFreebox,
    onNavigateToUniFi,
    onNavigateToPlugins
}) => {
    const { plugins, fetchPlugins, fetchAllStats } = usePluginStore();

    useEffect(() => {
        fetchPlugins();
    }, [fetchPlugins]);

    // Poll plugin stats every 30 seconds
    usePolling(fetchAllStats, {
        enabled: plugins.some(p => p.enabled),
        interval: POLLING_INTERVALS.system
    });

    const activePlugins = plugins.filter(p => p.enabled && p.connectionStatus);
    const hasUniFi = activePlugins.some(p => p.id === 'unifi');

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

            {/* Column 1 - à gauche (état des plugins + système serveur) */}
            <div className="flex flex-col gap-6">
                <MultiSourceWidget onPluginClick={() => onNavigateToPlugins?.()} />
                <SystemServerWidget />
            </div>

            {/* Colonnes 2-3-4 - bande passante en haut, cartes Freebox / UniFi + évènements réseau en dessous */}
            <div className="md:col-span-1 xl:col-span-3 flex flex-col gap-6">
                {/* Bande passante (ligne du haut, large) */}
                <BandwidthHistoryWidget />

                {/* Ligne du dessous: cartes Freebox / UniFi + évènements réseau alignés sous la bande passante */}
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
                    {hasUniFi && (
                        <NetworkEventsWidget />
                    )}
                </div>
            </div>
        </div>
    );
};
