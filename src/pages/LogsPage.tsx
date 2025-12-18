/**
 * Logs Viewing Page
 * 
 * Page for viewing activity logs (admin only)
 */

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Filter, RefreshCw, Calendar, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { api } from '../api/client';
import { useUserAuthStore } from '../stores/userAuthStore';
import { Card } from '../components/widgets/Card';

interface Log {
    id: number;
    userId?: number;
    username?: string;
    pluginId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    level: 'info' | 'warning' | 'error';
    timestamp: string;
    ipAddress?: string;
}

interface LogsPageProps {
    onBack: () => void;
}

export const LogsPage: React.FC<LogsPageProps> = ({ onBack }) => {
    const { user: currentUser } = useUserAuthStore();
    const [logs, setLogs] = useState<Log[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'info' | 'warning' | 'error'>('all');
    const [limit, setLimit] = useState(50);

    useEffect(() => {
        if (currentUser?.role === 'admin') {
            fetchLogs();
        }
    }, [currentUser, filter, limit]);

    const fetchLogs = async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                limit: limit.toString()
            });
            if (filter !== 'all') {
                params.append('level', filter);
            }

            const response = await api.get<{ logs: Log[]; total: number }>(`/api/logs?${params}`);
            if (response.success && response.result) {
                setLogs(response.result.logs);
            } else {
                // Handle API error response
                const errorMsg = response.error?.message;
                if (errorMsg && !errorMsg.includes('socket') && !errorMsg.includes('ECONNRESET')) {
                    console.error('Failed to fetch logs:', errorMsg);
                }
            }
        } catch (err: any) {
            // Handle network/socket errors silently
            const errorMessage = err.message || err.error?.message || '';
            if (errorMessage && !errorMessage.includes('socket') && !errorMessage.includes('ECONNRESET')) {
                console.error('Failed to fetch logs:', errorMessage);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const getLevelIcon = (level: string) => {
        switch (level) {
            case 'error':
                return <AlertCircle size={14} className="text-red-400" />;
            case 'warning':
                return <AlertTriangle size={14} className="text-yellow-400" />;
            default:
                return <Info size={14} className="text-blue-400" />;
        }
    };

    const formatAction = (action: string) => {
        return action.replace(/\./g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    if (currentUser?.role !== 'admin') {
        return (
            <div className="min-h-screen bg-[#050505] text-gray-300 flex items-center justify-center">
                <div className="text-center">
                    <AlertCircle size={48} className="mx-auto text-gray-600 mb-4" />
                    <p className="text-gray-400">Accès administrateur requis</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050505] text-gray-300">
            <div className="max-w-7xl mx-auto p-6">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-[#1a1a1a] rounded transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-2xl font-semibold">Logs d'Activité</h1>
                    <button
                        onClick={fetchLogs}
                        className="ml-auto p-2 hover:bg-[#1a1a1a] rounded transition-colors"
                        title="Actualiser"
                    >
                        <RefreshCw size={20} />
                    </button>
                </div>

                {/* Filters */}
                <Card title="Filtres" className="mb-6">
                    <div className="flex flex-wrap gap-2">
                        {(['all', 'info', 'warning', 'error'] as const).map((level) => (
                            <button
                                key={level}
                                onClick={() => setFilter(level)}
                                className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                                    filter === level
                                        ? 'bg-blue-900/30 border-blue-700 text-blue-400'
                                        : 'bg-[#1a1a1a] border-gray-700 text-gray-400 hover:bg-[#252525]'
                                }`}
                            >
                                {level === 'all' ? 'Tous' : level.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </Card>

                {/* Logs List */}
                {isLoading ? (
                    <div className="text-center py-12 text-gray-500">Chargement...</div>
                ) : (
                    <div className="space-y-2">
                        {logs.map((log) => (
                            <div
                                key={log.id}
                                className="bg-[#1a1a1a] border border-gray-700 rounded p-3 flex items-start gap-3"
                            >
                                <div className="mt-0.5">
                                    {getLevelIcon(log.level)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-sm font-medium text-white">
                                            {formatAction(log.action)}
                                        </span>
                                        <span className="text-xs text-gray-500">sur</span>
                                        <span className="text-sm text-gray-400">{log.resource}</span>
                                        {log.pluginId && (
                                            <span className="px-1.5 py-0.5 bg-purple-900/30 border border-purple-700 rounded text-xs text-purple-400">
                                                {log.pluginId}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-gray-500">
                                        {log.username && (
                                            <span>Par {log.username}</span>
                                        )}
                                        <span>{new Date(log.timestamp).toLocaleString('fr-FR')}</span>
                                        {log.ipAddress && (
                                            <span>IP: {log.ipAddress}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {logs.length === 0 && (
                            <div className="text-center py-12 text-gray-500">
                                Aucun log trouvé
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

