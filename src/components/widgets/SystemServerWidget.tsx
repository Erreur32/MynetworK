/**
 * System Server Widget
 * 
 * Displays server system information (CPU, RAM, Disk, Docker)
 * Compatible with Docker containers
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from './Card';
import { BarChart } from './BarChart';
import { Cpu, MemoryStick, CheckCircle, XCircle, Activity, Loader2, Database } from 'lucide-react';
import { RichTooltip } from '../ui/RichTooltip';
import { api } from '../../api/client';
import { usePolling } from '../../hooks/usePolling';
import { POLLING_INTERVALS, formatSpeed } from '../../utils/constants';
import type { NetworkStat as ChartNetworkStat } from '../../types';

interface DiskInfo {
    mount: string;
    total: number;
    free: number;
    used: number;
    percentage: number;
}

interface NetworkStat {
    timestamp: number;
    download: number;
    upload: number;
}

function historyForBarChart(history: NetworkStat[]): ChartNetworkStat[] {
    return history.map((h) => ({
        time: String(h.timestamp),
        download: h.download,
        upload: h.upload
    }));
}

interface SystemNetworkData {
    current: {
        download: number;
        upload: number;
    };
    history: NetworkStat[];
}

interface DockerStats {
    version: string | null;
    containers: {
        total: number;
        running: number;
        stopped: number;
        paused: number;
    };
    images: number;
    volumes: number;
    networks: number;
    diskUsage: {
        images: number;
        containers: number;
        volumes: number;
        buildCache: number;
        total: number;
    } | null;
}

interface DatabaseStats {
    pageSize: number;
    pageCount: number;
    cacheSize: number;
    synchronous: number;
    journalMode: string;
    walSize: number;
    dbSize: number;
}

interface SystemInfo {
    platform: string;
    arch: string;
    hostname: string;
    uptime: number;
    nodeVersion: string;
    docker: boolean;
    dockerVersion?: string | null;
    dockerStats?: DockerStats | null;
    cpu: {
        cores: number;
        model: string;
        usage: number;
    };
    memory: {
        total: number;
        free: number;
        used: number;
        percentage: number;
    };
    disk: {
        total: number;
        free: number;
        used: number;
        percentage: number;
    };
    disks?: DiskInfo[];
}

export const SystemServerWidget: React.FC = () => {
    const { t } = useTranslation();
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
    const [networkData, setNetworkData] = useState<SystemNetworkData | null>(null);
    const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
    const [dbHealth, setDbHealth] = useState<{ status: 'good' | 'warning' | 'critical' } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isNetworkLoading, setIsNetworkLoading] = useState(true);
    const [isDbLoading, setIsDbLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchSystemInfo = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await api.get<SystemInfo>('/api/system/server');
            if (response.success && response.result) {
                setSystemInfo(response.result);
            } else {
                setError(t('system.fetchError'));
            }
        } catch (err) {
            setError(t('system.fetchErrorShort'));
            console.error('System info error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchNetworkData = async () => {
        // Legacy network section removed from this widget (now handled by dedicated bandwidth widgets)
        setIsNetworkLoading(false);
    };

    const fetchDbStats = async () => {
        try {
            setIsDbLoading(true);
            const [statsRes, healthRes] = await Promise.all([
                api.get<DatabaseStats>('/api/database/stats'),
                api.get<{ status: 'good' | 'warning' | 'critical' }>('/api/database/health'),
            ]);
            if (statsRes.success && statsRes.result) {
                setDbStats(statsRes.result);
            }
            if (healthRes.success && healthRes.result) {
                setDbHealth(healthRes.result);
            }
        } catch (err) {
            // Silently fail - DB stats are optional
            console.debug('DB stats not available:', err);
        } finally {
            setIsDbLoading(false);
        }
    };

    useEffect(() => {
        fetchSystemInfo();
        fetchNetworkData();
        fetchDbStats();
    }, []);

    // Poll every 30 seconds
    usePolling(fetchSystemInfo, {
        enabled: true,
        interval: POLLING_INTERVALS.system
    });

    // Poll network data every 5 seconds (kept as no-op for backward compatibility)
    usePolling(fetchNetworkData, {
        enabled: false,
        interval: 5000
    });

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return 'N/A';
        const gb = bytes / (1024 * 1024 * 1024);
        if (gb >= 1) return `${gb.toFixed(2)} GB`;
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(2)} MB`;
    };

    const formatUptime = (seconds: number): string => {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) return `${days}j ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

    if (isLoading && !systemInfo) {
        return (
            <Card title={t('system.serverSystem')}>
                <div className="text-center py-8 text-gray-500">
                    <Loader2 size={24} className="mx-auto mb-2 animate-spin" />
                    <p className="text-sm">{t('common.loading')}</p>
                </div>
            </Card>
        );
    }

    if (error && !systemInfo) {
        return (
            <Card title={t('system.serverSystem')}>
                <div className="text-center py-8 text-red-500">
                    <XCircle size={24} className="mx-auto mb-2" />
                    <p className="text-sm">{error}</p>
                </div>
            </Card>
        );
    }

    if (!systemInfo) return null;

    return (
        <Card
            title={t('system.serverSystem')}
        >
            <div className="space-y-4">
                {/* CPU */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-gray-400">
                            <Cpu size={16} /> CPU
                        </span>
                        <span className="text-white">
                            {systemInfo.cpu.cores} {t('system.cores')}
                        </span>
                    </div>
                    <div className="w-full bg-[#1a1a1a] rounded-full h-2">
                        <div
                            className="bg-blue-500 h-2 rounded-full transition-all"
                            style={{ width: `${Math.min(systemInfo.cpu.usage ?? 0, 100)}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                        <span>{systemInfo.cpu.model}</span>
                        <span>{(systemInfo.cpu.usage ?? 0).toFixed(1)}%</span>
                    </div>
                </div>

                {/* RAM */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-gray-400">
                            <MemoryStick size={16} /> RAM
                        </span>
                        <span className="text-white">
                            {formatBytes(systemInfo.memory.used)} / {formatBytes(systemInfo.memory.total)}
                        </span>
                    </div>
                    <div className="w-full bg-[#1a1a1a] rounded-full h-2">
                        <div
                            className="bg-green-500 h-2 rounded-full transition-all"
                            style={{ width: `${Math.min(systemInfo.memory.percentage ?? 0, 100)}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                        <span>{t('system.free')} {formatBytes(systemInfo.memory.free)}</span>
                        <span>{(systemInfo.memory.percentage ?? 0).toFixed(1)}%</span>
                    </div>
                </div>


                {/* Database Stats */}
                {dbStats && (
                    <div className="pt-4 border-t border-gray-700 space-y-2 bg-[#05151a] px-3 py-2 rounded border border-purple-900/60">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 text-purple-400">
                                <Database size={14} />
                                <span className="font-semibold text-sm">{t('system.database')}</span>
                            </div>
                            {dbHealth ? (
                                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                    dbHealth.status === 'good'
                                        ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/50'
                                        : dbHealth.status === 'warning'
                                            ? 'bg-amber-900/40 text-amber-400 border border-amber-700/50'
                                            : 'bg-red-900/40 text-red-400 border border-red-700/50'
                                }`}>
                                    {dbHealth.status === 'good' ? <CheckCircle size={10} /> : <XCircle size={10} />}
                                    {dbHealth.status === 'good' ? 'OK' : dbHealth.status === 'warning' ? 'Warning' : 'Critical'}
                                </span>
                            ) : (
                                <span className="text-xs text-purple-300">{dbStats.journalMode}</span>
                            )}
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400">{t('system.size')}</span>
                                <span className="text-gray-300 font-medium">
                                    {formatBytes(dbStats.dbSize)}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* System Info */}
                <div className="pt-4 border-t border-gray-700 space-y-2 text-xs">
                    <div className="flex justify-between">
                        <span className="text-gray-500">{t('system.hostname')}</span>
                        <span className="text-gray-300">{systemInfo.hostname}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500">{t('system.platform')}</span>
                        <span className="text-gray-300">{systemInfo.platform} ({systemInfo.arch})</span>
                    </div>
                    {import.meta.env.DEV && (
                        <div className="flex justify-between">
                            <span className="text-gray-500">Node.js</span>
                            <span className="text-gray-300">{systemInfo.nodeVersion}</span>
                        </div>
                    )}
                </div>

                {/* Network Traffic */}
                {networkData && (
                    <div className="pt-4 border-t border-gray-700 space-y-4">
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                            <Activity size={16} />
                            <span>{t('system.networkTraffic')}</span>
                        </div>
                        <div className="flex flex-col gap-3">
                            <BarChart
                                data={historyForBarChart(networkData.history || [])}
                                dataKey="download"
                                color="#3b82f6"
                                title={t('system.download')}
                                currentValue={networkData.current.download > 0 
                                    ? formatSpeed(networkData.current.download).split(' ')[0] 
                                    : '0'}
                                unit={networkData.current.download > 0 
                                    ? formatSpeed(networkData.current.download).split(' ')[1] || 'kb/s'
                                    : 'kb/s'}
                                trend="down"
                            />
                            <BarChart
                                data={historyForBarChart(networkData.history || [])}
                                dataKey="upload"
                                color="#10b981"
                                title={t('system.upload')}
                                currentValue={networkData.current.upload > 0 
                                    ? formatSpeed(networkData.current.upload).split(' ')[0] 
                                    : '0'}
                                unit={networkData.current.upload > 0 
                                    ? formatSpeed(networkData.current.upload).split(' ')[1] || 'kb/s'
                                    : 'kb/s'}
                                trend="up"
                            />
                        </div>
                    </div>
                )}

                {/* Uptime en pied de carte */}
                {systemInfo.uptime && (() => {
                    const uptimeSeconds = systemInfo.uptime;
                    const hours = Math.floor(uptimeSeconds / 3600);
                    const days = Math.floor(hours / 24);
                    const label = days > 0
                        ? (hours % 24 > 0 ? `${days}j ${hours % 24}h` : `${days}j`)
                        : `${hours}h`;
                    const badgeColor = days >= 30
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : days >= 7 ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                        : days >= 1 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                        : 'bg-red-500/20 text-red-400 border-red-500/30';
                    return (
                        <div className="mt-3 pt-2 border-t border-gray-800 flex items-center justify-between text-[11px] text-gray-400">
                            <span className="flex items-center gap-1">
                                {t('system.uptime')}
                                <RichTooltip
                                    title={t('system.uptime')}
                                    description={t('system.uptimeTooltipDesc')}
                                    rows={[
                                        { label: '30+ ' + t('system.uptimeDays'), value: t('system.uptimeStable'), color: 'emerald', dot: true },
                                        { label: '7-30 ' + t('system.uptimeDays'), value: t('system.uptimeNormal'), color: 'blue', dot: true },
                                        { label: '1-7 ' + t('system.uptimeDays'), value: t('system.uptimeRecent'), color: 'amber', dot: true },
                                        { label: '< 24h', value: t('system.uptimeJustStarted'), color: 'red', dot: true },
                                    ]}
                                    position="top"
                                    width={220}
                                    iconSize={11}
                                />
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badgeColor}`}>
                                {label}
                            </span>
                        </div>
                    );
                })()}
            </div>
        </Card>
    );
};

