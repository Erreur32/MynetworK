/**
 * Logs Management Section
 * 
 * Component for viewing logs within Administration settings
 */

import React, { useEffect, useState } from 'react';
import { Filter, RefreshCw, AlertCircle, Info, AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { useUserAuthStore } from '../stores/userAuthStore';
import { Section, SettingRow } from '../pages/SettingsPage';

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

export const LogsManagementSection: React.FC = () => {
    const { user: currentUser } = useUserAuthStore();
    const [logs, setLogs] = useState<Log[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
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
            }
        } catch (err) {
            console.error('Failed to fetch logs:', err);
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

    const formatDate = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const handleDeleteAll = async () => {
        if (!confirm('Êtes-vous sûr de vouloir supprimer tous les logs ? Cette action est irréversible.')) {
            return;
        }

        setIsDeleting(true);
        try {
            const response = await api.delete<{ deletedCount: number }>('/api/logs');
            if (response.success && response.result) {
                setLogs([]);
                alert(`Tous les logs ont été supprimés (${response.result.deletedCount} entrées)`);
            } else {
                throw new Error(response.error?.message || 'Échec de la suppression');
            }
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Erreur lors de la suppression des logs');
        } finally {
            setIsDeleting(false);
        }
    };

    if (currentUser?.role !== 'admin') {
        return (
            <Section title="Journal des événements" icon={Filter}>
                <div className="text-center py-8 text-gray-500">
                    <AlertCircle size={32} className="mx-auto mb-2" />
                    <p>Accès administrateur requis</p>
                </div>
            </Section>
        );
    }

    return (
        <Section title="Journal des événements" icon={Filter}>
            <div className="space-y-4">
                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setFilter('all')}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                            filter === 'all'
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-[#1a1a1a] border-gray-700 text-gray-400 hover:border-gray-600'
                        }`}
                    >
                        Tous
                    </button>
                    <button
                        onClick={() => setFilter('info')}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1 ${
                            filter === 'info'
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-[#1a1a1a] border-gray-700 text-gray-400 hover:border-gray-600'
                        }`}
                    >
                        <Info size={12} />
                        Info
                    </button>
                    <button
                        onClick={() => setFilter('warning')}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1 ${
                            filter === 'warning'
                                ? 'bg-yellow-600 border-yellow-500 text-white'
                                : 'bg-[#1a1a1a] border-gray-700 text-gray-400 hover:border-gray-600'
                        }`}
                    >
                        <AlertTriangle size={12} />
                        Avertissement
                    </button>
                    <button
                        onClick={() => setFilter('error')}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1 ${
                            filter === 'error'
                                ? 'bg-red-600 border-red-500 text-white'
                                : 'bg-[#1a1a1a] border-gray-700 text-gray-400 hover:border-gray-600'
                        }`}
                    >
                        <AlertCircle size={12} />
                        Erreur
                    </button>
                    <button
                        onClick={fetchLogs}
                        disabled={isLoading}
                        className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                        <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                        Actualiser
                    </button>
                    <button
                        onClick={handleDeleteAll}
                        disabled={isDeleting || logs.length === 0}
                        className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                        {isDeleting ? (
                            <Loader2 size={12} className="animate-spin" />
                        ) : (
                            <Trash2 size={12} />
                        )}
                        Effacer tous les logs
                    </button>
                </div>

                {/* Logs List */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <RefreshCw size={32} className="text-gray-400 animate-spin" />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        <Info size={32} className="mx-auto mb-2" />
                        <p>Aucun log trouvé</p>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[600px] overflow-y-auto">
                        {logs.map((log) => (
                            <div
                                key={log.id}
                                className={`p-3 rounded-lg border-l-4 transition-colors ${
                                    log.level === 'error'
                                        ? 'bg-red-950/40 border-red-500 border-r border-t border-b border-red-700/60 hover:bg-red-950/50'
                                        : log.level === 'warning'
                                        ? 'bg-yellow-950/40 border-yellow-500 border-r border-t border-b border-yellow-700/60 hover:bg-yellow-950/50'
                                        : 'bg-blue-950/30 border-blue-500 border-r border-t border-b border-blue-700/40 hover:bg-blue-950/40'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-2 flex-1">
                                        {getLevelIcon(log.level)}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`text-sm font-medium ${
                                                    log.level === 'error'
                                                        ? 'text-red-300'
                                                        : log.level === 'warning'
                                                        ? 'text-yellow-300'
                                                        : 'text-blue-300'
                                                }`}>
                                                    {formatAction(log.action)}
                                                </span>
                                                {log.username && (
                                                    <span className="text-xs text-gray-400">
                                                        par {log.username}
                                                    </span>
                                                )}
                                                {log.pluginId && (
                                                    <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                                        {log.pluginId}
                                                    </span>
                                                )}
                                            </div>
                                            {log.resource && (
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {log.resource}
                                                    {log.resourceId && ` (${log.resourceId})`}
                                                </p>
                                            )}
                                            <p className="text-xs text-gray-500 mt-1">
                                                {formatDate(log.timestamp)}
                                                {log.ipAddress && ` • ${log.ipAddress}`}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Section>
    );
};

