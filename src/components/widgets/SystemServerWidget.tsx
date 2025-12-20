/**
 * System Server Widget
 * 
 * Displays server system information (CPU, RAM, Disk, Docker)
 * Compatible with Docker containers
 */

import React, { useEffect, useState } from 'react';
import { Card } from './Card';
import { BarChart } from './BarChart';
import { Cpu, HardDrive, MemoryStick, Server, CheckCircle, XCircle, Activity, Loader2 } from 'lucide-react';
import { api } from '../../api/client';
import { usePolling } from '../../hooks/usePolling';
import { POLLING_INTERVALS, formatSpeed } from '../../utils/constants';

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
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
    const [networkData, setNetworkData] = useState<SystemNetworkData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isNetworkLoading, setIsNetworkLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSystemInfo = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await api.get<SystemInfo>('/api/system/server');
            if (response.success && response.result) {
                setSystemInfo(response.result);
                // Debug: Log Docker stats to console (only in verbose mode)
                if (response.result.docker && import.meta.env.DEV && import.meta.env.VITE_DEBUG === 'true') {
                    console.log('[SystemServerWidget] Docker detected:', {
                        docker: response.result.docker,
                        dockerVersion: response.result.dockerVersion,
                        dockerStats: response.result.dockerStats
                    });
                }
            } else {
                setError('Failed to fetch system info');
            }
        } catch (err) {
            setError('Error fetching system info');
            console.error('System info error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchNetworkData = async () => {
        // Legacy network section removed from this widget (now handled by dedicated bandwidth widgets)
        setIsNetworkLoading(false);
    };

    useEffect(() => {
        fetchSystemInfo();
        fetchNetworkData();
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
            <Card title="Système Serveur">
                <div className="text-center py-8 text-gray-500">
                    <Loader2 size={24} className="mx-auto mb-2 animate-spin" />
                    <p className="text-sm">Chargement...</p>
                </div>
            </Card>
        );
    }

    if (error && !systemInfo) {
        return (
            <Card title="Système Serveur">
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
            title="Système Serveur"
        >
            <div className="space-y-4">
                {/* CPU */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-gray-400">
                            <Cpu size={16} /> CPU
                        </span>
                        <span className="text-white">
                            {systemInfo.cpu.cores} cores
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
                        <span>Libre: {formatBytes(systemInfo.memory.free)}</span>
                        <span>{(systemInfo.memory.percentage ?? 0).toFixed(1)}%</span>
                    </div>
                </div>

                {/* Disks - Show all disks if available, otherwise show single disk */}
                {systemInfo.disks && systemInfo.disks.length > 0 ? (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                            <HardDrive size={16} />
                            <span>Disques ({systemInfo.disks.length})</span>
                        </div>
                        {systemInfo.disks.map((disk, index) => (
                            <div key={index} className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-400 font-mono text-xs">
                                        {disk.mount}
                                    </span>
                                    <span className="text-white text-xs">
                                        {formatBytes(disk.used)} / {formatBytes(disk.total)}
                                    </span>
                                </div>
                                <div className="w-full bg-[#1a1a1a] rounded-full h-2">
                                    <div
                                        className="bg-fuchsia-500 h-2 rounded-full transition-all"
                                        style={{ width: `${Math.min(disk.percentage ?? 0, 100)}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs text-gray-500">
                                    <span>Libre: {formatBytes(disk.free)}</span>
                                    <span>{(disk.percentage ?? 0).toFixed(1)}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : systemInfo.disk.total > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 text-gray-400">
                                <HardDrive size={16} /> Disque
                            </span>
                            <span className="text-white">
                                {formatBytes(systemInfo.disk.used)} / {formatBytes(systemInfo.disk.total)}
                            </span>
                        </div>
                        <div className="w-full bg-[#1a1a1a] rounded-full h-2">
                            <div
                                className="bg-fuchsia-500 h-2 rounded-full transition-all"
                                style={{ width: `${Math.min(systemInfo.disk.percentage ?? 0, 100)}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                            <span>Libre: {formatBytes(systemInfo.disk.free)}</span>
                            <span>{(systemInfo.disk.percentage ?? 0).toFixed(1)}%</span>
                        </div>
                    </div>
                )}

                {/* Docker Status */}
                {(systemInfo.docker || systemInfo.dockerStats) && (
                    <div className="space-y-2 bg-[#05151a] px-3 py-2 rounded border border-cyan-900/60">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 text-cyan-400">
                                <Server size={14} />
                                <span className="font-semibold text-sm">Docker</span>
                            </div>
                            {systemInfo.dockerVersion && (
                                <div className="text-xs text-cyan-300">
                                    v{systemInfo.dockerVersion.replace('Docker version ', '')}
                                </div>
                            )}
                        </div>
                        
                        {systemInfo.dockerStats ? (
                            <div className="space-y-2">
                                <div className="grid grid-cols-4 gap-2 text-xs">
                                    {/* Containers */}
                                    <div className="space-y-1">
                                        <div className="text-gray-400 text-[10px]">Containers</div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-1">
                                                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                                <span className="text-gray-300">{systemInfo.dockerStats.containers.running}</span>
                                            </div>
                                            <span className="text-gray-500">/</span>
                                            <span className="text-gray-400">{systemInfo.dockerStats.containers.total}</span>
                                        </div>
                                    </div>
                                    
                                    {/* Images */}
                                    <div className="space-y-1">
                                        <div className="text-gray-400 text-[10px]">Images</div>
                                        <div className="text-gray-300">{systemInfo.dockerStats.images}</div>
                                    </div>
                                    
                                    {/* Volumes */}
                                    <div className="space-y-1">
                                        <div className="text-gray-400 text-[10px]">Volumes</div>
                                        <div className="text-gray-300">{systemInfo.dockerStats.volumes}</div>
                                    </div>
                                    
                                    {/* Networks */}
                                    <div className="space-y-1">
                                        <div className="text-gray-400 text-[10px]">Networks</div>
                                        <div className="text-gray-300">{systemInfo.dockerStats.networks}</div>
                                    </div>
                                </div>
                                
                                {/* Disk Usage */}
                                {systemInfo.dockerStats.diskUsage && systemInfo.dockerStats.diskUsage.total > 0 && (
                                    <div className="space-y-1 pt-1 border-t border-cyan-900/40">
                                        <div className="text-gray-400 text-[10px]">Disk Usage</div>
                                        <div className="text-gray-300">{formatBytes(systemInfo.dockerStats.diskUsage.total)}</div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-xs text-gray-500 text-center py-2">
                                Stats Docker non disponibles
                                <div className="text-[10px] text-gray-600 mt-1">
                                    Vérifiez que le socket Docker est monté
                            </div>
                        </div>
                        )}
                    </div>
                )}

                {/* System Info */}
                <div className="pt-4 border-t border-gray-700 space-y-2 text-xs">
                    <div className="flex justify-between">
                        <span className="text-gray-500">Uptime</span>
                        <span className="text-gray-300">{formatUptime(systemInfo.uptime)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500">Hostname</span>
                        <span className="text-gray-300">{systemInfo.hostname}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500">Platform</span>
                        <span className="text-gray-300">{systemInfo.platform} ({systemInfo.arch})</span>
                    </div>
                    {/* Show Node.js version only in development mode */}
                    {import.meta.env.DEV && (
                        <div className="flex justify-between">
                            <span className="text-gray-500">Node.js</span>
                            <span className="text-gray-300">{systemInfo.nodeVersion}</span>
                        </div>
                    )}
                    {/* Show Docker version if available */}
                    {(systemInfo.dockerVersion || systemInfo.dockerStats?.version) && (
                        <div className="flex justify-between">
                            <span className="text-gray-500">Docker</span>
                            <span className="text-gray-300">
                                {(systemInfo.dockerVersion || systemInfo.dockerStats?.version || '').replace('Docker version ', '')}
                            </span>
                        </div>
                    )}
                </div>

                {/* Network Traffic */}
                {networkData && (
                    <div className="pt-4 border-t border-gray-700 space-y-4">
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                            <Activity size={16} />
                            <span>Trafic Réseau</span>
                        </div>
                        <div className="flex flex-col gap-3">
                            <BarChart
                                data={networkData.history || []}
                                dataKey="download"
                                color="#3b82f6"
                                title="Descendant"
                                currentValue={networkData.current.download > 0 
                                    ? formatSpeed(networkData.current.download).split(' ')[0] 
                                    : '0'}
                                unit={networkData.current.download > 0 
                                    ? formatSpeed(networkData.current.download).split(' ')[1] || 'kb/s'
                                    : 'kb/s'}
                                trend="down"
                            />
                            <BarChart
                                data={networkData.history || []}
                                dataKey="upload"
                                color="#10b981"
                                title="Montant"
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
            </div>
        </Card>
    );
};

