/**
 * Multi-Source / Plugin state widget
 *
 * This card is dedicated to plugin health and meta-information only:
 * - Plugin status (enabled / configured / connected)
 * - Plugin version
 * - API mode (when available in settings)
 * - Source / timing metadata coming from unified stats
 *
 * It does NOT display devices or combined traffic anymore.
 */

import React from 'react';
import { Activity, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { usePluginStore, type PluginStats } from '../../stores/pluginStore';
import { Card } from './Card';

interface MultiSourceWidgetProps {
    className?: string;
    onPluginClick?: (pluginId: string) => void;
}

export const MultiSourceWidget: React.FC<MultiSourceWidgetProps> = ({ className = '', onPluginClick }) => {
    const { plugins, pluginStats, fetchAllStats } = usePluginStore();
    const [isRefreshing, setIsRefreshing] = React.useState(false);

    const activePlugins = plugins.filter((plugin) => plugin.enabled && plugin.connectionStatus);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await fetchAllStats();
        setTimeout(() => setIsRefreshing(false), 1000);
    };

    return (
        <Card
            title="État des plugins"
            actions={
                <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="text-xs bg-[#1a1a1a] border border-gray-700 px-2 py-1 rounded flex items-center gap-1 text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
                    title="Refresh plugin stats"
                >
                    <Activity size={12} className={isRefreshing ? 'animate-spin' : ''} />
                    Actualiser
                </button>
            }
            className={className}
        >
            {plugins.length === 0 ? (
                <div className="text-center py-8">
                    <AlertCircle size={32} className="mx-auto text-gray-600 mb-2" />
                    <p className="text-gray-500 text-sm">Aucun plugin détecté</p>
                    <p className="text-gray-600 text-xs mt-1">
                        Activez et configurez des plugins dans la page Plugins.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div>
                        <h4 className="text-xs text-gray-400 mb-2">État &amp; configuration</h4>
                        <div className="flex flex-col gap-3">
                            {plugins.map((plugin) => {
                                const stats = pluginStats[plugin.id] as PluginStats | null | undefined;
                                const hasStats = !!stats;
                                const isActive = plugin.enabled && plugin.connectionStatus;

                                const apiMode =
                                    (plugin.settings && (plugin.settings.apiMode as string)) || undefined;

                                const source =
                                    stats && typeof (stats as any).source === 'string'
                                        ? ((stats as any).source as string)
                                        : undefined;

                                const timing = (stats as any)?.timing as
                                    | {
                                          execution_ms?: number;
                                          total_execution?: number;
                                      }
                                    | undefined;

                                const executionMs =
                                    timing?.execution_ms !== undefined
                                        ? timing.execution_ms
                                        : timing?.total_execution;

                                const renderPluginIcon = () => {
                                    if (plugin.id === 'freebox') {
                                        return (
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="25 23.39 180 203.23"
                                                className="w-6 h-6"
                                            >
                                                <path
                                                    fill="#cd1e25"
                                                    d="m 187.24133,23.386327 c -14.98294,0.01847 -31.16732,4.917913 -41.74251,9.8272 l 0,-0.03081 c -17.70535,8.087262 -29.24956,16.441925 -37.86091,25.630825 -8.274459,8.82635 -13.79935,18.347312 -19.6236,28.9271 l -32.007722,0 c -0.927639,0 -1.76557,0.528637 -2.187247,1.355475 l -4.189654,8.194475 c -0.389391,0.763987 -0.354765,1.672163 0.09242,2.402888 0.447184,0.73072 1.268849,1.17064 2.125634,1.17064 l 30.313378,0 -56.930003,121.03787 c -0.434171,0.92135 -0.243567,2.03654 0.462094,2.77256 l 1.139832,1.17064 c 0.558802,0.58297 1.358434,0.86405 2.15644,0.73935 l 23.227934,-3.60434 c 0.772991,-0.11988 1.456644,-0.60023 1.81757,-1.29386 l 62.814004,-120.82222 39.95574,0 c 0.89584,0 1.71899,-0.48182 2.15644,-1.263065 l 4.55933,-8.194463 c 0.42512,-0.761537 0.41033,-1.682025 -0.0308,-2.4337 -0.44115,-0.752912 -1.2532,-1.23225 -2.12564,-1.23225 l -37.89172,0 11.58316,-23.844062 0.0308,-0.0308 c 2.64355,-5.680688 5.57101,-11.577 10.41252,-15.988463 2.42384,-2.211887 5.31224,-4.079988 8.99544,-5.421913 3.68196,-1.340687 8.17722,-2.155199 13.73959,-2.156437 3.99619,-0.0038 7.9776,0.940212 11.95284,1.9408 3.97524,0.988263 7.91475,2.054163 11.98364,2.064025 2.12317,0.0025 4.06766,-0.5422 5.69916,-1.386287 2.45711,-1.27415 4.25866,-3.180438 5.48352,-5.083038 0.61243,-0.956225 1.08562,-1.906287 1.41709,-2.834175 0.32901,-0.93405 0.51754,-1.834825 0.5237,-2.772562 0.002,-0.941438 -0.20331,-1.859475 -0.58531,-2.68015 -0.67527,-1.445425 -1.82004,-2.48545 -3.08062,-3.265463 -1.90753,-1.169412 -4.18351,-1.838525 -6.65417,-2.279662 -2.47066,-0.433763 -5.12,-0.6149 -7.73237,-0.616125 z"
                                                />
                                            </svg>
                                        );
                                    }
                                    if (plugin.id === 'unifi') {
                                        return (
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="0 0 24 24"
                                                className="w-6 h-6"
                                            >
                                                <path
                                                    fill="#1fb0ec"
                                                    d="M5.343 4.222h1.099v1.1H5.343zm7.438 14.435a7.2 7.2 0 0 1-3.51-.988a6.5 6.5 0 0 0 2.947 3.936l.69.38c5.052-.337 8.009-3.6 8.009-7.863v-.924c-1.201 3.918-3.995 5.66-8.136 5.475m-4.107-2.291V8.355H7.562v4.1H6.448V10h-1.11v1.1H4.225V5.042H3.113v9.063c0 4.508 3.3 7.9 8.888 7.9a6.82 6.82 0 0 1-3.327-5.639M7.562 4.772h1.112v1.1H7.562zM3.113 2h1.112v1.111H3.113zm2.231 5.805h1.1v1.1h-1.1zm1.111-1.649h1.1v1.1h-1.1zm-.006-3.045h1.113V4.21H6.449zm8.876 2.677v10.577a9 9 0 0 1-.164 1.7c2.671-.486 4.414-2.137 5.3-5.014l.431-1.407V2.012c-5.042 0-5.567 1.931-5.567 3.776"
                                                />
                                            </svg>
                                        );
                                    }
                                    return (
                                        <Activity size={12} className="text-gray-400" />
                                    );
                                };

                                        return (
                                            <div
                                        key={plugin.id}
                                                className={`rounded border border-gray-800 bg-[#111111] px-3 py-2 text-xs flex flex-col gap-1.5 ${
                                                    onPluginClick ? 'cursor-pointer' : ''
                                                }`}
                                                onClick={() => onPluginClick?.(plugin.id)}
                                                title={onPluginClick ? `Cliquer pour configurer ${plugin.name}` : undefined}
                                    >
                                        {/* Header: plugin name, version and status */}
                                        <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex items-center justify-center">
                                                        {renderPluginIcon()}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-gray-200 font-medium">
                                                            {plugin.name}
                                                        </span>
                                                <span className="text-[10px] text-gray-500">
                                                    Version {plugin.version || 'n/a'}
                                                </span>
                                                    </div>
                                                </div>
                                            <div>
                                                {isActive ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/30 border border-emerald-700 text-emerald-400">
                                                        <CheckCircle size={10} />
                                                        Actif
                                                    </span>
                                                ) : plugin.enabled ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-900/30 border border-yellow-700 text-yellow-400">
                                                        <AlertCircle size={10} />
                                                        Config requise
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-800/50 border border-gray-700 text-gray-500">
                                                        <XCircle size={10} />
                                                        Désactivé
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Meta-information: API mode, stats source and timing */}
                                        <div className="flex flex-col gap-1 mt-1.5">
                                            <div className="flex items-center justify-between text-[11px] text-gray-400">
                                                <span>
                                                    API&nbsp;:
                                                    <span className="ml-1 text-gray-300">
                                                        {apiMode || 'n/a'}
                                                    </span>
                                                </span>
                                                <span>
                                                    Status&nbsp;:
                                                    <span className="ml-1 text-gray-300">
                                                        {hasStats ? 'OK' : 'indispo'}
                                                    </span>
                                                </span>
                                            </div>

                                            {(source || executionMs !== undefined) && (
                                                <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-gray-500">
                                                    {source && (
                                                        <span className="truncate max-w-[60%]">
                                                            Source&nbsp;:{' '}
                                                            <span className="text-gray-300">
                                                                {source}
                                                            </span>
                                                        </span>
                                                    )}
                                                    {executionMs !== undefined && (
                                                        <span>
                                                            Temps&nbsp;:
                                                            <span className="ml-1 text-gray-300">
                                                                {executionMs} ms
                                                            </span>
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {!hasStats && plugin.enabled && (
                                                <span className="text-[10px] text-yellow-500">
                                                    Statistiques non disponibles (voir logs backend).
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Quick summary of active plugins */}
                    <div className="pt-3 border-t border-gray-800">
                        <p className="text-[11px] text-gray-500">
                            Plugins actifs :{' '}
                            <span className="text-gray-200 font-medium">
                                {activePlugins.length} / {plugins.length}
                            </span>
                        </p>
                    </div>
                </div>
            )}
        </Card>
    );
};

