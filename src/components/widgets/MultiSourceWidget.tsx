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
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, AlertCircle, ExternalLink, Activity } from 'lucide-react';
import { usePluginStore, type PluginStats } from '../../stores/pluginStore';
import { useAuthStore } from '../../stores/authStore';
import { getFreeboxSettingsUrl, PERMISSION_LABELS } from '../../utils/permissions';
import { Card } from './Card';

interface MultiSourceWidgetProps {
    className?: string;
    onPluginClick?: (pluginId: string) => void;
}

export const MultiSourceWidget: React.FC<MultiSourceWidgetProps> = ({ className = '', onPluginClick }) => {
    const { t, i18n } = useTranslation();
    const { plugins, pluginStats } = usePluginStore();
    const { permissions, freeboxUrl } = useAuthStore();
    const dateLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';

    const activePlugins = plugins.filter((plugin) => plugin.enabled && plugin.connectionStatus);
    
    // Check if Freebox plugin has missing permissions
    const freeboxPlugin = plugins.find(p => p.id === 'freebox');
    const hasSettingsPermission = permissions.settings === true;
    const showFreeboxPermissionWarning = freeboxPlugin?.enabled && !hasSettingsPermission;

    return (
        <Card
            title={t('dashboard.pluginsState.title')}
            actions={
                <div className="text-xs text-gray-500">
                    {t('dashboard.pluginsState.activeCount')}{' '}
                    <span className="text-gray-200 font-medium">
                        {activePlugins.length} / {plugins.length}
                    </span>
                </div>
            }
            className={className}
        >
            {plugins.length === 0 ? (
                <div className="text-center py-8">
                    <AlertCircle size={32} className="mx-auto text-gray-600 mb-2" />
                    <p className="text-gray-500 text-sm">{t('dashboard.pluginsState.noPlugin')}</p>
                    <p className="text-gray-600 text-xs mt-1">
                        {t('dashboard.pluginsState.noPluginHint')}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Freebox Permission Warning */}
                    {showFreeboxPermissionWarning && (
                        <div className="mb-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                            <div className="flex items-start gap-2">
                                <AlertCircle size={16} className="text-orange-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-semibold text-orange-400 mb-1">
                                        {t('dashboard.pluginsState.freeboxPermissionTitle')}
                                    </div>
                                    <div className="text-[11px] text-orange-300/90 mb-2">
                                        {t('dashboard.pluginsState.freeboxPermissionDesc', { label: PERMISSION_LABELS.settings || 'settings' })}
                                    </div>
                                    <a
                                        href={getFreeboxSettingsUrl(freeboxUrl)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-[11px] text-orange-400 hover:text-orange-300 underline"
                                    >
                                        {t('dashboard.pluginsState.freeboxPermissionLink')}
                                        <ExternalLink size={12} />
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}
                    <div>
                        <div className="flex flex-col gap-3">
                            {plugins.map((plugin) => {
                                const stats = pluginStats[plugin.id] as PluginStats | null | undefined;
                                const hasStats = !!stats;
                                const isActive = plugin.enabled && plugin.connectionStatus;

                                // Get API information from pluginStats.system (where firmware/apiVersion are stored)
                                // Fallback to plugin properties if not available in stats (for backward compatibility)
                                const systemStats = stats?.system as any;
                                const apiMode = plugin.apiMode || systemStats?.apiMode;
                                const apiVersion = plugin.apiVersion || systemStats?.apiVersion;
                                // For UniFi, firmware is stored as 'version' in systemStats
                                const controllerFirmware = plugin.controllerFirmware || systemStats?.controllerFirmware || systemStats?.version;
                                const firmware = plugin.firmware || systemStats?.firmware;
                                const playerFirmware = plugin.playerFirmware || systemStats?.playerFirmware;

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
                                                onClick={() => onPluginClick?.()}
                                                title={onPluginClick ? `${t('dashboard.pluginsState.goToAdmin')} ${plugin.name}` : undefined}
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
                                                    {(() => {
                                                        // Display real firmware version instead of plugin code version
                                                        // Get firmware from systemStats (where it's stored after getStats call)
                                                        const systemStats = stats?.system as any;
                                                        const freeboxFirmware = plugin.firmware || systemStats?.firmware;
                                                        const unifiFirmware = plugin.controllerFirmware || systemStats?.controllerFirmware || systemStats?.version;
                                                        
                                                        if (plugin.id === 'freebox' && freeboxFirmware) {
                                                            return t('dashboard.pluginsState.firmware', { version: freeboxFirmware });
                                                        } else if (plugin.id === 'unifi' && unifiFirmware) {
                                                            return t('dashboard.pluginsState.firmware', { version: unifiFirmware });
                                                        }
                                                        return t('dashboard.pluginsState.version', { version: plugin.version || 'n/a' });
                                                    })()}
                                                </span>
                                                    </div>
                                                </div>
                                            <div className="flex items-center gap-1.5">
                                                {isActive ? (
                                                    <>
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/30 border border-emerald-700 text-emerald-400">
                                                            <CheckCircle size={10} />
                                                            {t('dashboard.pluginsState.statusActive')}
                                                        </span>
                                                        {hasStats ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-900/30 border border-blue-700 text-blue-400">
                                                                <CheckCircle size={10} />
                                                                {t('dashboard.pluginsState.statusOk')}
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-900/30 border border-yellow-700 text-yellow-400">
                                                                <AlertCircle size={10} />
                                                                {t('dashboard.pluginsState.statusUnavailable')}
                                                            </span>
                                                        )}
                                                    </>
                                                ) : plugin.enabled ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-900/30 border border-yellow-700 text-yellow-400">
                                                        <AlertCircle size={10} />
                                                        {t('dashboard.pluginsState.configRequired')}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-800/50 border border-gray-700 text-gray-500">
                                                        <XCircle size={10} />
                                                        {t('dashboard.pluginsState.disabled')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Meta-information: API info, stats source and timing */}
                                        <div className="flex flex-col gap-1 mt-1.5">
                                            {/* Plugin-specific API information */}
                                            {isActive && (
                                                <div className="flex flex-col gap-1.5 text-[11px] text-gray-400 mb-1 p-2 bg-gray-900/30 rounded border border-gray-800/50">
                                                    {plugin.id === 'freebox' && (
                                                        <>
                                                    {(apiVersion || systemStats?.apiVersion) && (
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-gray-500">{t('dashboard.pluginsState.apiVersion')}</span>
                                                            <span className="text-cyan-400 font-mono font-medium text-xs">
                                                                {systemStats?.apiVersion || apiVersion}
                                                            </span>
                                                        </div>
                                                    )}
                                                            {firmware && (
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-gray-500">{t('dashboard.pluginsState.firmwareBox')}</span>
                                                                    <span className="text-gray-200 font-mono font-medium text-xs">
                                                                        {firmware}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {playerFirmware && (
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-gray-500">{t('dashboard.pluginsState.firmwarePlayer')}</span>
                                                                    <span className="text-gray-200 font-mono font-medium text-xs">
                                                                        {playerFirmware}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                    {plugin.id === 'unifi' && (
                                                        <>
                                                            {apiMode && (
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-gray-500">{t('dashboard.pluginsState.apiMode')}</span>
                                                                    <span className="text-purple-400 font-mono font-medium text-xs">
                                                                        {apiMode}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {controllerFirmware && (
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-gray-500">{t('dashboard.pluginsState.firmwareVersion')}</span>
                                                                    <span className="text-gray-200 font-mono font-medium text-xs">
                                                                        {controllerFirmware}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                    {plugin.id === 'scan-reseau' && (() => {
                                                        const scanStats = pluginStats?.['scan-reseau']?.system as any;
                                                        const lastScan = scanStats?.lastScan ? new Date(scanStats.lastScan) : null;
                                                        
                                                        const formatLastScan = (date: Date | null): string => {
                                                            if (!date) return t('dashboard.pluginsState.scanPending');
                                                            const now = new Date();
                                                            const diffMs = now.getTime() - date.getTime();
                                                            const diffMins = Math.floor(diffMs / 60000);
                                                            const diffHours = Math.floor(diffMs / 3600000);
                                                            const diffDays = Math.floor(diffMs / 86400000);
                                                            if (diffMins < 1) return t('dashboard.pluginsState.justNow');
                                                            if (diffMins < 60) return t('dashboard.pluginsState.agoMins', { count: diffMins });
                                                            if (diffHours < 24) return t('dashboard.pluginsState.agoHours', { count: diffHours });
                                                            if (diffDays < 7) return t('dashboard.pluginsState.agoDays', { count: diffDays });
                                                            return date.toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                                                        };
                                                        return (
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-gray-500">{t('dashboard.pluginsState.lastScan')}</span>
                                                                <span className={`font-mono font-medium text-xs ${lastScan ? 'text-gray-200' : 'text-yellow-400'}`}>
                                                                    {formatLastScan(lastScan)}
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            )}

                                            {/* Source and timing info */}
                                            {(source || executionMs !== undefined) && (
                                                <div className="flex items-center justify-between text-[10px] text-gray-500 pt-1 border-t border-gray-800">
                                                    {source && (
                                                        <span className="truncate max-w-[60%]">
                                                            {t('dashboard.pluginsState.source')} <span className="text-gray-300">{source}</span>
                                                        </span>
                                                    )}
                                                    {executionMs !== undefined && (
                                                        <span>
                                                            {t('dashboard.pluginsState.time')} <span className="text-gray-300">{executionMs} ms</span>
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {!hasStats && plugin.enabled && (
                                                <span className="text-[10px] text-yellow-500">
                                                    {t('dashboard.pluginsState.statsUnavailable')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
};

