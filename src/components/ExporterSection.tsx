/**
 * Exporter Section Component
 * 
 * Configuration for metrics export (Prometheus and InfluxDB)
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Share2, Server, Database, Save, Loader2, ExternalLink, AlertCircle, CheckCircle, Download, Upload, FileText } from 'lucide-react';
import { Section, SettingRow } from '../pages/SettingsPage';
import { api } from '../api/client';

interface MetricsConfig {
    prometheus: {
        enabled: boolean;
        port?: number; // Port réel du serveur (3003 en dev, 3000 en prod)
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
    const { t } = useTranslation();
    // Get default port based on environment
    // In production (Docker), default port is 7505 (mapped from container port 3000)
    const getDefaultPort = () => {
        const isDev = import.meta.env.DEV;
        return isDev ? 3003 : 7505; // Docker default port is 7505
    };
    
    const [config, setConfig] = useState<MetricsConfig>({
        prometheus: { enabled: false, port: getDefaultPort(), path: '/metrics' },
        influxdb: { enabled: false, url: 'http://localhost:8086', database: 'mynetwork', username: '', password: '', retention: '30d' }
    });
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [prometheusUrl, setPrometheusUrl] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [configMessage, setConfigMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [isAuditing, setIsAuditing] = useState(false);
    const [auditResult, setAuditResult] = useState<{ summary: { total: number; success: number; errors: number }; results: any[] } | null>(null);
    const [initialConfig, setInitialConfig] = useState<MetricsConfig | null>(null);
    const [publicUrl, setPublicUrl] = useState<string>('');

    useEffect(() => {
        // Load config first
        loadConfig();
        // Load public URL from system settings
        loadPublicUrl();
    }, []);

    // Load public URL from system settings
    const loadPublicUrl = async () => {
        try {
            const response = await api.get<{ publicUrl: string }>('/api/system/general');
            if (response.success && response.result) {
                setPublicUrl(response.result.publicUrl || '');
            }
        } catch (error) {
            console.error('Failed to load public URL:', error);
        }
    };

    // Check if there are unsaved changes
    const hasUnsavedChanges = initialConfig && JSON.stringify(config) !== JSON.stringify(initialConfig);

    // Update Prometheus URL when config changes
    useEffect(() => {
        if (!config.prometheus.enabled) {
            setPrometheusUrl('');
            return;
        }
        
        const configuredPort = config.prometheus.port || getDefaultPort();
        
        // If public URL (domain) is configured, use HTTPS + domain without port
        if (publicUrl && publicUrl.trim()) {
            try {
                const url = new URL(publicUrl.trim());
                // Remove port from domain URL (use standard HTTPS port 443)
                const domain = url.hostname;
                const prometheusUrl = `https://${domain}/api/metrics/prometheus`;
                setPrometheusUrl(prometheusUrl);
                return;
            } catch {
                // Invalid URL, fallback to IP + port
            }
        }
        
        // No public URL configured: use HTTP + IP + port
        const hostname = window.location.hostname;
        const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(hostname);
        
        if (isIpAddress) {
            // Use IP address with configured port
            const url = `http://${hostname}:${configuredPort}/api/metrics/prometheus`;
            setPrometheusUrl(url);
        } else {
            // Fallback: use hostname with configured port (shouldn't happen if no publicUrl)
            const url = `http://${hostname}:${configuredPort}/api/metrics/prometheus`;
            setPrometheusUrl(url);
        }
    }, [config.prometheus.port, config.prometheus.enabled, publicUrl]);

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
                    text: t('admin.exporter.exportSuccess')
                });
            } else {
                throw new Error(response.error?.message || t('admin.exporter.exportFailed'));
            }
        } catch (error) {
            setConfigMessage({
                type: 'error',
                text: error instanceof Error ? error.message : t('admin.exporter.exportError')
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
                    text: response.result.message || t('admin.exporter.importSuccess', { count: response.result.imported })
                });
                
                // Reload page after 2 seconds to apply changes
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            } else {
                throw new Error(response.error?.message || t('admin.exporter.importFailed'));
            }
        } catch (error) {
            setConfigMessage({
                type: 'error',
                text: error instanceof Error ? error.message : t('admin.exporter.importError')
            });
            setSelectedFile(null);
        }
    };

    const loadConfig = async () => {
        setIsLoading(true);
        try {
            const response = await api.get<MetricsConfig>('/api/metrics/config');
            if (response.success && response.result) {
                const loadedConfig = response.result;
                // If port is 9090 (old default) or undefined, replace with current default
                // Update port to Docker default (7505) if not set or using old defaults
                if (loadedConfig.prometheus && (!loadedConfig.prometheus.port || loadedConfig.prometheus.port === 9090 || loadedConfig.prometheus.port === 3000)) {
                    loadedConfig.prometheus.port = getDefaultPort();
                }
                setConfig(loadedConfig);
                // Store initial config (deep copy)
                setInitialConfig(JSON.parse(JSON.stringify(loadedConfig)));
            }
        } catch (error) {
            console.error('Failed to load metrics config:', error);
            setMessage({ type: 'error', text: t('admin.exporter.loadError') });
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
                setMessage({ type: 'success', text: t('admin.exporter.saveSuccess') });
                // Update initial config after save
                setInitialConfig(JSON.parse(JSON.stringify(config)));
            } else {
                setMessage({ type: 'error', text: response.error?.message || t('admin.exporter.saveError') });
            }
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : t('admin.exporter.saveError') });
        } finally {
            setIsSaving(false);
        }
    };

    const testPrometheus = () => {
        window.open(prometheusUrl, '_blank');
    };

    const auditPrometheus = async () => {
        setIsAuditing(true);
        setAuditResult(null);
        setMessage(null);
        
        try {
            const response = await api.get<{
                auditDate: string;
                results: Array<{
                    endpoint: string;
                    status: 'success' | 'error';
                    message: string;
                    metricsCount?: number;
                    sampleMetrics?: string[];
                    errors?: string[];
                }>;
                summary: {
                    total: number;
                    success: number;
                    errors: number;
                };
            }>('/api/metrics/prometheus/audit');
            
            if (response.success && response.result) {
                setAuditResult(response.result);
                if (response.result.summary.errors === 0) {
                    setMessage({ 
                        type: 'success', 
                        text: t('admin.exporter.auditSuccess', { success: response.result.summary.success, total: response.result.summary.total })
                    });
                } else {
                    setMessage({ 
                        type: 'error', 
                        text: t('admin.exporter.auditPartial', { count: response.result.summary.errors })
                    });
                }
            } else {
                throw new Error(response.error?.message || t('admin.exporter.auditFailed'));
            }
        } catch (error) {
            setMessage({ 
                type: 'error', 
                text: error instanceof Error ? error.message : t('admin.exporter.auditError')
            });
        } finally {
            setIsAuditing(false);
        }
    };

    const testInfluxDB = async () => {
        try {
            const response = await api.get('/api/metrics/influxdb');
            if (response.success) {
                // Show success message
                setMessage({ type: 'success', text: t('admin.exporter.influxTestSuccess') });
            }
        } catch (error) {
            setMessage({ type: 'error', text: t('admin.exporter.influxTestError') });
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
            {/* Unsaved Changes Notification */}
            {hasUnsavedChanges && (
                <div className="p-4 bg-amber-900/20 border border-amber-700/50 rounded-lg flex items-start gap-3">
                    <AlertCircle size={20} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                        <h4 className="text-sm font-medium text-amber-400 mb-1">
                            {t('admin.exporter.unsavedTitle')}
                        </h4>
                        <p className="text-xs text-amber-300">
                            {t('admin.exporter.unsavedHint')}
                        </p>
                    </div>
                </div>
            )}

            {message && (
                <div className={`p-3 rounded text-sm ${message.type === 'success' ? 'bg-emerald-900/30 border border-emerald-700 text-emerald-400' : 'bg-red-900/30 border border-red-700 text-red-400'}`}>
                    {message.text}
                </div>
            )}

            {/* Prometheus Section */}
            <Section title={t('admin.exporter.prometheusTitle')} icon={Server} iconColor="orange">
                <SettingRow
                    label={t('admin.exporter.prometheusEnable')}
                    description={t('admin.exporter.prometheusEnableDesc')}
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
                                    {t('admin.exporter.enabled')}
                                </span>
                            ) : (
                                t('admin.exporter.disabled')
                            )}
                        </span>
                    </div>
                </SettingRow>

                {config.prometheus.enabled && (
                    <>
                        <SettingRow
                            label={t('admin.exporter.serverPort')}
                            description={t('admin.exporter.serverPortDesc')}
                        >
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min="1024"
                                    max="65535"
                                    value={config.prometheus.port || getDefaultPort()}
                                    onChange={(e) => {
                                        const port = parseInt(e.target.value) || getDefaultPort();
                                        setConfig({
                                            ...config,
                                            prometheus: { ...config.prometheus, port }
                                        });
                                    }}
                                    className="w-32 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-400">{t('admin.exporter.port')}</span>
                                <span className="text-xs text-gray-500">
                                    ({t('admin.exporter.defaultPort', { port: getDefaultPort() })})
                                </span>
                            </div>
                        </SettingRow>

                        <SettingRow
                            label={t('admin.exporter.endpointPath')}
                            description={t('admin.exporter.endpointPathDesc')}
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
                                    placeholder={t('admin.exporter.endpointPathPlaceholder')}
                                />
                            </div>
                        </SettingRow>

                        <SettingRow
                            label={t('admin.exporter.endpointUrl')}
                            description={t('admin.exporter.endpointUrlDesc')}
                        >
                            <div className="w-full">
                                <div className="flex items-center gap-2 w-full">
                                    <input
                                        type="text"
                                        value={prometheusUrl}
                                        readOnly
                                        className="flex-1 px-4 py-3 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-base opacity-90 cursor-not-allowed font-mono"
                                        style={{ width: '100%', minWidth: '600px' }}
                                    />
                                    <button
                                        onClick={testPrometheus}
                                        className="px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm transition-colors flex items-center gap-2 flex-shrink-0 whitespace-nowrap"
                                    >
                                        <ExternalLink size={16} />
                                        {t('admin.exporter.test')}
                                    </button>
                                    <button
                                        onClick={auditPrometheus}
                                        disabled={isAuditing}
                                        className="px-4 py-3 bg-orange-600 hover:bg-orange-700 rounded-lg text-white text-sm transition-colors flex items-center gap-2 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                    >
                                        {isAuditing ? <Loader2 size={16} className="animate-spin" /> : <AlertCircle size={16} />}
                                        {t('admin.exporter.audit')}
                                    </button>
                                </div>
                            </div>
                        </SettingRow>
                        
                        {auditResult && (
                            <div className="mt-4 p-4 bg-gray-900/50 border border-gray-700 rounded-lg">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-sm font-semibold text-gray-300">{t('admin.exporter.auditResultsTitle')}</h4>
                                    <span className={`text-xs px-2 py-1 rounded ${
                                        auditResult.summary.errors === 0 
                                            ? 'bg-green-900/40 text-green-400' 
                                            : 'bg-orange-900/40 text-orange-400'
                                    }`}>
                                        {t('admin.exporter.auditPassed', { success: auditResult.summary.success, total: auditResult.summary.total })}
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {auditResult.results.map((result, index) => (
                                        <div key={index} className={`p-2 rounded text-xs ${
                                            result.status === 'success' 
                                                ? 'bg-green-900/20 border border-green-700/50' 
                                                : 'bg-red-900/20 border border-red-700/50'
                                        }`}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-medium text-gray-300">{result.endpoint}</span>
                                                <span className={`px-2 py-0.5 rounded text-[10px] ${
                                                    result.status === 'success' 
                                                        ? 'bg-green-700/50 text-green-300' 
                                                        : 'bg-red-700/50 text-red-300'
                                                }`}>
                                                    {result.status === 'success' ? t('admin.exporter.statusOk') : t('admin.exporter.statusError')}
                                                </span>
                                            </div>
                                            <p className="text-gray-400">{result.message}</p>
                                            {result.metricsCount !== undefined && (
                                                <p className="text-gray-500 mt-1">{t('admin.exporter.metricsCount', { count: result.metricsCount })}</p>
                                            )}
                                            {result.sampleMetrics && result.sampleMetrics.length > 0 && (
                                                <div className="mt-1">
                                                    <p className="text-gray-500 text-[10px]">{t('admin.exporter.samples')} {result.sampleMetrics.slice(0, 5).join(', ')}</p>
                                                </div>
                                            )}
                                            {result.errors && result.errors.length > 0 && (
                                                <div className="mt-1 text-red-400 text-[10px]">
                                                    {result.errors.map((err: string, i: number) => (
                                                        <div key={i}>{err}</div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                            <p className="text-xs text-blue-300 mb-2">
                                <strong>{t('admin.exporter.prometheusConfigTitle')}</strong>
                            </p>
                            <pre className="text-xs text-gray-400 overflow-x-auto">
{`scrape_configs:
  - job_name: 'mynetwork'
    scrape_interval: 30s
    static_configs:
      - targets: ['${window.location.hostname}:${config.prometheus.port || getDefaultPort()}']
    metrics_path: '/api/metrics/prometheus'`}
                            </pre>
                            <p className="text-xs text-blue-400 mt-2">
                                <strong>{t('admin.exporter.noteLabel')} :</strong> {t('admin.exporter.prometheusNote', { port: config.prometheus.port || getDefaultPort() })}{' '}
                                <code className="text-blue-300">/api/metrics/prometheus</code>.
                            </p>
                        </div>
                    </>
                )}
            </Section>

            {/* InfluxDB Section */}
            <Section title={t('admin.exporter.influxdbTitle')} icon={Database} iconColor="cyan">
                <SettingRow
                    label={t('admin.exporter.influxdbEnable')}
                    description={t('admin.exporter.influxdbEnableDesc')}
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
                                    {t('admin.exporter.enabled')}
                                </span>
                            ) : (
                                t('admin.exporter.disabled')
                            )}
                        </span>
                    </div>
                </SettingRow>

                {config.influxdb.enabled && (
                    <>
                        <SettingRow
                            label={t('admin.exporter.influxdbUrl')}
                            description={t('admin.exporter.influxdbUrlDesc')}
                        >
                            <input
                                type="text"
                                value={config.influxdb.url || ''}
                                onChange={(e) => setConfig({
                                    ...config,
                                    influxdb: { ...config.influxdb, url: e.target.value }
                                })}
                                placeholder={t('admin.exporter.influxdbUrlPlaceholder')}
                                className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:outline-none transition-colors"
                            />
                        </SettingRow>

                        <SettingRow
                            label={t('admin.exporter.database')}
                            description={t('admin.exporter.databaseDesc')}
                        >
                            <input
                                type="text"
                                value={config.influxdb.database || ''}
                                onChange={(e) => setConfig({
                                    ...config,
                                    influxdb: { ...config.influxdb, database: e.target.value }
                                })}
                                placeholder={t('admin.exporter.databasePlaceholder')}
                                className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:outline-none transition-colors"
                            />
                        </SettingRow>

                        <SettingRow
                            label={t('admin.exporter.username')}
                            description={t('admin.exporter.usernameDesc')}
                        >
                            <input
                                type="text"
                                value={config.influxdb.username || ''}
                                onChange={(e) => setConfig({
                                    ...config,
                                    influxdb: { ...config.influxdb, username: e.target.value }
                                })}
                                placeholder={t('admin.exporter.usernamePlaceholder')}
                                className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:outline-none transition-colors"
                            />
                        </SettingRow>

                        <SettingRow
                            label={t('admin.exporter.password')}
                            description={t('admin.exporter.passwordDesc')}
                        >
                            <input
                                type="password"
                                value={config.influxdb.password || ''}
                                onChange={(e) => setConfig({
                                    ...config,
                                    influxdb: { ...config.influxdb, password: e.target.value }
                                })}
                                placeholder={t('admin.exporter.passwordPlaceholder')}
                                className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:outline-none transition-colors"
                            />
                        </SettingRow>

                        <SettingRow
                            label={t('admin.exporter.retention')}
                            description={t('admin.exporter.retentionDesc')}
                        >
                            <input
                                type="text"
                                value={config.influxdb.retention || ''}
                                onChange={(e) => setConfig({
                                    ...config,
                                    influxdb: { ...config.influxdb, retention: e.target.value }
                                })}
                                placeholder={t('admin.exporter.retentionPlaceholder')}
                                className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:outline-none transition-colors"
                            />
                        </SettingRow>

                        <div className="mt-4 p-3 bg-purple-900/20 border border-purple-700/50 rounded-lg">
                            <p className="text-xs text-purple-300 mb-2">
                                <strong>{t('admin.exporter.noteLabel')} :</strong> {t('admin.exporter.influxdbNote')} <code className="text-purple-400">/api/metrics/influxdb</code>
                            </p>
                            <button
                                onClick={testInfluxDB}
                                className="mt-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded text-white text-xs transition-colors flex items-center gap-2"
                            >
                                <ExternalLink size={12} />
                                {t('admin.exporter.testExport')}
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
                    <span>{t('admin.exporter.saveConfig')}</span>
                </button>
            </div>

            {/* Configuration Export/Import Section */}
            <Section title={t('admin.exporter.exportImportTitle')} icon={FileText} iconColor="amber">
                <div className="space-y-4">
                    <SettingRow
                        label={t('admin.exporter.exportConfigLabel')}
                        description={t('admin.exporter.exportConfigDesc')}
                    >
                        <button
                            onClick={handleExportConfig}
                            disabled={isExporting}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                            <span>{t('admin.exporter.exportBtn')}</span>
                        </button>
                    </SettingRow>

                    <SettingRow
                        label={t('admin.exporter.importConfigLabel')}
                        description={t('admin.exporter.importConfigDesc')}
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
                                <span>{t('admin.exporter.selectFile')}</span>
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

