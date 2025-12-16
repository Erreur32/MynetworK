/**
 * System Network Widget
 * 
 * Displays system network traffic with graphs (similar to FreeboxOS)
 */

import React, { useEffect, useState } from 'react';
import { Card } from './Card';
import { BarChart } from './BarChart';
import { Activity, RefreshCw } from 'lucide-react';
import { api } from '../../api/client';
import { usePolling } from '../../hooks/usePolling';
import { POLLING_INTERVALS, formatSpeed } from '../../utils/constants';

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

export const SystemNetworkWidget: React.FC = () => {
    const [networkData, setNetworkData] = useState<SystemNetworkData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchNetworkData = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await api.get<SystemNetworkData>('/api/system/server/network');
            if (response.success && response.result) {
                setNetworkData(response.result);
            } else {
                // Don't set error if API returns success but empty data
                if (response.result) {
                    setNetworkData(response.result);
                } else {
                    setError('Données réseau non disponibles');
                }
            }
        } catch (err) {
            // On error, set empty data instead of error state
            console.error('Network data error:', err);
            setNetworkData({
                current: { download: 0, upload: 0 },
                history: []
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchNetworkData();
    }, []);

    // Poll every 5 seconds for real-time updates
    usePolling(fetchNetworkData, {
        enabled: true,
        interval: 5000
    });

    if (isLoading && !networkData) {
        return (
            <Card 
                title="Trafic Réseau Système"
                actions={
                    <button
                        onClick={fetchNetworkData}
                        className="p-1 hover:bg-[#1a1a1a] rounded transition-colors"
                        title="Actualiser"
                    >
                        <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                }
            >
                <div className="text-center py-8 text-gray-500">
                    <RefreshCw size={24} className="mx-auto mb-2 animate-spin" />
                    <p className="text-sm">Chargement...</p>
                </div>
            </Card>
        );
    }

    if (error && !networkData) {
        return (
            <Card title="Trafic Réseau Système">
                <div className="text-center py-8 text-gray-500">
                    <Activity size={24} className="mx-auto mb-2" />
                    <p className="text-sm">{error}</p>
                    <p className="text-xs mt-2 text-gray-600">
                        Les statistiques réseau de la machine host ne sont pas disponibles
                    </p>
                </div>
            </Card>
        );
    }

    if (!networkData) {
        return (
            <Card title="Trafic Réseau Système">
                <div className="text-center py-8 text-gray-500">
                    <Activity size={24} className="mx-auto mb-2" />
                    <p className="text-sm">Chargement des données réseau...</p>
                </div>
            </Card>
        );
    }

    const currentDownload = networkData.current.download > 0 
        ? formatSpeed(networkData.current.download) 
        : '0 kb/s';
    const currentUpload = networkData.current.upload > 0 
        ? formatSpeed(networkData.current.upload) 
        : '0 kb/s';

    // Convert history to format expected by BarChart
    const history = networkData.history || [];

    return (
        <Card
            title="Trafic Réseau Système"
            actions={
                <button
                    onClick={fetchNetworkData}
                    className="p-1 hover:bg-[#1a1a1a] rounded transition-colors"
                    title="Actualiser"
                >
                    <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                </button>
            }
        >
            <div className="flex flex-col gap-4">
                <BarChart
                    data={history}
                    dataKey="download"
                    color="#3b82f6"
                    title="Descendant en temps réel"
                    currentValue={currentDownload.split(' ')[0]}
                    unit={currentDownload.split(' ')[1] || 'kb/s'}
                    trend="down"
                />
                <BarChart
                    data={history}
                    dataKey="upload"
                    color="#10b981"
                    title="Montant en temps réel"
                    currentValue={currentUpload.split(' ')[0]}
                    unit={currentUpload.split(' ')[1] || 'kb/s'}
                    trend="up"
                />
            </div>
        </Card>
    );
};

