/**
 * Exporter Section Component
 * 
 * Configuration for metrics export (Prometheus and InfluxDB)
 */

import React, { useState, useEffect } from 'react';
import { Share2, Server, Database, Save, Loader2, ExternalLink, AlertCircle, CheckCircle, Download, Upload, FileText } from 'lucide-react';
import { Section, SettingRow } from '../pages/SettingsPage';
import { api } from '../api/client';

interface MetricsConfig {
    prometheus: {
        enabled: boolean;
        port?: number;
        path?: string;
    };
    influxdb: {
        enabled: boolean;
        url?: string;
        database?: string;
        username?: string;
        password?: string;
        retention?: string;
    };
}

export const ExporterSection: React.FC = () => {
    const [config, setConfig] = useState<MetricsConfig>({
        prometheus: { enabled: false, port: 9090, path: '/metrics' },
        influxdb: { enabled: false, url: 'http://localhost:8086', database: 'mynetwork', username: '', password: '', retention: '30d' }
    });
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [prometheusUrl, setPrometheusUrl] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [configMessage, setConfigMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        // Load config first
        loadConfig();
    }, []);

    // Update Prometheus URL when config changes
    // Note: The actual endpoint is on the main server, but the port in config is for Prometheus scrape configuration
    useEffect(() => {
        // In development, Vite proxies /api to backend on port 3003
        // In production, backend is on the same port as frontend
        const isDev = import.meta.env.DEV;
        const backendPort = isDev ? '3003' : (window.location.port || '3003');
        setPrometheusUrl(`http://${window.location.hostname}:${backendPort}/api/metrics/prometheus`);
    }, []);

    const handleExportConfig = async () => {
        setIsExporting(true);
        setConfigMessage(null);
        
        try {
            const response = await api.get<{ content: string; filePath: string }>('/api/config/export');
            
            if (response.success && response.result) {
                // Create blob and download
                const blob = new Blob([response.result.content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'mynetwork.conf';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                setConfigMessage({
                    type: 'success',
                    text: 'Configuration exportée avec succès'
                });
            } else {
                throw new Error(response.error?.message || 'Échec de l\'export');
            }
        } catch (error) {
            setConfigMessage({
                type: 'error',
                text: error instanceof Error ? error.message : 'Erreur lors de l\'export'
            });
        } finally {
            setIsExporting(false);
        }
    };

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        
        setSelectedFile(file);
        setConfigMessage(null);
        
        try {
            const content = await file.text();
            
            const response = await api.post<{ imported: number; errors: string[]; message: string }>('/api/config/import', {
                content
            });
            
            if (response.success && response.result) {
                setConfigMessage({
                    type: 'success',
                    text: response.result.message || `Configuration importée : ${response.result.imported} plugin(s) configuré(s)`
                });
                
                // Reload page after 2 seconds to apply changes
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            } else {
                throw new Error(response.error?.message || 'Échec de l\'import');
            }
        } catch (error) {
            setConfigMessage({
                type: 'error',
                text: error instanceof Error ? error.message : 'Erreur lors de l\'import'
            });
            setSelectedFile(null);
        }
    };

    const loadConfig = async () => {
        setIsLoading(true);
        try {
            const response = await api.get('/api/metrics/config');
            if (response.success && response.result) {
                setConfig(response.result);
            }
        } catch (error) {
            console.error('Failed to load metrics config:', error);
            setMessage({ type: 'error', text: 'Erreur lors du chargement de la configuration' });
        } finally {
            setIsLoading(false);
        }
    };

    const saveConfig = async () => {
        setIsSaving(true);
        setMessage(null);
        try {
            const response = await api.post('/api/metrics/config', { config });
            if (response.success) {
                setMessage({ type: 'success', text: 'Configuration sauvegardée avec succès !' });
            } else {
                setMessage({ type: 'error', text: response.error?.message || 'Erreur lors de la sauvegarde' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Erreur lors de la sauvegarde' });
        } finally {
            setIsSaving(false);
        }
    };

    const testPrometheus = () => {
        window.open(prometheusUrl, '_blank');
    };

    const testInfluxDB = async () => {
        try {
            const response = await api.get('/api/metrics/influxdb');
            if (response.success) {
                // Show success message
                setMessage({ type: 'success', text: 'Export InfluxDB réussi ! Les métriques sont disponibles.' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Erreur lors du test InfluxDB' });
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 size={32} className="text-gray-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {message && (
                <div className={`p-3 rounded text-sm ${message.type === 'success' ? 'bg-emerald-900/30 border border-emerald-700 text-emerald-400' : 'bg-red-900/30 border border-red-700 text-red-400'}`}>
                    {message.text}
                </div>
            )}

            {/* Prometheus Section */}
            <Section title="Prometheus" icon={Server} iconColor="orange">
                <SettingRow
                    label="Activer l'export Prometheus"
                    description="Expose les métriques au format Prometheus sur /api/metrics/prometheus"
                >
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={config.prometheus.enabled}
                            onChange={(e) => setConfig({
                                ...config,
                                prometheus: { ...config.prometheus, enabled: e.target.checked }
                            })}
                            className="w-4 h-4 text-blue-600 bg-[#1a1a1a] border-gray-700 rounded focus:ring-0"
                        />
                        <span className="text-sm text-gray-400">
                            {config.prometheus.enabled ? (
                                <span className="flex items-center gap-1 text-green-400">
                                    <CheckCircle size={14} />
                                    Activé
                                </span>
                            ) : (
                                'Désactivé'
                            )}
                        </span>
                    </div>
                </SettingRow>

                {config.prometheus.enabled && (
                    <>
                        <SettingRow
                            label="Port Prometheus"
                            description="Port à configurer dans Prometheus pour scraper les métriques (utilisé dans la configuration Prometheus)"
                        >
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min="1024"
                                    max="65535"
                                    value={config.prometheus.port || 9090}
                                    onChange={(e) => {
                                        const port = parseInt(e.target.value) || 9090;
                                        setConfig({
                                            ...config,
                                            prometheus: { ...config.prometheus, port }
                                        });
                                    }}
                                    className="w-24 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:outline-none"
                                />
                                <span className="text-sm text-gray-400">port</span>
                            </div>
                        </SettingRow>

                        <SettingRow
                            label="Chemin de l'endpoint"
                            description="Chemin pour accéder aux métriques Prometheus"
                        >
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={config.prometheus.path || '/metrics'}
                                    onChange={(e) => setConfig({
                                        ...config,
                                        prometheus: { ...config.prometheus, path: e.target.value }
                                    })}
                                    className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:outline-none"
                                    placeholder="/metrics"
                                />
                            </div>
                        </SettingRow>

                        <SettingRow
                            label="URL de l'endpoint"
                            description="URL complète pour récupérer les métriques Prometheus"
                        >
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={prometheusUrl}
                                    readOnly
                                    className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm opacity-70 cursor-not-allowed"
                                />
                                <button
                                    onClick={testPrometheus}
                                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm transition-colors flex items-center gap-2"
                                >
                                    <ExternalLink size={14} />
                                    Tester
                                </button>
                            </div>
                        </SettingRow>

                        <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                            <p className="text-xs text-blue-300 mb-2">
                                <strong>Configuration Prometheus :</strong>
                            </p>
                            <pre className="text-xs text-gray-400 overflow-x-auto">
{`scrape_configs:
  - job_name: 'mynetwork'
    scrape_interval: 30s
    static_configs:
      - targets: ['${window.location.hostname}:${config.prometheus.port || 9090}']
    metrics_path: '/api/metrics/prometheus'`}
                            </pre>
                            <p className="text-xs text-blue-400 mt-2">
                                <strong>Note :</strong> Le port configuré ({config.prometheus.port || 9090}) est utilisé pour la configuration Prometheus. 
                                L'endpoint réel reste sur le serveur principal à <code className="text-blue-300">/api/metrics/prometheus</code>.
                            </p>
                        </div>
                    </>
                )}
            </Section>

            {/* InfluxDB Section */}
            <Section title="InfluxDB" icon={Database} iconColor="cyan">
                <SettingRow
                    label="Activer l'export InfluxDB"
                    description="Exporte les métriques au format InfluxDB Line Protocol"
                >
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={config.influxdb.enabled}
                            onChange={(e) => setConfig({
                                ...config,
                                influxdb: { ...config.influxdb, enabled: e.target.checked }
                            })}
                            className="w-4 h-4 text-blue-600 bg-[#1a1a1a] border-gray-700 rounded focus:ring-0"
                        />
                        <span className="text-sm text-gray-400">
                            {config.influxdb.enabled ? (
                                <span className="flex items-center gap-1 text-green-400">
                                    <CheckCircle size={14} />
                                    Activé
                                </span>
                            ) : (
                                'Désactivé'
                            )}
                        </span>
                    </div>
                </SettingRow>

                {config.influxdb.enabled && (
                    <>
                        <SettingRow
                            label="URL du serveur InfluxDB"
                            description="URL complète du serveur InfluxDB (ex: http://localhost:8086)"
                        >
                            <input
                                type="text"
                                value={config.influxdb.url || ''}
                                onChange={(e) => setConfig({
                                    ...config,
                                    influxdb: { ...config.influxdb, url: e.target.value }
                                })}
                                placeholder="http://localhost:8086"
                                className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:outline-none transition-colors"
                            />
                        </SettingRow>

                        <SettingRow
                            label="Base de données"
                            description="Nom de la base de données InfluxDB"
                        >
                            <input
                                type="text"
                                value={config.influxdb.database || ''}
                                onChange={(e) => setConfig({
                                    ...config,
                                    influxdb: { ...config.influxdb, database: e.target.value }
                                })}
                                placeholder="mynetwork"
                                className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:outline-none transition-colors"
                            />
                        </SettingRow>

                        <SettingRow
                            label="Nom d'utilisateur"
                            description="Nom d'utilisateur pour l'authentification InfluxDB (optionnel)"
                        >
                            <input
                                type="text"
                                value={config.influxdb.username || ''}
                                onChange={(e) => setConfig({
                                    ...config,
                                    influxdb: { ...config.influxdb, username: e.target.value }
                                })}
                                placeholder="admin"
                                className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:outline-none transition-colors"
                            />
                        </SettingRow>

                        <SettingRow
                            label="Mot de passe"
                            description="Mot de passe pour l'authentification InfluxDB (optionnel)"
                        >
                            <input
                                type="password"
                                value={config.influxdb.password || ''}
                                onChange={(e) => setConfig({
                                    ...config,
                                    influxdb: { ...config.influxdb, password: e.target.value }
                                })}
                                placeholder="••••••••"
                                className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:outline-none transition-colors"
                            />
                        </SettingRow>

                        <SettingRow
                            label="Rétention"
                            description="Durée de rétention des données (ex: 30d, 1w, 1h)"
                        >
                            <input
                                type="text"
                                value={config.influxdb.retention || ''}
                                onChange={(e) => setConfig({
                                    ...config,
                                    influxdb: { ...config.influxdb, retention: e.target.value }
                                })}
                                placeholder="30d"
                                className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:outline-none transition-colors"
                            />
                        </SettingRow>

                        <div className="mt-4 p-3 bg-purple-900/20 border border-purple-700/50 rounded-lg">
                            <p className="text-xs text-purple-300 mb-2">
                                <strong>Note :</strong> L'export InfluxDB est disponible via l'endpoint <code className="text-purple-400">/api/metrics/influxdb</code>
                            </p>
                            <button
                                onClick={testInfluxDB}
                                className="mt-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded text-white text-xs transition-colors flex items-center gap-2"
                            >
                                <ExternalLink size={12} />
                                Tester l'export
                            </button>
                        </div>
                    </>
                )}
            </Section>

            {/* Save Button */}
            <div className="flex justify-end pt-4">
                <button
                    onClick={saveConfig}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    <span>Sauvegarder la configuration</span>
                </button>
            </div>

            {/* Configuration Export/Import Section */}
            <Section title="Export/Import de Configuration" icon={FileText} iconColor="amber">
                <div className="space-y-4">
                    <SettingRow
                        label="Exporter la configuration"
                        description="Téléchargez la configuration complète de l'application (plugins, paramètres) au format .conf"
                    >
                        <button
                            onClick={handleExportConfig}
                            disabled={isExporting}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                            <span>Exporter</span>
                        </button>
                    </SettingRow>

                    <SettingRow
                        label="Importer la configuration"
                        description="Importez une configuration depuis un fichier .conf (remplace la configuration actuelle)"
                    >
                        <div className="flex items-center gap-2">
                            <input
                                type="file"
                                accept=".conf"
                                onChange={handleFileSelect}
                                className="hidden"
                                id="config-file-input"
                            />
                            <label
                                htmlFor="config-file-input"
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors cursor-pointer"
                            >
                                <Upload size={16} />
                                <span>Sélectionner un fichier</span>
                            </label>
                            {selectedFile && (
                                <span className="text-sm text-gray-400">{selectedFile.name}</span>
                            )}
                        </div>
                    </SettingRow>

                    {configMessage && (
                        <div className={`p-3 rounded-lg flex items-center gap-2 ${
                            configMessage.type === 'success' 
                                ? 'bg-green-900/20 border border-green-700 text-green-400' 
                                : 'bg-red-900/20 border border-red-700 text-red-400'
                        }`}>
                            {configMessage.type === 'success' ? (
                                <CheckCircle size={16} />
                            ) : (
                                <AlertCircle size={16} />
                            )}
                            <span className="text-sm">{configMessage.text}</span>
                        </div>
                    )}
                </div>
            </Section>
        </div>
    );
};

