import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Settings,
  Wifi,
  Network,
  HardDrive,
  Shield,
  Server,
  Monitor,
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
  Sparkles
} from 'lucide-react';
import { api } from '../api/client';
import { API_ROUTES } from '../utils/constants';
import { ParentalControlModal } from '../components/modals/ParentalControlModal';
import { PortForwardingModal } from '../components/modals/PortForwardingModal';
import { VpnModal } from '../components/modals/VpnModal';
import { RebootScheduleModal } from '../components/modals/RebootScheduleModal';
import { useLanStore } from '../stores/lanStore';
import { useAuthStore } from '../stores/authStore';
import { useSystemStore } from '../stores/systemStore';
import { getPermissionErrorMessage, getPermissionShortError, getFreeboxSettingsUrl } from '../utils/permissions';
import { useUserAuthStore, type User } from '../stores/userAuthStore';
import { ExporterSection } from '../components/ExporterSection';
import { PluginsManagementSection } from '../components/PluginsManagementSection';
import { LogsManagementSection } from '../components/LogsManagementSection';
import logoMynetworK from '../icons/logo_mynetwork.svg';
import { APP_VERSION, getVersionString } from '../constants/version';
import { SecuritySection } from '../components/SecuritySection';
import { ThemeSection } from '../components/ThemeSection';
import { useUpdateStore } from '../stores/updateStore';

interface SettingsPageProps {
  onBack: () => void;
  mode?: 'freebox' | 'administration';
  initialAdminTab?: 'general' | 'users' | 'plugins' | 'logs' | 'security' | 'exporter' | 'theme' | 'debug' | 'info';
  onNavigateToPage?: (page: 'plugins' | 'users' | 'logs') => void;
}

type SettingsTab = 'network' | 'wifi' | 'dhcp' | 'storage' | 'security' | 'system';
type AdminTab = 'general' | 'plugins' | 'logs' | 'security' | 'exporter' | 'theme' | 'debug' | 'info';

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

// App Logs Section Component (for Administration > Debug tab)
const AppLogsSection: React.FC = () => {
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
    if (!confirm('Voulez-vous vraiment nettoyer la mémoire ?\n\nCela supprimera tous les logs du buffer en mémoire (max 1000 logs). Cette action est irréversible.')) return;
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
    return date.toLocaleTimeString('fr-FR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
            title="Afficher tous les logs (tous niveaux confondus)"
          >
            Tous
          </button>
          <button
            onClick={() => setFilter('error')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filter === 'error'
                ? 'bg-red-600 text-white border-2 border-red-400'
                : 'bg-[#1a1a1a] text-red-400 border border-red-800/50 hover:bg-red-900/20 hover:text-red-300'
            }`}
            title="Afficher uniquement les logs d'erreur (niveau error)"
          >
            Erreurs
          </button>
          <button
            onClick={() => setFilter('warn')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filter === 'warn'
                ? 'bg-yellow-600 text-white border-2 border-yellow-400'
                : 'bg-[#1a1a1a] text-yellow-400 border border-yellow-800/50 hover:bg-yellow-900/20 hover:text-yellow-300'
            }`}
            title="Afficher uniquement les logs d'avertissement (niveau warn)"
          >
            Avertissements
          </button>
          <button
            onClick={() => setFilter('info')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filter === 'info'
                ? 'bg-cyan-600 text-white border-2 border-cyan-400'
                : 'bg-[#1a1a1a] text-cyan-400 border border-cyan-800/50 hover:bg-cyan-900/20 hover:text-cyan-300'
            }`}
            title="Afficher uniquement les logs informatifs (niveau info)"
          >
            Infos
          </button>
          <button
            onClick={() => setFilter('debug')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filter === 'debug'
                ? 'bg-blue-600 text-white border-2 border-blue-400'
                : 'bg-[#1a1a1a] text-blue-400 border border-blue-800/50 hover:bg-blue-900/20 hover:text-blue-300'
            }`}
            title="Afficher uniquement les logs de débogage (niveau debug)"
          >
            Debug
          </button>
          <button
            onClick={() => setFilter('verbose')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filter === 'verbose'
                ? 'bg-purple-600 text-white border-2 border-purple-400'
                : 'bg-[#1a1a1a] text-purple-400 border border-purple-800/50 hover:bg-purple-900/20 hover:text-purple-300'
            }`}
            title="Afficher uniquement les logs verbeux (niveau verbose)"
          >
            Verbose
          </button>
          <span 
            className="text-xs text-gray-500 ml-2"
            title={`${filteredLogs.length} log${filteredLogs.length !== 1 ? 's' : ''} affiché${filteredLogs.length !== 1 ? 's' : ''}${totalLogs > filteredLogs.length ? ` sur ${totalLogs} au total` : ''}`}
          >
            {filteredLogs.length} log{filteredLogs.length !== 1 ? 's' : ''}
            {totalLogs > filteredLogs.length && ` / ${totalLogs} total`}
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
                ? 'Afficher les 500 derniers logs' 
                : `Afficher tous les logs (${totalLogs} au total)`
            }
          >
            <FileText size={14} />
            <span>{showAllLogs ? '500 derniers' : 'Voir tout'}</span>
          </button>
          <button
            onClick={loadLogs}
            disabled={isLoading}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
            title="Rafraîchir manuellement la liste des logs"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={clearLogs}
            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
            title="Nettoyer la mémoire : supprime tous les logs du buffer en mémoire (max 1000 logs). Utile pour libérer la mémoire après un débogage."
          >
            <Sparkles size={14} />
            <span>Nettoyer</span>
          </button>
        </div>
      </div>

      {showAllLogs && filteredLogs.length > 1000 && (
        <div className="mb-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-400 text-sm">
            <AlertCircle size={16} />
            <span>
              <strong>Attention :</strong> Affichage de {filteredLogs.length.toLocaleString()} logs. 
              Cela peut affecter les performances du navigateur.
            </span>
          </div>
        </div>
      )}
      <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg overflow-hidden mt-2">
        <div ref={logsContainerRef} className="h-96 overflow-y-auto p-4 font-mono text-xs">
          {filteredLogs.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <FileText size={32} className="mx-auto mb-2 opacity-50" />
              <p>Aucun log disponible</p>
              <p className="text-xs text-gray-400 mt-2">Utilisez le bouton "Rafraîchir" pour charger les logs</p>
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
        <p className="text-sm">Chargement...</p>
      </div>
    );
  }

  return (
    <>
      <SettingRow
        label="Logs de debug"
        description="Active l'affichage des logs de debug dans la console du serveur (informations détaillées sur les opérations)"
      >
        <Toggle
          enabled={debugConfig.debug}
          onChange={(enabled) => handleToggle('debug', enabled)}
          disabled={isSaving}
        />
      </SettingRow>
      <SettingRow
        label="Logs verbeux"
        description="Active l'affichage des logs très détaillés (verbose) - nécessite que le mode debug soit activé"
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
            Les logs de debug sont désactivés. Activez-les pour voir les détails des opérations dans les logs du serveur.
          </p>
        </div>
      )}
      {debugConfig.debug && (
        <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <p className="text-xs text-amber-400">
            Les logs de debug sont activés. Les logs du serveur afficheront plus d'informations détaillées.
          </p>
        </div>
      )}
    </>
  );
};

// Update Check Section Component (for Administration > General tab)
const UpdateCheckSection: React.FC = () => {
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
        label="Vérification automatique des mises à jour"
        description="Active la vérification des nouvelles versions disponibles sur GitHub Container Registry"
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
              <span className="text-sm text-gray-400">Version actuelle</span>
              <span className="text-sm font-mono text-white">{updateInfo?.currentVersion || '0.0.0'}</span>
            </div>
            {updateInfo?.latestVersion && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Dernière version disponible</span>
                <span className="text-sm font-mono text-amber-400">{updateInfo.latestVersion}</span>
              </div>
            )}
            {updateInfo?.updateAvailable && (
              <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-xs text-amber-400 font-semibold mb-1">Nouvelle version disponible !</p>
                <p className="text-xs text-gray-400">
                  Une mise à jour est disponible. Pour mettre à jour, utilisez :
                </p>
                <code className="block mt-2 text-xs text-cyan-300 bg-[#0a0a0a] p-2 rounded border border-gray-800">
                  docker-compose pull && docker-compose up -d
                </code>
              </div>
            )}
            {updateInfo?.error && (
              <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-xs text-red-400">Erreur lors de la vérification : {updateInfo.error}</p>
              </div>
            )}
            <div className="mt-3 p-3 bg-gray-500/10 border border-gray-500/30 rounded-lg">
              <p className="text-xs text-gray-400">
                La vérification manuelle des mises à jour est temporairement désactivée.
              </p>
            </div>
            <button
              onClick={() => {}}
              disabled={true}
              className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-gray-600 text-gray-400 text-sm rounded-lg transition-colors opacity-50 cursor-not-allowed"
            >
              <RefreshCw size={14} />
              Vérifier maintenant
            </button>
          </div>
        </>
      )}
    </>
  );
};

// General Network Configuration Section Component (for Administration > General tab)
const GeneralNetworkSection: React.FC = () => {
  const [publicUrl, setPublicUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await api.get<{ publicUrl: string }>('/api/system/general');
        if (response.success && response.result) {
          setPublicUrl(response.result.publicUrl || '');
        }
      } catch (error) {
        console.error('Failed to fetch general settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const response = await api.put<{ publicUrl: string; message?: string }>('/api/system/general', {
        publicUrl: publicUrl.trim() || ''
      });
      if (response.success) {
        setMessage({ type: 'success', text: response.result?.message || 'Configuration sauvegardée avec succès' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: error?.response?.data?.error?.message || 'Erreur lors de la sauvegarde' 
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
      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.type === 'success' 
            ? 'bg-green-900/30 border border-green-700 text-green-400' 
            : 'bg-red-900/30 border border-red-700 text-red-400'
        }`}>
          {message.text}
        </div>
      )}
      
      <SettingRow
        label="URL publique (Domaine)"
        description="URL publique d'accès au dashboard (ex: https://mwk.myoueb.fr). Utilisée pour les headers et WebSocket en production avec nginx."
      >
        <div className="flex items-center gap-2 w-full max-w-md">
          <input
            type="url"
            value={publicUrl}
            onChange={(e) => setPublicUrl(e.target.value)}
            placeholder="https://mwk.myoueb.fr"
            className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                <span>Sauvegarde...</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>Sauvegarder</span>
              </>
            )}
          </button>
        </div>
      </SettingRow>
      
      <div className="text-xs text-gray-500 mt-2 p-3 bg-[#1a1a1a] rounded-lg border border-gray-800">
        <p className="font-medium text-gray-400 mb-1">💡 Note importante :</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Cette URL est utilisée pour construire les URLs WebSocket et les headers</li>
          <li>Format attendu : <code className="text-blue-400">https://votre-domaine.com</code> ou <code className="text-blue-400">http://votre-domaine.com</code></li>
          <li>Assurez-vous que nginx est configuré pour gérer les WebSockets (voir <code className="text-blue-400">Docs/NGINX_WEBSOCKET_CONFIG.md</code>)</li>
          <li>Laissez vide pour utiliser l'IP locale ou les valeurs par défaut</li>
        </ul>
      </div>
    </div>
  );
};

// User Profile Section Component (for Administration > General tab)
const UserProfileSection: React.FC = () => {
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
      setEmailError('Format d\'email invalide');
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
        setError('Vous devez être connecté pour modifier votre profil');
        setIsSaving(false);
        return;
      }

      // Validate username
      if (!username || username.trim().length === 0) {
        setError('Le nom d\'utilisateur ne peut pas être vide');
        setIsSaving(false);
        return;
      }

      if (username.length < 3) {
        setError('Le nom d\'utilisateur doit contenir au moins 3 caractères');
        setIsSaving(false);
        return;
      }

      // Validate email format BEFORE making any API call
      // If email is provided and different from current, it must be valid
      if (email !== currentUser?.email) {
        if (!email || email.trim().length === 0) {
          setEmailError('L\'email ne peut pas être vide');
          setError('Veuillez corriger les erreurs avant de sauvegarder');
          setIsSaving(false);
          return;
        }
        if (!validateEmail(email)) {
          setEmailError('Format d\'email invalide');
          setError('Veuillez corriger les erreurs avant de sauvegarder');
          setIsSaving(false);
          return;
        }
      }

      // Validate password if changing
      if (showPasswordFields && newPassword) {
        if (newPassword.length < 8) {
          setError('Le mot de passe doit contenir au moins 8 caractères');
          setIsSaving(false);
          return;
        }
        if (newPassword !== confirmPassword) {
          setError('Les mots de passe ne correspondent pas');
          setIsSaving(false);
          return;
        }
        if (!oldPassword) {
          setError('Veuillez entrer votre mot de passe actuel');
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
        setError('Aucune modification à sauvegarder');
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
        setSuccessMessage('Profil mis à jour avec succès');
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
        const errorMsg = response.error?.message || 'Échec de la mise à jour';
        setError(errorMsg);
        console.error('[UserProfile] Update failed:', response.error);
      }
    } catch (err) {
      // Enhanced error handling
      console.error('[UserProfile] Exception during save:', err);
      if (err instanceof Error) {
        if (err.message.includes('fetch') || err.message.includes('network')) {
          setError('Impossible de contacter le serveur. Vérifiez que le serveur backend est démarré.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Erreur lors de la mise à jour du profil');
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
        label="Avatar"
        description="Changer votre photo de profil"
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
                Choisir une image
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
                      reader.onerror = () => reject(new Error('Erreur lors de la lecture du fichier'));
                      reader.onloadend = () => {
                        if (reader.result && typeof reader.result === 'string') {
                          resolve(reader.result);
                        } else {
                          reject(new Error('Impossible de convertir le fichier en base64'));
                        }
                      };
                      reader.readAsDataURL(avatarFile);
                    });
                    
                    // Check if base64 string is too large (should not happen with 5MB limit, but double-check)
                    if (base64String.length > 10 * 1024 * 1024) { // ~10MB base64
                      setError('L\'image est trop volumineuse après conversion');
                      setIsUploadingAvatar(false);
                      return;
                    }
                    
                    // Upload to server
                    const response = await api.put(`/api/users/${currentUser.id}`, {
                      avatar: base64String
                    });
                    
                    if (response.success) {
                      setSuccessMessage('Avatar mis à jour avec succès');
                      setAvatarFile(null);
                      // Keep preview to show new avatar
                      await checkAuth();
                    } else {
                      // Handle API error
                      const errorMessage = response.error?.message || 'Échec de la mise à jour de l\'avatar';
                      setError(errorMessage);
                    }
                  } catch (err) {
                    // Handle conversion or network errors
                    if (err instanceof Error) {
                      if (err.message.includes('Network') || err.message.includes('fetch')) {
                        setError('Impossible de contacter le serveur. Vérifiez votre connexion réseau.');
                      } else {
                        setError(err.message);
                      }
                    } else {
                      setError('Erreur lors de la mise à jour de l\'avatar');
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
                    <span>Enregistrement...</span>
                  </>
                ) : (
                  <span>Enregistrer l'avatar</span>
                )}
              </button>
            )}
          </div>
        </div>
      </SettingRow>

      <SettingRow
        label="Nom d'utilisateur"
        description="Votre nom d'utilisateur (minimum 3 caractères)"
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
            placeholder="Nom d'utilisateur"
          />
        </div>
      </SettingRow>

      <SettingRow
        label="Email"
        description="Votre adresse email"
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
              placeholder="votre@email.com"
            />
          </div>
          {emailError && (
            <p className="text-xs text-red-400 ml-12">{emailError}</p>
          )}
        </div>
      </SettingRow>

      <SettingRow
        label="Mot de passe"
        description={showPasswordFields ? "Modifier votre mot de passe" : "Cliquez pour modifier votre mot de passe"}
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
              <span className="flex-1 text-left">Modifier le mot de passe</span>
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
                  placeholder="Mot de passe actuel"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowOldPassword(!showOldPassword)}
                  className="p-2 text-gray-400 hover:text-amber-400 transition-colors"
                  title={showOldPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
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
                  placeholder="Nouveau mot de passe (min. 8 caractères)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="p-2 text-gray-400 hover:text-emerald-400 transition-colors"
                  title={showNewPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
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
                  placeholder="Confirmer le nouveau mot de passe"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="p-2 text-gray-400 hover:text-emerald-400 transition-colors"
                  title={showConfirmPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
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
                  {isSaving ? 'Enregistrement...' : 'Enregistrer'}
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
                  Annuler
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
            {isSaving ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </button>
        </div>
      )}
    </>
  );
};

// Info Section Component (for Administration > Info tab)
const InfoSection: React.FC = () => {
  return (
    <div className="space-y-6">
      <Section title="Informations du projet" icon={Info} iconColor="teal">
        <div className="space-y-4">
          <div className="p-4 bg-theme-secondary rounded-lg border border-theme">
            <h3 className="text-lg font-semibold text-theme-primary mb-3">MynetworK</h3>
            <p className="text-sm text-theme-secondary mb-4">
              Dashboard multi-sources pour la gestion de votre réseau. Intégration avec Freebox, UniFi Controller et autres systèmes réseau.
            </p>
            
            <div className="space-y-1">
              <div className="flex items-center justify-start gap-2 py-2 border-b border-gray-700">
                <span className="text-sm text-gray-400">Version</span>
                <span className="text-sm font-mono text-theme-primary">{getVersionString()}</span>
                    
                <span className="text-sm text-gray-400">Licence</span>
                <span className="text-sm text-theme-primary">Privée</span>
              </div>
              </div>
              <br />
            <a
              href="https://github.com/Erreur32/MynetworK"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
            >
              <Github size={16} />
              <span>Voir sur GitHub</span>
              <ExternalLink size={14} />
            </a>
          </div>

          <div className="p-4 bg-theme-secondary rounded-lg border border-theme">
            <h3 className="text-lg font-semibold text-theme-primary mb-3">Auteur</h3>
            <div className="space-y-2">
              <p className="text-sm text-theme-secondary">
                Développé par <span className="text-theme-primary font-medium">Erreur32</span>
              </p>
            </div>
          </div>

          <div className="p-4 bg-theme-secondary rounded-lg border border-theme">
            <h3 className="text-lg font-semibold text-theme-primary mb-3">Technologies</h3>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 bg-blue-900/30 border border-blue-700 rounded text-xs text-blue-400">React</span>
              <span className="px-3 py-1 bg-blue-900/30 border border-blue-700 rounded text-xs text-blue-400">TypeScript</span>
              <span className="px-3 py-1 bg-green-900/30 border border-green-700 rounded text-xs text-green-400">Node.js</span>
              <span className="px-3 py-1 bg-cyan-900/30 border border-cyan-700 rounded text-xs text-cyan-400">Express</span>
              <span className="px-3 py-1 bg-purple-900/30 border border-purple-700 rounded text-xs text-purple-400">SQLite</span>
              <span className="px-3 py-1 bg-yellow-900/30 border border-yellow-700 rounded text-xs text-yellow-400">Docker</span>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
};

// Users Management Section Component (for Administration tab)
const UsersManagementSection: React.FC = () => {
  const { user: currentUser } = useUserAuthStore();
  const [users, setUsers] = useState<User[]>([]);
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
        const errorMsg = response.error?.message || 'Échec du chargement des utilisateurs';
        setError(errorMsg);
      }
    } catch (err: any) {
      // Handle network/socket errors
      let errorMessage = 'Échec du chargement des utilisateurs';
      
      if (err.message) {
        if (err.message.includes('socket') || err.message.includes('ended') || err.message.includes('ECONNRESET')) {
          errorMessage = 'Connexion interrompue. Veuillez réessayer.';
        } else if (err.message.includes('timeout') || err.message.includes('TIMEOUT')) {
          errorMessage = 'La requête a expiré. Veuillez réessayer.';
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
    if (!confirm(`Voulez-vous vraiment supprimer cet utilisateur ?`)) {
      return;
    }

    try {
      const response = await api.delete(`/api/users/${userId}`);
      if (response.success) {
        await fetchUsers();
      } else {
        const errorMsg = response.error?.message || 'Échec de la suppression';
        alert(errorMsg);
      }
    } catch (err: any) {
      // Handle network/socket errors
      let errorMessage = 'Échec de la suppression';
      
      if (err.message) {
        if (err.message.includes('socket') || err.message.includes('ended') || err.message.includes('ECONNRESET')) {
          errorMessage = 'Connexion interrompue. Veuillez réessayer.';
        } else if (err.message.includes('timeout') || err.message.includes('TIMEOUT')) {
          errorMessage = 'La requête a expiré. Veuillez réessayer.';
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
          <p>Chargement des utilisateurs...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users size={32} className="mx-auto mb-2" />
              <p>Aucun utilisateur trouvé</p>
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
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-theme-secondary truncate">{user.email}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-theme-tertiary">
                      <span>Créé le {new Date(user.createdAt).toLocaleDateString('fr-FR')}</span>
                      {user.lastLogin && (
                        <>
                          <span className="text-gray-600">•</span>
                          <span>Dernière connexion: {new Date(user.lastLogin).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })} {new Date(user.lastLogin).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </>
                      )}
                      {user.lastLoginIp && (
                        <>
                          <span className="text-gray-600">•</span>
                          <span className="font-mono text-gray-400">IP: {user.lastLoginIp}</span>
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
                        title="Supprimer"
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
  onNavigateToPage
}) => {
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

  // Get devices from LAN store for parental control
  const { devices } = useLanStore();
  const { reboot } = useSystemStore();

  // Get permissions and freebox URL from auth store
  const { permissions, freeboxUrl } = useAuthStore();

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
    { id: 'system', label: 'Système', icon: Server, color: 'purple' }
  ];

  // Update time every minute
  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date());
    updateTime(); // Set initial time
    const interval = setInterval(updateTime, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const adminTabs: { id: AdminTab; label: string; icon: React.ElementType; color: string }[] = [
    { id: 'general', label: 'Général', icon: Settings, color: 'blue' },
    { id: 'plugins', label: 'Plugins', icon: Plug, color: 'emerald' },
    { id: 'logs', label: 'Logs', icon: FileText, color: 'cyan' },
    { id: 'security', label: 'Sécurité', icon: Shield, color: 'red' },
    { id: 'exporter', label: 'Exporter', icon: Share2, color: 'amber' },
    { id: 'theme', label: 'Thème', icon: Lightbulb, color: 'yellow' },
    { id: 'debug', label: 'Debug', icon: Monitor, color: 'violet' },
    { id: 'info', label: 'Info', icon: Info, color: 'teal' }
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
                    {mode === 'administration' ? 'Administration' : 'Paramètres'}
                  </h1>
                  <p className="text-sm text-theme-secondary">
                    {mode === 'administration' ? 'Gestion de l\'application' : 'Configuration de la Freebox'}
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
              </div>
            ) : (
              <button
                onClick={fetchSettings}
                className="p-2 hover:bg-theme-tertiary rounded-lg transition-colors"
                title="Actualiser"
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
                  <Section title="Mon Profil" icon={Users} iconColor="blue">
                    <UserProfileSection />
                  </Section>
                  
                  {/* Gestion des utilisateurs (Admin only) */}
                  {currentUser?.role === 'admin' && (
                    <Section title="Gestion des utilisateurs" icon={Users} iconColor="purple">
                      <UsersManagementSection />
                    </Section>
                  )}
                </div>

                {/* Colonne 2 */}
                <div className="space-y-6">
                  <Section title="Configuration réseau" icon={Network} iconColor="blue">
                    <GeneralNetworkSection />
                  </Section>

                  <Section title="Localisation" icon={Globe} iconColor="cyan">
                    <SettingRow
                      label="Fuseau horaire"
                      description="Définit le fuseau horaire de l'application"
                    >
                      <select className="px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm">
                        <option value="Europe/Paris">Europe/Paris (UTC+1)</option>
                        <option value="UTC">UTC (UTC+0)</option>
                        <option value="America/New_York">America/New_York (UTC-5)</option>
                      </select>
                    </SettingRow>
                  </Section>

                  <Section title="Langue" icon={Globe} iconColor="cyan">
                    <SettingRow
                      label="Langue de l'interface"
                      description="Sélectionnez la langue d'affichage"
                    >
                      <select className="px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm">
                        <option value="fr">Français</option>
                        <option value="en">English</option>
                      </select>
                    </SettingRow>
                  </Section>
                </div>

                {/* Colonne 3 */}
                <div className="space-y-6">
                  <Section title="Mises à jour" icon={RefreshCw} iconColor="amber">
                    <UpdateCheckSection />
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

            {activeAdminTab === 'info' && (
              <InfoSection />
            )}

            {activeAdminTab === 'debug' && (
              <div className="space-y-6">

                <Section title="Logs de l'application" icon={FileText} iconColor="cyan">
                  <AppLogsSection />
                </Section>
                <Section title="Niveaux de Log" icon={Monitor} iconColor="violet">
                  <DebugLogSection />
                </Section>

                <Section title="Debug & Diagnostics" icon={Monitor} iconColor="violet">
                  <div className="py-4 space-y-2 text-xs text-gray-400">
                    <p>
                      Cette section regroupe des informations utiles pour le debug de MynetworK&nbsp;:
                      utilisation des logs, configuration externe et métriques techniques.
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>
                        <span className="text-gray-300 font-semibold">Logs applicatifs</span>&nbsp;: utilisables via l&apos;onglet&nbsp;
                        <span className="text-gray-100">Logs</span> (recherches, filtres, export).
                      </li>
                      <li>
                        <span className="text-gray-300 font-semibold">Configuration externe</span>&nbsp;:
                        fichier <code className="text-[11px] text-emerald-300">config/mynetwork.conf</code> si monté,
                        import/export via la section <span className="text-gray-100">Exporter</span>.
                      </li>
                      <li>
                        <span className="text-gray-300 font-semibold">Métriques Prometheus</span>&nbsp;:
                        endpoint <code className="text-[11px] text-sky-300">/api/metrics/prometheus</code> sur le backend.
                      </li>
                      <li>
                        <span className="text-gray-300 font-semibold">Métriques InfluxDB</span>&nbsp;:
                        endpoint <code className="text-[11px] text-sky-300">/api/metrics/influxdb</code> si activé.
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
        {!isLoading && activeTab === 'network' && connectionConfig && (
          <div className="space-y-6">
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

            <button
              onClick={saveConnectionConfig}
              disabled={!hasPermission('settings')}
              className={`flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors ${!hasPermission('settings') ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Save size={16} />
              Enregistrer
            </button>
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
              <div className="py-4 text-sm text-gray-500">
                <p>Le filtrage MAC permet de restreindre l'accès au WiFi à des appareils spécifiques.</p>
                <p className="mt-2">Mode liste blanche : seuls les appareils autorisés peuvent se connecter.</p>
                <p>Mode liste noire : les appareils listés sont bloqués.</p>
              </div>
            </Section>

            {wifiPlanning && (
              <button
                onClick={saveWifiPlanning}
                disabled={!hasPermission('settings')}
                className={`flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors ${!hasPermission('settings') ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Save size={16} />
                Enregistrer
              </button>
            )}
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