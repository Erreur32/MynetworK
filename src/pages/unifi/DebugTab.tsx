import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Card } from '../../components/widgets/Card';

interface DebugTabProps {
    unifiPlugin: any;
    unifiStats: any;
    pluginStats: Record<string, any>;
    isActive: boolean | undefined;
    isRefreshing: boolean;
    handleRefresh: () => void;
}

export const DebugTab: React.FC<DebugTabProps> = ({
    unifiPlugin,
    unifiStats,
    pluginStats,
    isActive,
    isRefreshing,
    handleRefresh,
}) => {
    const { t } = useTranslation();

    return (
        <div className="col-span-full space-y-6">
            {/* Plugin Info */}
            <Card title={t('unifi.pluginInfo')} className="bg-unifi-card border border-gray-800 rounded-xl">
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-400">Plugin ID:</span>
                        <span className="text-sm text-white font-mono">{unifiPlugin.id}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-400">Nom:</span>
                        <span className="text-sm text-white">{unifiPlugin.name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-400">Version:</span>
                        <span className="text-sm text-white">{unifiPlugin.version}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-400">{t('unifi.enabledLabel')}</span>
                        <span className={`text-sm ${unifiPlugin.enabled ? 'text-green-400' : 'text-red-400'}`}>
                            {unifiPlugin.enabled ? 'Oui' : 'Non'}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-400">{t('unifi.connectedLabel')}</span>
                        <span className={`text-sm ${unifiPlugin.connectionStatus ? 'text-green-400' : 'text-red-400'}`}>
                            {unifiPlugin.connectionStatus ? 'Oui' : 'Non'}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-400">isActive:</span>
                        <span className={`text-sm ${isActive ? 'text-green-400' : 'text-red-400'}`}>
                            {isActive ? 'Oui' : 'Non'}
                        </span>
                    </div>
                </div>
            </Card>

            {/* Settings */}
            <Card title={t('unifi.configuration')} className="bg-unifi-card border border-gray-800 rounded-xl">
                <pre className="text-xs bg-unifi-card/50 p-4 rounded-lg overflow-auto max-h-96 text-gray-300">
                    {JSON.stringify(unifiPlugin.settings, null, 2)}
                </pre>
            </Card>

            {/* Stats Raw Data */}
            <Card title={t('unifi.rawStatsDebug')} className="bg-unifi-card border border-gray-800 rounded-xl">
                {unifiStats ? (
                    <pre className="text-xs bg-[#050505] p-4 rounded-lg overflow-auto max-h-96 text-gray-300">
                        {JSON.stringify(unifiStats, null, 2)}
                    </pre>
                ) : (
                    <div className="text-center py-8 text-gray-500">
                        <AlertCircle size={32} className="mx-auto mb-2" />
                        <p>{t('unifi.noStatsData')}</p>
                        <p className="text-xs mt-2 text-gray-600">
                            {t('unifi.statsFetchedDescription')}
                        </p>
                        <div className="mt-4 text-left text-xs bg-[#050505] p-3 rounded-lg">
                            <p className="text-gray-400 mb-2">{t('unifi.debugInfo')}</p>
                            <p className="text-gray-500">Plugin enabled: {unifiPlugin?.enabled ? t('unifi.yes') : t('unifi.no')}</p>
                            <p className="text-gray-500">Connection status: {unifiPlugin?.connectionStatus ? t('unifi.yes') : t('unifi.no')}</p>
                            <p className="text-gray-500">isActive: {isActive ? t('unifi.yes') : t('unifi.no')}</p>
                            <p className="text-gray-500">pluginStats keys: {Object.keys(pluginStats).join(', ')}</p>
                            <p className="text-gray-500">unifiStats type: {typeof unifiStats}</p>
                        </div>
                    </div>
                )}
            </Card>

            {/* Devices Analysis */}
            {unifiStats?.devices && (
                <Card title={t('unifi.deviceAnalysis')} className="bg-unifi-card border border-gray-800 rounded-xl">
                    <div className="space-y-4">
                        <div>
                            <span className="text-sm text-gray-400">Nombre total de devices:</span>
                            <span className="ml-2 text-white font-semibold">{unifiStats.devices.length}</span>
                        </div>
                        <div>
                            <span className="text-sm text-gray-400">Types uniques:</span>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {Array.from(new Set(unifiStats.devices.map((d: any) => d.type || 'unknown'))).map((type: string) => (
                                    <span key={type} className="px-2 py-1 bg-[#050505] rounded text-xs text-gray-300">
                                        {type} ({unifiStats.devices.filter((d: any) => (d.type || 'unknown') === type).length})
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div>
                            <span className="text-sm text-gray-400">{t('unifi.uniqueModels')}</span>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {Array.from(new Set(unifiStats.devices.map((d: any) => d.model || 'unknown').filter((m: string) => m !== 'unknown'))).map((model: string) => (
                                    <span key={model} className="px-2 py-1 bg-[#050505] rounded text-xs text-gray-300">
                                        {model} ({unifiStats.devices.filter((d: any) => (d.model || 'unknown') === model).length})
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div>
                            <span className="text-sm text-gray-400">Devices actifs:</span>
                            <span className="ml-2 text-white font-semibold">
                                {unifiStats.devices.filter((d: any) => d.active !== false).length}
                            </span>
                        </div>
                        <div>
                            <span className="text-sm text-gray-400">{t('unifi.firmwareSummary')}</span>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {(() => {
                                    const firmwareCounts = new Map<string, number>();
                                    for (const d of unifiStats.devices as any[]) {
                                        const type = ((d as any).type || '').toString().toLowerCase();
                                        if (type === 'client') continue;
                                        const rawFw =
                                            (d as any).firmware_version ||
                                            (d as any).version ||
                                            (d as any).firmware ||
                                            (d as any).cfgversion ||
                                            (d as any).stable_version;
                                        const fwStr = rawFw != null ? String(rawFw).trim() : '';
                                        if (!fwStr || fwStr === 'undefined' || fwStr === 'null') continue;
                                        firmwareCounts.set(fwStr, (firmwareCounts.get(fwStr) || 0) + 1);
                                    }
                                    const entries = Array.from(firmwareCounts.entries());
                                    if (entries.length === 0) {
                                        return (
                                            <span className="text-xs text-gray-500">
                                                {t('unifi.noFirmwareInfo')}
                                                <code className="ml-1">version</code>, <code>firmware</code> ou <code>firmware_version</code> dans les stats brutes).
                                            </span>
                                        );
                                    }
                                    return entries.map(([fw, count]) => (
                                        <span
                                            key={fw}
                                            className="px-2 py-1 bg-[#1a1a1a] rounded text-xs text-gray-200"
                                        >
                                            v{fw} ({count})
                                        </span>
                                    ));
                                })()}
                            </div>
                        </div>
                        <div>
                            <span className="text-sm text-gray-400">Exemple de device (premier):</span>
                            {unifiStats.devices.length > 0 && (
                                <pre className="text-xs bg-[#1a1a1a] p-4 rounded-lg overflow-auto max-h-64 text-gray-300 mt-2">
                                    {JSON.stringify(unifiStats.devices[0], null, 2)}
                                </pre>
                            )}
                        </div>
                    </div>
                </Card>
            )}

            {/* Network Stats Analysis */}
            {unifiStats?.network && (
                <Card title={t('unifi.statsAnalysis')} className="bg-unifi-card border border-gray-800 rounded-xl">
                    <pre className="text-xs bg-unifi-card/50 p-4 rounded-lg overflow-auto max-h-64 text-gray-300">
                        {JSON.stringify(unifiStats.network, null, 2)}
                    </pre>
                </Card>
            )}

            {/* System Stats Analysis */}
            {unifiStats?.system && (
                <Card title={t('unifi.systemStatsAnalysis')} className="bg-unifi-card border border-gray-800 rounded-xl">
                    <pre className="text-xs bg-unifi-card/50 p-4 rounded-lg overflow-auto max-h-64 text-gray-300">
                        {JSON.stringify(unifiStats.system, null, 2)}
                    </pre>
                </Card>
            )}

            {/* Actions */}
            <Card title={t('unifi.debugActions')} className="bg-unifi-card border border-gray-800 rounded-xl">
                <div className="space-y-3">
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                        {t('unifi.forceRefreshStats')}
                    </button>
                    <div className="text-xs text-gray-500 space-y-1">
                        <p>• Le polling automatique se fait toutes les 30 secondes si le plugin est actif</p>
                        <p>• {t('unifi.debugCheckConsole')}</p>
                        <p>• {t('unifi.debugCheckBackend')}</p>
                    </div>
                </div>
            </Card>
        </div>
    );
};
