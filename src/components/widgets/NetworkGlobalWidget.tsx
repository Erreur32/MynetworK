/**
 * Network Global Widget
 * 
 * Displays combined network statistics from all active plugins
 */

import React from 'react';
import { Card } from './Card';
import { Globe, Wifi, Activity, TrendingUp, TrendingDown } from 'lucide-react';
import { usePluginStore } from '../../stores/pluginStore';
import { formatSpeed } from '../../utils/constants';

export const NetworkGlobalWidget: React.FC = () => {
    const { plugins, pluginStats } = usePluginStore();

    // Calculate combined stats
    const getCombinedStats = () => {
        let totalDownload = 0;
        let totalUpload = 0;
        let totalDevices = 0;
        let activeDevices = 0;

        Object.entries(pluginStats)
            .filter(([, stats]) => stats !== null && stats !== undefined)
            .forEach(([pluginId, stats]) => {
                const plugin = plugins.find(p => p.id === pluginId);
                if (!plugin || !plugin.enabled || !plugin.connectionStatus) return;

                if (stats?.network) {
                    totalDownload += stats.network.download || 0;
                    totalUpload += stats.network.upload || 0;
                }

                if (stats?.devices) {
                    totalDevices += stats.devices.length;
                    activeDevices += stats.devices.filter((d: any) => d.active !== false).length;
                }
            });

        return { totalDownload, totalUpload, totalDevices, activeDevices };
    };

    const stats = getCombinedStats();
    const activePlugins = plugins.filter(p => p.enabled && p.connectionStatus);

    if (activePlugins.length === 0) {
        return (
            <Card title="Réseau Global">
                <div className="text-center py-8 text-gray-500">
                    <Globe size={32} className="mx-auto mb-2" />
                    <p className="text-sm">Aucun plugin réseau actif</p>
                </div>
            </Card>
        );
    }

    return (
        <Card title="Réseau Global">
            <div className="space-y-4">
                {/* Combined Network Speed */}
                {(stats.totalDownload > 0 || stats.totalUpload > 0) && (
                    <div className="space-y-3">
                        <h4 className="text-xs text-gray-400">Débit Combiné</h4>
                        
                        {/* Download */}
                        <div className="bg-[#1a1a1a] rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <TrendingDown size={16} className="text-blue-400" />
                                    <span className="text-xs text-gray-400">Descendant</span>
                                </div>
                                <span className="text-lg font-semibold text-blue-400">
                                    {formatSpeed(stats.totalDownload)}
                                </span>
                            </div>
                        </div>

                        {/* Upload */}
                        <div className="bg-[#1a1a1a] rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <TrendingUp size={16} className="text-green-400" />
                                    <span className="text-xs text-gray-400">Montant</span>
                                </div>
                                <span className="text-lg font-semibold text-green-400">
                                    {formatSpeed(stats.totalUpload)}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Devices Summary */}
                {stats.totalDevices > 0 && (
                    <div className="pt-4 border-t border-gray-700 space-y-3">
                        <h4 className="text-xs text-gray-400">Appareils</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-[#1a1a1a] rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <Wifi size={14} className="text-gray-400" />
                                    <span className="text-xs text-gray-500">Total</span>
                                </div>
                                <p className="text-xl font-semibold text-white">
                                    {stats.totalDevices}
                                </p>
                            </div>
                            <div className="bg-[#1a1a1a] rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <Activity size={14} className="text-green-400" />
                                    <span className="text-xs text-gray-500">Actifs</span>
                                </div>
                                <p className="text-xl font-semibold text-green-400">
                                    {stats.activeDevices}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Active Plugins */}
                <div className="pt-4 border-t border-gray-700">
                    <h4 className="text-xs text-gray-400 mb-2">Sources Actives</h4>
                    <div className="flex flex-wrap gap-2">
                        {activePlugins.map(plugin => (
                            <div
                                key={plugin.id}
                                className="flex items-center gap-1.5 px-2 py-1 bg-[#1a1a1a] rounded text-xs border border-gray-700"
                            >
                                <Globe size={12} className="text-blue-400" />
                                <span className="text-gray-300">{plugin.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Card>
    );
};

