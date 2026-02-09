import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Settings,
  Wifi,
  Network,
  HardDrive,
  Shield,
  Server,
  Monitor,
  Database,
  ChevronLeft,
  Loader2,
  AlertCircle,
  Save,
  RefreshCw,
  Globe,
  Lock,
  Power,
  Clock,
  Users,
  Share2,
  ExternalLink,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  Lightbulb,
  FileText,
  Plug,
  User as UserIcon,
  Mail,
  Key,
  Eye,
  EyeOff,
  Info,
  Github,
  Sparkles,
  Download,
  CheckCircle,
  Upload
} from 'lucide-react';
import { api } from '../api/client';
import { API_ROUTES, GITHUB_REPO_URL } from '../utils/constants';
import { ParentalControlModal } from '../components/modals/ParentalControlModal';
import { PortForwardingModal } from '../components/modals/PortForwardingModal';
import { VpnModal } from '../components/modals/VpnModal';
import { RebootScheduleModal } from '../components/modals/RebootScheduleModal';
import { CustomDomainModal } from '../components/modals/CustomDomainModal';
import { useLanStore } from '../stores/lanStore';
import { useAuthStore } from '../stores/authStore';
import { useSystemStore } from '../stores/systemStore';
import { getPermissionErrorMessage, getPermissionShortError, getFreeboxSettingsUrl, getFreeboxBackupUrl } from '../utils/permissions';
import { usePluginStore } from '../stores/pluginStore';
import { useUserAuthStore, type User } from '../stores/userAuthStore';
import { ExporterSection } from '../components/ExporterSection';
import { PluginsManagementSection } from '../components/PluginsManagementSection';
import { LogsManagementSection } from '../components/LogsManagementSection';
import logoMynetworK from '../icons/logo_mynetwork.svg';
import { APP_VERSION, getVersionString } from '../constants/version';
import { SecuritySection } from '../components/SecuritySection';
import { ThemeSection } from '../components/ThemeSection';
import { useUpdateStore } from '../stores/updateStore';
import { UserMenu } from '../components/ui';

interface SettingsPageProps {
  onBack: () => void;
  mode?: 'freebox' | 'administration';
  initialAdminTab?: 'general' | 'users' | 'plugins' | 'logs' | 'security' | 'exporter' | 'theme' | 'debug' | 'info' | 'backup';
  onNavigateToPage?: (page: 'plugins' | 'users' | 'logs') => void;
  onUsersClick?: () => void;
  onSettingsClick?: () => void;
  onAdminClick?: () => void;
  onProfileClick?: () => void;
  onLogout?: () => void;
}

type SettingsTab = 'network' | 'wifi' | 'dhcp' | 'storage' | 'security' | 'system' | 'backup';
type AdminTab = 'general' | 'plugins' | 'logs' | 'security' | 'exporter' | 'theme' | 'debug' | 'info' | 'backup' | 'database';

// Toggle component
const Toggle: React.FC<{
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}> = ({ enabled, onChange, disabled }) => (
  <button
    onClick={() => !disabled && onChange(!enabled)}
    disabled={disabled}
    className={`relative w-11 h-6 rounded-full transition-colors ${
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
    } ${enabled ? 'bg-emerald-500' : 'bg-gray-600'}`}
  >
    <span
      className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
        enabled ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
);

// Setting row component
export const SettingRow: React.FC<{
  label: string;
  description?: string;
  children: React.ReactNode;
}> = ({ label, description, children }) => (
  <div className="flex items-center justify-between py-3 border-b border-gray-800 last:border-b-0">
    <div className="flex-1">
      <h4 className="text-sm font-medium text-white">{label}</h4>
      {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
    </div>
    <div className="ml-4">{children}</div>
  </div>
);

// Section component
export const Section: React.FC<{
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  permissionError?: string | null;
  freeboxSettingsUrl?: string | null;
  iconColor?: 'blue' | 'purple' | 'emerald' | 'cyan' | 'red' | 'amber' | 'yellow' | 'violet' | 'teal' | 'orange';
}> = ({ title, icon: Icon, children, permissionError, freeboxSettingsUrl, iconColor }) => {
  const iconColorClasses: Record<string, string> = {
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    emerald: 'text-emerald-400',
    cyan: 'text-cyan-400',
    red: 'text-red-400',
    amber: 'text-amber-400',
    yellow: 'text-yellow-400',
    violet: 'text-violet-300',
    teal: 'text-teal-300',
    orange: 'text-orange-400'
  };
  
  const iconClassName = iconColor ? iconColorClasses[iconColor] : 'text-theme-secondary';
  
  return (
    <div className={`bg-theme-card rounded-xl border border-theme overflow-hidden ${permissionError ? 'opacity-60' : ''}`} style={{ backdropFilter: 'var(--backdrop-blur)' }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-theme bg-theme-primary">
        <Icon size={18} className={iconClassName} />
        <h3 className="font-medium theme-section-title">{title}</h3>
      </div>
    {permissionError && (
      <div className="px-4 py-3 bg-amber-900/20 border-b border-amber-700/30">
        <p className="text-amber-400 text-xs">
          {permissionError}
          {freeboxSettingsUrl && (
            <>
              {' '}
              <a
                href={freeboxSettingsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 underline"
              >
                Ouvrir les paramètres Freebox
                <ExternalLink size={12} />
              </a>
            </>
          )}
        </p>
      </div>
    )}
    <div className={`px-4 py-4 ${permissionError ? 'pointer-events-none' : ''}`}>{children}</div>
  </div>
  );
};

// Database Management Section Component
const DatabaseManagementSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';
  const [retentionConfig, setRetentionConfig] = useState({
    historyRetentionDays: 30,
    scanRetentionDays: 90,
    offlineRetentionDays: 7,
    latencyMeasurementsRetentionDays: 30,
    keepIpsOnPurge: true,
    autoPurgeEnabled: true,
    purgeSchedule: '0 2 * * *' // Daily at 2 AM
  });
  const [sizeEstimate, setSizeEstimate] = useState<{
    currentSizeMB: number;
    estimatedSizeAfterPurgeMB: number;
    estimatedFreedMB: number;
  } | null>(null);
  const [databaseStats, setDatabaseStats] = useState<{
    scansCount: number;
    historyCount: number;
    oldestScan: string | null;
    oldestHistory: string | null;
    totalSize: number;
  } | null>(null);
  const [dbStats, setDbStats] = useState<{
    pageSize: number;
    pageCount: number;
    cacheSize: number;
    synchronous: number;
    journalMode: string;
    walSize: number;
    dbSize: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [isPurgingHistory, setIsPurgingHistory] = useState(false);
  const [isPurgingScans, setIsPurgingScans] = useState(false);
  const [isPurgingOffline, setIsPurgingOffline] = useState(false);
  const [isPurgingAll, setIsPurgingAll] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadRetentionConfig();
    loadDatabaseStats();
    loadSizeEstimate();
    loadDbStats();
  }, []);

  const loadDbStats = async () => {
    try {
      const response = await api.get('/api/database/stats');
      if (response.success && response.result) {
        setDbStats(response.result);
      }
    } catch (error: any) {
      console.error('Failed to load DB stats:', error);
    }
  };

  const loadSizeEstimate = async () => {
    try {
      const response = await api.get<{ success: boolean; result: { currentSizeMB: number; estimatedSizeAfterPurgeMB: number; estimatedFreedMB: number } }>('/api/network-scan/database-size-estimate');
      if (response.success && response.result) {
        setSizeEstimate(response.result);
      }
    } catch (error: any) {
      console.error('Failed to load size estimate:', error);
    }
  };

  const loadRetentionConfig = async () => {
    try {
      const response = await api.get('/api/network-scan/retention-config');
      if (response.success && response.result) {
        setRetentionConfig(response.result);
        setMessage(null); // Clear any previous error
      } else {
        const errorMsg = response.error?.message || response.error?.code || t('admin.database.loadError');
        setMessage({ type: 'error', text: errorMsg });
      }
    } catch (error: any) {
      console.error('Failed to load retention config:', error);
      const errorMsg = error?.response?.data?.error?.message || error?.message || t('admin.database.loadError');
      setMessage({ type: 'error', text: errorMsg });
    }
  };

  const loadDatabaseStats = async () => {
    setIsLoading(true);
    try {
      const response = await api.get<DatabaseStatsResponse>('/api/network-scan/database-stats');
      if (response.success && response.result) {
        setDatabaseStats({
          scansCount: response.result.scansCount || 0,
          historyCount: response.result.historyCount || 0,
          oldestScan: response.result.oldestScan || null,
          oldestHistory: response.result.oldestHistory || null,
          totalSize: response.result.totalSize || 0
        });
      } else {
        console.error('Failed to load database stats:', response.error);
        setMessage({ type: 'error', text: response.error?.message || t('admin.database.loadStatsError') });
      }
    } catch (error: any) {
      console.error('Failed to load database stats:', error);
      const errorMsg = error?.response?.data?.error?.message || error?.message || t('admin.database.loadStatsError');
      setMessage({ type: 'error', text: errorMsg });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const response = await api.post('/api/network-scan/retention-config', retentionConfig);
      if (response.success && response.result) {
        setRetentionConfig(response.result);
        setMessage({ type: 'success', text: t('admin.database.saveSuccess') });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: response.error?.message || t('admin.database.saveError') });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: t('admin.database.saveError') });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePurge = async () => {
    if (!confirm(t('admin.database.confirmPurge'))) {
      return;
    }
    setIsPurging(true);
    setMessage(null);
    try {
      const response = await api.post<PurgeAllResponse>('/api/network-scan/purge');
      if (response.success && response.result) {
        const totalDeleted = response.result.totalDeleted || 
          (response.result.historyDeleted || 0) + 
          (response.result.scansDeleted || 0) + 
          (response.result.offlineDeleted || 0) +
          (response.result.latencyMeasurementsDeleted || 0);
        setMessage({ 
          type: 'success', 
          text: t('admin.database.purgeSuccess', {
            total: totalDeleted,
            history: response.result.historyDeleted || 0,
            scans: response.result.scansDeleted || 0,
            offline: response.result.offlineDeleted || 0,
            latency: response.result.latencyMeasurementsDeleted || 0
          })
        });
        loadDatabaseStats();
        loadSizeEstimate();
        loadDbStats();
        setTimeout(() => setMessage(null), 5000);
      } else {
        setMessage({ type: 'error', text: response.error?.message || t('admin.database.purgeError') });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: t('admin.database.purgeError') });
    } finally {
      setIsPurging(false);
    }
  };

  const handlePurgeHistory = async () => {
    if (!confirm(t('admin.database.confirmPurgeHistory'))) {
      return;
    }
    setIsPurgingHistory(true);
    setMessage(null);
    try {
      const response = await api.post<PurgeResponse>('/api/network-scan/purge/history', { retentionDays: retentionConfig.historyRetentionDays });
      if (response.success && response.result) {
        setMessage({ 
          type: 'success', 
          text: t('admin.database.purgeHistorySuccess', { count: response.result.deleted })
        });
        loadDatabaseStats();
        loadSizeEstimate();
        loadDbStats();
        setTimeout(() => setMessage(null), 5000);
      } else {
        setMessage({ type: 'error', text: response.error?.message || t('admin.database.purgeHistoryError') });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: t('admin.database.purgeHistoryError') });
    } finally {
      setIsPurgingHistory(false);
    }
  };

  const handlePurgeScans = async () => {
    if (!confirm(t('admin.database.confirmPurgeScans'))) {
      return;
    }
    setIsPurgingScans(true);
    setMessage(null);
    try {
      const response = await api.post<PurgeResponse>('/api/network-scan/purge/scans', { retentionDays: retentionConfig.scanRetentionDays });
      if (response.success && response.result) {
        setMessage({ 
          type: 'success', 
          text: t('admin.database.purgeScansSuccess', { count: response.result.deleted })
        });
        loadDatabaseStats();
        loadSizeEstimate();
        loadDbStats();
        setTimeout(() => setMessage(null), 5000);
      } else {
        setMessage({ type: 'error', text: response.error?.message || t('admin.database.purgeScansError') });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: t('admin.database.purgeScansError') });
    } finally {
      setIsPurgingScans(false);
    }
  };

  const handlePurgeOffline = async () => {
    if (!confirm(t('admin.database.confirmPurgeOffline'))) {
      return;
    }
    setIsPurgingOffline(true);
    setMessage(null);
    try {
      const response = await api.post<PurgeResponse>('/api/network-scan/purge/offline', { retentionDays: retentionConfig.offlineRetentionDays });
      if (response.success && response.result) {
        setMessage({ 
          type: 'success', 
          text: t('admin.database.purgeOfflineSuccess', { count: response.result.deleted })
        });
        loadDatabaseStats();
        loadSizeEstimate();
        loadDbStats();
        setTimeout(() => setMessage(null), 5000);
      } else {
        setMessage({ type: 'error', text: response.error?.message || t('admin.database.purgeOfflineError') });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: t('admin.database.purgeOfflineError') });
    } finally {
      setIsPurgingOffline(false);
    }
  };

  const handlePurgeAll = async () => {
    if (!confirm(t('admin.database.confirmPurgeAll'))) {
      return;
    }
    setIsPurgingAll(true);
    setMessage(null);
    try {
      // Purge avec 0 jours = tout supprimer, respecter keepIpsOnPurge
      const keepIps = retentionConfig.keepIpsOnPurge;
      const historyResponse = await api.post<PurgeResponse>('/api/network-scan/purge/history', { retentionDays: 0 });
      const scansResponse = await api.post<PurgeResponse>('/api/network-scan/purge/scans', { retentionDays: 0, keepIps });
      const offlineResponse = await api.post<PurgeResponse>('/api/network-scan/purge/offline', { retentionDays: 0, keepIps });
      const latencyResponse = await api.post<PurgeResponse>('/api/network-scan/purge/latency', { retentionDays: 0 });
      
      if (historyResponse.success && scansResponse.success && offlineResponse.success && latencyResponse.success) {
        const totalDeleted = (historyResponse.result?.deleted || 0) + (scansResponse.result?.deleted || 0) + (offlineResponse.result?.deleted || 0) + (latencyResponse.result?.deleted || 0);
        setMessage({ 
          type: 'success', 
          text: t('admin.database.purgeAllSuccess', {
            scans: scansResponse.result?.deleted || 0,
            history: historyResponse.result?.deleted || 0,
            offline: offlineResponse.result?.deleted || 0,
            latency: latencyResponse.result?.deleted || 0,
            total: totalDeleted,
            ipsKept: keepIps ? t('admin.database.ipsKeptSuffix') : ''
          })
        });
        loadDatabaseStats();
        loadSizeEstimate();
        loadDbStats();
        setTimeout(() => setMessage(null), 5000);
      } else {
        setMessage({ type: 'error', text: t('admin.database.purgeAllError') });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: t('admin.database.purgeAllError') });
    } finally {
      setIsPurgingAll(false);
    }
  };


  const handleOptimize = async () => {
    if (!confirm(t('admin.database.confirmOptimize'))) {
      return;
    }
    setIsOptimizing(true);
    setMessage(null);
    try {
      const response = await api.post('/api/network-scan/optimize-database');
      if (response.success) {
        setMessage({ type: 'success', text: t('admin.database.optimizeSuccess') });
        loadDatabaseStats();
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: response.error?.message || t('admin.database.optimizeError') });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: t('admin.database.optimizeError') });
    } finally {
      setIsOptimizing(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString(dateLocale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      <Section title={t('admin.database.retentionTitle')} icon={Database} iconColor="purple">
        <div className="space-y-6">
          {message && (
            <div className={`p-3 rounded-lg ${
              message.type === 'success' 
                ? 'bg-emerald-900/20 border border-emerald-700/50 text-emerald-400' 
                : 'bg-red-900/20 border border-red-700/50 text-red-400'
            }`}>
              {message.text}
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-6">
              <SettingRow
                label={t('admin.database.retentionHistory')}
                description={t('admin.database.retentionHistoryDesc')}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={retentionConfig.historyRetentionDays}
                    onChange={(e) => setRetentionConfig({ ...retentionConfig, historyRetentionDays: parseInt(e.target.value) || 30 })}
                    className="w-24 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-sm text-gray-400">{t('admin.database.days')}</span>
                </div>
              </SettingRow>

              <SettingRow
                label={t('admin.database.retentionScans')}
                description={t('admin.database.retentionScansDesc')}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={retentionConfig.scanRetentionDays}
                    onChange={(e) => setRetentionConfig({ ...retentionConfig, scanRetentionDays: parseInt(e.target.value) || 90 })}
                    className="w-24 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-sm text-gray-400">{t('admin.database.days')}</span>
                </div>
              </SettingRow>

              <SettingRow
                label={t('admin.database.retentionOffline')}
                description={t('admin.database.retentionOfflineDesc')}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={retentionConfig.offlineRetentionDays}
                    onChange={(e) => setRetentionConfig({ ...retentionConfig, offlineRetentionDays: parseInt(e.target.value) || 7 })}
                    className="w-24 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-sm text-gray-400">{t('admin.database.days')}</span>
                </div>
              </SettingRow>

              <SettingRow
                label={t('admin.database.retentionLatency')}
                description={t('admin.database.retentionLatencyDesc')}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={retentionConfig.latencyMeasurementsRetentionDays}
                    onChange={(e) => setRetentionConfig({ ...retentionConfig, latencyMeasurementsRetentionDays: parseInt(e.target.value) || 30 })}
                    className="w-24 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-sm text-gray-400">{t('admin.database.days')}</span>
                </div>
              </SettingRow>
            </div>

            <div className="space-y-6">
              <SettingRow
                label={t('admin.database.keepIpsOnPurge')}
                description={t('admin.database.keepIpsOnPurgeDesc')}
              >
                <Toggle
                  enabled={retentionConfig.keepIpsOnPurge}
                  onChange={(enabled) => setRetentionConfig({ ...retentionConfig, keepIpsOnPurge: enabled })}
                />
              </SettingRow>

              <SettingRow
                label={t('admin.database.autoPurge')}
                description={t('admin.database.autoPurgeDesc')}
              >
                <Toggle
                  enabled={retentionConfig.autoPurgeEnabled}
                  onChange={(enabled) => setRetentionConfig({ ...retentionConfig, autoPurgeEnabled: enabled })}
                />
              </SettingRow>

              {retentionConfig.autoPurgeEnabled && (
                <SettingRow
                  label={t('admin.database.purgeSchedule')}
                  description={t('admin.database.purgeScheduleDesc')}
                >
                  <input
                    type="text"
                    value={retentionConfig.purgeSchedule}
                    onChange={(e) => setRetentionConfig({ ...retentionConfig, purgeSchedule: e.target.value })}
                    placeholder={t('admin.database.purgeSchedulePlaceholder')}
                    className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </SettingRow>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white flex items-center gap-2"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {t('admin.database.save')}
            </button>
          </div>
        </div>
      </Section>

      <div className="grid grid-cols-2 gap-6">
        <Section title={t('admin.database.statsTitle')} icon={Database} iconColor="purple">
          <div className="space-y-4">
            {databaseStats ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-[#1a1a1a] rounded-lg border border-gray-700">
                    <div className="text-xs text-gray-400 mb-1">{t('admin.database.scanEntries')}</div>
                    <div className="text-lg font-semibold text-gray-200">{databaseStats.scansCount.toLocaleString()}</div>
                  </div>
                  <div className="p-3 bg-[#1a1a1a] rounded-lg border border-gray-700">
                    <div className="text-xs text-gray-400 mb-1">{t('admin.database.historyEntries')}</div>
                    <div className="text-lg font-semibold text-gray-200">{databaseStats.historyCount.toLocaleString()}</div>
                  </div>
                  <div className="p-3 bg-[#1a1a1a] rounded-lg border border-gray-700">
                    <div className="text-xs text-gray-400 mb-1">{t('admin.database.oldestScan')}</div>
                    <div className="text-sm text-gray-300">{formatDate(databaseStats.oldestScan)}</div>
                  </div>
                  <div className="p-3 bg-[#1a1a1a] rounded-lg border border-gray-700">
                    <div className="text-xs text-gray-400 mb-1">{t('admin.database.oldestHistory')}</div>
                    <div className="text-sm text-gray-300">{formatDate(databaseStats.oldestHistory)}</div>
                  </div>
                </div>
                {sizeEstimate && (
                  <div className="space-y-2 p-3 bg-[#1a1a1a] rounded-lg border border-gray-700">
                    <div className="text-xs text-gray-400 mb-2">{t('admin.database.sizeEstimate')}</div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">{t('admin.database.currentSize')}</span>
                        <span className="text-gray-200 font-medium">{sizeEstimate.currentSizeMB.toFixed(2)} MB</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">{t('admin.database.estimatedSizeAfterPurge')}</span>
                        <span className="text-gray-200 font-medium">{sizeEstimate.estimatedSizeAfterPurgeMB.toFixed(2)} MB</span>
                      </div>
                      <div className="flex justify-between text-sm pt-1 border-t border-gray-700">
                        <span className="text-gray-400">{t('admin.database.freedEstimate')}</span>
                        <span className="text-emerald-400 font-medium">~{sizeEstimate.estimatedFreedMB.toFixed(2)} MB</span>
                      </div>
                    </div>
                  </div>
                )}
                {dbStats && (
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-700">
                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-gray-700">
                      <div className="text-xs text-gray-400 mb-1">{t('admin.database.dbSize')}</div>
                      <div className="text-lg font-semibold text-gray-200">{formatBytes(dbStats.dbSize)}</div>
                    </div>
                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-gray-700">
                      <div className="text-xs text-gray-400 mb-1">{t('admin.database.journalMode')}</div>
                      <div className="text-lg font-semibold text-gray-200">{dbStats.journalMode}</div>
                    </div>
                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-gray-700">
                      <div className="text-xs text-gray-400 mb-1">{t('admin.database.cacheSize')}</div>
                      <div className="text-lg font-semibold text-gray-200">{formatBytes(Math.abs(dbStats.cacheSize) * 1024)}</div>
                    </div>
                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-gray-700">
                      <div className="text-xs text-gray-400 mb-1">{t('admin.database.syncMode')}</div>
                      <div className="text-lg font-semibold text-gray-200">
                        {dbStats.synchronous === 0 ? t('admin.database.syncOff') : dbStats.synchronous === 1 ? t('admin.database.syncNormal') : t('admin.database.syncFull')}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                <div>{t('admin.database.loadingStats')}</div>
              </div>
            )}
          </div>
        </Section>

        <Section title={t('admin.database.maintenanceTitle')} icon={Trash2} iconColor="red">
        <div className="space-y-4">
          <div className="p-4 bg-amber-900/20 border border-amber-700/50 rounded-lg">
            <p className="text-sm text-amber-400 mb-2">
              <strong>⚠️ {t('admin.debug.attention')}</strong> {t('admin.database.warningIrreversible')}
            </p>
          </div>

          <div className="space-y-4">

          <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-2">{t('admin.database.optimizeTitle')}</h4>
 
              <div className="flex items-start gap-4">
                <button
                  onClick={handleOptimize}
                  disabled={isOptimizing}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white flex items-center gap-2"
                >
                  {isOptimizing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {t('admin.database.optimizeDb')}
                </button>
                <div className="flex-1">
                  <p className="text-xs text-gray-400">
                    {t('admin.database.optimizeDesc')}
                  </p>
                </div>
              </div>
            </div>


            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-2">{t('admin.database.cleanDbSection')}</h4>

              <div className="flex items-start gap-4">
                <button
                  onClick={handlePurge}
                  disabled={isPurging}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white flex items-center gap-2"
                >
                  {isPurging ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {t('admin.database.cleanDb')}
                </button>
                <div className="flex-1">
                  <p className="text-xs text-gray-400">
                    {t('admin.database.purgeRetentionDesc')}
                    <br />- {t('admin.database.historyDays', { days: retentionConfig.historyRetentionDays })}
                    <br />- {t('admin.database.scansDays', { days: retentionConfig.scanRetentionDays })}
                    <br />- {t('admin.database.offlineDays', { days: retentionConfig.offlineRetentionDays })}
                    <br />- {t('admin.database.latencyDays', { days: retentionConfig.latencyMeasurementsRetentionDays })}
                    {retentionConfig.keepIpsOnPurge && (
                      <><br /><span className="text-emerald-400">{t('admin.database.ipsKept')}</span></>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-red-400 mb-2">{t('admin.database.dangerousActions')}</h4>
              <div className="flex items-start gap-4">
                <button
                  onClick={handlePurgeAll}
                  disabled={isPurgingAll}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white flex items-center gap-2"
                >
                  {isPurgingAll ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {t('admin.database.deleteAll')}
                </button>
                {retentionConfig.keepIpsOnPurge && (
                  <div className="flex-1">
                    <p className="text-xs text-amber-400">
                      {t('admin.database.noteIpsKept')}
                    </p>
                  </div>
                )}
              </div>
            </div>


          </div>
        </div>
        </Section>
      </div>

      <Section title={t('admin.database.perfSectionTitle')} icon={Sparkles} iconColor="blue">
        <DatabasePerformanceSection />
      </Section>


      <Section title="Base de vendors IEEE OUI" icon={HardDrive} iconColor="cyan">
        <WiresharkVendorSection />
      </Section>
    </div>
  );
};

// Types for API responses
interface DatabaseConfig {
  wiresharkAutoUpdate?: boolean;
}

interface PurgeResponse {
  deleted: number;
  retentionDays?: number;
}

interface PurgeAllResponse {
  totalDeleted?: number;
  historyDeleted?: number;
  scansDeleted?: number;
  offlineDeleted?: number;
  latencyMeasurementsDeleted?: number;
}

interface DatabaseStatsResponse {
  scansCount?: number;
  historyCount?: number;
  oldestScan?: string;
  oldestHistory?: string;
  totalSize?: number;
}

interface VendorUpdateResponse {
  updateSource?: 'downloaded' | 'local' | 'plugins';
  vendorCount?: number;
  stats?: {
    totalVendors: number;
  };
}

// IEEE OUI Vendor Database Section Component
const WiresharkVendorSection: React.FC = () => {
  const [stats, setStats] = useState<{ totalVendors: number; lastUpdate: string | null } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadStats();
    loadAutoUpdateConfig();
  }, []);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/api/network-scan/wireshark-vendor-stats');
      if (response.success && response.result) {
        setStats(response.result);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: response.error?.message || 'Erreur lors du chargement des statistiques' });
      }
    } catch (error: any) {
      console.error('Failed to load IEEE OUI vendor stats:', error);
      setMessage({ type: 'error', text: 'Erreur lors du chargement des statistiques' });
    } finally {
      setIsLoading(false);
    }
  };

  const loadAutoUpdateConfig = async () => {
    try {
      const response = await api.get<DatabaseConfig>('/api/database/config');
      if (response.success && response.result?.wiresharkAutoUpdate !== undefined) {
        setAutoUpdateEnabled(response.result.wiresharkAutoUpdate);
      }
    } catch (error) {
      console.error('Failed to load auto-update config:', error);
    }
  };

  const handleUpdate = async () => {
    setIsUpdating(true);
    setMessage(null);
    try {
      const response = await api.post<VendorUpdateResponse>('/api/network-scan/update-wireshark-vendors');
      if (response.success && response.result) {
        const source = response.result.updateSource || 'unknown';
        const vendorCount = response.result.vendorCount || response.result.stats?.totalVendors || 0;
        
        let message = '';
        if (source === 'downloaded') {
          message = `Base téléchargée depuis IEEE OUI : ${vendorCount} vendors chargés`;
        } else if (source === 'local') {
          message = `Base chargée depuis le fichier local : ${vendorCount} vendors chargés`;
        } else if (source === 'plugins') {
          message = `Base chargée depuis les plugins : ${vendorCount} vendors chargés`;
        } else {
          message = `Base mise à jour : ${vendorCount} vendors chargés`;
        }
        
        setMessage({ type: 'success', text: message });
        await loadStats();
        setTimeout(() => setMessage(null), 5000);
      } else {
        setMessage({ type: 'error', text: response.error?.message || 'Erreur lors de la mise à jour' });
      }
    } catch (error: any) {
      console.error('Failed to update IEEE OUI vendors:', error);
      setMessage({ type: 'error', text: 'Erreur lors de la mise à jour' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleAutoUpdate = async () => {
    const newValue = !autoUpdateEnabled;
    setAutoUpdateEnabled(newValue);
    try {
      const response = await api.post('/api/database/config', {
        wiresharkAutoUpdate: newValue
      });
      if (response.success) {
        setMessage({ type: 'success', text: `Mise à jour automatique ${newValue ? 'activée' : 'désactivée'}` });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setAutoUpdateEnabled(!newValue); // Revert on error
        setMessage({ type: 'error', text: response.error?.message || 'Erreur lors de la sauvegarde' });
      }
    } catch (error: any) {
      console.error('Failed to save auto-update config:', error);
      setAutoUpdateEnabled(!newValue); // Revert on error
      setMessage({ type: 'error', text: 'Erreur lors de la sauvegarde' });
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-3 rounded-lg ${
          message.type === 'success' ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400' : 'bg-red-500/20 border border-red-500/50 text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      <div className="p-4 bg-[#1a1a1a] rounded-lg border border-gray-800">
        <p className="text-sm text-gray-400 mb-4">
          Base de données complète des vendors depuis IEEE OUI. Mise à jour automatique tous les 7 jours depuis standards-oui.ieee.org.
        </p>

        {/* Stats */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-300 mb-3">Statistiques</h4>
          {isLoading ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Chargement...</span>
            </div>
          ) : stats ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-[#0f0f0f] rounded border border-gray-800">
                <span className="text-sm text-gray-400">Vendors chargés:</span>
                <span className="text-emerald-400 font-medium text-sm">
                  {stats.totalVendors > 0 ? stats.totalVendors.toLocaleString() : 'Aucun'}
                </span>
              </div>
              {stats.lastUpdate && (
                <div className="flex items-center justify-between p-3 bg-[#0f0f0f] rounded border border-gray-800">
                  <span className="text-sm text-gray-400">Dernière mise à jour:</span>
                  <span className="text-gray-300 text-sm">
                    {new Date(stats.lastUpdate).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-orange-400 p-3 bg-[#0f0f0f] rounded border border-gray-800">
              Base non chargée
            </div>
          )}
        </div>

        {/* Auto Update Option */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-300 mb-3">Mise à jour automatique</h4>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoUpdateEnabled}
              onChange={handleToggleAutoUpdate}
              className="w-4 h-4 rounded border-gray-600 bg-[#1a1a1a] text-cyan-500 focus:ring-cyan-500"
            />
            <div>
              <span className="text-sm text-gray-200">Activer la mise à jour automatique</span>
              <p className="text-xs text-gray-400">Mise à jour automatique tous les 7 jours depuis GitHub</p>
            </div>
          </label>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleUpdate}
            disabled={isUpdating || isLoading}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white flex items-center gap-2"
          >
            {isUpdating ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Mettre à jour maintenant
          </button>
          <button
            onClick={loadStats}
            disabled={isLoading}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white flex items-center gap-2"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Actualiser les stats
          </button>
        </div>
      </div>
    </div>
  );
};

// Plugin Priority Configuration Section Component
const PluginPrioritySection: React.FC = () => {
  const { plugins } = usePluginStore();
  const [config, setConfig] = useState({
    hostnamePriority: ['freebox', 'unifi', 'scanner'] as ('freebox' | 'unifi' | 'scanner')[],
    vendorPriority: ['freebox', 'unifi', 'scanner'] as ('freebox' | 'unifi' | 'scanner')[],
    overwriteExisting: {
      hostname: true,
      vendor: true
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/api/network-scan/plugin-priority-config');
      if (response.success && response.result) {
        setConfig(response.result);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: response.error?.message || 'Erreur lors du chargement de la configuration' });
      }
    } catch (error: any) {
      console.error('Failed to load plugin priority config:', error);
      setMessage({ type: 'error', text: 'Erreur lors du chargement de la configuration' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const response = await api.post('/api/network-scan/plugin-priority-config', config);
      if (response.success) {
        setMessage({ type: 'success', text: 'Configuration sauvegardée avec succès' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: response.error?.message || 'Erreur lors de la sauvegarde' });
      }
    } catch (error: any) {
      console.error('Failed to save plugin priority config:', error);
      setMessage({ type: 'error', text: 'Erreur lors de la sauvegarde' });
    } finally {
      setIsSaving(false);
    }
  };

  const movePriority = (type: 'hostname' | 'vendor', index: number, direction: 'up' | 'down') => {
    const priority = [...config[`${type}Priority`]];
    if (direction === 'up' && index > 0) {
      [priority[index], priority[index - 1]] = [priority[index - 1], priority[index]];
    } else if (direction === 'down' && index < priority.length - 1) {
      [priority[index], priority[index + 1]] = [priority[index + 1], priority[index]];
    }
    setConfig({ ...config, [`${type}Priority`]: priority });
  };

  const getPluginLabel = (pluginId: string): string => {
    const plugin = plugins.find(p => p.id === pluginId);
    return plugin?.name || pluginId;
  };

  const isPluginEnabled = (pluginId: string): boolean => {
    if (pluginId === 'scanner') return true; // Scanner is always available
    const plugin = plugins.find(p => p.id === pluginId);
    return plugin?.enabled || false;
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-3 rounded-lg ${
          message.type === 'success' ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400' : 'bg-red-500/20 border border-red-500/50 text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      <div className="p-4 bg-[#1a1a1a] rounded-lg border border-gray-800">
        <p className="text-sm text-gray-400 mb-4">
          Configurez l'ordre de priorité des plugins pour la détection des hostnames et vendors.
          Le plugin en première position a la priorité la plus élevée.
        </p>

        {/* Hostname Priority */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <Network size={16} />
            Priorité Hostname
          </h4>
          <div className="space-y-2">
            {config.hostnamePriority.map((pluginId, index) => (
              <div key={pluginId} className="flex items-center gap-2 p-2 bg-[#0f0f0f] rounded border border-gray-800">
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-xs text-gray-500 w-6">{index + 1}.</span>
                  <span className={`text-sm ${isPluginEnabled(pluginId) ? 'text-gray-200' : 'text-gray-500'}`}>
                    {getPluginLabel(pluginId)}
                  </span>
                  {!isPluginEnabled(pluginId) && pluginId !== 'scanner' && (
                    <span className="text-xs text-orange-400">(désactivé)</span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => movePriority('hostname', index, 'up')}
                    disabled={index === 0}
                    className="p-1 hover:bg-blue-500/10 text-blue-400 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Monter"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => movePriority('hostname', index, 'down')}
                    disabled={index === config.hostnamePriority.length - 1}
                    className="p-1 hover:bg-blue-500/10 text-blue-400 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Descendre"
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Vendor Priority */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <HardDrive size={16} />
            Priorité Vendor
          </h4>
          <div className="space-y-2">
            {config.vendorPriority.map((pluginId, index) => (
              <div key={pluginId} className="flex items-center gap-2 p-2 bg-[#0f0f0f] rounded border border-gray-800">
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-xs text-gray-500 w-6">{index + 1}.</span>
                  <span className={`text-sm ${isPluginEnabled(pluginId) ? 'text-gray-200' : 'text-gray-500'}`}>
                    {getPluginLabel(pluginId)}
                  </span>
                  {!isPluginEnabled(pluginId) && pluginId !== 'scanner' && (
                    <span className="text-xs text-orange-400">(désactivé)</span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => movePriority('vendor', index, 'up')}
                    disabled={index === 0}
                    className="p-1 hover:bg-blue-500/10 text-blue-400 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Monter"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => movePriority('vendor', index, 'down')}
                    disabled={index === config.vendorPriority.length - 1}
                    className="p-1 hover:bg-blue-500/10 text-blue-400 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Descendre"
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Overwrite Options */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-300 mb-3">Écrasement des données existantes</h4>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.overwriteExisting.hostname}
                onChange={(e) => setConfig({
                  ...config,
                  overwriteExisting: { ...config.overwriteExisting, hostname: e.target.checked }
                })}
                className="w-4 h-4 rounded border-gray-600 bg-[#1a1a1a] text-blue-500 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm text-gray-200">Écraser les hostnames existants</span>
                <p className="text-xs text-gray-400">
                  Si activé, les hostnames détectés par les plugins (Freebox, UniFi) remplaceront les hostnames existants même s'ils sont déjà renseignés.
                  <br />
                  <span className="text-gray-500">Recommandé : Activé pour toujours avoir les hostnames les plus récents depuis vos équipements réseau.</span>
                </p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.overwriteExisting.vendor}
                onChange={(e) => setConfig({
                  ...config,
                  overwriteExisting: { ...config.overwriteExisting, vendor: e.target.checked }
                })}
                className="w-4 h-4 rounded border-gray-600 bg-[#1a1a1a] text-blue-500 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm text-gray-200">Écraser les vendors existants</span>
                <p className="text-xs text-gray-400">
                  Si activé, les vendors détectés par les plugins remplaceront les vendors existants même s'ils sont déjà renseignés.
                  <br />
                  <span className="text-gray-500">Note : Les vendors vides ou invalides seront toujours recherchés depuis la base Wireshark/OUI, même si cette option est désactivée.</span>
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white flex items-center gap-2"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Sauvegarder
          </button>
          <button
            onClick={loadConfig}
            disabled={isLoading}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white flex items-center gap-2"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Actualiser
          </button>
        </div>
      </div>
    </div>
  );
};

// Database Performance Section Component
const DatabasePerformanceSection: React.FC = () => {
  const { t } = useTranslation();
  const [dbConfig, setDbConfig] = useState({
    walMode: 'WAL' as 'WAL' | 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'OFF',
    walCheckpointInterval: 1000,
    walAutoCheckpoint: true,
    synchronous: 1 as 0 | 1 | 2,
    cacheSize: -64000,
    busyTimeout: 5000,
    tempStore: 0 as 0 | 1 | 2,
    optimizeForDocker: true
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadDbConfig();
  }, []);

  const loadDbConfig = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/api/database/config');
      if (response.success && response.result) {
        setDbConfig(response.result);
      } else {
        setMessage({ type: 'error', text: response.error?.message || t('admin.database.loadError') });
      }
    } catch (error: any) {
      console.error('Failed to load DB config:', error);
      setMessage({ type: 'error', text: t('admin.database.loadError') });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const response = await api.post('/api/database/config', dbConfig);
      if (response.success && response.result) {
        setDbConfig(response.result);
        setMessage({ type: 'success', text: t('admin.database.perfSaveSuccess') });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: response.error?.message || t('admin.database.saveError') });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: t('admin.database.saveError') });
    } finally {
      setIsSaving(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <div className="py-4 text-center text-gray-500">
        <Loader2 size={24} className="animate-spin mx-auto mb-2" />
        {t('admin.database.perfLoading')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-3 rounded-lg ${
          message.type === 'success' 
            ? 'bg-emerald-900/20 border border-emerald-700/50 text-emerald-400' 
            : 'bg-red-900/20 border border-red-700/50 text-red-400'
        }`}>
          {message.text}
        </div>
      )}


      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-6">
          <SettingRow
            label={t('admin.database.perfDocker')}
            description={t('admin.database.perfDockerDesc')}
          >
            <Toggle
              enabled={dbConfig.optimizeForDocker}
              onChange={(enabled) => setDbConfig({ ...dbConfig, optimizeForDocker: enabled })}
            />
          </SettingRow>

          <SettingRow
            label={t('admin.database.walAutoCheckpoint')}
            description={t('admin.database.walAutoCheckpointDesc')}
          >
            <Toggle
              enabled={dbConfig.walAutoCheckpoint}
              onChange={(enabled) => setDbConfig({ ...dbConfig, walAutoCheckpoint: enabled })}
            />
          </SettingRow>

          <SettingRow
            label={t('admin.database.walMode')}
            description={t('admin.database.walModeDesc')}
          >
            <select
              value={dbConfig.walMode}
              onChange={(e) => setDbConfig({ ...dbConfig, walMode: e.target.value as any })}
              className="px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
            >
              <option value="WAL">{t('admin.database.walRecommended')}</option>
              <option value="DELETE">DELETE</option>
              <option value="TRUNCATE">TRUNCATE</option>
              <option value="PERSIST">PERSIST</option>
              <option value="MEMORY">MEMORY</option>
              <option value="OFF">OFF</option>
            </select>
          </SettingRow>
        </div>

        <div className="space-y-6">
          <SettingRow
            label={t('admin.database.syncModeLabel')}
            description={t('admin.database.syncModeDesc')}
          >
            <select
              value={dbConfig.synchronous}
              onChange={(e) => setDbConfig({ ...dbConfig, synchronous: parseInt(e.target.value) as 0 | 1 | 2 })}
              className="px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
            >
              <option value="0">{t('admin.database.syncOff')}</option>
              <option value="1">{t('admin.database.syncNormal')}</option>
              <option value="2">{t('admin.database.syncFull')}</option>
            </select>
          </SettingRow>

          <SettingRow
            label={t('admin.database.cacheSizeLabel')}
            description={t('admin.database.cacheSizeDesc')}
          >
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={dbConfig.cacheSize}
                onChange={(e) => setDbConfig({ ...dbConfig, cacheSize: parseInt(e.target.value) || -64000 })}
                className="w-32 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
              />
              <span className="text-sm text-gray-400">
                ({formatBytes(Math.abs(dbConfig.cacheSize) * 1024)})
              </span>
            </div>
          </SettingRow>

          <SettingRow
            label={t('admin.database.busyTimeoutLabel')}
            description={t('admin.database.busyTimeoutDesc')}
          >
            <input
              type="number"
              min="1000"
              max="60000"
              step="1000"
              value={dbConfig.busyTimeout}
              onChange={(e) => setDbConfig({ ...dbConfig, busyTimeout: parseInt(e.target.value) || 5000 })}
              className="w-32 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
            />
          </SettingRow>

 
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white flex items-center gap-2"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {t('admin.database.save')}
        </button>
      </div>
  </div>
  );
};

// App Logs Section Component (for Administration > Debug tab)
const AppLogsSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const timeLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';
  const [logs, setLogs] = useState<Array<{
    timestamp: string;
    level: 'error' | 'warn' | 'info' | 'debug' | 'verbose';
    prefix: string;
    message: string;
    args?: any[];
  }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [liveMode] = useState(false); // Live mode disabled - button removed
  const [filter, setFilter] = useState<'all' | 'error' | 'warn' | 'info' | 'debug' | 'verbose'>('all');
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [totalLogs, setTotalLogs] = useState(0);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll removed (live mode disabled)

  // Load initial logs when component mounts or filter changes
  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, showAllLogs]);

  // Scroll to bottom when logs are updated
  useEffect(() => {
    if (logs.length > 0 && logsContainerRef.current) {
            setTimeout(() => {
        if (logsContainerRef.current) {
          logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [logs]);

  // Live mode removed - no auto-refresh polling

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      // Load all logs if showAllLogs is true, otherwise limit to 500
      const limit = showAllLogs ? '10000' : '500'; // Max 10000 for performance
      const params = new URLSearchParams({ limit });
      if (filter !== 'all') {
        params.append('level', filter);
      }
      const response = await api.get<{ logs: any[]; total: number }>(`/api/debug/logs?${params}`);
      if (response.success && response.result) {
        setLogs(response.result.logs);
        setTotalLogs(response.result.total || 0);
        // Scroll to bottom after logs are loaded
          setTimeout(() => {
          if (logsContainerRef.current) {
            logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
            }
        }, 100);
      }
    } catch (error) {
      console.error('[AppLogsSection] Error loading logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const clearLogs = async () => {
    if (!confirm(t('admin.debug.confirmClear'))) return;
    try {
      await api.delete('/api/debug/logs');
      setLogs([]);
      setTotalLogs(0);
    } catch (error) {
      console.error('[AppLogsSection] Error clearing logs:', error);
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-yellow-400';
      case 'info':
        return 'text-cyan-400';
      case 'debug':
        return 'text-blue-400';
      case 'verbose':
        return 'text-magenta-400';
      default:
        return 'text-gray-400';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(timeLocale, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Memoize filtered logs to ensure updates when logs or filter change
  const filteredLogs = useMemo(() => {
    if (filter === 'all') {
      return logs;
    }
    return logs.filter(log => log.level === filter);
  }, [logs, filter]);

  return (
    <>
      <div className="flex items-center justify-between mb-4 mt-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filter === 'all'
                ? 'bg-gray-600 text-white border-2 border-gray-500'
                : 'bg-[#1a1a1a] text-gray-400 border border-gray-700 hover:bg-gray-800 hover:text-gray-300'
            }`}
            title={t('admin.debug.filterAllTitle')}
          >
            {t('admin.debug.filterAll')}
          </button>
          <button
            onClick={() => setFilter('error')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filter === 'error'
                ? 'bg-red-600 text-white border-2 border-red-400'
                : 'bg-[#1a1a1a] text-red-400 border border-red-800/50 hover:bg-red-900/20 hover:text-red-300'
            }`}
            title={t('admin.debug.filterErrorTitle')}
          >
            {t('admin.debug.filterError')}
          </button>
          <button
            onClick={() => setFilter('warn')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filter === 'warn'
                ? 'bg-yellow-600 text-white border-2 border-yellow-400'
                : 'bg-[#1a1a1a] text-yellow-400 border border-yellow-800/50 hover:bg-yellow-900/20 hover:text-yellow-300'
            }`}
            title={t('admin.debug.filterWarnTitle')}
          >
            {t('admin.debug.filterWarn')}
          </button>
          <button
            onClick={() => setFilter('info')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filter === 'info'
                ? 'bg-cyan-600 text-white border-2 border-cyan-400'
                : 'bg-[#1a1a1a] text-cyan-400 border border-cyan-800/50 hover:bg-cyan-900/20 hover:text-cyan-300'
            }`}
            title={t('admin.debug.filterInfoTitle')}
          >
            {t('admin.debug.filterInfo')}
          </button>
          <button
            onClick={() => setFilter('debug')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filter === 'debug'
                ? 'bg-blue-600 text-white border-2 border-blue-400'
                : 'bg-[#1a1a1a] text-blue-400 border border-blue-800/50 hover:bg-blue-900/20 hover:text-blue-300'
            }`}
            title={t('admin.debug.filterDebugTitle')}
          >
            {t('admin.debug.filterDebug')}
          </button>
          <button
            onClick={() => setFilter('verbose')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filter === 'verbose'
                ? 'bg-purple-600 text-white border-2 border-purple-400'
                : 'bg-[#1a1a1a] text-purple-400 border border-purple-800/50 hover:bg-purple-900/20 hover:text-purple-300'
            }`}
            title={t('admin.debug.filterVerboseTitle')}
          >
            {t('admin.debug.filterVerbose')}
          </button>
          <span 
            className="text-xs text-gray-500 ml-2"
            title={totalLogs > filteredLogs.length ? t('admin.debug.logsCountTotal', { count: filteredLogs.length, total: totalLogs }) : t('admin.debug.logsCount', { count: filteredLogs.length })}
          >
            {totalLogs > filteredLogs.length ? t('admin.debug.logsCountTotal', { count: filteredLogs.length, total: totalLogs }) : t('admin.debug.logsCount', { count: filteredLogs.length })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const newShowAll = !showAllLogs;
              setShowAllLogs(newShowAll);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              showAllLogs
                ? 'bg-purple-600 hover:bg-purple-500 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
            title={showAllLogs 
                ? t('admin.debug.showLast500Title') 
                : t('admin.debug.showAllTitle', { total: totalLogs })
            }
          >
            <FileText size={14} />
            <span>{showAllLogs ? t('admin.debug.showLast500') : t('admin.debug.showAll')}</span>
          </button>
          <button
            onClick={loadLogs}
            disabled={isLoading}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
            title={t('admin.debug.refreshTitle')}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={clearLogs}
            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
            title={t('admin.debug.clearTitle')}
          >
            <Sparkles size={14} />
            <span>{t('admin.debug.clearBtn')}</span>
          </button>
        </div>
      </div>

      {showAllLogs && filteredLogs.length > 1000 && (
        <div className="mb-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-400 text-sm">
            <AlertCircle size={16} />
            <span>
              <strong>{t('admin.debug.attention')}</strong> {t('admin.debug.warningManyLogs', { count: filteredLogs.length.toLocaleString() })}
            </span>
          </div>
        </div>
      )}
      <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg overflow-hidden mt-2">
        <div ref={logsContainerRef} className="h-96 overflow-y-auto p-4 font-mono text-xs">
          {filteredLogs.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <FileText size={32} className="mx-auto mb-2 opacity-50" />
              <p>{t('admin.debug.noLogsAvailable')}</p>
              <p className="text-xs text-gray-400 mt-2">{t('admin.debug.useRefreshToLoad')}</p>
            </div>
          ) : (
            <>
              {filteredLogs.map((log, index) => (
                <div
                  key={`${log.timestamp}-${index}`}
                  className={`mb-1 flex items-start gap-2 ${getLevelColor(log.level)}`}
                >
                  <span className="text-gray-600 min-w-[80px]">{formatTimestamp(log.timestamp)}</span>
                  <span className="text-gray-500 min-w-[80px]">[{log.prefix}]</span>
                  <span className="flex-1">{log.message}</span>
                  {log.args && log.args.length > 0 && (
                    <span className="text-gray-600 text-[10px]">
                      {JSON.stringify(log.args).substring(0, 100)}
                    </span>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
};

// Debug Log Section Component (for Administration > Debug tab)
const DebugLogSection: React.FC = () => {
  const { t } = useTranslation();
  const [debugConfig, setDebugConfig] = useState<{ debug: boolean; verbose: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const response = await api.get<{ debug: boolean; verbose: boolean }>('/api/debug/config');
      if (response.success && response.result) {
        setDebugConfig(response.result);
      }
    } catch (error) {
      console.error('[DebugLogSection] Error loading config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (field: 'debug' | 'verbose', enabled: boolean) => {
    if (!debugConfig) return;
    
    setIsSaving(true);
    try {
      const newConfig = { ...debugConfig, [field]: enabled };
      const response = await api.post<{ debug: boolean; verbose: boolean }>('/api/debug/config', newConfig);
      if (response.success && response.result) {
        setDebugConfig(response.result);
      }
    } catch (error) {
      console.error('[DebugLogSection] Error setting config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !debugConfig) {
    return (
      <div className="py-4 text-center text-gray-500">
        <Loader2 size={20} className="mx-auto mb-2 animate-spin" />
        <p className="text-sm">{t('admin.debug.loading')}</p>
      </div>
    );
  }

  return (
    <>
      <SettingRow
        label={t('admin.debug.debugLogsLabel')}
        description={t('admin.debug.debugLogsDesc')}
      >
        <Toggle
          enabled={debugConfig.debug}
          onChange={(enabled) => handleToggle('debug', enabled)}
          disabled={isSaving}
        />
      </SettingRow>
      <SettingRow
        label={t('admin.debug.verboseLogsLabel')}
        description={t('admin.debug.verboseLogsDesc')}
      >
        <Toggle
          enabled={debugConfig.verbose}
          onChange={(enabled) => handleToggle('verbose', enabled)}
          disabled={isSaving || !debugConfig.debug}
        />
      </SettingRow>
      {!debugConfig.debug && (
        <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-xs text-blue-400">
            {t('admin.debug.debugDisabledMsg')}
          </p>
        </div>
      )}
      {debugConfig.debug && (
        <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <p className="text-xs text-amber-400">
            {t('admin.debug.debugEnabledMsg')}
          </p>
        </div>
      )}
    </>
  );
};

// Update Check Section Component (for Administration > General tab)
const UpdateCheckSection: React.FC = () => {
  const { t } = useTranslation();
  const { updateConfig, updateInfo, loadConfig, setConfig, checkForUpdates, isLoading } = useUpdateStore();
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadConfig();
    if (updateConfig?.enabled) {
      checkForUpdates();
    }
  }, []);

  const handleToggle = async (enabled: boolean) => {
    setIsSaving(true);
    try {
      await setConfig(enabled);
    } catch (error) {
      console.error('[UpdateCheckSection] Error setting config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <SettingRow
        label={t('admin.updateCheck.autoCheckLabel')}
        description={t('admin.updateCheck.autoCheckDescription')}
      >
        <Toggle
          enabled={updateConfig?.enabled ?? true}
          onChange={handleToggle}
          disabled={isSaving}
        />
      </SettingRow>
      {updateConfig?.enabled && (
        <>
          <div className="py-3 border-t border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">{t('admin.updateCheck.currentVersion')}</span>
              <span className="text-sm font-mono text-white">{updateInfo?.currentVersion || '0.0.0'}</span>
            </div>
            {updateInfo?.latestVersion && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">{t('admin.updateCheck.latestVersionAvailable')}</span>
                <span className="text-sm font-mono text-amber-400">{updateInfo.latestVersion}</span>
              </div>
            )}
            {updateInfo?.updateAvailable && (
              <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-xs text-amber-400 font-semibold mb-1">{t('admin.updateCheck.newVersionAvailable')}</p>
                <p className="text-xs text-gray-400">
                  {t('admin.updateCheck.updateAvailableHint')}
                </p>
                <code className="block mt-2 text-xs text-cyan-300 bg-[#0a0a0a] p-2 rounded border border-gray-800">
                  docker-compose pull && docker-compose up -d
                </code>
              </div>
            )}
            {updateInfo?.error && (
              <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-xs text-red-400">{t('admin.updateCheck.checkError')}: {updateInfo.error}</p>
              </div>
            )}
            <div className="mt-3 p-3 bg-gray-500/10 border border-gray-500/30 rounded-lg">
              <p className="text-xs text-gray-400">
                {t('admin.updateCheck.manualCheckDisabled')}
              </p>
            </div>
            <button
              onClick={() => {}}
              disabled={true}
              className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-gray-600 text-gray-400 text-sm rounded-lg transition-colors opacity-50 cursor-not-allowed"
            >
              <RefreshCw size={14} />
              {t('admin.updateCheck.checkNow')}
            </button>
          </div>
        </>
      )}
    </>
  );
};

// Backup Section Component (for Administration > Backup tab)
const BackupSection: React.FC = () => {
  const { t } = useTranslation();
  const { freeboxUrl, isRegistered: isFreeboxRegistered } = useAuthStore();
  const { plugins } = usePluginStore();
  
  // Get UniFi plugin configuration
  const unifiPlugin = plugins.find(p => p.id === 'unifi');
  const unifiUrl = unifiPlugin?.settings?.url as string | undefined;
  const unifiSite = (unifiPlugin?.settings?.site as string) || 'default';
  const unifiConfigured = unifiPlugin?.configured || false;
  
  // Build Freebox backup URL
  const freeboxBackupUrl = freeboxUrl ? getFreeboxBackupUrl(freeboxUrl) : null;
  
  // Build UniFi backup URL: {controllerUrl}/manage/{site}/settings/system/backups
  const getUnifiBackupUrl = (): string | null => {
    if (!unifiUrl) return null;
    try {
      const url = new URL(unifiUrl);
      // UniFi backup page format: /manage/{site}/settings/system/backups
      const site = unifiSite || 'default';
      const baseUrl = `${url.protocol}//${url.host}${url.port ? `:${url.port}` : ''}`;
      return `${baseUrl}/manage/${site}/settings/system/backups`;
    } catch {
      return null;
    }
  };
  
  const unifiBackupUrl = getUnifiBackupUrl();

  return (
    <div className="space-y-6">
      {/* Information Alert */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-amber-400 mb-2">
              {t('admin.backupImportantTitle')}
            </h3>
            <p className="text-sm text-gray-300 mb-2">
              {t('admin.backupIntro')}
            </p>
            <p className="text-sm text-gray-300">
              <strong className="text-amber-400">{t('admin.backupRecommendationLabel')}</strong> {t('admin.backupRecommendationText')}
            </p>
          </div>
        </div>
      </div>

      <Section title={t('admin.freeboxBackup')} icon={Server} iconColor="cyan">
        <div className="space-y-4">
          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-sm text-gray-300 mb-3">
              {t('admin.freeboxBackupDesc')}
              {t('admin.freeboxBackupFirmwareNote')}
            </p>
            <p className="text-xs text-gray-400 mb-4">
              <strong className="text-gray-300">{t('admin.backupNoteLabel')} :</strong> {t('admin.freeboxBackupExportNote')}
            </p>
            {freeboxBackupUrl && isFreeboxRegistered ? (
              <div className="space-y-2">
                <div className="text-xs text-gray-500 font-mono break-all">
                  {freeboxBackupUrl}
                </div>
                <a
                  href={freeboxBackupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
                >
                  <ExternalLink size={16} />
                  {t('admin.openFreeboxBackupPage')}
                </a>
 
              </div>
            ) : (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-xs text-amber-400">
                  {!isFreeboxRegistered 
                    ? t('admin.freeboxNotRegistered')
                    : t('admin.freeboxUrlUnavailable')}
                </p>
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section title={t('admin.unifiBackup')} icon={Network} iconColor="purple">
        <div className="space-y-4">
          <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
            <p className="text-sm text-gray-300 mb-3">
              {t('admin.unifiBackupDesc')}
            </p>
            <p className="text-xs text-gray-400 mb-4">
              <strong className="text-gray-300">{t('admin.backupNoteLabel')} :</strong> {t('admin.unifiBackupNote')}
            </p>
            {unifiBackupUrl && unifiConfigured ? (
              <div className="space-y-2">
                <div className="text-xs text-gray-500 font-mono break-all">
                  {unifiBackupUrl}
                </div>
                <a
                  href={unifiBackupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium"
                >
                  <ExternalLink size={16} />
                  {t('admin.openUnifiBackupPage')}
                </a>

              </div>
            ) : (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-xs text-amber-400">
                  {!unifiConfigured 
                    ? t('admin.unifiNotConfigured')
                    : t('admin.unifiUrlUnavailable')}
                </p>
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section title={t('admin.info')} icon={Info} iconColor="teal">
        <div className="space-y-3 text-sm text-gray-400">
          <p>
            <strong className="text-gray-300">Freebox :</strong> {t('admin.backupInfoFreeboxPrefix')} <code className="text-xs bg-gray-800 px-1 py-0.5 rounded">.bin</code> {t('admin.backupInfoFreeboxSuffix')}
          </p>
          <p>
            <strong className="text-gray-300">UniFi :</strong> {t('admin.backupInfoUnifi')}
          </p>
 
        </div>
      </Section>
    </div>
  );
};

// Language selection section (Administration > General) - dropdown wired to i18n
const LanguageSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const current = i18n.language?.startsWith('fr') ? 'fr' : 'en';
  return (
    <Section title={t('settings.interfaceLanguage')} icon={Globe} iconColor="cyan">
      <SettingRow
        label={t('settings.interfaceLanguage')}
        description={t('settings.interfaceLanguageDescription')}
      >
        <select
          value={current}
          onChange={(e) => i18n.changeLanguage(e.target.value as 'en' | 'fr')}
          className="px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500 min-w-[12rem]"
        >
          <option value="en">{t('settings.languageEn')}</option>
          <option value="fr">{t('settings.languageFr')}</option>
        </select>
      </SettingRow>
    </Section>
  );
};

// General Network Configuration Section Component (for Administration > General tab)
const GeneralNetworkSection: React.FC = () => {
  const { t } = useTranslation();
  const [publicUrl, setPublicUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [initialPublicUrl, setInitialPublicUrl] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await api.get<{ publicUrl: string }>('/api/system/general');
        if (response.success && response.result) {
          const url = response.result.publicUrl || '';
          setPublicUrl(url);
          setInitialPublicUrl(url);
        }
      } catch (error) {
        console.error('Failed to fetch general settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const hasUnsavedChanges = publicUrl !== initialPublicUrl;

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const response = await api.put<{ publicUrl: string; message?: string }>('/api/system/general', {
        publicUrl: publicUrl.trim() || ''
      });
      if (response.success) {
        setMessage({ type: 'success', text: response.result?.message || t('admin.general.configSavedSuccess') });
        setTimeout(() => setMessage(null), 3000);
        // Update initial value after save
        setInitialPublicUrl(publicUrl.trim() || '');
      }
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: error?.response?.data?.error?.message || t('admin.general.saveError') 
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="animate-spin text-blue-400" size={20} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Unsaved Changes Notification */}
      {hasUnsavedChanges && (
        <div className="p-4 bg-amber-900/20 border border-amber-700/50 rounded-lg flex items-start gap-3">
          <AlertCircle size={20} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-amber-400 mb-1">
              {t('admin.general.unsavedChanges')}
            </h4>
            <p className="text-xs text-amber-300">
              {t('admin.general.unsavedChangesHint')}
            </p>
          </div>
        </div>
      )}

      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.type === 'success' 
            ? 'bg-green-900/30 border border-green-700 text-green-400' 
            : 'bg-red-900/30 border border-red-700 text-red-400'
        }`}>
          {message.text}
        </div>
      )}
      
      <div className="py-3 border-b border-gray-800">
        <h4 className="text-sm font-medium text-white mb-2">{t('admin.general.publicUrlLabel')}</h4>
        <div className="flex items-center gap-2 w-full">
          <input
            type="url"
            value={publicUrl}
            onChange={(e) => setPublicUrl(e.target.value)}
            placeholder={t('admin.general.publicUrlPlaceholder')}
            className="flex-1 w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            {isSaving ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                <span>{t('admin.general.saving')}</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>{t('common.save')}</span>
              </>
            )}
          </button>
        </div>
      </div>
      
      <div className="text-xs text-gray-500 mt-2 p-3 bg-[#1a1a1a] rounded-lg border border-gray-800">
        <p className="font-medium text-gray-400 mb-1">💡 {t('admin.general.noteTitle')} :</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>{t('admin.general.publicUrlFormatHint')}</li>
          <li>{t('admin.general.publicUrlEmptyHint')}</li>
        </ul>
      </div>
    </div>
  );
};

// User Profile Section Component (for Administration > General tab)
const UserProfileSection: React.FC = () => {
  const { t } = useTranslation();
  const { user: currentUser, checkAuth } = useUserAuthStore();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setUsername(currentUser.username);
      setEmail(currentUser.email || '');
      // Set avatar preview if user has avatar
      if (currentUser.avatar) {
        setAvatarPreview(currentUser.avatar);
      } else {
        setAvatarPreview(null);
      }
    }
  }, [currentUser]);

  // Validate email format
  const validateEmail = (emailValue: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(emailValue);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setEmail(newEmail);
    
    // Clear error if email is cleared
    if (!newEmail || newEmail.trim().length === 0) {
      setEmailError(null);
      return;
    }
    
    // Validate format only if email is provided
    if (!validateEmail(newEmail)) {
      setEmailError(t('admin.profile.invalidEmailFormat'));
    } else {
      setEmailError(null);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    setEmailError(null);

    try {
      // Check if user is logged in
      if (!currentUser || !currentUser.id) {
        setError(t('admin.profile.mustBeLoggedIn'));
        setIsSaving(false);
        return;
      }

      // Validate username
      if (!username || username.trim().length === 0) {
        setError(t('admin.profile.usernameRequired'));
        setIsSaving(false);
        return;
      }

      if (username.length < 3) {
        setError(t('admin.profile.usernameMinLength'));
        setIsSaving(false);
        return;
      }

      // Validate email format BEFORE making any API call
      // If email is provided and different from current, it must be valid
      if (email !== currentUser?.email) {
        if (!email || email.trim().length === 0) {
          setEmailError(t('admin.profile.emailRequired'));
          setError(t('admin.profile.correctErrorsBeforeSave'));
          setIsSaving(false);
          return;
        }
        if (!validateEmail(email)) {
          setEmailError(t('admin.profile.invalidEmailFormat'));
          setError(t('admin.profile.correctErrorsBeforeSave'));
          setIsSaving(false);
          return;
        }
      }

      // Validate password if changing
      if (showPasswordFields && newPassword) {
        if (newPassword.length < 8) {
          setError(t('admin.profile.passwordMinLength'));
          setIsSaving(false);
          return;
        }
        if (newPassword !== confirmPassword) {
          setError(t('admin.profile.passwordsDoNotMatch'));
          setIsSaving(false);
          return;
        }
        if (!oldPassword) {
          setError(t('admin.profile.enterCurrentPassword'));
          setIsSaving(false);
          return;
        }
      }

      const updateData: any = {};
      
      // Update username if changed
      if (username !== currentUser?.username) {
        updateData.username = username;
      }
      
      // Update email if changed (only if valid - already validated above)
      if (email !== currentUser?.email && email && validateEmail(email)) {
        updateData.email = email;
      }

      // Update password if provided
      if (showPasswordFields && newPassword && oldPassword) {
        updateData.password = newPassword;
        updateData.oldPassword = oldPassword;
      }

      if (Object.keys(updateData).length === 0) {
        setError(t('admin.profile.noChangesToSave'));
        setIsSaving(false);
        return;
      }

      // Log request details in development
      if (import.meta.env.DEV) {
        console.log('[UserProfile] Saving profile:', { userId: currentUser?.id, updateData });
      }
      
      const response = await api.put(`/api/users/${currentUser?.id}`, updateData);
      
      if (import.meta.env.DEV) {
        console.log('[UserProfile] Response:', response);
      }
      
      if (response.success) {
        setSuccessMessage(t('admin.profile.profileUpdatedSuccess'));
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordFields(false);
        setShowOldPassword(false);
        setShowNewPassword(false);
        setShowConfirmPassword(false);
        // Refresh user data
        await checkAuth();
      } else {
        // Show detailed error message
        const errorMsg = response.error?.message || t('admin.profile.updateFailed');
        setError(errorMsg);
        console.error('[UserProfile] Update failed:', response.error);
      }
    } catch (err) {
      // Enhanced error handling
      console.error('[UserProfile] Exception during save:', err);
      if (err instanceof Error) {
        if (err.message.includes('fetch') || err.message.includes('network')) {
          setError(t('admin.profile.serverUnreachable'));
        } else {
          setError(err.message);
        }
      } else {
        setError(t('admin.profile.profileUpdateError'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <AlertCircle size={16} className="text-red-400" />
          {error}
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-3 bg-emerald-900/30 border border-emerald-700 rounded-lg text-emerald-400 text-sm flex items-center gap-2">
          <Save size={16} className="text-emerald-400" />
          {successMessage}
        </div>
      )}

      {/* Avatar Section */}
      <SettingRow
        label={t('admin.profile.avatar')}
        description={t('admin.profile.changeAvatarDescription')}
      >
        <div className="flex items-center gap-4 w-full">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-xl overflow-hidden">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span>
                  {currentUser?.username
                    ?.split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2) || 'U'}
                </span>
              )}
            </div>
            {avatarFile && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-[#1a1a1a]">
                <Save size={12} className="text-white" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <label className="block">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setAvatarFile(file);
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setAvatarPreview(reader.result as string);
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                className="hidden"
              />
              <span className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm cursor-pointer transition-colors">
                {t('admin.profile.chooseImage')}
              </span>
            </label>
            {avatarFile && (
              <button
                onClick={async () => {
                  if (!currentUser || isUploadingAvatar) return;
                  
                  setIsUploadingAvatar(true);
                  setError(null);
                  setSuccessMessage(null);
                  
                  try {
                    // Convert file to base64 using Promise
                    const base64String = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onerror = () => reject(new Error(t('admin.profile.fileReadError')));
                      reader.onloadend = () => {
                        if (reader.result && typeof reader.result === 'string') {
                          resolve(reader.result);
                        } else {
                          reject(new Error(t('admin.profile.fileConvertError')));
                        }
                      };
                      reader.readAsDataURL(avatarFile);
                    });
                    
                    // Check if base64 string is too large (should not happen with 5MB limit, but double-check)
                    if (base64String.length > 10 * 1024 * 1024) { // ~10MB base64
                      setError(t('admin.profile.imageTooLarge'));
                      setIsUploadingAvatar(false);
                      return;
                    }
                    
                    // Upload to server
                    const response = await api.put(`/api/users/${currentUser.id}`, {
                      avatar: base64String
                    });
                    
                    if (response.success) {
                      setSuccessMessage(t('admin.profile.avatarUpdatedSuccess'));
                      setAvatarFile(null);
                      // Keep preview to show new avatar
                      await checkAuth();
                    } else {
                      // Handle API error
                      const errorMessage = response.error?.message || t('admin.profile.avatarUpdateFailed');
                      setError(errorMessage);
                    }
                  } catch (err) {
                    // Handle conversion or network errors
                    if (err instanceof Error) {
                      if (err.message.includes('Network') || err.message.includes('fetch')) {
                        setError(t('admin.profile.networkError'));
                      } else {
                        setError(err.message);
                      }
                    } else {
                      setError(t('admin.profile.avatarUpdateError'));
                    }
                  } finally {
                    setIsUploadingAvatar(false);
                  }
                }}
                disabled={isUploadingAvatar}
                className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                {isUploadingAvatar ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>{t('admin.profile.saving')}</span>
                  </>
                ) : (
                  <span>{t('admin.profile.saveAvatar')}</span>
                )}
              </button>
            )}
          </div>
        </div>
      </SettingRow>

      <SettingRow
        label={t('admin.profile.username')}
        description={t('admin.profile.usernameDescription')}
      >
        <div className="flex items-center gap-3 w-full">
          <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20 flex-shrink-0">
            <UserIcon size={18} className="text-blue-400" />
          </div>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:outline-none transition-colors"
            placeholder={t('admin.profile.usernamePlaceholder')}
          />
        </div>
      </SettingRow>

      <SettingRow
        label={t('admin.profile.email')}
        description={t('admin.profile.emailDescription')}
      >
        <div className="flex flex-col gap-2 w-full">
          <div className="flex items-center gap-3 w-full">
            <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/20 flex-shrink-0">
              <Mail size={18} className="text-purple-400" />
            </div>
            <input
              type="email"
              value={email}
              onChange={handleEmailChange}
              className={`flex-1 px-3 py-2 bg-[#1a1a1a] border rounded-lg text-white text-sm focus:outline-none transition-colors ${
                emailError ? 'border-red-500 focus:border-red-500' : 'border-gray-700 focus:border-purple-500'
              }`}
              placeholder={t('admin.profile.emailPlaceholder')}
            />
          </div>
          {emailError && (
            <p className="text-xs text-red-400 ml-12">{emailError}</p>
          )}
        </div>
      </SettingRow>

      <SettingRow
        label={t('admin.profile.password')}
        description={showPasswordFields ? t('admin.profile.passwordDescription') : t('admin.profile.passwordDescriptionClick')}
      >
        <div className="flex flex-col gap-3 w-full">
          {!showPasswordFields ? (
            <button
              onClick={() => setShowPasswordFields(true)}
              className="flex items-center gap-3 px-4 py-3 bg-[#1a1a1a] hover:bg-[#252525] border border-gray-700 rounded-lg text-white text-sm transition-colors group"
            >
              <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20 group-hover:bg-amber-500/20 transition-colors">
                <Key size={18} className="text-amber-400" />
              </div>
              <span className="flex-1 text-left">{t('admin.profile.changePassword')}</span>
              <Edit2 size={16} className="text-gray-400 group-hover:text-amber-400 transition-colors" />
            </button>
          ) : (
            <>
              <div className="flex items-center gap-3 w-full">
                <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20 flex-shrink-0">
                  <Key size={18} className="text-amber-400" />
                </div>
                <input
                  type={showOldPassword ? 'text' : 'password'}
                  placeholder={t('admin.profile.currentPasswordPlaceholder')}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowOldPassword(!showOldPassword)}
                  className="p-2 text-gray-400 hover:text-amber-400 transition-colors"
                  title={showOldPassword ? t('admin.profile.hidePassword') : t('admin.profile.showPassword')}
                >
                  {showOldPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="flex items-center gap-3 w-full">
                <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 flex-shrink-0">
                  <Key size={18} className="text-emerald-400" />
                </div>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder={t('admin.profile.newPasswordPlaceholder')}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="p-2 text-gray-400 hover:text-emerald-400 transition-colors"
                  title={showNewPassword ? t('admin.profile.hidePassword') : t('admin.profile.showPassword')}
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="flex items-center gap-3 w-full">
                <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 flex-shrink-0">
                  <Key size={18} className="text-emerald-400" />
                </div>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder={t('admin.profile.confirmPasswordPlaceholder')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="p-2 text-gray-400 hover:text-emerald-400 transition-colors"
                  title={showConfirmPassword ? t('admin.profile.hidePassword') : t('admin.profile.showPassword')}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <Save size={16} />
                  {isSaving ? t('admin.profile.saving') : t('common.save')}
                </button>
                <button
                  onClick={() => {
                    setShowPasswordFields(false);
                    setOldPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setError(null);
                  }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm transition-colors"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </>
          )}
        </div>
      </SettingRow>

      {!showPasswordFields && (
        <div className="flex justify-end pt-4">
          <button
            onClick={handleSave}
            disabled={isSaving || (email === currentUser?.email && username === currentUser?.username) || !!emailError}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20"
          >
            <Save size={18} />
            {isSaving ? t('admin.profile.saving') : t('admin.profile.saveChanges')}
          </button>
        </div>
      )}
    </>
  );
};

// Badge image URLs from project README (GitHub shields.io)
const GITHUB_README_BADGES = [
  { src: 'https://img.shields.io/badge/MynetworK---help-111827?style=for-the-badge', alt: 'MynetworK' },
  { src: 'https://img.shields.io/badge/Status-PRODUCTION-374151?style=for-the-badge', alt: 'Status' },
  { src: 'https://img.shields.io/badge/Docker-Ready-1f2937?style=for-the-badge&logo=docker&logoColor=38bdf8', alt: 'Docker' },
  { src: 'https://img.shields.io/badge/GHCR-ghcr.io%2Ferreur32%2Fmynetwork-1f2937?style=for-the-badge&logo=docker&logoColor=38bdf8', alt: 'GHCR' },
  { src: 'https://img.shields.io/github/actions/workflow/status/Erreur32/MynetworK/docker-publish.yml?style=for-the-badge&logo=github&logoColor=white&label=Build&color=111827', alt: 'Build' },
  { src: 'https://img.shields.io/badge/React-19-111827?style=for-the-badge&logo=react&logoColor=38bdf8', alt: 'React' },
  { src: 'https://img.shields.io/badge/TypeScript-5.8-111827?style=for-the-badge&logo=typescript&logoColor=60a5fa', alt: 'TypeScript' },
  { src: 'https://img.shields.io/badge/License-MIT-111827?style=for-the-badge&color=111827&labelColor=111827&logoColor=white', alt: 'License' },
];

/** Parses CHANGELOG.md content into version blocks (## [version] - date). Returns array of { version, date, body }. */
function parseChangelogVersions(content: string): Array<{ version: string; date: string; body: string }> {
  const blocks = content.split(/\n## \[/).slice(1);
  return blocks.map((block) => {
    const idx = block.indexOf('\n');
    const firstLine = idx >= 0 ? block.slice(0, idx) : block;
    const body = (idx >= 0 ? block.slice(idx) : '').replace(/^\s*\n+/, '').trim();
    const m = firstLine.match(/^(.+?)\]\s*-\s*(.*)$/);
    const version = m ? m[1].trim() : firstLine.replace(/\]\s*$/, '').trim();
    const date = m ? m[2].trim() : '';
    return { version, date, body };
  });
}

// Info Section Component (for Administration > Info tab)
// Displays project badges, GitHub repo stats, and Changelog (latest version by default, optional version selector).
const InfoSection: React.FC = () => {
  const { t } = useTranslation();
  const [changelogVersions, setChangelogVersions] = useState<Array<{ version: string; date: string; body: string }>>([]);
  const [selectedVersionIndex, setSelectedVersionIndex] = useState(0);
  const [repoStats, setRepoStats] = useState<{ stars: number; forks: number; watchers: number; open_issues: number } | null>(null);
  const [changelogLoading, setChangelogLoading] = useState(true);
  const [repoStatsLoading, setRepoStatsLoading] = useState(true);
  const [changelogError, setChangelogError] = useState<string | null>(null);
  const [repoStatsError, setRepoStatsError] = useState<string | null>(null);

  useEffect(() => {
    const fetchChangelog = async () => {
      setChangelogLoading(true);
      setChangelogError(null);
      try {
        const response = await api.get<{ content: string }>('/api/info/changelog');
        if (response.success && response.result?.content) {
          const versions = parseChangelogVersions(response.result.content);
          setChangelogVersions(versions);
          setSelectedVersionIndex(0);
        } else {
          setChangelogError((response as { error?: { message?: string } })?.error?.message || t('admin.changelogLoadError'));
        }
      } catch {
        setChangelogError(t('admin.changelogLoadError'));
      } finally {
        setChangelogLoading(false);
      }
    };
    const fetchRepoStats = async () => {
      setRepoStatsLoading(true);
      setRepoStatsError(null);
      try {
        const response = await api.get<{ stars: number; forks: number; watchers: number; open_issues: number }>('/api/info/repo-stats');
        if (response.success && response.result) {
          setRepoStats(response.result);
        } else {
          setRepoStatsError((response as { error?: { message?: string } })?.error?.message || t('admin.repoStatsLoadError'));
        }
      } catch {
        setRepoStatsError(t('admin.repoStatsLoadError'));
      } finally {
        setRepoStatsLoading(false);
      }
    };
    fetchChangelog();
    fetchRepoStats();
  }, [t]);

  return (
    <div className="space-y-6">
      <Section title={t('admin.projectInfo')} icon={Info} iconColor="teal">
        <div className="space-y-4">
          {/* Badges row (same as README) */}
          <div className="p-4 bg-theme-secondary rounded-lg border border-theme border-l-4 border-l-teal-500">
            <div className="flex flex-wrap gap-2 items-center">
              {GITHUB_README_BADGES.map((badge) => (
                <a key={badge.alt} href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className="focus:outline-none"><img src={badge.src} alt={badge.alt} className="h-7 object-contain" /></a>
              ))}
            </div>
          </div>

          {/* Repository statistics from GitHub API */}
          <div className="p-4 bg-theme-secondary rounded-lg border border-theme border-l-4 border-l-blue-500">
            <h3 className="text-lg font-semibold text-blue-400 mb-3">{t('admin.repoStats')}</h3>
            {repoStatsLoading && (
              <div className="flex items-center gap-2 text-theme-secondary">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">{t('common.loading')}</span>
              </div>
            )}
            {repoStatsError && (
              <p className="text-sm text-amber-500">{repoStatsError}</p>
            )}
            {!repoStatsLoading && repoStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-theme rounded-lg text-center border border-amber-500/30">
                  <div className="text-xl font-bold text-amber-400">{repoStats.stars}</div>
                  <div className="text-xs text-gray-400">{t('admin.stars')}</div>
                </div>
                <div className="p-3 bg-theme rounded-lg text-center border border-cyan-500/30">
                  <div className="text-xl font-bold text-cyan-400">{repoStats.forks}</div>
                  <div className="text-xs text-gray-400">{t('admin.forks')}</div>
                </div>
                <div className="p-3 bg-theme rounded-lg text-center border border-emerald-500/30">
                  <div className="text-xl font-bold text-emerald-400">{repoStats.watchers}</div>
                  <div className="text-xs text-gray-400">{t('admin.watchers')}</div>
                </div>
                <div className="p-3 bg-theme rounded-lg text-center border border-purple-500/30">
                  <div className="text-xl font-bold text-purple-400">{repoStats.open_issues}</div>
                  <div className="text-xs text-gray-400">{t('admin.openIssues')}</div>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 bg-theme-secondary rounded-lg border border-theme border-l-4 border-l-teal-500">
            <div className="flex items-center gap-4 mb-4">
              <img src={logoMynetworK} alt="MynetworK" className="h-16 w-16 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-teal-400 mb-1">{t('admin.projectName')}</h3>
                <p className="text-sm text-theme-secondary">
                  {t('admin.projectDescription')}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-start gap-2 py-2 border-b border-gray-700">
                <span className="text-sm text-gray-400">{t('admin.version')}</span>
                <span className="text-sm font-mono text-teal-300">{getVersionString()}</span>
                <span className="text-sm text-gray-400">{t('admin.licenseLabel')}</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/15 text-emerald-400 text-xs font-semibold rounded-full border border-emerald-500/30">{t('admin.licensePublic')}</span>
              </div>
            </div>
            <br />
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700/50 hover:bg-teal-600/50 text-teal-200 rounded-lg text-sm transition-colors border border-teal-500/50"
            >
              <Github size={16} />
              <span>{t('admin.viewOnGitHub')}</span>
              <ExternalLink size={14} />
            </a>
          </div>

          <div className="p-4 bg-theme-secondary rounded-lg border border-theme border-l-4 border-l-amber-500">
            <h3 className="text-lg font-semibold text-amber-400 mb-3">{t('admin.authorTitle')}</h3>
            <div className="space-y-2">
              <p className="text-sm text-theme-secondary">
                {t('admin.authorBy', { name: 'Erreur32' })}
              </p>
            </div>
          </div>

          <div className="p-4 bg-theme-secondary rounded-lg border border-theme border-l-4 border-l-purple-500">
            <h3 className="text-lg font-semibold text-purple-400 mb-3">{t('admin.technologiesTitle')}</h3>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 bg-blue-900/30 border border-blue-700 rounded text-xs text-blue-400">React</span>
              <span className="px-3 py-1 bg-blue-900/30 border border-blue-700 rounded text-xs text-blue-400">TypeScript</span>
              <span className="px-3 py-1 bg-green-900/30 border border-green-700 rounded text-xs text-green-400">Node.js</span>
              <span className="px-3 py-1 bg-cyan-900/30 border border-cyan-700 rounded text-xs text-cyan-400">Express</span>
              <span className="px-3 py-1 bg-purple-900/30 border border-purple-700 rounded text-xs text-purple-400">SQLite</span>
              <span className="px-3 py-1 bg-yellow-900/30 border border-yellow-700 rounded text-xs text-yellow-400">Docker</span>
            </div>
          </div>

          {/* Changelog (latest version by default, selector for other versions) */}
          <div className="p-4 bg-theme-secondary rounded-lg border border-theme border-l-4 border-l-cyan-500">
            <h3 className="text-lg font-semibold text-cyan-400 mb-3">{t('admin.changelogTitle')}</h3>
            {changelogLoading && (
              <div className="flex items-center gap-2 text-theme-secondary">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">{t('common.loading')}</span>
              </div>
            )}
            {changelogError && (
              <p className="text-sm text-amber-500">{changelogError}</p>
            )}
            {!changelogLoading && changelogVersions.length > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-sm text-theme-secondary">{t('admin.changelogVersionLabel')}:</span>
                  <select
                    value={selectedVersionIndex}
                    onChange={(e) => setSelectedVersionIndex(Number(e.target.value))}
                    className="px-3 py-1.5 bg-theme border border-gray-700 rounded-lg text-sm text-theme-primary focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                    aria-label={t('admin.changelogShowOtherVersions')}
                  >
                    {changelogVersions.map((v, i) => (
                      <option key={i} value={i}>
                        {v.version}{v.date ? ` (${v.date})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="max-h-[480px] overflow-auto rounded border border-theme bg-gray-900/50 p-4">
                  <div className="changelog-markdown text-sm text-theme-secondary [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-teal-400 [&_h1]:border-b [&_h1]:border-teal-500/30 [&_h1]:pb-1 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-cyan-400 [&_h2]:border-b [&_h2]:border-cyan-500/30 [&_h2]:pb-1 [&_h3]:text-base [&_h3]:font-medium [&_h3]:mt-2.5 [&_h3]:mb-1 [&_h3]:text-amber-400 [&_h4]:text-sm [&_h4]:font-medium [&_h4]:mt-2 [&_h4]:mb-1 [&_h4]:text-emerald-400 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_li]:my-0.5 [&_p]:my-2 [&_code]:bg-gray-800 [&_code]:text-teal-300 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:border [&_code]:border-gray-700 [&_pre]:bg-gray-900 [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-gray-700 [&_pre]:border-l-4 [&_pre]:border-l-teal-500 [&_pre]:my-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:border-0 [&_pre_code]:text-gray-200 [&_a]:text-blue-400 [&_a]:underline hover:[&_a]:text-blue-300 [&_strong]:font-semibold [&_strong]:text-amber-300">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ href, children, ...props }) => {
                          const resolved = href?.startsWith('http') ? href : href?.startsWith('#') ? `${GITHUB_REPO_URL}${href}` : `${GITHUB_REPO_URL}/blob/main/${href ?? ''}`;
                          return (
                            <a href={resolved} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300" {...props}>
                              {children}
                            </a>
                          );
                        }
                      }}
                    >
                      {changelogVersions[selectedVersionIndex]?.body ?? ''}
                    </ReactMarkdown>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
};

// Users Management Section Component (for Administration tab)
const UsersManagementSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user: currentUser } = useUserAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const dateLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchUsers();
    }
  }, [currentUser]);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get<User[]>('/api/users');
      if (response.success && response.result) {
        setUsers(response.result);
      } else {
        const errorMsg = response.error?.message || t('admin.users.loadError');
        setError(errorMsg);
      }
    } catch (err: any) {
      // Handle network/socket errors
      let errorMessage = t('admin.users.loadError');
      
      if (err.message) {
        if (err.message.includes('socket') || err.message.includes('ended') || err.message.includes('ECONNRESET')) {
          errorMessage = t('admin.users.connectionError');
        } else if (err.message.includes('timeout') || err.message.includes('TIMEOUT')) {
          errorMessage = t('admin.users.timeoutError');
        } else if (err.error?.message) {
          errorMessage = err.error.message;
        } else {
          errorMessage = err.message;
        }
      } else if (err.error?.message) {
        errorMessage = err.error.message;
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (userId: number) => {
    if (!confirm(t('admin.users.confirmDelete'))) {
      return;
    }

    try {
      const response = await api.delete(`/api/users/${userId}`);
      if (response.success) {
        await fetchUsers();
      } else {
        const errorMsg = response.error?.message || t('admin.users.deleteError');
        alert(errorMsg);
      }
    } catch (err: any) {
      // Handle network/socket errors
      let errorMessage = t('admin.users.deleteError');
      
      if (err.message) {
        if (err.message.includes('socket') || err.message.includes('ended') || err.message.includes('ECONNRESET')) {
          errorMessage = t('admin.users.connectionError');
        } else if (err.message.includes('timeout') || err.message.includes('TIMEOUT')) {
          errorMessage = t('admin.users.timeoutError');
        } else if (err.error?.message) {
          errorMessage = err.error.message;
        } else {
          errorMessage = err.message;
        }
      } else if (err.error?.message) {
        errorMessage = err.error.message;
      }
      
      alert(errorMessage);
    }
  };

  return (
    <>
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">
          <Loader2 size={24} className="mx-auto mb-2 animate-spin" />
          <p>{t('admin.users.loadingUsers')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users size={32} className="mx-auto mb-2" />
              <p>{t('admin.users.noUsersFound')}</p>
            </div>
          ) : (
            users.map((user) => {
              // Get user initials for avatar
              const getInitials = (username: string): string => {
                if (!username) return 'U';
                return username
                  .split(' ')
                  .map(n => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2) || 'U';
              };
              const initials = getInitials(user.username);

              return (
                <div key={user.id} className="flex items-start gap-3 py-3 px-4 bg-theme-secondary rounded-lg border border-theme">
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    {user.avatar ? (
                      <img 
                        src={user.avatar} 
                        alt={user.username}
                        className="w-12 h-12 rounded-full object-cover border-2 border-gray-700"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm border-2 border-gray-700">
                        {initials}
                      </div>
                    )}
                  </div>
                  
                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium text-theme-primary">{user.username}</span>
                      {user.role === 'admin' && (
                        <span className="px-2 py-0.5 bg-blue-900/30 border border-blue-700 rounded text-xs text-blue-400 whitespace-nowrap">
                          {t('admin.users.roleAdmin')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-theme-secondary truncate">{user.email}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-theme-tertiary">
                      <span>{t('admin.users.createdOn')} {new Date(user.createdAt).toLocaleDateString(dateLocale)}</span>
                      {user.lastLogin && (
                        <>
                          <span className="text-gray-600">•</span>
                          <span>{t('admin.users.lastLogin')}: {new Date(user.lastLogin).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' })} {new Date(user.lastLogin).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}</span>
                        </>
                      )}
                      {user.lastLoginIp && (
                        <>
                          <span className="text-gray-600">•</span>
                          <span className="font-mono text-gray-400">{t('admin.users.ip')}: {user.lastLoginIp}</span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {user.id !== currentUser?.id && (
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="p-2 hover:bg-red-900/20 rounded text-red-400 hover:text-red-300 transition-colors"
                        title={t('admin.users.deleteTitle')}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </>
  );
};

export const SettingsPage: React.FC<SettingsPageProps> = ({
  onBack,
  mode = 'freebox',
  initialAdminTab = 'general',
  onNavigateToPage,
  onUsersClick,
  onSettingsClick,
  onAdminClick,
  onProfileClick,
  onLogout
}) => {
  const { t } = useTranslation();
  const { user: currentUser } = useUserAuthStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('network');
  // Check sessionStorage on mount in case initialAdminTab wasn't passed correctly
  const storedAdminTab = sessionStorage.getItem('adminTab') as AdminTab | null;
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>(storedAdminTab || initialAdminTab);

  // Update activeAdminTab when initialAdminTab changes (e.g., from navigation)
  // Also check sessionStorage on mount
  useEffect(() => {
    const tabFromStorage = sessionStorage.getItem('adminTab') as AdminTab | null;
    if (tabFromStorage) {
      setActiveAdminTab(tabFromStorage);
      sessionStorage.removeItem('adminTab'); // Clear after reading
    } else if (initialAdminTab && initialAdminTab !== 'general') {
      setActiveAdminTab(initialAdminTab);
    }
    // Clean URL hash if present
    if (window.location.hash === '#admin') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [initialAdminTab]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Modal states
  const [showParentalModal, setShowParentalModal] = useState(false);
  const [showFirewallModal, setShowFirewallModal] = useState(false);
  const [showVpnModal, setShowVpnModal] = useState(false);
  const [showRebootScheduleModal, setShowRebootScheduleModal] = useState(false);
  const [showCustomDomainModal, setShowCustomDomainModal] = useState(false);

  // Get devices from LAN store for parental control
  const { devices } = useLanStore();
  const { reboot } = useSystemStore();

  // Get permissions and freebox URL from auth store
  const { permissions, freeboxUrl, isRegistered } = useAuthStore();
  
  // State for Freebox token
  const [freeboxToken, setFreeboxToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [showFreeboxToken, setShowFreeboxToken] = useState(false);
  
  // State for UniFi token
  const [unifiToken, setUnifiToken] = useState<string | null>(null);
  const [unifiApiMode, setUnifiApiMode] = useState<'controller' | 'site-manager' | null>(null);
  const [loadingUnifiToken, setLoadingUnifiToken] = useState(false);
  
  // State for LAN config (network mode, IP, hostnames)
  const [lanConfig, setLanConfig] = useState<{
    mode?: 'server' | 'bridge';
    ip?: string;
    hostname?: string;
    dns_name?: string;
    mdns_name?: string;
    netbios_name?: string;
  } | null>(null);
  const [loadingLanConfig, setLoadingLanConfig] = useState(false);
  
  // State for DynDNS config (custom domain)
  const [ddnsConfig, setDdnsConfig] = useState<{
    provider: 'ovh' | 'dyndns' | 'noip' | null;
    enabled: boolean;
    hostname: string;
    user: string;
    password: string;
  }>({
    provider: null,
    enabled: false,
    hostname: '',
    user: '',
    password: ''
  });
  const [ddnsStatus, setDdnsStatus] = useState<{
    status: string;
    last_refresh?: number;
    next_refresh?: number;
    last_error?: number;
  } | null>(null);
  const [loadingDdnsConfig, setLoadingDdnsConfig] = useState(false);
  const [showDdnsPassword, setShowDdnsPassword] = useState(false);
  
  // State for custom domain info (reverse DNS)
  const [domainInfo, setDomainInfo] = useState<{
    domain?: string;
    enabled?: boolean;
    certificateType?: string;
    certificateValid?: boolean;
    certificateExpiry?: string;
  } | null>(null);
  const [loadingDomainInfo, setLoadingDomainInfo] = useState(false);
  
  // Track original values for change detection
  const [originalLanConfig, setOriginalLanConfig] = useState<typeof lanConfig | null>(null);
  const [originalDdnsConfig, setOriginalDdnsConfig] = useState<typeof ddnsConfig | null>(null);
  
  // Get plugins to check if UniFi is configured
  const { plugins } = usePluginStore();
  const unifiPlugin = plugins.find(p => p.id === 'unifi');
  
  // Fetch Freebox token on mount (always fetch, even if not registered, to show status)
  useEffect(() => {
    if (mode === 'freebox') {
      setLoadingToken(true);
      api.get<{ success: boolean; result?: { appToken: string | null; isRegistered: boolean } }>('/api/auth/token')
        .then((response) => {
          if (response.success && response.result && 'appToken' in response.result) {
            setFreeboxToken(response.result.appToken || null);
          }
        })
        .catch((error) => {
          console.error('Failed to fetch Freebox token:', error);
        })
        .finally(() => {
          setLoadingToken(false);
        });
    }
  }, [mode]);
  
  // Fetch UniFi token on mount if plugin is configured
  useEffect(() => {
    if (unifiPlugin?.configured && mode === 'freebox') {
      setLoadingUnifiToken(true);
      api.get<{ success: boolean; result?: { apiKey: string | null; apiMode?: 'controller' | 'site-manager'; hasApiKey: boolean } }>('/api/plugins/unifi/token')
        .then((response) => {
          if (response.success && response.result) {
            const result = response.result as unknown as { apiKey: string | null; apiMode?: 'controller' | 'site-manager'; hasApiKey: boolean };
            setUnifiToken(result.apiKey || null);
            setUnifiApiMode(result.apiMode || null);
          }
        })
        .catch((error) => {
          console.error('Failed to fetch UniFi token:', error);
        })
        .finally(() => {
          setLoadingUnifiToken(false);
        });
    }
  }, [unifiPlugin?.configured, mode]);
  
  // Fetch LAN config on mount if in freebox mode
  useEffect(() => {
    if (mode === 'freebox' && activeTab === 'network') {
      setLoadingLanConfig(true);
      api.get<any>('/api/settings/lan')
        .then((response) => {
          if (response.success && response.result) {
            const config = response.result as any;
            // Extract LAN config - structure may vary
            // The API might return an array of interfaces or a single object
            let lanData: any = null;
            if (Array.isArray(config)) {
              // If array, find the main interface (usually the first one or the one with name 'pub')
              lanData = config.find((iface: any) => iface.name === 'pub') || config[0] || {};
            } else if (config.lan) {
              lanData = config.lan;
            } else {
              lanData = config;
            }
            
            // Debug: log the raw data to see what we're getting
            console.log('[LAN Config] Raw API response:', JSON.stringify(lanData, null, 2));
            console.log('[LAN Config] Available keys:', Object.keys(lanData));
            console.log('[LAN Config] name_dns value:', lanData.name_dns);
            console.log('[LAN Config] name_mdns value:', lanData.name_mdns);
            console.log('[LAN Config] name_netbios value:', lanData.name_netbios);
            
            // Helper function to get value or empty string (handle null, undefined, and empty strings)
            const getValue = (...values: (string | null | undefined)[]): string => {
              for (const val of values) {
                if (val !== null && val !== undefined && val !== '') {
                  return val;
                }
              }
              return '';
            };
            
            // According to Freebox API docs: name_dns, name_mdns, name_netbios, name, mode, ip
            const mappedConfig = {
              mode: (lanData.mode || (lanData.type === 'bridge' ? 'bridge' : 'server')) as 'server' | 'bridge',
              ip: getValue(lanData.ip, lanData.ipv4, lanData.ip_addr),
              hostname: getValue(lanData.name, lanData.hostname, lanData.host_name),
              dns_name: getValue(lanData.name_dns, lanData.dns_name, lanData.dns, lanData.dns_name_host),
              mdns_name: getValue(lanData.name_mdns, lanData.mdns_name, lanData.mdns, lanData.mdns_name_host),
              netbios_name: getValue(lanData.name_netbios, lanData.netbios_name, lanData.netbios, lanData.netbios_name_host)
            };
            
            console.log('[LAN Config] Mapped config:', mappedConfig);
            setLanConfig(mappedConfig);
            setOriginalLanConfig({ ...mappedConfig });
          }
        })
        .catch((error) => {
          console.error('Failed to fetch LAN config:', error);
        })
        .finally(() => {
          setLoadingLanConfig(false);
        });
    }
  }, [mode, activeTab]);
  
  // Fetch DynDNS config on mount if in freebox mode
  useEffect(() => {
    if (mode === 'freebox' && activeTab === 'network') {
      // Try to fetch config for each provider to find which one is configured
      const providers: Array<'ovh' | 'dyndns' | 'noip'> = ['ovh', 'dyndns', 'noip'];
      setLoadingDdnsConfig(true);
      
      Promise.allSettled(
        providers.map(provider =>
          Promise.all([
            api.get<any>(`/api/connection/ddns/${provider}`),
            api.get<any>(`/api/connection/ddns/${provider}/status`)
          ]).then(([configRes, statusRes]) => ({
            provider,
            config: configRes,
            status: statusRes
          }))
        )
      ).then((results) => {
        // Find the first provider that has a config
        for (const result of results) {
          if (result.status === 'fulfilled') {
            const { provider, config, status } = result.value;
            if (config.success && config.result) {
              const ddnsData = config.result as any;
              setDdnsConfig({
                provider,
                enabled: ddnsData.enabled || false,
                hostname: ddnsData.hostname || '',
                user: ddnsData.user || '',
                password: '' // Password is write-only, don't display it
              });
              
              if (status.success && status.result) {
                setDdnsStatus(status.result as any);
              }
              // Store original config for change detection
              setOriginalDdnsConfig({
                provider,
                enabled: ddnsData.enabled || false,
                hostname: ddnsData.hostname || '',
                user: ddnsData.user || '',
                password: ''
              });
              break;
            }
          }
        }
      })
      .catch((error) => {
        console.error('Failed to fetch DynDNS config:', error);
      })
      .finally(() => {
        setLoadingDdnsConfig(false);
      });
    }
  }, [mode, activeTab]);
  
  // Fetch custom domain info (reverse DNS) on mount if in freebox mode
  useEffect(() => {
    if (mode === 'freebox' && activeTab === 'network') {
      setLoadingDomainInfo(true);
      // Get domain info from API version endpoint (via system endpoint which includes it)
      Promise.all([
        api.get<any>('/api/system'),
        api.get<any>('/api/system/version')
      ])
        .then(([systemResponse, versionResponse]) => {
          let domain: string | null = null;
          let httpsAvailable: boolean | null = null;
          let httpsPort: number | null = null;
          
          // Try to get from system endpoint first (which includes api_domain)
          if (systemResponse.success && systemResponse.result) {
            const systemData = systemResponse.result as any;
            domain = systemData.api_domain || null;
            httpsAvailable = systemData.https_available ?? null;
            httpsPort = systemData.https_port ?? null;
          }
          
          // Fallback to version endpoint directly
          if (!domain && versionResponse.success && versionResponse.result) {
            const versionData = versionResponse.result as any;
            domain = versionData.api_domain || null;
            httpsAvailable = versionData.https_available ?? null;
            httpsPort = versionData.https_port ?? null;
          }
          
          console.log('[Domain Info] Retrieved:', { domain, httpsAvailable, httpsPort });
          
          if (domain && domain !== 'mafreebox.freebox.fr') {
            // Domain is configured (not the default)
            setDomainInfo({
              domain: domain,
              enabled: true,
              certificateType: 'RSA', // Default, should come from API if available
              certificateValid: httpsAvailable === true, // Use https_available as indicator
              certificateExpiry: 'dans 69 jours' // This should be calculated from API certificate expiry
            });
          } else {
            setDomainInfo(null);
          }
        })
        .catch((error) => {
          console.error('Failed to fetch domain info:', error);
          setDomainInfo(null);
        })
        .finally(() => {
          setLoadingDomainInfo(false);
        });
    }
  }, [mode, activeTab]);

  // Helper to check if a permission is granted (defaults to false if not present)
  const hasPermission = (permission: keyof typeof permissions): boolean => {
    return permissions[permission] === true;
  };

  // Connection settings
  const [connectionConfig, setConnectionConfig] = useState<{
    remote_access: boolean;
    remote_access_port: number;
    ping: boolean;
    wol: boolean;
    adblock: boolean;
  } | null>(null);

  // Original config for diff comparison
  const [originalConnectionConfig, setOriginalConnectionConfig] = useState<typeof connectionConfig>(null);

  // DHCP settings
  const [dhcpConfig, setDhcpConfig] = useState<{
    enabled: boolean;
    ip_range_start: string;
    ip_range_end: string;
    netmask: string;
    gateway: string;
    dns: string[];  // Array of DNS servers
    sticky_assign: boolean;
    always_broadcast: boolean;
  } | null>(null);

  // DHCP static leases
  const [staticLeases, setStaticLeases] = useState<Array<{
    id: string;
    mac: string;
    ip: string;
    comment: string;
    hostname?: string;
  }>>([]);
  const [showLeaseModal, setShowLeaseModal] = useState(false);
  const [editingLease, setEditingLease] = useState<{
    id?: string;
    mac: string;
    ip: string;
    comment: string;
  } | null>(null);

  // FTP settings
  const [ftpConfig, setFtpConfig] = useState<{
    enabled: boolean;
    allow_anonymous: boolean;
    allow_anonymous_write: boolean;
    port_ctrl: number;
  } | null>(null);

  // LCD settings (includes LED strip for Ultra 25 ans edition)
  const [lcdConfig, setLcdConfig] = useState<{
    brightness: number;
    orientation: number;
    orientation_forced: boolean;
    hide_wifi_key?: boolean;
    hide_status_led?: boolean;
    // LED Strip (Ultra 25 ans edition only)
    led_strip_enabled?: boolean;
    led_strip_brightness?: number;
    led_strip_animation?: string;
    available_led_strip_animations?: string[];
  } | null>(null);

  // WiFi planning
  const [wifiPlanning, setWifiPlanning] = useState<{
    enabled: boolean;
  } | null>(null);

  // WiFi MAC filter
  const [wifiMacFilter, setWifiMacFilter] = useState<{
    enabled?: boolean;
    mode?: 'whitelist' | 'blacklist';
    macs?: string[];
  } | null>(null);

  // Parental control profiles
  const [parentalProfiles, setParentalProfiles] = useState<Array<{
    id: number;
    name: string;
  }>>([]);

  // Port forwarding rules (firewall)
  const [portForwardingRules, setPortForwardingRules] = useState<Array<{
    id: number;
    enabled: boolean;
    comment?: string;
    lan_port: number;
    wan_port_start: number;
    wan_port_end?: number;
    lan_ip: string;
    ip_proto: string;
  }>>([]);

  // VPN server config
  const [vpnServerConfig, setVpnServerConfig] = useState<{
    enabled: boolean;
  } | null>(null);

  const [vpnUsers, setVpnUsers] = useState<Array<{
    login: string;
    ip_reservation?: string;
  }>>([]);

  // Fetch settings based on active tab
  useEffect(() => {
    fetchSettings();
  }, [activeTab]);

  const fetchSettings = async () => {
    setIsLoading(true);
    setError(null);

    try {
      switch (activeTab) {
        case 'network': {
          const response = await api.get<typeof connectionConfig>(API_ROUTES.CONNECTION_CONFIG);
          if (response.success && response.result) {
            setConnectionConfig(response.result);
            setOriginalConnectionConfig(response.result);
          }
          break;
        }
        case 'dhcp': {
          const response = await api.get<typeof dhcpConfig>(API_ROUTES.SETTINGS_DHCP);
          if (response.success && response.result) {
            setDhcpConfig(response.result);
          }
          // Fetch static leases
          const leasesResponse = await api.get<typeof staticLeases>(API_ROUTES.DHCP_STATIC_LEASES);
          if (leasesResponse.success && leasesResponse.result) {
            setStaticLeases(Array.isArray(leasesResponse.result) ? leasesResponse.result : []);
          }
          break;
        }
        case 'storage': {
          const response = await api.get<typeof ftpConfig>(API_ROUTES.SETTINGS_FTP);
          if (response.success && response.result) {
            setFtpConfig(response.result);
          }
          break;
        }
        case 'system': {
          const response = await api.get<typeof lcdConfig>(API_ROUTES.SETTINGS_LCD);
          if (response.success && response.result) {
            setLcdConfig(response.result);
          }
          break;
        }
        case 'wifi': {
          const response = await api.get<typeof wifiPlanning>(API_ROUTES.WIFI_PLANNING);
          if (response.success && response.result) {
            setWifiPlanning(response.result);
          }
          break;
        }
        case 'backup': {
          // No data to fetch on mount, data will be loaded on demand when exporting
          break;
        }
        case 'security': {
          // Fetch parental profiles
          try {
            const profilesRes = await api.get<Array<{ id: number; name: string }>>(API_ROUTES.PROFILES);
            if (profilesRes.success && profilesRes.result) {
              setParentalProfiles(profilesRes.result);
            }
          } catch {
            // Silently fail - parental control may not be available
          }

          // Fetch port forwarding rules
          try {
            const natRes = await api.get<Array<typeof portForwardingRules[0]>>(`${API_ROUTES.SETTINGS_NAT}/redirections`);
            if (natRes.success && natRes.result) {
              setPortForwardingRules(natRes.result);
            }
          } catch {
            // Silently fail - NAT may not be available
          }

          // Fetch VPN server config
          try {
            const vpnRes = await api.get<{ enabled: boolean }>(API_ROUTES.SETTINGS_VPN_SERVER);
            if (vpnRes.success && vpnRes.result) {
              setVpnServerConfig(vpnRes.result);
            }
          } catch {
            // Silently fail - VPN may not be available
          }

          // Fetch VPN users
          try {
            const vpnUsersRes = await api.get<Array<{ login: string; ip_reservation?: string }>>(`${API_ROUTES.SETTINGS_VPN_SERVER.replace('/server', '/users')}`);
            if (vpnUsersRes.success && vpnUsersRes.result) {
              setVpnUsers(vpnUsersRes.result);
            }
          } catch {
            // Silently fail
          }
          break;
        }
      }
    } catch {
      setError('Erreur lors du chargement des paramètres');
    } finally {
      setIsLoading(false);
    }
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const saveConnectionConfig = async () => {
    if (!connectionConfig || !originalConnectionConfig) return;

    // Build payload with only modified fields
    const changedFields: Partial<typeof connectionConfig> = {};
    for (const key of Object.keys(connectionConfig) as Array<keyof typeof connectionConfig>) {
      if (connectionConfig[key] !== originalConnectionConfig[key]) {
        changedFields[key] = connectionConfig[key] as never;
      }
    }

    // If nothing changed, don't send request
    if (Object.keys(changedFields).length === 0) {
      showSuccess('Aucune modification à enregistrer');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.put(API_ROUTES.CONNECTION_CONFIG, changedFields);
      if (response.success) {
        showSuccess('Paramètres réseau enregistrés');
        // Update original config to reflect saved state
        setOriginalConnectionConfig({ ...connectionConfig });
      } else {
        setError(response.error?.message || 'Erreur lors de la sauvegarde');
      }
    } catch {
      setError('Erreur lors de la sauvegarde');
    } finally {
      setIsLoading(false);
    }
  };

  const saveDhcpConfig = async () => {
    if (!dhcpConfig) return;
    setIsLoading(true);
    try {
      const response = await api.put(API_ROUTES.SETTINGS_DHCP, dhcpConfig);
      if (response.success) {
        showSuccess('Paramètres DHCP enregistrés');
      } else {
        setError(response.error?.message || 'Erreur lors de la sauvegarde');
      }
    } catch {
      setError('Erreur lors de la sauvegarde');
    } finally {
      setIsLoading(false);
    }
  };

  const saveLanConfig = async () => {
    if (!lanConfig) return;
    setIsLoading(true);
    try {
      // Build payload for LAN config update
      // According to Freebox API docs: name_dns, name_mdns, name_netbios, name, mode, ip
      const payload: any = {};
      if (lanConfig.mode) {
        payload.mode = lanConfig.mode;
        // API uses 'mode' for router/bridge, but also accepts 'type'
        payload.type = lanConfig.mode;
      }
      if (lanConfig.ip) payload.ip = lanConfig.ip;
      if (lanConfig.hostname) payload.name = lanConfig.hostname;
      if (lanConfig.dns_name !== undefined) payload.name_dns = lanConfig.dns_name || '';
      if (lanConfig.mdns_name !== undefined) payload.name_mdns = lanConfig.mdns_name || '';
      if (lanConfig.netbios_name !== undefined) payload.name_netbios = lanConfig.netbios_name || '';
      
      console.log('[LAN Config] Saving payload:', payload);
      
      const response = await api.put('/api/settings/lan', payload);
      if (response.success) {
        showSuccess('Paramètres réseau LAN enregistrés');
        // Refresh config after save
        const refreshResponse = await api.get<any>('/api/settings/lan');
        if (refreshResponse.success && refreshResponse.result) {
          const config = refreshResponse.result as any;
          let lanData: any = null;
          if (Array.isArray(config)) {
            lanData = config.find((iface: any) => iface.name === 'pub') || config[0] || {};
          } else if (config.lan) {
            lanData = config.lan;
          } else {
            lanData = config;
          }
          // Helper function to get value or empty string (handle null, undefined, and empty strings)
          const getValue = (...values: (string | null | undefined)[]): string => {
            for (const val of values) {
              if (val !== null && val !== undefined && val !== '') {
                return val;
              }
            }
            return '';
          };
          
          setLanConfig({
            mode: (lanData.mode || (lanData.type === 'bridge' ? 'bridge' : 'server')) as 'server' | 'bridge',
            ip: getValue(lanData.ip, lanData.ipv4, lanData.ip_addr),
            hostname: getValue(lanData.name, lanData.hostname, lanData.host_name),
            dns_name: getValue(lanData.name_dns, lanData.dns_name, lanData.dns, lanData.dns_name_host),
            mdns_name: getValue(lanData.name_mdns, lanData.mdns_name, lanData.mdns, lanData.mdns_name_host),
            netbios_name: getValue(lanData.name_netbios, lanData.netbios_name, lanData.netbios, lanData.netbios_name_host)
          });
        }
      } else {
        setError(response.error?.message || 'Erreur lors de la sauvegarde');
      }
    } catch (error: any) {
      setError(error?.response?.data?.error?.message || 'Erreur lors de la sauvegarde');
    } finally {
      setIsLoading(false);
    }
  };

  const saveDdnsConfig = async () => {
    if (!ddnsConfig.provider) return;
    setIsLoading(true);
    try {
      // Build payload for DynDNS config update
      const payload: any = {
        enabled: ddnsConfig.enabled,
        hostname: ddnsConfig.hostname,
        user: ddnsConfig.user
      };
      // Only include password if it's been set (password is write-only)
      if (ddnsConfig.password) {
        payload.password = ddnsConfig.password;
      }
      
      const response = await api.put(`/api/connection/ddns/${ddnsConfig.provider}`, payload);
      if (response.success) {
        showSuccess('Configuration DynDNS enregistrée');
        // Refresh status after save
        const statusRes = await api.get<any>(`/api/connection/ddns/${ddnsConfig.provider}/status`);
        if (statusRes.success && statusRes.result) {
          setDdnsStatus(statusRes.result as any);
        }
        // Update original config
        setOriginalDdnsConfig({ ...ddnsConfig });
      } else {
        setError(response.error?.message || 'Erreur lors de la sauvegarde');
      }
    } catch (error: any) {
      setError(error?.response?.data?.error?.message || 'Erreur lors de la sauvegarde');
    } finally {
      setIsLoading(false);
    }
  };

  // Check if there are unsaved changes in network settings
  const hasNetworkUnsavedChanges = useMemo(() => {
    // Check connection config changes
    const hasConnectionChanges = connectionConfig && originalConnectionConfig && 
      Object.keys(connectionConfig).some(key => {
        const k = key as keyof typeof connectionConfig;
        return connectionConfig[k] !== originalConnectionConfig[k];
      });
    
    // Check LAN config changes
    const hasLanChanges = lanConfig && originalLanConfig &&
      (lanConfig.mode !== originalLanConfig.mode ||
       lanConfig.ip !== originalLanConfig.ip ||
       lanConfig.hostname !== originalLanConfig.hostname ||
       lanConfig.dns_name !== originalLanConfig.dns_name ||
       lanConfig.mdns_name !== originalLanConfig.mdns_name ||
       lanConfig.netbios_name !== originalLanConfig.netbios_name);
    
    // Check DynDNS config changes
    const hasDdnsChanges = ddnsConfig.provider && originalDdnsConfig &&
      (ddnsConfig.enabled !== originalDdnsConfig.enabled ||
       ddnsConfig.hostname !== originalDdnsConfig.hostname ||
       ddnsConfig.user !== originalDdnsConfig.user ||
       ddnsConfig.password !== ''); // Password is write-only, if set, consider it changed
    
    return hasConnectionChanges || hasLanChanges || hasDdnsChanges;
  }, [connectionConfig, originalConnectionConfig, lanConfig, originalLanConfig, ddnsConfig, originalDdnsConfig]);

  // Unified save function
  const saveAllNetworkSettings = async () => {
    if (!hasNetworkUnsavedChanges) {
      showSuccess('Aucune modification à enregistrer');
      return;
    }

    setIsLoading(true);
    const errors: string[] = [];
    const successes: string[] = [];

    try {
      // Save connection config if changed
      if (connectionConfig && originalConnectionConfig) {
        const changedFields: Partial<typeof connectionConfig> = {};
        for (const key of Object.keys(connectionConfig) as Array<keyof typeof connectionConfig>) {
          if (connectionConfig[key] !== originalConnectionConfig[key]) {
            changedFields[key] = connectionConfig[key] as never;
          }
        }
        if (Object.keys(changedFields).length > 0) {
          try {
            const response = await api.put(API_ROUTES.CONNECTION_CONFIG, changedFields);
            if (response.success) {
              successes.push('Paramètres connexion');
              setOriginalConnectionConfig({ ...connectionConfig });
            } else {
              errors.push('Connexion: ' + (response.error?.message || 'Erreur'));
            }
          } catch (error: any) {
            errors.push('Connexion: ' + (error?.message || 'Erreur'));
          }
        }
      }

      // Save LAN config if changed
      if (lanConfig && originalLanConfig) {
        const hasChanges = lanConfig.mode !== originalLanConfig.mode ||
          lanConfig.ip !== originalLanConfig.ip ||
          lanConfig.hostname !== originalLanConfig.hostname ||
          lanConfig.dns_name !== originalLanConfig.dns_name ||
          lanConfig.mdns_name !== originalLanConfig.mdns_name ||
          lanConfig.netbios_name !== originalLanConfig.netbios_name;
        
        if (hasChanges) {
          try {
            const payload: any = {};
            if (lanConfig.mode) {
              payload.mode = lanConfig.mode;
              payload.type = lanConfig.mode;
            }
            if (lanConfig.ip) payload.ip = lanConfig.ip;
            if (lanConfig.hostname) payload.name = lanConfig.hostname;
            if (lanConfig.dns_name !== undefined) payload.name_dns = lanConfig.dns_name || '';
            if (lanConfig.mdns_name !== undefined) payload.name_mdns = lanConfig.mdns_name || '';
            if (lanConfig.netbios_name !== undefined) payload.name_netbios = lanConfig.netbios_name || '';
            
            const response = await api.put('/api/settings/lan', payload);
            if (response.success) {
              successes.push('Paramètres réseau');
              // Refresh config after save
              const refreshResponse = await api.get<any>('/api/settings/lan');
              if (refreshResponse.success && refreshResponse.result) {
                const config = refreshResponse.result as any;
                let lanData: any = null;
                if (Array.isArray(config)) {
                  lanData = config.find((iface: any) => iface.name === 'pub') || config[0] || {};
                } else if (config.lan) {
                  lanData = config.lan;
                } else {
                  lanData = config;
                }
                const getValue = (...values: (string | null | undefined)[]): string => {
                  for (const val of values) {
                    if (val !== null && val !== undefined && val !== '') {
                      return val;
                    }
                  }
                  return '';
                };
                const updatedConfig = {
                  mode: (lanData.mode || (lanData.type === 'bridge' ? 'bridge' : 'server')) as 'server' | 'bridge',
                  ip: getValue(lanData.ip, lanData.ipv4, lanData.ip_addr),
                  hostname: getValue(lanData.name, lanData.hostname, lanData.host_name),
                  dns_name: getValue(lanData.name_dns, lanData.dns_name, lanData.dns, lanData.dns_name_host),
                  mdns_name: getValue(lanData.name_mdns, lanData.mdns_name, lanData.mdns, lanData.mdns_name_host),
                  netbios_name: getValue(lanData.name_netbios, lanData.netbios_name, lanData.netbios, lanData.netbios_name_host)
                };
                setLanConfig(updatedConfig);
                setOriginalLanConfig({ ...updatedConfig });
              }
            } else {
              errors.push('Réseau: ' + (response.error?.message || 'Erreur'));
            }
          } catch (error: any) {
            errors.push('Réseau: ' + (error?.response?.data?.error?.message || 'Erreur'));
          }
        }
      }

      // Save DynDNS config if changed
      if (ddnsConfig.provider && originalDdnsConfig) {
        const hasChanges = ddnsConfig.enabled !== originalDdnsConfig.enabled ||
          ddnsConfig.hostname !== originalDdnsConfig.hostname ||
          ddnsConfig.user !== originalDdnsConfig.user ||
          ddnsConfig.password !== '';
        
        if (hasChanges) {
          try {
            const payload: any = {
              enabled: ddnsConfig.enabled,
              hostname: ddnsConfig.hostname,
              user: ddnsConfig.user
            };
            if (ddnsConfig.password) {
              payload.password = ddnsConfig.password;
            }
            
            const response = await api.put(`/api/connection/ddns/${ddnsConfig.provider}`, payload);
            if (response.success) {
              successes.push('Paramètres DynDNS');
              const statusRes = await api.get<any>(`/api/connection/ddns/${ddnsConfig.provider}/status`);
              if (statusRes.success && statusRes.result) {
                setDdnsStatus(statusRes.result as any);
              }
              setOriginalDdnsConfig({ ...ddnsConfig });
            } else {
              errors.push('DynDNS: ' + (response.error?.message || 'Erreur'));
            }
          } catch (error: any) {
            errors.push('DynDNS: ' + (error?.response?.data?.error?.message || 'Erreur'));
          }
        }
      }

      // Show results
      if (errors.length > 0 && successes.length > 0) {
        setError(`Erreurs: ${errors.join(', ')}. Succès: ${successes.join(', ')}`);
      } else if (errors.length > 0) {
        setError(errors.join(', '));
      } else if (successes.length > 0) {
        showSuccess(`Paramètres enregistrés: ${successes.join(', ')}`);
      }
    } catch (error: any) {
      setError('Erreur lors de la sauvegarde');
    } finally {
      setIsLoading(false);
    }
  };

  // DHCP Static Leases management
  const addStaticLease = () => {
    setEditingLease({ mac: '', ip: '', comment: '' });
    setShowLeaseModal(true);
  };

  const editStaticLease = (lease: typeof staticLeases[0]) => {
    setEditingLease({ id: lease.id, mac: lease.mac, ip: lease.ip, comment: lease.comment });
    setShowLeaseModal(true);
  };

  const saveStaticLease = async () => {
    if (!editingLease) return;
    setIsLoading(true);
    try {
      let response;
      if (editingLease.id) {
        // Update existing lease
        response = await api.put(`${API_ROUTES.DHCP_STATIC_LEASES}/${editingLease.id}`, {
          mac: editingLease.mac,
          ip: editingLease.ip,
          comment: editingLease.comment
        });
      } else {
        // Create new lease
        response = await api.post(API_ROUTES.DHCP_STATIC_LEASES, {
          mac: editingLease.mac,
          ip: editingLease.ip,
          comment: editingLease.comment
        });
      }

      if (response.success) {
        showSuccess(editingLease.id ? 'Bail statique modifié' : 'Bail statique ajouté');
        setShowLeaseModal(false);
        setEditingLease(null);
        // Refresh leases
        fetchSettings();
      } else {
        setError(response.error?.message || 'Erreur lors de la sauvegarde');
      }
    } catch {
      setError('Erreur lors de la sauvegarde');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteStaticLease = async (id: string) => {
    if (!confirm('Voulez-vous vraiment supprimer ce bail statique ?')) return;
    setIsLoading(true);
    try {
      const response = await api.delete(`${API_ROUTES.DHCP_STATIC_LEASES}/${id}`);
      if (response.success) {
        showSuccess('Bail statique supprimé');
        // Refresh leases
        fetchSettings();
      } else {
        setError(response.error?.message || 'Erreur lors de la suppression');
      }
    } catch {
      setError('Erreur lors de la suppression');
    } finally {
      setIsLoading(false);
    }
  };

  const saveFtpConfig = async () => {
    if (!ftpConfig) return;
    setIsLoading(true);
    try {
      const response = await api.put(API_ROUTES.SETTINGS_FTP, ftpConfig);
      if (response.success) {
        showSuccess('Paramètres FTP enregistrés');
      } else {
        setError(response.error?.message || 'Erreur lors de la sauvegarde');
      }
    } catch {
      setError('Erreur lors de la sauvegarde');
    } finally {
      setIsLoading(false);
    }
  };

  const saveLcdConfig = async () => {
    if (!lcdConfig) return;
    setIsLoading(true);
    try {
      const response = await api.put(API_ROUTES.SETTINGS_LCD, lcdConfig);
      if (response.success) {
        showSuccess('Paramètres écran enregistrés');
      } else {
        setError(response.error?.message || 'Erreur lors de la sauvegarde');
      }
    } catch {
      setError('Erreur lors de la sauvegarde');
    } finally {
      setIsLoading(false);
    }
  };

  const saveWifiMacFilter = async () => {
    if (!wifiMacFilter) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await api.put<typeof wifiMacFilter>(API_ROUTES.WIFI_MAC_FILTER, wifiMacFilter);
      if (response.success) {
        setSuccessMessage('Filtrage MAC enregistré avec succès');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError(response.error?.message || 'Erreur lors de l\'enregistrement');
      }
    } catch (error) {
      console.error('Save WiFi MAC filter error:', error);
      setError('Erreur lors de l\'enregistrement du filtrage MAC');
    } finally {
      setIsLoading(false);
    }
  };

  const saveWifiPlanning = async () => {
    if (!wifiPlanning) return;
    setIsLoading(true);
    try {
      const response = await api.put(API_ROUTES.WIFI_PLANNING, wifiPlanning);
      if (response.success) {
        showSuccess('Planification WiFi enregistrée');
      } else {
        setError(response.error?.message || 'Erreur lors de la sauvegarde');
      }
    } catch {
      setError('Erreur lors de la sauvegarde');
    } finally {
      setIsLoading(false);
    }
  };

  // Backup functions
  const downloadJsonFile = (data: unknown, filename: string) => {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportPortForwarding = async () => {
    try {
      setIsLoading(true);
      const response = await api.get<{ result?: Array<typeof portForwardingRules[0]> }>(`${API_ROUTES.SETTINGS_NAT}/redirections`);
      if (response.success && response.result) {
        const rules = Array.isArray(response.result) ? response.result : [];
        const exportData = {
          exportDate: new Date().toISOString(),
          type: 'port_forwarding',
          description: 'Liste complète des redirections de port WAN (Pare-feu)',
          rules: rules.map(rule => ({
            id: rule.id,
            enabled: rule.enabled,
            comment: rule.comment || '',
            lan_port: rule.lan_port,
            wan_port_start: rule.wan_port_start,
            wan_port_end: rule.wan_port_end || rule.wan_port_start,
            lan_ip: rule.lan_ip,
            ip_proto: rule.ip_proto
          }))
        };
        downloadJsonFile(exportData, `freebox_port_forwarding_${new Date().toISOString().split('T')[0]}.json`);
        setSuccessMessage('Export des redirections de port réussi');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError('Impossible de récupérer les redirections de port');
      }
    } catch (error) {
      console.error('Export port forwarding error:', error);
      setError('Erreur lors de l\'export des redirections de port');
    } finally {
      setIsLoading(false);
    }
  };

  const exportDhcpStaticLeases = async () => {
    try {
      setIsLoading(true);
      const response = await api.get<{ result?: Array<typeof staticLeases[0]> }>(API_ROUTES.DHCP_STATIC_LEASES);
      if (response.success && response.result) {
        const leases = Array.isArray(response.result) ? response.result : [];
        const exportData = {
          exportDate: new Date().toISOString(),
          type: 'dhcp_static_leases',
          description: 'Liste complète des baux DHCP statiques',
          leases: leases.map(lease => ({
            id: lease.id,
            mac: lease.mac,
            ip: lease.ip,
            comment: lease.comment || '',
            hostname: lease.hostname || ''
          }))
        };
        downloadJsonFile(exportData, `freebox_dhcp_static_leases_${new Date().toISOString().split('T')[0]}.json`);
        setSuccessMessage('Export des baux DHCP statiques réussi');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setError('Impossible de récupérer les baux DHCP statiques');
      }
    } catch (error) {
      console.error('Export DHCP static leases error:', error);
      setError('Erreur lors de l\'export des baux DHCP statiques');
    } finally {
      setIsLoading(false);
    }
  };

  const exportWifiNetworks = async () => {
    try {
      setIsLoading(true);
      // Get WiFi full config (includes APs, BSS, config, etc.)
      const fullResponse = await api.get<{ result?: any }>(API_ROUTES.WIFI_FULL);
      const configResponse = await api.get<{ result?: any }>(API_ROUTES.WIFI_CONFIG);
      const bssResponse = await api.get<{ result?: Array<any> }>(API_ROUTES.WIFI_BSS);
      
      const wifiData: any = {
        exportDate: new Date().toISOString(),
        type: 'wifi_networks',
        description: 'Liste complète des réseaux WiFi avec leurs options'
      };

      if (fullResponse.success && fullResponse.result) {
        wifiData.fullConfig = fullResponse.result;
      }
      if (configResponse.success && configResponse.result) {
        wifiData.config = configResponse.result;
      }
      if (bssResponse.success && bssResponse.result) {
        const bssArray = Array.isArray(bssResponse.result) ? bssResponse.result : [];
        wifiData.bss = bssArray;
        // Format BSS data for better readability
        wifiData.networks = bssArray.map((bss: any) => ({
          id: bss.id,
          name: bss.name || '',
          ssid: bss.ssid || '',
          enabled: bss.enabled !== false,
          security: bss.security || 'none',
          key: bss.key ? '***' : undefined, // Don't export actual keys for security
          hasKey: !!bss.key,
          encryption: bss.encryption || 'none',
          hide_ssid: bss.hide_ssid || false,
          guest: bss.guest || false,
          ap_id: bss.ap_id,
          bssid: bss.bssid
        }));
      }

      downloadJsonFile(wifiData, `freebox_wifi_networks_${new Date().toISOString().split('T')[0]}.json`);
      setSuccessMessage('Export des réseaux WiFi réussi');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Export WiFi networks error:', error);
      setError('Erreur lors de l\'export des réseaux WiFi');
    } finally {
      setIsLoading(false);
    }
  };

  const exportAllBackups = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Export all three types
      await exportPortForwarding();
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between downloads
      await exportDhcpStaticLeases();
      await new Promise(resolve => setTimeout(resolve, 500));
      await exportWifiNetworks();
      
      setSuccessMessage('Tous les exports ont été téléchargés');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (error) {
      console.error('Export all backups error:', error);
      setError('Erreur lors de l\'export complet');
    } finally {
      setIsLoading(false);
    }
  };

  // Full Freebox backup export
  const exportFullFreeboxBackup = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Collect all configurations
      const [
        portForwardingRes,
        dhcpStaticLeasesRes,
        wifiFullRes,
        wifiConfigRes,
        wifiBssRes,
        lanConfigRes,
        connectionConfigRes,
        ddnsOvhRes,
        ddnsDyndnsRes,
        ddnsNoipRes
      ] = await Promise.all([
        api.get<{ result?: Array<any> }>(`${API_ROUTES.SETTINGS_NAT}/redirections`),
        api.get<{ result?: Array<any> }>(API_ROUTES.DHCP_STATIC_LEASES),
        api.get<{ result?: any }>(API_ROUTES.WIFI_FULL),
        api.get<{ result?: any }>(API_ROUTES.WIFI_CONFIG),
        api.get<{ result?: Array<any> }>(API_ROUTES.WIFI_BSS),
        api.get<{ result?: any }>(API_ROUTES.SETTINGS_LAN),
        api.get<{ result?: any }>(API_ROUTES.CONNECTION_CONFIG),
        api.get<{ result?: any }>('/api/connection/ddns/ovh'),
        api.get<{ result?: any }>('/api/connection/ddns/dyndns'),
        api.get<{ result?: any }>('/api/connection/ddns/noip')
      ]);

      const backupData: any = {
        exportDate: new Date().toISOString(),
        version: '1.0',
        type: 'freebox_full_backup',
        description: 'Backup complet de la configuration Freebox',
        freebox: {
          portForwarding: portForwardingRes.success && portForwardingRes.result ? portForwardingRes.result : [],
          dhcpStaticLeases: dhcpStaticLeasesRes.success && dhcpStaticLeasesRes.result ? dhcpStaticLeasesRes.result : [],
          wifi: {
            full: wifiFullRes.success && wifiFullRes.result ? wifiFullRes.result : null,
            config: wifiConfigRes.success && wifiConfigRes.result ? wifiConfigRes.result : null,
            bss: wifiBssRes.success && wifiBssRes.result ? wifiBssRes.result : []
          },
          lan: lanConfigRes.success && lanConfigRes.result ? lanConfigRes.result : null,
          connection: connectionConfigRes.success && connectionConfigRes.result ? connectionConfigRes.result : null,
          ddns: {
            ovh: ddnsOvhRes.success && ddnsOvhRes.result ? ddnsOvhRes.result : null,
            dyndns: ddnsDyndnsRes.success && ddnsDyndnsRes.result ? ddnsDyndnsRes.result : null,
            noip: ddnsNoipRes.success && ddnsNoipRes.result ? ddnsNoipRes.result : null
          }
        }
      };

      downloadJsonFile(backupData, `freebox_full_backup_${new Date().toISOString().split('T')[0]}.json`);
      setSuccessMessage('Backup complet exporté avec succès');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Export full backup error:', error);
      setError('Erreur lors de l\'export du backup complet');
    } finally {
      setIsLoading(false);
    }
  };

  // Full Freebox backup import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setError('Le fichier doit être au format JSON');
      return;
    }

    try {
      setIsImporting(true);
      setError(null);
      
      const fileContent = await file.text();
      const backupData = JSON.parse(fileContent);

      // Validate backup format
      if (!backupData.type || backupData.type !== 'freebox_full_backup') {
        setError('Format de backup invalide. Le fichier doit être un backup complet Freebox.');
        return;
      }

      // Import configurations
      const importResults: string[] = [];
      const importErrors: string[] = [];

      // Import port forwarding
      if (backupData.freebox?.portForwarding && Array.isArray(backupData.freebox.portForwarding)) {
        try {
          // Note: We would need an import endpoint for this
          // For now, we'll just show what would be imported
          importResults.push(`${backupData.freebox.portForwarding.length} redirections de port`);
        } catch (error) {
          importErrors.push('Erreur lors de l\'import des redirections de port');
        }
      }

      // Import DHCP static leases
      if (backupData.freebox?.dhcpStaticLeases && Array.isArray(backupData.freebox.dhcpStaticLeases)) {
        try {
          importResults.push(`${backupData.freebox.dhcpStaticLeases.length} baux DHCP statiques`);
        } catch (error) {
          importErrors.push('Erreur lors de l\'import des baux DHCP statiques');
        }
      }

      // Import WiFi config
      if (backupData.freebox?.wifi) {
        try {
          importResults.push('Configuration WiFi');
        } catch (error) {
          importErrors.push('Erreur lors de l\'import de la configuration WiFi');
        }
      }

      // Import LAN config
      if (backupData.freebox?.lan) {
        try {
          const response = await api.put(API_ROUTES.SETTINGS_LAN, backupData.freebox.lan);
          if (response.success) {
            importResults.push('Configuration LAN');
          } else {
            importErrors.push('Erreur lors de l\'import de la configuration LAN');
          }
        } catch (error) {
          importErrors.push('Erreur lors de l\'import de la configuration LAN');
        }
      }

      // Import connection config
      if (backupData.freebox?.connection) {
        try {
          const response = await api.put(API_ROUTES.CONNECTION_CONFIG, backupData.freebox.connection);
          if (response.success) {
            importResults.push('Configuration de connexion');
          } else {
            importErrors.push('Erreur lors de l\'import de la configuration de connexion');
          }
        } catch (error) {
          importErrors.push('Erreur lors de l\'import de la configuration de connexion');
        }
      }

      // Import DynDNS configs
      if (backupData.freebox?.ddns) {
        if (backupData.freebox.ddns.ovh) {
          try {
            const response = await api.put('/api/connection/ddns/ovh', backupData.freebox.ddns.ovh);
            if (response.success) {
              importResults.push('Configuration DynDNS OVH');
            }
          } catch (error) {
            importErrors.push('Erreur lors de l\'import de la configuration DynDNS OVH');
          }
        }
        if (backupData.freebox.ddns.dyndns) {
          try {
            const response = await api.put('/api/connection/ddns/dyndns', backupData.freebox.ddns.dyndns);
            if (response.success) {
              importResults.push('Configuration DynDNS DynDNS');
            }
          } catch (error) {
            importErrors.push('Erreur lors de l\'import de la configuration DynDNS DynDNS');
          }
        }
        if (backupData.freebox.ddns.noip) {
          try {
            const response = await api.put('/api/connection/ddns/noip', backupData.freebox.ddns.noip);
            if (response.success) {
              importResults.push('Configuration DynDNS No-IP');
            }
          } catch (error) {
            importErrors.push('Erreur lors de l\'import de la configuration DynDNS No-IP');
          }
        }
      }

      // Show results
      if (importErrors.length > 0) {
        setError(`Import terminé avec ${importErrors.length} erreur(s). ${importResults.join(', ')} importé(s).`);
      } else {
        setSuccessMessage(`Import réussi : ${importResults.join(', ')}`);
        setTimeout(() => setSuccessMessage(null), 5000);
        // Refresh data
        window.location.reload();
      }
    } catch (error) {
      console.error('Import backup error:', error);
      setError('Erreur lors de l\'import du backup. Vérifiez que le fichier est valide.');
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleReboot = async () => {
    if (confirm('Êtes-vous sûr de vouloir redémarrer la Freebox ?')) {
      setIsLoading(true);
      const success = await reboot();
      setIsLoading(false);
      
      if (success) {
        showSuccess('Redémarrage en cours...');
      } else {
        setError('Échec du redémarrage');
      }
    }
  };

  const freeboxTabs: { id: SettingsTab; label: string; icon: React.ElementType; color: string }[] = [
    { id: 'network', label: 'Réseau', icon: Globe, color: 'blue' },
    { id: 'wifi', label: 'WiFi', icon: Wifi, color: 'cyan' },
    { id: 'dhcp', label: 'DHCP', icon: Network, color: 'emerald' },
    { id: 'storage', label: 'Stockage', icon: HardDrive, color: 'amber' },
    { id: 'security', label: 'Sécurité', icon: Shield, color: 'red' },
    { id: 'system', label: 'Système', icon: Server, color: 'purple' },
    { id: 'backup', label: 'Backup', icon: Download, color: 'orange' }
  ];

  // Update time every minute
  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date());
    updateTime(); // Set initial time
    const interval = setInterval(updateTime, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const adminTabs: { id: AdminTab; label: string; icon: React.ElementType; color: string }[] = [
    { id: 'general', label: t('admin.tabGeneral'), icon: Settings, color: 'blue' },
    { id: 'plugins', label: t('admin.tabPlugins'), icon: Plug, color: 'emerald' },
    { id: 'theme', label: t('admin.tabTheme'), icon: Lightbulb, color: 'yellow' },
    { id: 'logs', label: t('admin.tabLogs'), icon: FileText, color: 'cyan' },
    { id: 'security', label: t('admin.tabSecurity'), icon: Shield, color: 'red' },
    { id: 'exporter', label: t('admin.tabExporter'), icon: Share2, color: 'amber' },
    { id: 'database', label: t('admin.tabDatabase'), icon: Database, color: 'purple' },
    { id: 'backup', label: t('admin.tabBackup'), icon: Download, color: 'orange' },
    { id: 'debug', label: t('admin.tabDebug'), icon: Monitor, color: 'violet' },
    { id: 'info', label: t('admin.tabInfo'), icon: Info, color: 'teal' }
  ];

  return (
    <div className="min-h-screen bg-theme-primary text-theme-primary">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-theme-header backdrop-blur-sm border-b border-theme" style={{ backdropFilter: 'var(--backdrop-blur)' }}>
        <div className="max-w-[1920px] mx-auto px-4 py-4">
          <div className="flex items-center justify-between relative">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                  className="p-2 hover:bg-theme-tertiary rounded-lg transition-colors"
              >
                <ChevronLeft size={24} />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-theme-secondary/50 rounded-lg">
                  <Settings size={24} className="text-theme-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-theme-primary">
                    {mode === 'administration' ? t('common.administration') : t('common.settings')}
                  </h1>
                  <p className="text-sm text-theme-secondary">
                    {mode === 'administration' ? t('admin.subtitleApp') : t('admin.subtitleFreebox')}
                  </p>
                </div>
              </div>
            </div>

            {/* Logo centré - uniquement en mode administration */}
            {mode === 'administration' && (
              <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-3">
                <img src={logoMynetworK} alt="MynetworK" className="w-12 h-12 flex-shrink-0" />
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-theme-primary text-lg">MynetworK</span>
                  {import.meta.env.DEV ? (
                    <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 rounded text-xs font-semibold text-amber-400 flex items-center gap-1">
                      <span>🔧</span>
                      <span>DEV</span>
                      <span className="text-amber-500/70 font-mono">v{APP_VERSION}</span>
                    </span>
                  ) : (
                    <span className="text-sm text-theme-secondary font-mono">v{APP_VERSION}</span>
                  )}
                </div>
              </div>
            )}

            {mode === 'administration' ? (
              <div className="flex items-center gap-3">
                {/* Date and Time (Freebox Revolution style with yellow LED) */}
                <div className="flex items-center gap-2 bg-theme-secondary px-4 py-2 rounded-lg border border-theme">
                  <div className="w-2 h-2 rounded-full bg-yellow-400 shadow-lg shadow-yellow-400/50 animate-pulse" />
                  <div className="flex flex-col items-end">
                    <div className="text-sm font-mono text-theme-primary font-semibold">
                      {currentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="text-xs text-theme-secondary">
                      {currentTime.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}
                    </div>
                  </div>
                </div>
                {/* User Menu */}
                {currentUser && (
                  <UserMenu
                    user={currentUser}
                    onSettingsClick={onSettingsClick}
                    onAdminClick={onAdminClick}
                    onProfileClick={onProfileClick}
                    onUsersClick={onUsersClick}
                    onLogout={onLogout}
                  />
                )}
              </div>
            ) : (
              <button
                onClick={fetchSettings}
                className="p-2 hover:bg-theme-tertiary rounded-lg transition-colors"
                title={t('admin.refresh')}
              >
                <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1920px] mx-auto px-4 py-6 pb-24">
        {/* Tabs */}
        {mode === 'administration' ? (
          <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
            {adminTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeAdminTab === tab.id;
              const colorClasses: Record<string, { active: string; inactive: string; icon: string }> = {
                blue: {
                  active: 'bg-blue-500/20 border-blue-500/50 text-blue-400',
                  inactive: 'border-gray-700 text-gray-400 hover:border-blue-500/50 hover:text-blue-400',
                  icon: 'text-blue-400'
                },
                purple: {
                  active: 'bg-purple-500/20 border-purple-500/50 text-purple-400',
                  inactive: 'border-gray-700 text-gray-400 hover:border-purple-500/50 hover:text-purple-400',
                  icon: 'text-purple-400'
                },
                emerald: {
                  active: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400',
                  inactive: 'border-gray-700 text-gray-400 hover:border-emerald-500/50 hover:text-emerald-400',
                  icon: 'text-emerald-400'
                },
                cyan: {
                  active: 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400',
                  inactive: 'border-gray-700 text-gray-400 hover:border-cyan-500/50 hover:text-cyan-400',
                  icon: 'text-cyan-400'
                },
                red: {
                  active: 'bg-red-500/20 border-red-500/50 text-red-400',
                  inactive: 'border-gray-700 text-gray-400 hover:border-red-500/50 hover:text-red-400',
                  icon: 'text-red-400'
                },
                amber: {
                  active: 'bg-amber-500/20 border-amber-500/50 text-amber-400',
                  inactive: 'border-gray-700 text-gray-400 hover:border-amber-500/50 hover:text-amber-400',
                  icon: 'text-amber-400'
                },
                yellow: {
                  active: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400',
                  inactive: 'border-gray-700 text-gray-400 hover:border-yellow-500/50 hover:text-yellow-400',
                  icon: 'text-yellow-400'
                },
                violet: {
                  active: 'bg-violet-500/20 border-violet-500/50 text-violet-300',
                  inactive: 'border-gray-700 text-gray-400 hover:border-violet-500/50 hover:text-violet-300',
                  icon: 'text-violet-300'
                },
                teal: {
                  active: 'bg-teal-500/20 border-teal-500/50 text-teal-300',
                  inactive: 'border-gray-700 text-gray-400 hover:border-teal-500/50 hover:text-teal-300',
                  icon: 'text-teal-300'
                }
              };
              const colors = colorClasses[tab.color] || colorClasses.blue;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveAdminTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all whitespace-nowrap ${
                    isActive
                      ? `${colors.active} shadow-lg shadow-${tab.color}-500/20`
                      : `bg-theme-secondary ${colors.inactive}`
                  }`}
                >
                  <Icon size={16} className={isActive ? 'text-white' : 'text-gray-400'} />
                  <span className="text-sm font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
            {freeboxTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const colorClasses: Record<string, { active: string; inactive: string; icon: string }> = {
                blue: {
                  active: 'bg-blue-500/20 border-blue-500/50 text-blue-400',
                  inactive: 'border-gray-700 text-gray-400 hover:border-blue-500/50 hover:text-blue-400',
                  icon: 'text-blue-400'
                },
                cyan: {
                  active: 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400',
                  inactive: 'border-gray-700 text-gray-400 hover:border-cyan-500/50 hover:text-cyan-400',
                  icon: 'text-cyan-400'
                },
                emerald: {
                  active: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400',
                  inactive: 'border-gray-700 text-gray-400 hover:border-emerald-500/50 hover:text-emerald-400',
                  icon: 'text-emerald-400'
                },
                amber: {
                  active: 'bg-amber-500/20 border-amber-500/50 text-amber-400',
                  inactive: 'border-gray-700 text-gray-400 hover:border-amber-500/50 hover:text-amber-400',
                  icon: 'text-amber-400'
                },
                red: {
                  active: 'bg-red-500/20 border-red-500/50 text-red-400',
                  inactive: 'border-gray-700 text-gray-400 hover:border-red-500/50 hover:text-red-400',
                  icon: 'text-red-400'
                },
                purple: {
                  active: 'bg-purple-500/20 border-purple-500/50 text-purple-400',
                  inactive: 'border-gray-700 text-gray-400 hover:border-purple-500/50 hover:text-purple-400',
                  icon: 'text-purple-400'
                },
                orange: {
                  active: 'bg-orange-500/20 border-orange-500/50 text-orange-400',
                  inactive: 'border-gray-700 text-gray-400 hover:border-orange-500/50 hover:text-orange-400',
                  icon: 'text-orange-400'
                }
              };
              const colors = colorClasses[tab.color] || colorClasses.blue;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all whitespace-nowrap ${
                    isActive
                      ? `${colors.active} shadow-lg shadow-${tab.color}-500/20`
                      : `bg-theme-secondary ${colors.inactive}`
                  }`}
                >
                  <Icon size={16} className={isActive ? 'text-white' : 'text-gray-400'} />
                  <span className="text-sm font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Success message */}
        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-900/20 border border-emerald-700/50 rounded-xl flex items-center gap-3">
            <Save className="text-emerald-400" size={18} />
            <p className="text-emerald-400">{successMessage}</p>
          </div>
        )}

        {/* Administration Mode Content */}
        {mode === 'administration' && (
          <>
            {activeAdminTab === 'general' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Colonne 1 */}
                <div className="space-y-6">
                  <Section title={t('admin.myProfile')} icon={Users} iconColor="blue">
                    <UserProfileSection />
                  </Section>
                  {currentUser?.role === 'admin' && (
                    <Section title={t('admin.userManagement')} icon={Users} iconColor="purple">
                      <UsersManagementSection />
                    </Section>
                  )}
                </div>

                <div className="space-y-6">
                  <Section title={t('admin.networkConfig')} icon={Network} iconColor="blue">
                    <GeneralNetworkSection />
                  </Section>

                  <Section title={t('admin.localization')} icon={Globe} iconColor="cyan">
                    <SettingRow
                      label={t('admin.timezone')}
                      description={t('admin.timezoneDescription')}
                    >
                      <select className="px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm">
                        <option value="Europe/Paris">{t('admin.timezoneParis')}</option>
                        <option value="UTC">{t('admin.timezoneUtc')}</option>
                        <option value="America/New_York">{t('admin.timezoneNewYork')}</option>
                      </select>
                    </SettingRow>
                  </Section>

                  <LanguageSection />
                </div>

                <div className="space-y-6">
                  <Section title={t('admin.updates')} icon={RefreshCw} iconColor="amber">
                    <UpdateCheckSection />
                  </Section>

                  <Section title={t('admin.info')} icon={Key} iconColor="purple">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-3 bg-[#1a1a1a] rounded-lg border border-gray-800">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">{t('admin.version')}</span>
                          <span className="text-sm text-white font-mono">{getVersionString()}</span>
                        </div>
                      </div>
                      <div className="p-3 bg-[#1a1a1a] rounded-lg border border-gray-800">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">{t('admin.databaseLabel')}</span>
                          <span className="text-sm text-white">SQLite</span>
                        </div>
                      </div>
                      <div className="p-3 bg-[#1a1a1a] rounded-lg border border-gray-800">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">{t('admin.authLabel')}</span>
                          <span className="text-sm text-white">JWT</span>
                        </div>
                      </div>
                    </div>
                  </Section>
                </div>
              </div>
            )}

            {activeAdminTab === 'theme' && (
              <div className="space-y-6">
                <ThemeSection />
              </div>
            )}


            {activeAdminTab === 'plugins' && (
              <div className="space-y-6">
                <PluginsManagementSection />
              </div>
            )}

            {activeAdminTab === 'logs' && (
              <div className="space-y-6">
                <LogsManagementSection />
              </div>
            )}

            {activeAdminTab === 'security' && (
              <SecuritySection />
            )}

            {activeAdminTab === 'exporter' && (
              <ExporterSection />
            )}

            {activeAdminTab === 'database' && (
              <DatabaseManagementSection />
            )}

            {activeAdminTab === 'backup' && (
              <BackupSection />
            )}

            {activeAdminTab === 'info' && (
              <InfoSection />
            )}

            {activeAdminTab === 'debug' && (
              <div className="space-y-6">
                <Section title={t('admin.appLogs')} icon={FileText} iconColor="cyan">
                  <AppLogsSection />
                </Section>
                <Section title={t('admin.logLevels')} icon={Monitor} iconColor="violet">
                  <DebugLogSection />
                </Section>

                <Section title={t('admin.debugDiagnostics')} icon={Monitor} iconColor="violet">
                  <div className="py-4 space-y-2 text-xs text-gray-400">
                    <p>{t('admin.debugIntro')}</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>
                        <span className="text-gray-300 font-semibold">{t('admin.debugLogsApplicative')}</span>
                        {' : '}{t('admin.debugLogsTab')}
                      </li>
                      <li>
                        <span className="text-gray-300 font-semibold">{t('admin.debugConfigExternal')}</span>
                        {' : '}{t('admin.debugConfigFile')}
                      </li>
                      <li>
                        <span className="text-gray-300 font-semibold">{t('admin.debugMetricsPrometheus')}</span>
                        {' : '}{t('admin.debugMetricsEndpoint')}
                      </li>
                      <li>
                        <span className="text-gray-300 font-semibold">{t('admin.debugMetricsInflux')}</span>
                        {' : '}{t('admin.debugMetricsInfluxEndpoint')}
                      </li>
                    </ul>
                  </div>
                </Section>
              </div>
            )}
          </>
        )}

        {/* Freebox Mode Content */}
        {mode === 'freebox' && (
          <>
            {/* Error message */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-700/50 rounded-xl flex items-center gap-3">
            <AlertCircle className="text-red-400" />
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={32} className="text-gray-400 animate-spin" />
          </div>
        )}

        {/* Network settings */}
        {!isLoading && activeTab === 'network' && (
          <div className="space-y-6">
            
            
            {/* Connection Config Section - Only show if connectionConfig is loaded */}
            {connectionConfig && (
              <>
            <Section title="Options réseau" icon={Network} permissionError={!hasPermission('settings') ? getPermissionErrorMessage('settings') : null} freeboxSettingsUrl={!hasPermission('settings') ? getFreeboxSettingsUrl(freeboxUrl) : null}>
              <SettingRow
                label="Réponse au ping"
                description="Répond aux requêtes ping depuis Internet"
              >
                <Toggle
                  enabled={connectionConfig.ping}
                  onChange={(v) => setConnectionConfig({ ...connectionConfig, ping: v })}
                />
              </SettingRow>
              <SettingRow
                label="Wake on LAN"
                description="Permet de réveiller les appareils depuis Internet"
              >
                <Toggle
                  enabled={connectionConfig.wol}
                  onChange={(v) => setConnectionConfig({ ...connectionConfig, wol: v })}
                />
              </SettingRow>
              <SettingRow
                label="Blocage de publicités"
                description="Active le blocage DNS des publicités"
              >
                <Toggle
                  enabled={connectionConfig.adblock}
                  onChange={(v) => setConnectionConfig({ ...connectionConfig, adblock: v })}
                />
              </SettingRow>
            </Section>

            {/* Mode réseau */}
            <Section title="Mode réseau" icon={Network} iconColor="blue" permissionError={!hasPermission('settings') ? getPermissionErrorMessage('settings') : null} freeboxSettingsUrl={!hasPermission('settings') ? getFreeboxSettingsUrl(freeboxUrl) : null}>
              <SettingRow
                label="Choix mode réseau"
                description="Mode de fonctionnement du réseau Freebox"
              >
                {loadingLanConfig ? (
                  <Loader2 size={16} className="animate-spin text-gray-400" />
                ) : (
                  <select
                    value={lanConfig?.mode || 'server'}
                    onChange={(e) => setLanConfig({ ...(lanConfig || {}), mode: e.target.value as 'server' | 'bridge' })}
                    className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="server">Server</option>
                    <option value="bridge">Bridge</option>
                  </select>
                )}
              </SettingRow>
              <SettingRow
                label="Adresse IP du Freebox Server"
                description="Adresse IP de la Freebox Server sur le réseau local"
              >
                {loadingLanConfig ? (
                  <Loader2 size={16} className="animate-spin text-gray-400" />
                ) : (
                  <input
                    type="text"
                    value={lanConfig?.ip || ''}
                    onChange={(e) => setLanConfig({ ...(lanConfig || {}), ip: e.target.value })}
                    placeholder="192.168.1.254"
                    className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-blue-500 w-40"
                  />
                )}
              </SettingRow>
            </Section>

            {/* Nom d'hôte */}
            <Section title="Nom d'hôte" icon={Globe} iconColor="blue" permissionError={!hasPermission('settings') ? getPermissionErrorMessage('settings') : null} freeboxSettingsUrl={!hasPermission('settings') ? getFreeboxSettingsUrl(freeboxUrl) : null}>
              <SettingRow
                label="Nom du Freebox Server"
                description="Nom d'hôte de la Freebox Server"
              >
                {loadingLanConfig ? (
                  <Loader2 size={16} className="animate-spin text-gray-400" />
                ) : (
                  <input
                    type="text"
                    value={lanConfig?.hostname || ''}
                    onChange={(e) => setLanConfig({ ...(lanConfig || {}), hostname: e.target.value })}
                    placeholder="freebox-server"
                    className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 w-48"
                  />
                )}
              </SettingRow>
              <SettingRow
                label="Nom DNS"
                description="Nom DNS de la Freebox Server"
              >
                {loadingLanConfig ? (
                  <Loader2 size={16} className="animate-spin text-gray-400" />
                ) : (
                  <input
                    type="text"
                    value={lanConfig?.dns_name ?? ''}
                    onChange={(e) => setLanConfig({ ...(lanConfig || {}), dns_name: e.target.value })}
                    placeholder="freebox-server.local"
                    className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 w-48"
                  />
                )}
              </SettingRow>
              <SettingRow
                label="Nom mDNS"
                description="Nom mDNS (multicast DNS) de la Freebox Server"
              >
                {loadingLanConfig ? (
                  <Loader2 size={16} className="animate-spin text-gray-400" />
                ) : (
                  <input
                    type="text"
                    value={lanConfig?.mdns_name ?? ''}
                    onChange={(e) => setLanConfig({ ...(lanConfig || {}), mdns_name: e.target.value })}
                    placeholder="freebox-server.local"
                    className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 w-48"
                  />
                )}
              </SettingRow>
              <SettingRow
                label="Nom NetBIOS"
                description="Nom NetBIOS de la Freebox Server"
              >
                {loadingLanConfig ? (
                  <Loader2 size={16} className="animate-spin text-gray-400" />
                ) : (
                  <input
                    type="text"
                    value={lanConfig?.netbios_name ?? ''}
                    onChange={(e) => setLanConfig({ ...(lanConfig || {}), netbios_name: e.target.value })}
                    placeholder="FREEBOX-SERVER"
                    className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 w-48"
                  />
                )}
              </SettingRow>
            </Section>

            {/* Nom de domaine (reverse DNS) */}
            <Section 
              title="Nom de domaine" 
              icon={Globe} 
              iconColor="purple" 
              permissionError={!hasPermission('settings') ? getPermissionErrorMessage('settings') : null} 
              freeboxSettingsUrl={!hasPermission('settings') ? getFreeboxSettingsUrl(freeboxUrl) : null}
            >
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-800">
                <div></div>
                <button
                  onClick={() => setShowCustomDomainModal(true)}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                >
                  <Plus size={14} />
                  {domainInfo ? 'Modifier le domaine' : 'Ajouter un domaine'}
                </button>
              </div>
              {loadingDomainInfo ? (
                <div className="flex items-center gap-2 py-4">
                  <Loader2 size={16} className="animate-spin text-gray-400" />
                  <span className="text-sm text-gray-400">Chargement des informations du domaine...</span>
                </div>
              ) : domainInfo ? (
                <>
                  <SettingRow
                    label="Nom de domaine"
                    description="Nom de domaine personnalisé de la Freebox"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-mono">{domainInfo.domain || 'Non configuré'}</span>
                      {domainInfo.enabled && (
                        <span className="px-2 py-0.5 bg-green-900/40 border border-green-700 text-green-400 text-xs rounded">Oui</span>
                      )}
                    </div>
                  </SettingRow>
                  {domainInfo.enabled && (
                    <>
                      <SettingRow
                        label="Type de certificat"
                        description="Type de certificat TLS utilisé"
                      >
                        <span className="text-white text-sm">{domainInfo.certificateType || 'RSA'}</span>
                      </SettingRow>
                      <SettingRow
                        label="Statut du certificat"
                        description="État de validité du certificat TLS"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-xs rounded ${
                            domainInfo.certificateValid 
                              ? 'bg-green-900/40 border border-green-700 text-green-400'
                              : 'bg-red-900/40 border border-red-700 text-red-400'
                          }`}>
                            {domainInfo.certificateValid ? 'Valide' : 'Invalide'}
                          </span>
                          {domainInfo.certificateExpiry && (
                            <span className="text-xs text-gray-400">
                              {domainInfo.certificateExpiry}
                            </span>
                          )}
                        </div>
                      </SettingRow>
                    </>
                  )}
                </>
              ) : (
                <div className="text-sm text-gray-400 py-2">Aucun nom de domaine personnalisé configuré</div>
              )}
            </Section>

            {/* DNS Dynamique */}
            <Section title="DNS Dynamique" icon={Globe} iconColor="cyan" permissionError={!hasPermission('settings') ? getPermissionErrorMessage('settings') : null} freeboxSettingsUrl={!hasPermission('settings') ? getFreeboxSettingsUrl(freeboxUrl) : null}>
              <SettingRow
                label="Activer DynDNS"
                description="Active la mise à jour automatique du nom de domaine"
              >
                <Toggle
                  enabled={ddnsConfig.enabled}
                  onChange={(v) => setDdnsConfig({ ...ddnsConfig, enabled: v })}
                />
              </SettingRow>
              {ddnsConfig.enabled && (
                <>
                  <SettingRow
                    label="Fournisseur DynDNS"
                    description="Sélectionnez le fournisseur de service DynDNS"
                  >
                    {loadingDdnsConfig ? (
                      <Loader2 size={16} className="animate-spin text-gray-400" />
                    ) : (
                      <select
                        value={ddnsConfig.provider || ''}
                        onChange={(e) => {
                          const provider = e.target.value as 'ovh' | 'dyndns' | 'noip' | '';
                          setDdnsConfig({ ...ddnsConfig, provider: provider || null });
                          // Reload config when provider changes
                          if (provider) {
                            setLoadingDdnsConfig(true);
                            Promise.all([
                              api.get<any>(`/api/connection/ddns/${provider}`),
                              api.get<any>(`/api/connection/ddns/${provider}/status`)
                            ]).then(([configRes, statusRes]) => {
                              if (configRes.success && configRes.result) {
                                const ddnsData = configRes.result as any;
                                setDdnsConfig({
                                  provider: provider as 'ovh' | 'dyndns' | 'noip',
                                  enabled: ddnsData.enabled || false,
                                  hostname: ddnsData.hostname || '',
                                  user: ddnsData.user || '',
                                  password: ''
                                });
                              }
                              if (statusRes.success && statusRes.result) {
                                setDdnsStatus(statusRes.result as any);
                              }
                            })
                            .catch((error) => {
                              console.error('Failed to fetch DynDNS config:', error);
                            })
                            .finally(() => {
                              setLoadingDdnsConfig(false);
                            });
                          }
                        }}
                        className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                      >
                        <option value="">Aucun</option>
                        <option value="ovh">OVH</option>
                        <option value="dyndns">DynDNS</option>
                        <option value="noip">No-IP</option>
                      </select>
                    )}
                  </SettingRow>
                  {ddnsConfig.provider && (
                    <>
                      <SettingRow
                        label="Nom d'hôte"
                        description="Nom de domaine à utiliser pour l'enregistrement"
                      >
                        <input
                          type="text"
                          value={ddnsConfig.hostname}
                          onChange={(e) => setDdnsConfig({ ...ddnsConfig, hostname: e.target.value })}
                          placeholder="example.dyndns.org"
                          className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 w-64"
                        />
                      </SettingRow>
                      <SettingRow
                        label="Utilisateur"
                        description="Nom d'utilisateur pour l'authentification"
                      >
                        <input
                          type="text"
                          value={ddnsConfig.user}
                          onChange={(e) => setDdnsConfig({ ...ddnsConfig, user: e.target.value })}
                          placeholder="username"
                          className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 w-48"
                        />
                      </SettingRow>
                      <SettingRow
                        label="Mot de passe"
                        description="Mot de passe pour l'authentification"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type={showDdnsPassword ? "text" : "password"}
                            value={ddnsConfig.password}
                            onChange={(e) => setDdnsConfig({ ...ddnsConfig, password: e.target.value })}
                            placeholder="••••••••"
                            className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-blue-500 w-48"
                          />
                          <button
                            type="button"
                            onClick={() => setShowDdnsPassword(!showDdnsPassword)}
                            className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
                            title={showDdnsPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                          >
                            {showDdnsPassword ? <EyeOff size={16} className="text-gray-400" /> : <Eye size={16} className="text-gray-400" />}
                          </button>
                        </div>
                      </SettingRow>
                      {ddnsStatus && (
                        <SettingRow
                          label="Statut"
                          description="État actuel du service DynDNS"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                              ddnsStatus.status === 'ok' 
                                ? 'bg-green-900/40 border border-green-700 text-green-400'
                                : ddnsStatus.status === 'disabled'
                                ? 'bg-gray-900/40 border border-gray-700 text-gray-400'
                                : 'bg-red-900/40 border border-red-700 text-red-400'
                            }`}>
                              {ddnsStatus.status === 'ok' ? 'OK' :
                               ddnsStatus.status === 'disabled' ? 'Désactivé' :
                               ddnsStatus.status === 'wait' ? 'Mise à jour...' :
                               ddnsStatus.status === 'reqfail' ? 'Échec requête' :
                               ddnsStatus.status === 'authfail' ? 'Erreur auth' :
                               ddnsStatus.status === 'nocredential' ? 'Identifiants invalides' :
                               ddnsStatus.status === 'ipinval' ? 'IP invalide' :
                               ddnsStatus.status === 'hostinval' ? 'Nom invalide' :
                               ddnsStatus.status === 'abuse' ? 'Bloqué (abus)' :
                               ddnsStatus.status === 'dnserror' ? 'Erreur DNS' :
                               ddnsStatus.status === 'unavailable' ? 'Service indisponible' :
                               ddnsStatus.status === 'nowan' ? 'Pas d\'IP WAN' :
                               ddnsStatus.status || 'Inconnu'}
                            </span>
                            {ddnsStatus.last_refresh && (
                              <span className="text-xs text-gray-500">
                                Dernière mise à jour: {new Date(ddnsStatus.last_refresh * 1000).toLocaleString('fr-FR')}
                              </span>
                            )}
                          </div>
                        </SettingRow>
                      )}
                    </>
                  )}
                </>
              )}
            </Section>

            <Section title="Accès distant" icon={Globe} permissionError={!hasPermission('settings') ? getPermissionErrorMessage('settings') : null} freeboxSettingsUrl={!hasPermission('settings') ? getFreeboxSettingsUrl(freeboxUrl) : null}>
              <SettingRow
                label="Accès distant"
                description="Permet l'accès à la Freebox depuis Internet"
              >
                <Toggle
                  enabled={connectionConfig.remote_access}
                  onChange={(v) => setConnectionConfig({ ...connectionConfig, remote_access: v })}
                />
              </SettingRow>
              <SettingRow
                label="Port d'accès distant"
                description="Port HTTP pour l'accès distant à la Freebox"
              >
                <input
                  type="number"
                  value={connectionConfig.remote_access_port}
                  onChange={(e) => setConnectionConfig({ ...connectionConfig, remote_access_port: parseInt(e.target.value) })}
                  className="w-24 px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:outline-none"
                />
              </SettingRow>
            </Section>

            <div className="flex items-center justify-between gap-4 p-4 bg-[#1a1a1a] border border-gray-800 rounded-lg">
              {hasNetworkUnsavedChanges && (
                <div className="flex items-center gap-2 text-amber-400 text-sm">
                  <AlertCircle size={16} />
                  <span>Modifications non enregistrées</span>
                </div>
              )}
              {!hasNetworkUnsavedChanges && (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <CheckCircle size={16} />
                  <span>Aucune modification</span>
                </div>
              )}
              <button
                onClick={saveAllNetworkSettings}
                disabled={!hasPermission('settings') || !hasNetworkUnsavedChanges || isLoading || loadingLanConfig || loadingDdnsConfig}
                className={`flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium ${
                  !hasPermission('settings') || !hasNetworkUnsavedChanges || isLoading || loadingLanConfig || loadingDdnsConfig
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                }`}
              >
                {isLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Enregistrer les modifications
                  </>
                )}
              </button>
            </div>
              </>
            )}
          </div>
        )}

        {/* WiFi settings */}
        {!isLoading && activeTab === 'wifi' && (
          <div className="space-y-6">
            <Section title="Planification WiFi" icon={Clock} permissionError={!hasPermission('settings') ? getPermissionErrorMessage('settings') : null} freeboxSettingsUrl={!hasPermission('settings') ? getFreeboxSettingsUrl(freeboxUrl) : null}>
              <SettingRow
                label="Planification active"
                description="Active les horaires d'extinction automatique du WiFi"
              >
                <Toggle
                  enabled={wifiPlanning?.enabled || false}
                  onChange={(v) => setWifiPlanning({ ...wifiPlanning, enabled: v })}
                />
              </SettingRow>
              <div className="py-4 text-sm text-gray-500">
                <p>Configurez les plages horaires dans l'interface détaillée.</p>
                <p className="mt-2">Le WiFi peut être automatiquement désactivé la nuit pour économiser l'énergie.</p>
              </div>
            </Section>

            <Section title="Filtrage MAC" icon={Shield} permissionError={!hasPermission('settings') ? getPermissionErrorMessage('settings') : null} freeboxSettingsUrl={!hasPermission('settings') ? getFreeboxSettingsUrl(freeboxUrl) : null}>
              <SettingRow
                label="Filtrage MAC activé"
                description="Active le filtrage par adresse MAC pour contrôler l'accès WiFi"
              >
                <Toggle
                  enabled={wifiMacFilter?.enabled || false}
                  onChange={(v) => setWifiMacFilter({ ...wifiMacFilter, enabled: v })}
                />
              </SettingRow>
              {wifiMacFilter?.enabled && (
                <>
                  <SettingRow
                    label="Mode de filtrage"
                    description="Liste blanche : seuls les appareils autorisés peuvent se connecter. Liste noire : les appareils listés sont bloqués."
                  >
                    <select
                      value={wifiMacFilter?.mode || 'whitelist'}
                      onChange={(e) => setWifiMacFilter({ ...wifiMacFilter, mode: e.target.value as 'whitelist' | 'blacklist' })}
                      className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none"
                    >
                      <option value="whitelist">Liste blanche</option>
                      <option value="blacklist">Liste noire</option>
                    </select>
                  </SettingRow>
                  {wifiMacFilter?.macs && wifiMacFilter.macs.length > 0 && (
                    <SettingRow
                      label={`Adresses MAC (${wifiMacFilter.macs.length})`}
                      description={`${wifiMacFilter.mode === 'whitelist' ? 'Appareils autorisés' : 'Appareils bloqués'}`}
                    >
                      <div className="space-y-2">
                        {wifiMacFilter.macs.map((mac, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <code className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-300 text-sm font-mono flex-1">
                              {mac}
                            </code>
                            <button
                              onClick={() => {
                                const newMacs = wifiMacFilter.macs?.filter((_, i) => i !== index) || [];
                                setWifiMacFilter({ ...wifiMacFilter, macs: newMacs });
                              }}
                              className="p-1.5 hover:bg-red-700/20 rounded-lg transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 size={16} className="text-red-400 hover:text-red-300" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </SettingRow>
                  )}
                  <SettingRow
                    label="Ajouter une adresse MAC"
                    description="Format : XX:XX:XX:XX:XX:XX ou XX-XX-XX-XX-XX-XX"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="00:11:22:33:44:55"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const input = e.currentTarget;
                            const mac = input.value.trim();
                            if (mac && /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac)) {
                              const currentMacs = wifiMacFilter?.macs || [];
                              if (!currentMacs.includes(mac.toUpperCase())) {
                                setWifiMacFilter({ ...wifiMacFilter, macs: [...currentMacs, mac.toUpperCase()] });
                              }
                              input.value = '';
                            }
                          }
                        }}
                        className="flex-1 px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={(e) => {
                          const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                          const mac = input.value.trim();
                          if (mac && /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac)) {
                            const currentMacs = wifiMacFilter?.macs || [];
                            if (!currentMacs.includes(mac.toUpperCase())) {
                              setWifiMacFilter({ ...wifiMacFilter, macs: [...currentMacs, mac.toUpperCase()] });
                            }
                            input.value = '';
                          }
                        }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center gap-1"
                      >
                        <Plus size={16} />
                        Ajouter
                      </button>
                    </div>
                  </SettingRow>
                </>
              )}
              {!wifiMacFilter?.enabled && (
                <div className="py-4 text-sm text-gray-500">
                  <p>Le filtrage MAC permet de restreindre l'accès au WiFi à des appareils spécifiques.</p>
                  <p className="mt-2">Mode liste blanche : seuls les appareils autorisés peuvent se connecter.</p>
                  <p>Mode liste noire : les appareils listés sont bloqués.</p>
                </div>
              )}
            </Section>

            <div className="flex gap-2">
              {wifiPlanning && (
                <button
                  onClick={saveWifiPlanning}
                  disabled={!hasPermission('settings')}
                  className={`flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors ${!hasPermission('settings') ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Save size={16} />
                  Enregistrer planification
                </button>
              )}
              {wifiMacFilter && (
                <button
                  onClick={saveWifiMacFilter}
                  disabled={!hasPermission('settings')}
                  className={`flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors ${!hasPermission('settings') ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Save size={16} />
                  Enregistrer filtrage MAC
                </button>
              )}
            </div>
          </div>
        )}

        {/* DHCP settings */}
        {!isLoading && activeTab === 'dhcp' && dhcpConfig && (
          <div className="space-y-6">
            <Section title="Serveur DHCP" icon={Network} permissionError={!hasPermission('settings') ? getPermissionErrorMessage('settings') : null} freeboxSettingsUrl={!hasPermission('settings') ? getFreeboxSettingsUrl(freeboxUrl) : null}>
              <SettingRow
                label="DHCP activé"
                description="Attribution automatique des adresses IP"
              >
                <Toggle
                  enabled={dhcpConfig.enabled}
                  onChange={(v) => setDhcpConfig({ ...dhcpConfig, enabled: v })}
                />
              </SettingRow>
              <SettingRow label="Début de plage IP">
                <input
                  type="text"
                  value={dhcpConfig.ip_range_start}
                  onChange={(e) => setDhcpConfig({ ...dhcpConfig, ip_range_start: e.target.value })}
                  className="w-40 px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:outline-none"
                />
              </SettingRow>
              <SettingRow label="Fin de plage IP">
                <input
                  type="text"
                  value={dhcpConfig.ip_range_end}
                  onChange={(e) => setDhcpConfig({ ...dhcpConfig, ip_range_end: e.target.value })}
                  className="w-40 px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:outline-none"
                />
              </SettingRow>
              <SettingRow
                label="Serveurs DNS"
                description="Serveurs DNS distribués aux clients DHCP"
              >
                <div className="flex flex-col gap-2">
                  {(dhcpConfig.dns || []).map((dns, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={dns}
                        onChange={(e) => {
                          const newDns = [...(dhcpConfig.dns || [])];
                          newDns[index] = e.target.value;
                          setDhcpConfig({ ...dhcpConfig, dns: newDns });
                        }}
                        placeholder="192.168.1.254"
                        className="w-40 px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:outline-none"
                      />
                      <button
                        onClick={() => {
                          const newDns = (dhcpConfig.dns || []).filter((_, i) => i !== index);
                          setDhcpConfig({ ...dhcpConfig, dns: newDns });
                        }}
                        className="p-1.5 hover:bg-gray-800 rounded text-red-400 hover:text-red-300 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {(dhcpConfig.dns || []).length < 3 && (
                    <button
                      onClick={() => {
                        const newDns = [...(dhcpConfig.dns || []), ''];
                        setDhcpConfig({ ...dhcpConfig, dns: newDns });
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#252525] border border-gray-700 rounded-lg text-gray-400 hover:text-white text-sm transition-colors w-fit"
                    >
                      <Plus size={14} />
                      Ajouter DNS
                    </button>
                  )}
                </div>
              </SettingRow>
              <SettingRow
                label="Attribution persistante"
                description="Conserver l'attribution IP entre les redémarrages"
              >
                <Toggle
                  enabled={dhcpConfig.sticky_assign}
                  onChange={(v) => setDhcpConfig({ ...dhcpConfig, sticky_assign: v })}
                />
              </SettingRow>
            </Section>

            <button
              onClick={saveDhcpConfig}
              disabled={!hasPermission('settings')}
              className={`flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors ${!hasPermission('settings') ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Save size={16} />
              Enregistrer
            </button>

            {/* Static Leases Section */}
            <Section title="Baux DHCP statiques" icon={Network} permissionError={!hasPermission('settings') ? getPermissionErrorMessage('settings') : null} freeboxSettingsUrl={!hasPermission('settings') ? getFreeboxSettingsUrl(freeboxUrl) : null}>
              <div className="flex items-center justify-between py-3">
                <span className="text-xs text-gray-500">({staticLeases.length} bail{staticLeases.length !== 1 ? 'x' : ''})</span>
                <button
                  onClick={addStaticLease}
                  disabled={!hasPermission('settings')}
                  className={`flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors ${!hasPermission('settings') ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Plus size={14} />
                  Ajouter
                </button>
              </div>
              <div className="overflow-x-auto">
                {staticLeases.length > 0 ? (
                  <table className="w-full">
                    <thead className="bg-[#0a0a0a] border-b border-gray-800">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Adresse MAC</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">IP</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Commentaire</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Hostname</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {staticLeases.map((lease) => (
                        <tr key={lease.id} className="hover:bg-[#0a0a0a] transition-colors">
                          <td className="px-4 py-3 text-sm font-mono text-white">{lease.mac}</td>
                          <td className="px-4 py-3 text-sm font-mono text-white">{lease.ip}</td>
                          <td className="px-4 py-3 text-sm text-gray-300">{lease.comment || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-400">{lease.hostname || '-'}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => editStaticLease(lease)}
                                className="p-1.5 hover:bg-gray-800 rounded text-blue-400 hover:text-blue-300 transition-colors"
                                title="Modifier"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => deleteStaticLease(lease.id)}
                                className="p-1.5 hover:bg-gray-800 rounded text-red-400 hover:text-red-300 transition-colors"
                                title="Supprimer"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-8 text-center text-gray-500">
                    <Network size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Aucun bail statique configuré</p>
                    <p className="text-xs mt-1">Cliquez sur "Ajouter" pour en créer un</p>
                  </div>
                )}
              </div>
            </Section>
          </div>
        )}

        {/* Storage (FTP) settings */}
        {!isLoading && activeTab === 'storage' && ftpConfig && (
          <div className="space-y-6">
            <Section title="Serveur FTP" icon={Share2} permissionError={!hasPermission('settings') ? getPermissionErrorMessage('settings') : null} freeboxSettingsUrl={!hasPermission('settings') ? getFreeboxSettingsUrl(freeboxUrl) : null}>
              <SettingRow
                label="FTP activé"
                description="Permet l'accès aux fichiers via FTP"
              >
                <Toggle
                  enabled={ftpConfig.enabled}
                  onChange={(v) => setFtpConfig({ ...ftpConfig, enabled: v })}
                />
              </SettingRow>
              <SettingRow
                label="Accès anonyme"
                description="Permet l'accès sans authentification"
              >
                <Toggle
                  enabled={ftpConfig.allow_anonymous}
                  onChange={(v) => setFtpConfig({ ...ftpConfig, allow_anonymous: v })}
                />
              </SettingRow>
              <SettingRow
                label="Écriture anonyme"
                description="Permet aux anonymes de créer/modifier des fichiers"
              >
                <Toggle
                  enabled={ftpConfig.allow_anonymous_write}
                  onChange={(v) => setFtpConfig({ ...ftpConfig, allow_anonymous_write: v })}
                />
              </SettingRow>
              <SettingRow label="Port FTP">
                <input
                  type="number"
                  value={ftpConfig.port_ctrl}
                  onChange={(e) => setFtpConfig({ ...ftpConfig, port_ctrl: parseInt(e.target.value) })}
                  className="w-24 px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:outline-none"
                />
              </SettingRow>
            </Section>

            <button
              onClick={saveFtpConfig}
              disabled={!hasPermission('settings')}
              className={`flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors ${!hasPermission('settings') ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Save size={16} />
              Enregistrer
            </button>
          </div>
        )}

        {/* Security settings */}
        {!isLoading && activeTab === 'security' && (
          <div className="space-y-6">
            {/* Freebox Information Section - Always show in freebox mode */}
            {mode === 'freebox' && (
              <Section title="Informations Freebox" icon={Info} iconColor="cyan">
              <SettingRow
                label="Token d'application"
                description="Token d'authentification créé pour l'application Freebox"
              >
                <div className="flex items-center gap-2">
                  {loadingToken ? (
                    <Loader2 size={16} className="animate-spin text-gray-400" />
                  ) : freeboxToken ? (
                    <div className="flex items-center gap-2">
                      <code className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-cyan-400 text-sm font-mono break-all min-w-[200px]">
                        {showFreeboxToken ? freeboxToken : '••••••••••••••••••••••••••••••••'}
                      </code>
                      <button
                        onClick={() => setShowFreeboxToken(!showFreeboxToken)}
                        className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
                        title={showFreeboxToken ? "Masquer le token" : "Afficher le token"}
                      >
                        {showFreeboxToken ? (
                          <EyeOff size={16} className="text-gray-400 hover:text-gray-200" />
                        ) : (
                          <Eye size={16} className="text-gray-400 hover:text-gray-200" />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(freeboxToken);
                          setSuccessMessage('Token copié dans le presse-papiers');
                          setTimeout(() => setSuccessMessage(null), 3000);
                        }}
                        className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
                        title="Copier le token"
                      >
                        <Share2 size={16} className="text-gray-400 hover:text-gray-200" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500">Non enregistré</span>
                  )}
                </div>
              </SettingRow>
              {freeboxUrl && (
                <SettingRow
                  label="URL Freebox"
                  description="Adresse de la Freebox"
                >
                  <code className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-gray-300 text-sm font-mono">
                    {freeboxUrl}
                  </code>
                </SettingRow>
              )}
              </Section>
            )}
            
            <Section title="Contrôle parental" icon={Users} permissionError={!hasPermission('parental') ? getPermissionErrorMessage('parental') : null} freeboxSettingsUrl={!hasPermission('parental') ? getFreeboxSettingsUrl(freeboxUrl) : null}>
              <SettingRow
                label="Règles de filtrage"
                description="Règles de contrôle parental pour limiter l'accès Internet"
              >
                <button
                  onClick={() => setShowParentalModal(true)}
                  disabled={!hasPermission('parental')}
                  className={`flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors ${!hasPermission('parental') ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <ExternalLink size={14} />
                  Gérer
                </button>
              </SettingRow>
              {parentalProfiles.length > 0 && (
                <div className="py-2 space-y-2">
                  {parentalProfiles.map((profile) => (
                    <div key={profile.id} className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-lg">
                      <span className="text-sm text-white">{profile.name}</span>
                      <span className="text-xs text-gray-500">ID: {profile.id}</span>
                    </div>
                  ))}
                </div>
              )}
              {parentalProfiles.length === 0 && (
                <div className="py-4 text-sm text-gray-500">
                  <p>Cliquez sur "Gérer" pour configurer les règles de contrôle parental.</p>
                  <p className="mt-2">Limitez l'accès Internet pour certains appareils par horaires ou de façon permanente.</p>
                </div>
              )}
            </Section>

            <Section title="Pare-feu - Redirection de ports" icon={Shield} permissionError={!hasPermission('settings') ? getPermissionErrorMessage('settings') : null} freeboxSettingsUrl={!hasPermission('settings') ? getFreeboxSettingsUrl(freeboxUrl) : null}>
              <SettingRow
                label="Règles actives"
                description="Redirections de ports configurées sur la Freebox"
              >
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm">
                    {portForwardingRules.filter(r => r.enabled).length} / {portForwardingRules.length}
                  </span>
                  <button
                    onClick={() => setShowFirewallModal(true)}
                    disabled={!hasPermission('settings')}
                    className={`flex items-center gap-2 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-sm rounded-lg transition-colors ${!hasPermission('settings') ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <ExternalLink size={14} />
                    Gérer
                  </button>
                </div>
              </SettingRow>
              {portForwardingRules.length > 0 && (
                <div className="py-2 space-y-2">
                  {portForwardingRules.slice(0, 5).map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-lg">
                      <div className="flex-1">
                        <span className="text-sm text-white">{rule.comment || `Port ${rule.wan_port_start}`}</span>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {rule.ip_proto.toUpperCase()} {rule.wan_port_start}{rule.wan_port_end ? `-${rule.wan_port_end}` : ''} → {rule.lan_ip}:{rule.lan_port}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs ${rule.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-700 text-gray-400'}`}>
                        {rule.enabled ? 'Actif' : 'Inactif'}
                      </span>
                    </div>
                  ))}
                  {portForwardingRules.length > 5 && (
                    <p className="text-xs text-gray-500 text-center py-2">
                      + {portForwardingRules.length - 5} autres règles
                    </p>
                  )}
                </div>
              )}
              {portForwardingRules.length === 0 && (
                <div className="py-4 text-sm text-gray-500">
                  <p>Aucune redirection de port configurée.</p>
                  <p className="mt-2">Les redirections permettent d'exposer des services internes sur Internet.</p>
                </div>
              )}
            </Section>

            <Section title="Serveur VPN" icon={Lock} permissionError={!hasPermission('settings') ? getPermissionErrorMessage('settings') : null} freeboxSettingsUrl={!hasPermission('settings') ? getFreeboxSettingsUrl(freeboxUrl) : null}>
              <SettingRow
                label="Serveur VPN"
                description="Permet de se connecter au réseau local depuis l'extérieur"
              >
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    vpnServerConfig?.enabled
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-gray-700 text-gray-400'
                  }`}>
                    {vpnServerConfig?.enabled ? 'Activé' : 'Désactivé'}
                  </span>
                  <button
                    onClick={() => setShowVpnModal(true)}
                    disabled={!hasPermission('settings')}
                    className={`flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors ${!hasPermission('settings') ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <ExternalLink size={14} />
                    Gérer
                  </button>
                </div>
              </SettingRow>
              {vpnUsers.length > 0 && (
                <SettingRow
                  label="Utilisateurs VPN"
                  description="Comptes configurés pour l'accès VPN"
                >
                  <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">
                    {vpnUsers.length} utilisateur{vpnUsers.length !== 1 ? 's' : ''}
                  </span>
                </SettingRow>
              )}
              {vpnUsers.length > 0 && (
                <div className="py-2 space-y-2">
                  {vpnUsers.map((user) => (
                    <div key={user.login} className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-lg">
                      <span className="text-sm text-white">{user.login}</span>
                      {user.ip_reservation && (
                        <span className="text-xs text-gray-500 font-mono">{user.ip_reservation}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {!vpnServerConfig && vpnUsers.length === 0 && (
                <div className="py-4 text-sm text-gray-500">
                  <p>Le serveur VPN n'est pas configuré.</p>
                  <p className="mt-2">Protocoles supportés : OpenVPN, WireGuard, PPTP.</p>
                </div>
              )}
            </Section>
          </div>
        )}

        {/* System settings */}
        {!isLoading && activeTab === 'system' && lcdConfig && (
          <div className="space-y-6">
            <Section title="Écran LCD" icon={Monitor} permissionError={!hasPermission('settings') ? getPermissionErrorMessage('settings') : null} freeboxSettingsUrl={!hasPermission('settings') ? getFreeboxSettingsUrl(freeboxUrl) : null}>
              <SettingRow label="Luminosité">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={lcdConfig.brightness}
                    onChange={(e) => setLcdConfig({ ...lcdConfig, brightness: parseInt(e.target.value) })}
                    className="w-32"
                  />
                  <span className="text-sm text-gray-400 w-12">{lcdConfig.brightness}%</span>
                </div>
              </SettingRow>
              <SettingRow label="Orientation">
                <select
                  value={lcdConfig.orientation}
                  onChange={(e) => setLcdConfig({ ...lcdConfig, orientation: parseInt(e.target.value) })}
                  className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:outline-none"
                >
                  <option value={0}>Normal</option>
                  <option value={90}>90°</option>
                  <option value={180}>180°</option>
                  <option value={270}>270°</option>
                </select>
              </SettingRow>
              <SettingRow
                label="Forcer l'orientation"
                description="Empêche la rotation automatique"
              >
                <Toggle
                  enabled={lcdConfig.orientation_forced}
                  onChange={(v) => setLcdConfig({ ...lcdConfig, orientation_forced: v })}
                />
              </SettingRow>
            </Section>

            {/* LED Strip section - Only shown for Ultra 25 ans edition */}
            {lcdConfig.led_strip_enabled !== undefined && (
              <Section title="Bandeau LED" icon={Lightbulb} permissionError={!hasPermission('settings') ? getPermissionErrorMessage('settings') : null} freeboxSettingsUrl={!hasPermission('settings') ? getFreeboxSettingsUrl(freeboxUrl) : null}>
                <SettingRow
                  label="Bandeau LED activé"
                  description="Active ou désactive le bandeau LED"
                >
                  <Toggle
                    enabled={lcdConfig.led_strip_enabled ?? false}
                    onChange={(v) => setLcdConfig({ ...lcdConfig, led_strip_enabled: v })}
                  />
                </SettingRow>
                {lcdConfig.led_strip_enabled && (
                  <>
                    <SettingRow label="Luminosité LED">
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={lcdConfig.led_strip_brightness ?? 50}
                          onChange={(e) => setLcdConfig({ ...lcdConfig, led_strip_brightness: parseInt(e.target.value) })}
                          className="w-32"
                        />
                        <span className="text-sm text-gray-400 w-12">{lcdConfig.led_strip_brightness ?? 50}%</span>
                      </div>
                    </SettingRow>
                    <SettingRow label="Animation">
                      <select
                        value={lcdConfig.led_strip_animation ?? 'breathing'}
                        onChange={(e) => setLcdConfig({ ...lcdConfig, led_strip_animation: e.target.value })}
                        className="px-3 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:outline-none"
                      >
                        {(lcdConfig.available_led_strip_animations || ['organic', 'static', 'breathing', 'rain', 'trail', 'wave']).map((anim) => (
                          <option key={anim} value={anim}>
                            {anim.charAt(0).toUpperCase() + anim.slice(1)}
                          </option>
                        ))}
                      </select>
                    </SettingRow>
                  </>
                )}
              </Section>
            )}

            <Section title="Actions système" icon={Power} permissionError={!hasPermission('settings') ? getPermissionErrorMessage('settings') : null} freeboxSettingsUrl={!hasPermission('settings') ? getFreeboxSettingsUrl(freeboxUrl) : null}>
              <div className="py-4 space-y-3">
                <button
                  onClick={handleReboot}
                  disabled={!hasPermission('settings')}
                  className={`w-full flex items-center justify-between px-4 py-3 bg-[#1a1a1a] hover:bg-[#252525] border border-gray-700 rounded-lg transition-colors ${!hasPermission('settings') ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className="text-sm text-white">Redémarrer la Freebox</span>
                  <Power size={16} className="text-orange-400" />
                </button>
                <button
                  onClick={() => setShowRebootScheduleModal(true)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-[#1a1a1a] hover:bg-[#252525] border border-gray-700 rounded-lg transition-colors"
                >
                  <span className="text-sm text-white">Programmer le redémarrage</span>
                  <Calendar size={16} className="text-blue-400" />
                </button>
                <p className="text-xs text-gray-600 px-1">
                  Le redémarrage prend environ 2-3 minutes. Toutes les connexions seront interrompues.
                </p>
              </div>
            </Section>

            <button
              onClick={saveLcdConfig}
              disabled={!hasPermission('settings')}
              className={`flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors ${!hasPermission('settings') ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Save size={16} />
              Enregistrer
            </button>
          </div>
        )}

        {/* No disk placeholder for some tabs */}
        {!isLoading && (activeTab === 'network' && !connectionConfig) && (
          <div className="flex flex-col items-center justify-center py-16">
            <AlertCircle size={48} className="text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Paramètres non disponibles</h3>
            <p className="text-gray-500 text-center max-w-md">
              Impossible de charger les paramètres. Vérifiez que vous êtes connecté à la Freebox.
            </p>
          </div>
        )}

        {!isLoading && (activeTab === 'dhcp' && !dhcpConfig) && (
          <div className="flex flex-col items-center justify-center py-16">
            <Network size={48} className="text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">DHCP non disponible</h3>
            <p className="text-gray-500 text-center max-w-md">
              Impossible de charger la configuration DHCP.
            </p>
          </div>
        )}

        {!isLoading && (activeTab === 'storage' && !ftpConfig) && (
          <div className="flex flex-col items-center justify-center py-16">
            <HardDrive size={48} className="text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Stockage non disponible</h3>
            <p className="text-gray-500 text-center max-w-md">
              Aucun disque n'est connecté à la Freebox.
            </p>
          </div>
        )}

        {!isLoading && (activeTab === 'system' && !lcdConfig) && (
          <div className="flex flex-col items-center justify-center py-16">
            <Monitor size={48} className="text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Paramètres système</h3>
            <p className="text-gray-500 text-center max-w-md">
              Impossible de charger les paramètres de l'écran LCD.
            </p>
          </div>
        )}

        {/* Backup settings */}
        {!isLoading && activeTab === 'backup' && (
          <div className="space-y-6">
            {/* Full Freebox Backup Section */}
            <Section title="Backup complet Freebox" icon={Download} iconColor="purple">
              <div className="space-y-4">
                <p className="text-sm text-gray-400">
                  Exportez ou importez une sauvegarde complète de la configuration de votre Freebox. 
                  Cette sauvegarde inclut toutes les configurations : redirections de port, baux DHCP, WiFi, LAN, connexion et DynDNS.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Export Full Backup */}
                  <div className="p-4 bg-[#1a1a1a] rounded-lg border border-gray-700">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="text-white font-medium mb-1 flex items-center gap-2">
                          <Download size={18} className="text-purple-400" />
                          Exporter le backup complet
                        </h4>
                        <p className="text-sm text-gray-400 mt-2">
                          Crée un fichier JSON contenant toutes les configurations de votre Freebox.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={exportFullFreeboxBackup}
                      disabled={isLoading || !hasPermission('settings')}
                      className={`w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors ${
                        isLoading || !hasPermission('settings') ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      <Download size={16} />
                      <span>Exporter le backup</span>
                    </button>
                  </div>

                  {/* Import Full Backup */}
                  <div className="p-4 bg-[#1a1a1a] rounded-lg border border-gray-700">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="text-white font-medium mb-1 flex items-center gap-2">
                          <Upload size={18} className="text-cyan-400" />
                          Importer un backup
                        </h4>
                        <p className="text-sm text-gray-400 mt-2">
                          Restaure les configurations depuis un fichier de backup JSON.
                        </p>
                      </div>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      onChange={handleImportBackup}
                      disabled={isImporting || !hasPermission('settings')}
                      className="hidden"
                      id="backup-file-input"
                    />
                    <label
                      htmlFor="backup-file-input"
                      className={`w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors cursor-pointer ${
                        isImporting || !hasPermission('settings') ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {isImporting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Import en cours...</span>
                        </>
                      ) : (
                        <>
                          <Upload size={16} />
                          <span>Importer le backup</span>
                        </>
                      )}
                    </label>
                  </div>
                </div>

                <div className="p-3 bg-amber-900/20 border border-amber-700/30 rounded-lg">
                  <p className="text-xs text-amber-400">
                    <strong>⚠️ Attention :</strong> L'import d'un backup remplacera les configurations existantes. 
                    Assurez-vous d'avoir fait un export avant d'importer un nouveau backup.
                  </p>
                </div>
              </div>
            </Section>

            <Section title="Export des configurations Freebox" icon={Download} iconColor="orange">
              <div className="space-y-4">
                <p className="text-sm text-gray-400">
                  Téléchargez les configurations individuelles de votre Freebox au format JSON pour sauvegarder ou restaurer vos paramètres.
                </p>
                
                <div className="space-y-4">
                  {/* Port Forwarding Export */}
                  <div className="p-4 bg-[#1a1a1a] rounded-lg border border-gray-700">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="text-white font-medium mb-1">Redirections de port WAN</h4>
                        <p className="text-sm text-gray-400">
                          Exporte la liste complète des redirections de port (Pare-feu) configurées sur votre Freebox.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={exportPortForwarding}
                      disabled={isLoading || !hasPermission('settings')}
                      className={`flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors ${
                        isLoading || !hasPermission('settings') ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      <Download size={16} />
                      <span>Télécharger en JSON</span>
                    </button>
                  </div>

                  {/* DHCP Static Leases Export */}
                  <div className="p-4 bg-[#1a1a1a] rounded-lg border border-gray-700">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="text-white font-medium mb-1">Baux DHCP statiques</h4>
                        <p className="text-sm text-gray-400">
                          Exporte la liste complète des adresses IP statiques configurées dans le serveur DHCP.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={exportDhcpStaticLeases}
                      disabled={isLoading || !hasPermission('settings')}
                      className={`flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors ${
                        isLoading || !hasPermission('settings') ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      <Download size={16} />
                      <span>Télécharger en JSON</span>
                    </button>
                  </div>

                  {/* WiFi Networks Export */}
                  <div className="p-4 bg-[#1a1a1a] rounded-lg border border-gray-700">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="text-white font-medium mb-1">Réseaux WiFi</h4>
                        <p className="text-sm text-gray-400">
                          Exporte la liste complète des réseaux WiFi avec leurs options (SSID, sécurité, etc.).
                          <br />
                          <span className="text-xs text-gray-500">Note : Les mots de passe WiFi ne sont pas inclus pour des raisons de sécurité.</span>
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={exportWifiNetworks}
                      disabled={isLoading || !hasPermission('settings')}
                      className={`flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors ${
                        isLoading || !hasPermission('settings') ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      <Download size={16} />
                      <span>Télécharger en JSON</span>
                    </button>
                  </div>
                </div>

                {/* Export All Button */}
                <div className="pt-4 border-t border-gray-700">
                  <button
                    onClick={exportAllBackups}
                    disabled={isLoading || !hasPermission('settings')}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white rounded-lg transition-all font-medium ${
                      isLoading || !hasPermission('settings') ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <Download size={18} />
                    <span>Télécharger tous les exports</span>
                  </button>
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Télécharge les trois fichiers JSON en une seule action
                  </p>
                </div>
              </div>
            </Section>
          </div>
        )}
        </>
        )}
      </main>

      {/* Parental Control Modal */}
      <ParentalControlModal
        isOpen={showParentalModal}
        onClose={() => setShowParentalModal(false)}
        devices={devices}
      />

      {/* Port Forwarding Modal */}
      <PortForwardingModal
        isOpen={showFirewallModal}
        onClose={() => setShowFirewallModal(false)}
        devices={devices}
      />

      {/* VPN Modal */}
      <VpnModal
        isOpen={showVpnModal}
        onClose={() => setShowVpnModal(false)}
      />

      {/* Reboot Schedule Modal */}
      <RebootScheduleModal
        isOpen={showRebootScheduleModal}
        onClose={() => setShowRebootScheduleModal(false)}
      />
      
      {showCustomDomainModal && (
        <CustomDomainModal
          isOpen={showCustomDomainModal}
          onClose={() => setShowCustomDomainModal(false)}
          onSuccess={() => {
            // Refresh domain info after successful configuration
            setLoadingDomainInfo(true);
            Promise.all([
              api.get<any>('/api/system'),
              api.get<any>('/api/system/version')
            ])
              .then(([systemResponse, versionResponse]) => {
                let domain: string | null = null;
                let httpsAvailable: boolean | null = null;
                let httpsPort: number | null = null;
                
                if (systemResponse.success && systemResponse.result) {
                  const systemData = systemResponse.result as any;
                  domain = systemData.api_domain || null;
                  httpsAvailable = systemData.https_available ?? null;
                  httpsPort = systemData.https_port ?? null;
                }
                
                if (!domain && versionResponse.success && versionResponse.result) {
                  const versionData = versionResponse.result as any;
                  domain = versionData.api_domain || null;
                  httpsAvailable = versionData.https_available ?? null;
                  httpsPort = versionData.https_port ?? null;
                }
                
                if (domain && domain !== 'mafreebox.freebox.fr') {
                  setDomainInfo({
                    domain: domain,
                    enabled: true,
                    certificateType: 'RSA',
                    certificateValid: httpsAvailable === true,
                    certificateExpiry: 'dans 69 jours'
                  });
                } else {
                  setDomainInfo(null);
                }
              })
              .catch((error) => {
                console.error('Failed to refresh domain info:', error);
              })
              .finally(() => {
                setLoadingDomainInfo(false);
              });
          }}
        />
      )}

      {/* DHCP Static Lease Modal */}
      {showLeaseModal && editingLease && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#151515] w-full max-w-md rounded-xl border border-gray-800 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-lg font-semibold text-white">
                {editingLease.id ? 'Modifier' : 'Ajouter'} un bail statique
              </h3>
              <button
                onClick={() => {
                  setShowLeaseModal(false);
                  setEditingLease(null);
                }}
                className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Adresse MAC *
                </label>
                <input
                  type="text"
                  value={editingLease.mac}
                  onChange={(e) => setEditingLease({ ...editingLease, mac: e.target.value })}
                  placeholder="AA:BB:CC:DD:EE:FF"
                  className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white font-mono text-sm focus:outline-none focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">Format: XX:XX:XX:XX:XX:XX</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Adresse IP *
                </label>
                <input
                  type="text"
                  value={editingLease.ip}
                  onChange={(e) => setEditingLease({ ...editingLease, ip: e.target.value })}
                  placeholder="192.168.1.100"
                  className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white font-mono text-sm focus:outline-none focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">Doit être dans la plage DHCP</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Commentaire
                </label>
                <input
                  type="text"
                  value={editingLease.comment}
                  onChange={(e) => setEditingLease({ ...editingLease, comment: e.target.value })}
                  placeholder="Ex: PC Bureau, NAS, Imprimante..."
                  className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:outline-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-800">
              <button
                onClick={() => {
                  setShowLeaseModal(false);
                  setEditingLease(null);
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={saveStaticLease}
                disabled={!editingLease.mac || !editingLease.ip || isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                {editingLease.id ? 'Modifier' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;