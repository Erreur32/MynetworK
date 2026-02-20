import React, { useEffect, useState, Suspense, lazy, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Header, Footer, type PageType } from './components/layout';
import {
  Card,
  BarChart,
  WifiPanel,
  VmPanel,
  DevicesList,
  FilePanel,
  UptimeGrid,
  SpeedtestWidget,
  HistoryLog,
  MultiSourceWidget,
  NetworkSummaryFreeboxWidget
} from './components/widgets';
import { ActionButton, UnsupportedFeature } from './components/ui';
import { LoginModal, UserLoginModal, TrafficHistoryModal, WifiSettingsModal, CreateVmModal } from './components/modals';
import AnimatedBackground from './components/AnimatedBackground';

// Lazy load pages for code splitting
// Use default exports when available, otherwise use named exports
const TvPage = lazy(() => import('./pages/TvPage'));
const PhonePage = lazy(() => import('./pages/PhonePage'));
const FilesPage = lazy(() => import('./pages/FilesPage'));
const VmsPage = lazy(() => import('./pages/VmsPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const PluginsPage = lazy(() => import('./pages/PluginsPage').then(m => ({ default: m.PluginsPage })));
const UsersPage = lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })));
const LogsPage = lazy(() => import('./pages/LogsPage').then(m => ({ default: m.LogsPage })));
const UnifiedDashboardPage = lazy(() => import('./pages/UnifiedDashboardPage').then(m => ({ default: m.UnifiedDashboardPage })));
const UniFiPage = lazy(() => import('./pages/UniFiPage').then(m => ({ default: m.UniFiPage })));
const SearchPage = lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })));
const NetworkScanPage = lazy(() => import('./pages/NetworkScanPage').then(m => ({ default: m.NetworkScanPage })));
import { usePolling } from './hooks/usePolling';
import { useConnectionWebSocket } from './hooks/useConnectionWebSocket';
import { useBackgroundAnimation } from './hooks/useBackgroundAnimation';
import { useAnimationParameters, AnimationParametersContext } from './hooks/useAnimationParameters';
import type { FullAnimationId } from './hooks/useBackgroundAnimation';
import { fetchEnvironmentInfo } from './constants/version';
import {
  useAuthStore,
  useUserAuthStore,
  useSystemStore,
  useConnectionStore,
  useWifiStore,
  useLanStore,
  useDownloadsStore,
  useVmStore,
  useHistoryStore
} from './stores';
import { usePluginStore } from './stores/pluginStore';
import { startPermissionsRefresh, stopPermissionsRefresh } from './stores/authStore';
import { useCapabilitiesStore } from './stores/capabilitiesStore';
import { useUpdateStore } from './stores/updateStore';
import { useFreeboxFirmwareStore } from './stores/freeboxFirmwareStore';
import { POLLING_INTERVALS, formatSpeed } from './utils/constants';
import { decodeHtmlEntities } from './utils/textUtils';
import {
  MoreHorizontal,
  Settings,
  Calendar,
  Sliders,
  Filter,
  Plus,
  Wifi as WifiIcon,
  HardDrive,
  Server,
  Download,
  History,
  Clock,
  ArrowDownWideNarrow,
  ChevronDown,
  ChevronUp,
  ExternalLink
} from 'lucide-react';

// Freebox firmware update banner (shown on Freebox page when update available)
const FreeboxFirmwareBanner: React.FC = () => {
  const { t } = useTranslation();
  const { isLoggedIn: isFreeboxLoggedIn } = useAuthStore();
  const firmwareInfo = useFreeboxFirmwareStore((s) => s.firmwareInfo);
  const [expanded, setExpanded] = useState(false);

  // Expanded by default when update available so description is visible
  useEffect(() => {
    setExpanded(true);
  }, [firmwareInfo?.lastCheck]);

  if (!isFreeboxLoggedIn || !firmwareInfo) return null;
  const serverUpdate = firmwareInfo.server?.updateAvailable;
  const playerUpdate = firmwareInfo.player?.updateAvailable;
  if (!serverUpdate && !playerUpdate) return null;

  const entries: Array<{ type: 'server' | 'player'; label: string; version: string; changelog: string; blogUrl: string }> = [];
  if (serverUpdate && firmwareInfo.server) {
    entries.push({
      type: 'server',
      label: t('freebox.firmwareUpdate.serverUpdate'),
      version: firmwareInfo.server.latestVersion,
      changelog: firmwareInfo.server.changelog,
      blogUrl: firmwareInfo.server.blogUrl
    });
  }
  if (playerUpdate && firmwareInfo.player) {
    entries.push({
      type: 'player',
      label: t('freebox.firmwareUpdate.playerUpdate'),
      version: firmwareInfo.player.latestVersion,
      changelog: firmwareInfo.player.changelog,
      blogUrl: firmwareInfo.player.blogUrl
    });
  }

  return (
    <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-medium text-amber-400">
          {t('freebox.firmwareUpdate.updateAvailable')}
          {entries.length === 1 && ` v${entries[0].version}`}
          {entries.length > 1 && ` (${entries.map((e) => `v${e.version}`).join(', ')})`}
        </span>
        {expanded ? <ChevronUp size={18} className="text-amber-400 flex-shrink-0" /> : <ChevronDown size={18} className="text-amber-400 flex-shrink-0" />}
      </button>
      {expanded && (
        <div className="mt-3 space-y-3 pt-3 border-t border-amber-500/20">
          {entries.map((entry) => (
            <div key={entry.type} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-amber-400">{entry.label} v{entry.version}</span>
                {entry.blogUrl && (
                  <a href={entry.blogUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-400 hover:underline flex items-center gap-1">
                    {t('freebox.firmwareUpdate.viewBlog')}
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
              {entry.changelog && (
                <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words font-sans max-h-48 overflow-y-auto bg-black/20 p-2 rounded">
                  {decodeHtmlEntities(entry.changelog)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Loading component for lazy-loaded pages (receives t from parent so it can be used outside hook scope in Suspense)
const PageLoader = ({ t }: { t: (key: string) => string }) => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
      <p className="text-gray-400 text-sm">{t('common.loading')}</p>
    </div>
  </div>
);

const App: React.FC = () => {
  const { t } = useTranslation();
  // User authentication (JWT) - New system
  const { isAuthenticated: isUserAuthenticated, isLoading: userAuthLoading, checkAuth: checkUserAuth, logout: userLogout, user } = useUserAuthStore();
  
  // Freebox authentication (existing system)
  const { isLoggedIn: isFreeboxLoggedIn, isLoading: freeboxAuthLoading, checkAuth: checkFreeboxAuth, logout: freeboxLogout } = useAuthStore();
  
  // Plugin store for multi-source dashboard
  const { plugins, pluginStats, fetchPlugins, fetchAllStats } = usePluginStore();
  
  // Combined auth state - user must be logged in, Freebox auth is optional
  const isLoggedIn = isUserAuthenticated;
  const authLoading = userAuthLoading || freeboxAuthLoading;

  // Data stores
  const { info: systemInfo, temperatureHistory: systemTempHistory, fetchSystemInfo, reboot } = useSystemStore();
  const { status: connectionStatus, history: networkHistory, extendedHistory, temperatureHistory, fetchConnectionStatus, fetchExtendedHistory, fetchTemperatureHistory } = useConnectionStore();
  const { networks: wifiNetworks, isLoading: wifiLoading, fetchWifiStatus, toggleBss } = useWifiStore();
  const { devices, fetchDevices } = useLanStore();
  const { tasks: downloads, fetchDownloads } = useDownloadsStore();
  const { vms, isLoading: vmLoading, error: vmError, fetchVms, startVm, stopVm } = useVmStore();
  const { logs: historyLogs, isLoading: historyLoading, fetchHistory } = useHistoryStore();

  // Capabilities store for model-specific features
  const { capabilities, supportsVm, hasLimitedVmSupport, getMaxVms } = useCapabilitiesStore();

  // Background animation (CSS or full-animation theme)
  const { variant: bgVariant, fullAnimationId, prefersReducedMotion, animationSpeed, theme } = useBackgroundAnimation();
  
  // Animation params: always use the user-selected animation id (fullAnimationId). When "All" is selected,
  // Settings must show the "All" transition rules (cycle duration, random, pause), not the currently displayed animation's params.
  const animationParameters = useAnimationParameters(fullAnimationId);

  // Local state
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard');
  const [isTrafficModalOpen, setIsTrafficModalOpen] = useState(false);
  const [isWifiModalOpen, setIsWifiModalOpen] = useState(false);
  const [isCreateVmModalOpen, setIsCreateVmModalOpen] = useState(false);
  const [wifiModalTab, setWifiModalTab] = useState<'filter' | 'planning' | 'wps'>('filter');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showAllDevices, setShowAllDevices] = useState(false);

  // Filters for files/downloads
  const [downloadFilter, setDownloadFilter] = useState<'all' | 'active' | 'done'>('all');
  const [downloadSort, setDownloadSort] = useState<'recent' | 'name' | 'progress'>('recent');

  // Navigation state for FilesPage
  const [filesPageInitialTab, setFilesPageInitialTab] = useState<'files' | 'downloads' | 'shares'>('files');
  const [filesPageInitialDownloadId, setFilesPageInitialDownloadId] = useState<string | undefined>(undefined);

  // Filters for history
  const [historyFilter, setHistoryFilter] = useState<'all' | 'connection' | 'calls' | 'notifications'>('all');
  const [historyPeriod, setHistoryPeriod] = useState<'30d' | '7d' | '24h'>('30d');

  // State for search query (used when on search page) - declared at component level
  const [headerSearchQuery, setHeaderSearchQuery] = useState<string>('');

  // Check user auth on mount and clean URL hash
  useEffect(() => {
    // Clean URL hash if present (legacy support)
    if (window.location.hash === '#admin') {
      window.history.replaceState(null, '', window.location.pathname);
      sessionStorage.setItem('adminMode', 'true');
    }
    
    // Check for search parameter 's' in URL and navigate to search page
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get('s');
    if (searchParam) {
      setCurrentPage('search');
      // Keep the URL parameter while on search page for bookmarking/sharing
    }
    
    checkUserAuth();
    
    // Listen for theme changes to force re-render
    const handleThemeChange = () => {
      // Force component re-render when theme changes by updating a dummy state
      setCurrentPage(prev => prev);
    };
    
    // Listen for URL changes (browser back/forward buttons or manual URL changes)
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const searchParam = urlParams.get('s');
      if (searchParam) {
        setCurrentPage('search');
      }
    };
    
    window.addEventListener('themechange', handleThemeChange);
    window.addEventListener('themeupdate', handleThemeChange);
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('themechange', handleThemeChange);
      window.removeEventListener('themeupdate', handleThemeChange);
      window.removeEventListener('popstate', handlePopState);
    };
    
    // Fetch environment info on mount
    fetchEnvironmentInfo();
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Load custom theme colors when user becomes authenticated
  useEffect(() => {
    if (isUserAuthenticated) {
      // Import and call initTheme to load custom colors from server
      import('./utils/themeManager').then(({ initTheme }) => {
        initTheme().catch(err => {
          // Silently fail - default theme colors will be used
          if (import.meta.env.DEV) {
            console.debug('[Theme] Failed to load custom colors after auth:', err);
          }
        });
      });
    }
  }, [isUserAuthenticated]);

  // Check Freebox auth only if Freebox plugin is enabled
  useEffect(() => {
    if (isUserAuthenticated) {
      const freeboxPlugin = plugins.find(p => p.id === 'freebox');
      if (freeboxPlugin?.enabled) {
        checkFreeboxAuth();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserAuthenticated, plugins]); // Zustand functions are stable

  // Update check store
  const { loadConfig, checkForUpdates } = useUpdateStore();
  const checkFirmware = useFreeboxFirmwareStore((s) => s.checkFirmware);

  // Fetch plugins and stats when authenticated
  useEffect(() => {
    if (isUserAuthenticated) {
      fetchPlugins();
      fetchAllStats();
      
      // Load update check config and check for updates if enabled
      loadConfig().then(() => {
        const { updateConfig } = useUpdateStore.getState();
        if (updateConfig?.enabled) {
          checkForUpdates();
        }
      });

      // Check Freebox firmware updates (backend caches blog scrape result)
      checkFirmware();
      
      // Refresh stats periodically
      const interval = setInterval(() => {
        fetchAllStats();
      }, 30000); // Every 30 seconds
      
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserAuthenticated]); // Zustand functions are stable, no need to include them

  // Start/stop periodic permissions refresh based on Freebox login state
  useEffect(() => {
    if (isFreeboxLoggedIn) {
      startPermissionsRefresh();
    } else {
      stopPermissionsRefresh();
    }
    return () => stopPermissionsRefresh();
  }, [isFreeboxLoggedIn]);

  // Initialize search query from sessionStorage when navigating to search page
  useEffect(() => {
    if (currentPage === 'search') {
      const query = sessionStorage.getItem('searchQuery') || '';
      if (query && !headerSearchQuery) {
        setHeaderSearchQuery(query);
        sessionStorage.removeItem('searchQuery');
      }
    }
  }, [currentPage, headerSearchQuery]);

  // WebSocket for real-time connection status (replaces polling)
  // Only enable if Freebox is logged in
  // Disable WebSocket in Docker dev mode to avoid connection issues
  // Fallback polling HTTP is already in place (see useEffect below)
  const isDockerDev = useMemo(() => {
    return import.meta.env.DEV && 
      window.location.hostname !== 'localhost' && 
      window.location.hostname !== '127.0.0.1' && 
      window.location.port === '3666';
  }, []); // Only calculate once, doesn't change during app lifetime
  useConnectionWebSocket({ enabled: isFreeboxLoggedIn && !isDockerDev });
  
  // Fallback: If WebSocket is not connected, fetch connection status manually
  // This ensures data is available even if WebSocket takes time to connect
  useEffect(() => {
    if (isFreeboxLoggedIn && isUserAuthenticated) {
      // Initial fetch to populate data immediately (don't wait for WebSocket)
      if (import.meta.env.DEV) {
        console.log('[App] Freebox logged in, fetching initial connection status...');
      }
      fetchConnectionStatus();
      
      // Also fetch periodically as fallback if WebSocket fails
      const fallbackInterval = setInterval(() => {
        fetchConnectionStatus();
      }, 1000); // Every 1 second as fallback (faster than before)
      
      return () => clearInterval(fallbackInterval);
    }
  }, [isFreeboxLoggedIn, isUserAuthenticated, fetchConnectionStatus]);

  // Polling only if user is authenticated AND Freebox is connected
  usePolling(fetchSystemInfo, {
    enabled: isUserAuthenticated && isFreeboxLoggedIn,
    interval: POLLING_INTERVALS.system
  });

  usePolling(fetchWifiStatus, {
    enabled: isUserAuthenticated && isFreeboxLoggedIn,
    interval: POLLING_INTERVALS.wifi
  });

  usePolling(fetchDevices, {
    enabled: isUserAuthenticated && isFreeboxLoggedIn,
    interval: POLLING_INTERVALS.devices
  });

  usePolling(fetchDownloads, {
    enabled: isUserAuthenticated && isFreeboxLoggedIn,
    interval: POLLING_INTERVALS.downloads
  });

  // Only poll VMs if the model supports them
  usePolling(fetchVms, {
    enabled: isUserAuthenticated && isFreeboxLoggedIn && supportsVm(),
    interval: POLLING_INTERVALS.vm
  });

  usePolling(fetchHistory, {
    enabled: isUserAuthenticated && isFreeboxLoggedIn,
    interval: 60000 // Refresh history every minute
  });

  // Current speed values
  const currentDownload = connectionStatus
    ? formatSpeed(connectionStatus.rate_down)
    : '-- kb/s';
  const currentUpload = connectionStatus
    ? formatSpeed(connectionStatus.rate_up)
    : '-- kb/s';

  // Filter devices based on selection
  const filteredDevices = devices.filter(d => {
    if (deviceFilter === 'active') return d.active;
    if (deviceFilter === 'inactive') return !d.active;
    return true;
  });

  // Limit devices shown unless "show all" is enabled
  const displayedDevices = showAllDevices ? filteredDevices : filteredDevices.slice(0, 10);

  // Check if disk is available (for VMs and Downloads)
  const hasDisk = systemInfo?.disk_status === 'active' || systemInfo?.user_main_storage;

  // Filter downloads based on selection
  const filteredDownloads = downloads.filter(d => {
    if (downloadFilter === 'active') return d.status === 'downloading' || d.status === 'seeding' || d.status === 'queued';
    if (downloadFilter === 'done') return d.status === 'done';
    return true;
  }).sort((a, b) => {
    if (downloadSort === 'name') return a.name.localeCompare(b.name);
    if (downloadSort === 'progress') return b.progress - a.progress;
    // 'recent' - keep original order (most recent first from API)
    return 0;
  });

  // Filter history logs based on selection
  const filteredHistoryLogs = historyLogs.filter(log => {
    // Filter by type
    if (historyFilter === 'connection' && !log.id.startsWith('conn-')) return false;
    if (historyFilter === 'calls' && !log.id.startsWith('call-')) return false;
    if (historyFilter === 'notifications' && !log.id.startsWith('notif-')) return false;

    // Filter by period
    if (log.rawTimestamp) {
      const now = Date.now() / 1000;
      const diff = now - log.rawTimestamp;
      if (historyPeriod === '24h' && diff > 86400) return false;
      if (historyPeriod === '7d' && diff > 604800) return false;
      // '30d' - no additional filter needed
    }

    return true;
  });

  const handleReboot = async () => {
    if (confirm('Voulez-vous vraiment redémarrer la Freebox ?')) {
      await reboot();
    }
  };

  const handleLogout = async () => {
    // Logout from both systems
    userLogout();
    await freeboxLogout();
  };

  const handleVmToggle = async (id: string, start: boolean) => {
    if (start) {
      await startVm(id);
    } else {
      await stopVm(id);
    }
  };

  const handleWifiToggle = async (bssId: string, enabled: boolean) => {
    await toggleBss(bssId, enabled);
  };

  // Clean up URL parameter 's' when leaving search page
  useEffect(() => {
    if (currentPage !== 'search') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('s')) {
        urlParams.delete('s');
        const newUrl = urlParams.toString() 
          ? `${window.location.pathname}?${urlParams.toString()}`
          : window.location.pathname;
        window.history.replaceState(null, '', newUrl);
      }
    }
  }, [currentPage]);

  const handlePageChange = (page: PageType) => {
    setCurrentPage(page);
  };

  const handleHomeClick = () => {
    setCurrentPage('dashboard');
  };

  const handleSettingsClick = () => {
    setCurrentPage('settings');
  };

  const handleAdminClick = () => {
    sessionStorage.setItem('adminMode', 'true');
    setCurrentPage('settings');
    // SettingsPage will handle showing the admin tab
  };

  const handleProfileClick = () => {
    sessionStorage.setItem('adminMode', 'true');
    setCurrentPage('settings');
    // SettingsPage will open with 'general' tab (Mon Profil)
    sessionStorage.setItem('adminTab', 'general');
  };

  // Handle users click (navigate to users page)
  const handleUsersClick = () => {
    setCurrentPage('users');
  };

  // Navigate directly to Freebox plugin options in settings (Plugins tab)
  const handleFreeboxOptionsClick = () => {
    // Open Freebox settings page (mode Freebox, pas administration)
    sessionStorage.removeItem('adminMode');
    sessionStorage.removeItem('adminTab');
    setCurrentPage('settings');
  };

  // Show loading state while checking authentication
  if (userAuthLoading) {
    return (
      <div className="min-h-screen bg-theme-primary flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // Show user login modal if not authenticated
  if (!isUserAuthenticated) {
    return (
      <div className="min-h-screen bg-theme-primary">
        <UserLoginModal 
          isOpen={true} 
          onClose={() => {}} 
          onSuccess={() => {
            // Plugins will be fetched after user login, Freebox auth will be checked if plugin is enabled
          }}
        />
      </div>
    );
  }


  // Helper component to render page with footer (with optional animated background)
  // Provider shares animation parameters so ThemeSection sliders and AnimatedBackground stay in sync
  const renderPageWithFooter = (pageContent: React.ReactNode) => (
    <AnimationParametersContext.Provider value={animationParameters}>
      <div className="relative min-h-screen">
        <AnimatedBackground 
          variant={bgVariant} 
          disabled={prefersReducedMotion} 
          animationSpeed={animationSpeed}
          animationParameters={animationParameters.parameters}
        />
        <div className="relative z-0 min-h-screen pb-20 bg-theme-primary/95 text-theme-primary font-sans selection:bg-accent-primary/30">
          <Suspense fallback={<PageLoader t={t} />}>
            {pageContent}
          </Suspense>
          <Footer
          currentPage={currentPage}
          onPageChange={handlePageChange}
          onReboot={handleReboot}
          onLogout={handleLogout}
          onFreeboxOptions={handleFreeboxOptionsClick}
          userRole={user?.role}
        />
        </div>
      </div>
    </AnimationParametersContext.Provider>
  );

  // Render TV page
  if (currentPage === 'tv') {
    return renderPageWithFooter(
      <TvPage onBack={() => setCurrentPage('freebox')} />
    );
  }

  // Render Phone page
  if (currentPage === 'phone') {
    return renderPageWithFooter(
      <PhonePage onBack={() => setCurrentPage('freebox')} />
    );
  }

  // Render Files page
  if (currentPage === 'files') {
    return renderPageWithFooter(
      <FilesPage
        onBack={() => {
          setCurrentPage('freebox');
          setFilesPageInitialTab('files');
          setFilesPageInitialDownloadId(undefined);
        }}
        initialTab={filesPageInitialTab}
        initialDownloadId={filesPageInitialDownloadId}
      />
    );
  }

  // Render VMs page
  if (currentPage === 'vms') {
    return renderPageWithFooter(
      <VmsPage onBack={() => setCurrentPage('freebox')} />
    );
  }

  // Render Analytics page
  if (currentPage === 'analytics') {
    return renderPageWithFooter(
      <AnalyticsPage onBack={() => setCurrentPage('freebox')} />
    );
  }

  // Render Settings page
  if (currentPage === 'settings') {
    // Check if we should show administration mode (from sessionStorage)
    // Clean URL hash if present
    if (window.location.hash === '#admin') {
      window.history.replaceState(null, '', window.location.pathname);
    }
    const showAdmin = sessionStorage.getItem('adminMode') === 'true' || false;
    // Check if we should open a specific admin tab (from sessionStorage)
    // Read it immediately to ensure it's available
    const adminTab = sessionStorage.getItem('adminTab') as 'general' | 'users' | 'plugins' | 'logs' | 'security' | 'exporter' | 'theme' | 'debug' | 'info' | 'backup' | undefined;
    // Only clear if we're actually using it (to avoid clearing it before SettingsPage reads it)
    // We'll let SettingsPage handle clearing it via useEffect
    return renderPageWithFooter(
      <SettingsPage 
        onBack={() => setCurrentPage('dashboard')} 
        mode={showAdmin ? 'administration' : 'freebox'}
        initialAdminTab={adminTab || 'general'}
        onNavigateToPage={(page) => setCurrentPage(page)}
        onUsersClick={handleUsersClick}
        onSettingsClick={handleSettingsClick}
        onAdminClick={handleAdminClick}
        onProfileClick={handleProfileClick}
        onLogout={handleLogout}
      />
    );
  }

  // Render Plugins page
  if (currentPage === 'plugins') {
    return renderPageWithFooter(
      <PluginsPage 
        onBack={() => setCurrentPage('dashboard')}
        onNavigateToSettings={() => {
          sessionStorage.setItem('adminMode', 'true');
          sessionStorage.setItem('adminTab', 'plugins');
          setCurrentPage('settings');
        }}
      />
    );
  }

  // Render Users page (admin only)
  if (currentPage === 'users') {
    return renderPageWithFooter(
      <UsersPage onBack={() => setCurrentPage('dashboard')} />
    );
  }

  // Render Logs page (admin only)
  if (currentPage === 'logs') {
    return renderPageWithFooter(
      <LogsPage onBack={() => setCurrentPage('dashboard')} />
    );
  }

  // Render Search page
  if (currentPage === 'search') {
    return renderPageWithFooter(
      <>
        <Header 
          systemInfo={systemInfo} 
          connectionStatus={connectionStatus}
          pageType="search"
          onHomeClick={handleHomeClick}
          user={user || undefined}
          onSettingsClick={handleSettingsClick}
          onAdminClick={handleAdminClick}
          onProfileClick={handleProfileClick}
          onUsersClick={handleUsersClick}
          onLogout={handleLogout}
          onSearchClick={() => setCurrentPage('search')}
        />
        <main className="p-4 md:p-6 max-w-[1920px] mx-auto">
          <Suspense fallback={<PageLoader t={t} />}>
          <SearchPage 
            onBack={() => setCurrentPage('dashboard')} 
          />
          </Suspense>
        </main>
      </>
    );
  }

  // Render UniFi page
  if (currentPage === 'unifi') {
    return renderPageWithFooter(
      <>
        <Header 
          systemInfo={systemInfo} 
          connectionStatus={connectionStatus}
          pageType="unifi"
          onHomeClick={handleHomeClick}
          user={user || undefined}
          onSettingsClick={handleSettingsClick}
          onAdminClick={handleAdminClick}
          onProfileClick={handleProfileClick}
          onUsersClick={handleUsersClick}
          onLogout={handleLogout}
          unifiStats={pluginStats['unifi'] || null}
        />
        <main className="p-4 md:p-6 max-w-[1920px] mx-auto">
          <Suspense fallback={<PageLoader t={t} />}>
      <UniFiPage 
        onBack={() => setCurrentPage('dashboard')} 
        onNavigateToSearch={(ip) => {
          // URL is already updated in UniFiPage, just navigate to search page
          // The SearchPage will read the 's' parameter from URL
          setCurrentPage('search');
        }}
      />
          </Suspense>
        </main>
      </>
    );
  }

  // Render Network Scan page
  if (currentPage === 'network-scan') {
    return renderPageWithFooter(
      <>
        <Header 
          systemInfo={systemInfo} 
          connectionStatus={connectionStatus}
          pageType="network-scan"
          onHomeClick={handleHomeClick}
          user={user || undefined}
          onSettingsClick={handleSettingsClick}
          onAdminClick={handleAdminClick}
          onProfileClick={handleProfileClick}
          onUsersClick={handleUsersClick}
          onLogout={handleLogout}
        />
        <main className="p-4 md:p-6 max-w-[1920px] mx-auto">
          <Suspense fallback={<PageLoader t={t} />}>
            <NetworkScanPage 
              onBack={() => setCurrentPage('dashboard')} 
              onNavigateToSearch={(ip) => {
                // URL is already updated in NetworkScanPage, just navigate to search page
                // The SearchPage will read the 's' parameter from URL
                setCurrentPage('search');
              }}
            />
          </Suspense>
        </main>
      </>
    );
  }

  // Check if Freebox plugin is enabled
  const freeboxPlugin = plugins.find(p => p.id === 'freebox');
  const isFreeboxPluginEnabled = freeboxPlugin?.enabled || false;
  
  // Show Freebox login modal only if plugin is enabled and not logged in
  const shouldShowFreeboxLogin = isFreeboxPluginEnabled && !isFreeboxLoggedIn && !freeboxAuthLoading && isUserAuthenticated;

  // Render Freebox Dashboard (if Freebox plugin is active and connected)
  const isFreeboxPluginActive = isFreeboxPluginEnabled && freeboxPlugin?.connectionStatus;
  
  // Render Unified Dashboard (default)
  if (currentPage === 'dashboard') {
    return renderPageWithFooter(
      <>
        <Header 
          systemInfo={systemInfo} 
          connectionStatus={connectionStatus}
          pageType="dashboard"
          user={user || undefined}
          onSettingsClick={handleSettingsClick}
          onAdminClick={handleAdminClick}
          onProfileClick={handleProfileClick}
          onUsersClick={handleUsersClick}
          onLogout={handleLogout}
          onSearchClick={() => setCurrentPage('search')}
        />
        <main className="p-4 md:p-6 max-w-[1920px] mx-auto">
          <Suspense fallback={<PageLoader t={t} />}>
          <UnifiedDashboardPage 
            onNavigateToFreebox={() => setCurrentPage('freebox')}
            onNavigateToUniFi={() => setCurrentPage('unifi')}
            onNavigateToNetworkScan={() => setCurrentPage('network-scan')}
            onNavigateToPlugins={() => {
              // Set sessionStorage BEFORE changing page to ensure it's read
              sessionStorage.setItem('adminMode', 'true');
              sessionStorage.setItem('adminTab', 'plugins');
              setCurrentPage('settings');
            }}
          />
          </Suspense>
        </main>
      </>
    );
  }
  
  // Render Freebox page if plugin is enabled and active (login will be handled by modal if needed)
  if (currentPage === 'freebox' && isFreeboxPluginActive) {
    return (
      <div className="min-h-screen pb-20 bg-theme-primary text-theme-primary font-sans selection:bg-accent-primary/30">
        <Header 
          systemInfo={systemInfo} 
          connectionStatus={connectionStatus}
          pageType="freebox"
          onHomeClick={handleHomeClick}
          user={user || undefined}
          onSettingsClick={handleSettingsClick}
          onAdminClick={handleAdminClick}
          onProfileClick={handleProfileClick}
          onUsersClick={handleUsersClick}
          onLogout={handleLogout}
        />

        <main className="p-4 md:p-6 max-w-[1920px] mx-auto">
          <FreeboxFirmwareBanner />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

          {/* Column 1 - Multi-Sources + État de la Freebox */}
          <div className="flex flex-col gap-6">
            {/* Multi-Source Widget - Hidden in Freebox page */}
            {/* <MultiSourceWidget /> */}

            {/* Network Summary Widget */}
            {isFreeboxLoggedIn && (
              <NetworkSummaryFreeboxWidget />
            )}

            {/* Freebox Status (only if Freebox is connected) */}
            {isFreeboxLoggedIn && (
              <Card
                title={t('freebox.state')}
                actions={
                  <div className="flex items-center gap-2">
                    <ActionButton
                      label={t('freebox.page.options')}
                      icon={Settings}
                      onClick={handleFreeboxOptionsClick}
                    />
                    <ActionButton
                      label={t('freebox.page.seeMore')}
                      icon={MoreHorizontal}
                      onClick={() => setIsTrafficModalOpen(true)}
                    />
                  </div>
                }
              >
                <div className="flex flex-col gap-4">
                  {import.meta.env.DEV && (
                    <div className="text-xs text-gray-500 mb-2">
                      Debug: history length={networkHistory?.length || 0}, status={connectionStatus ? 'OK' : 'null'}
                    </div>
                  )}
                  <BarChart
                    data={networkHistory || []}
                    dataKey="download"
                    color="#3b82f6"
                    title={t('freebox.downloadRealtime')}
                    currentValue={currentDownload.split(' ')[0]}
                    unit={currentDownload.split(' ')[1] || 'kb/s'}
                    trend="down"
                  />
                  <BarChart
                    data={networkHistory || []}
                    dataKey="upload"
                    color="#10b981"
                    title={t('freebox.uploadRealtime')}
                    currentValue={currentUpload.split(' ')[0]}
                    unit={currentUpload.split(' ')[1] || 'kb/s'}
                    trend="up"
                  />
                </div>
              </Card>
            )}

            {isFreeboxLoggedIn && (
              <Card title={t('freebox.speedTest')}>
              <SpeedtestWidget />
              <p className="text-xs text-gray-500 mt-2 text-center">
                {t('freebox.page.speedTestApiMessage')}
              </p>
              </Card>
            )}

            {isFreeboxLoggedIn && systemInfo && (
              <Card
                title={t('system.uptime')}
                actions={
                  <button className="text-xs bg-[#1a1a1a] border border-gray-700 px-2 py-1 rounded flex items-center gap-1 text-gray-400">
                    <Calendar size={12} /> <span>{t('freebox.page.period30d')}</span>
                  </button>
                }
              >
              {systemInfo ? (
                <UptimeGrid
                  uptimeSeconds={systemInfo.uptime_val}
                />
              ) : (
                <div className="text-center text-gray-500 py-4">
                  {t('common.loading')}
                </div>
              )}
            </Card>
            )}
          </div>

          {/* Column 2 - WiFi & Local */}
          <div className="flex flex-col gap-6">
            <Card
              title={t('freebox.page.wifi')}
              actions={
                <div className="flex flex-wrap gap-1 sm:gap-2">
                  <ActionButton label={t('dashboard.filter')} icon={Sliders} onClick={() => { setWifiModalTab('filter'); setIsWifiModalOpen(true); }} />
                  <ActionButton label={t('dashboard.planning')} icon={Calendar} onClick={() => { setWifiModalTab('planning'); setIsWifiModalOpen(true); }} />
                  <ActionButton label={t('dashboard.wps')} icon={WifiIcon} onClick={() => { setWifiModalTab('wps'); setIsWifiModalOpen(true); }} />
                </div>
              }
            >
              {wifiLoading ? (
                <div className="text-center text-gray-500 py-4">{t('common.loading')}</div>
              ) : wifiNetworks.length > 0 ? (
                <WifiPanel networks={wifiNetworks} onToggle={handleWifiToggle} />
              ) : (
                <div className="text-center text-gray-500 py-4">
                  {t('dashboard.noWifiConfigured')}
                </div>
              )}
            </Card>

            <Card
              title={t('freebox.page.local')}
              actions={
                <div className="flex gap-2">
                  <button
                    onClick={() => setDeviceFilter(deviceFilter === 'active' ? 'all' : 'active')}
                    className={`text-xs px-2 py-1 rounded border transition-colors flex items-center gap-1 ${
                      deviceFilter === 'active'
                        ? 'bg-emerald-900/30 border-emerald-700 text-emerald-400'
                        : 'bg-[#1a1a1a] border-gray-700 text-gray-400 hover:bg-[#252525]'
                    }`}
                  >
                    <Filter size={12} /> {t('dashboard.active')}
                  </button>
                  <button
                    onClick={() => setDeviceFilter(deviceFilter === 'inactive' ? 'all' : 'inactive')}
                    className={`text-xs px-2 py-1 rounded border transition-colors flex items-center gap-1 ${
                      deviceFilter === 'inactive'
                        ? 'bg-gray-700/30 border-gray-600 text-gray-300'
                        : 'bg-[#1a1a1a] border-gray-700 text-gray-400 hover:bg-[#252525]'
                    }`}
                  >
                    <Filter size={12} /> {t('dashboard.offline')}
                  </button>
                </div>
              }
              className="flex-grow"
            >
              <DevicesList devices={displayedDevices} />
              {filteredDevices.length > 10 && !showAllDevices && (
                <button
                  onClick={() => setShowAllDevices(true)}
                  className="w-full mt-2 py-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {t('dashboard.showAllDevices', { count: filteredDevices.length })}
                </button>
              )}
              {showAllDevices && filteredDevices.length > 10 && (
                <button
                  onClick={() => setShowAllDevices(false)}
                  className="w-full mt-2 py-2 text-xs text-gray-400 hover:text-gray-300 transition-colors"
                >
                  {t('dashboard.reduceList')}
                </button>
              )}
            </Card>
          </div>

          {/* Column 3 - VMs & Fichiers */}
          <div className="flex flex-col gap-6">
            <Card
              title={hasLimitedVmSupport() ? `VMs (max ${getMaxVms()})` : "VMs"}
              actions={supportsVm() && hasDisk && !vmError ? <ActionButton label={t('dashboard.create')} icon={Plus} onClick={() => setIsCreateVmModalOpen(true)} /> : undefined}
            >
              {!supportsVm() ? (
                <UnsupportedFeature
                  feature={t('dashboard.virtualMachines')}
                  featureType="vm"
                />
              ) : !hasDisk ? (
                <div className="text-center py-8">
                  <Server size={32} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-gray-500 text-sm">{t('dashboard.noDiskDetected')}</p>
                  <p className="text-gray-600 text-xs mt-1">
                    {t('dashboard.connectDiskForVms')}
                  </p>
                </div>
              ) : vmLoading ? (
                <div className="text-center text-gray-500 py-4">{t('common.loading')}</div>
              ) : vmError ? (
                <div className="text-center py-8">
                  <Server size={32} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-gray-500 text-sm">{t('dashboard.vmsNotAvailable')}</p>
                  <p className="text-gray-600 text-xs mt-1">
                    {t('dashboard.vmsNotSupported')}
                  </p>
                </div>
              ) : vms.length > 0 ? (
                <VmPanel vms={vms} onToggle={handleVmToggle} />
              ) : (
                <div className="text-center py-8">
                  <Server size={32} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-gray-500 text-sm">{t('dashboard.noVmConfigured')}</p>
                  <p className="text-gray-600 text-xs mt-1">
                    {t('dashboard.createVmToStart')}
                  </p>
                </div>
              )}
            </Card>

            <Card
              title={t('dashboard.downloads')}
              onTitleClick={() => {
                setFilesPageInitialTab('downloads');
                setFilesPageInitialDownloadId(undefined);
                setCurrentPage('files');
              }}
              actions={
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const next = downloadFilter === 'all' ? 'active' : downloadFilter === 'active' ? 'done' : 'all';
                      setDownloadFilter(next);
                    }}
                    className={`text-xs px-2 py-1 rounded border transition-colors flex items-center gap-1 ${
                      downloadFilter !== 'all'
                        ? 'bg-blue-900/30 border-blue-700 text-blue-400'
                        : 'bg-[#1a1a1a] border-gray-700 text-gray-400 hover:bg-[#252525]'
                    }`}
                  >
                    <Filter size={12} />
                    {downloadFilter === 'all' ? 'Tous' : downloadFilter === 'active' ? 'En cours' : 'Terminés'}
                  </button>
                  <button
                    onClick={() => {
                      const next = downloadSort === 'recent' ? 'name' : downloadSort === 'name' ? 'progress' : 'recent';
                      setDownloadSort(next);
                    }}
                    className={`text-xs px-2 py-1 rounded border transition-colors flex items-center gap-1 ${
                      downloadSort !== 'recent'
                        ? 'bg-blue-900/30 border-blue-700 text-blue-400'
                        : 'bg-[#1a1a1a] border-gray-700 text-gray-400 hover:bg-[#252525]'
                    }`}
                  >
                    <ArrowDownWideNarrow size={12} />
                    {downloadSort === 'recent' ? 'Récent' : downloadSort === 'name' ? 'Nom' : 'Progression'}
                  </button>
                </div>
              }
              className={filteredDownloads.length === 0 && downloads.length === 0 ? '' : 'flex-grow'}
            >
              {!hasDisk ? (
                <div className="text-center py-4">
                  <HardDrive size={24} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-gray-500 text-xs">{t('dashboard.noDiskDetected')}</p>
                </div>
              ) : filteredDownloads.length > 0 ? (
                <FilePanel
                  tasks={filteredDownloads}
                  onTaskClick={(task) => {
                    setFilesPageInitialTab('downloads');
                    setFilesPageInitialDownloadId(task.id);
                    setCurrentPage('files');
                  }}
                />
              ) : downloads.length > 0 ? (
                <div className="text-center py-4">
                  <Download size={24} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-gray-500 text-xs">{t('app.noDownloadMatching')}</p>
                </div>
              ) : (
                <div className="text-center py-4">
                  <Download size={24} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-gray-500 text-xs">{t('app.noDownload')}</p>
                </div>
              )}
            </Card>
          </div>

          {/* Column 4 - Historique */}
          <div className="flex flex-col gap-6">
            <Card
              title="Historique"
              actions={
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const next = historyFilter === 'all' ? 'connection' : historyFilter === 'connection' ? 'calls' : historyFilter === 'calls' ? 'notifications' : 'all';
                      setHistoryFilter(next);
                    }}
                    className={`text-xs px-2 py-1 rounded border transition-colors flex items-center gap-1 ${
                      historyFilter !== 'all'
                        ? 'bg-accent-primary/30 border-accent-primary text-accent-primary'
                        : 'btn-theme border-theme text-theme-secondary hover:bg-theme-tertiary'
                    }`}
                  >
                    <Filter size={12} />
                    {historyFilter === 'all' ? t('app.historyAll') : historyFilter === 'connection' ? t('app.historyConnection') : historyFilter === 'calls' ? t('app.historyCalls') : t('app.historyNotifs')}
                  </button>
                  <button
                    onClick={() => {
                      const next = historyPeriod === '30d' ? '7d' : historyPeriod === '7d' ? '24h' : '30d';
                      setHistoryPeriod(next);
                    }}
                    className={`text-xs px-2 py-1 rounded border transition-colors flex items-center gap-1 ${
                      historyPeriod !== '30d'
                        ? 'bg-purple-900/30 border-purple-700 text-purple-400'
                        : 'bg-[#1a1a1a] border-gray-700 text-gray-400 hover:bg-[#252525]'
                    }`}
                  >
                    <Clock size={12} />
                    {historyPeriod === '30d' ? t('freebox.page.period30d') : historyPeriod === '7d' ? t('freebox.page.period7d') : t('freebox.page.period24h')}
                  </button>
                </div>
              }
              className={filteredHistoryLogs.length === 0 && historyLogs.length === 0 ? '' : 'h-full'}
            >
              {historyLoading ? (
                <div className="text-center text-gray-500 py-4">{t('common.loading')}</div>
              ) : filteredHistoryLogs.length > 0 ? (
                <HistoryLog logs={filteredHistoryLogs} />
              ) : historyLogs.length > 0 ? (
                <div className="text-center py-4">
                  <History size={24} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-gray-500 text-xs">{t('dashboard.noMatchingEvents')}</p>
                </div>
              ) : (
                <div className="text-center py-4">
                  <History size={24} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-gray-500 text-xs">{t('dashboard.noRecentEvents')}</p>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Traffic History Modal */}
        <TrafficHistoryModal
          isOpen={isTrafficModalOpen}
          onClose={() => setIsTrafficModalOpen(false)}
          data={extendedHistory.length > 0 ? extendedHistory : undefined}
          temperatureData={temperatureHistory}
          systemInfo={systemInfo}
          connectionStatus={connectionStatus}
          onFetchHistory={() => {
            fetchExtendedHistory();
            fetchTemperatureHistory();
          }}
        />

        {/* WiFi Settings Modal */}
        <WifiSettingsModal
          isOpen={isWifiModalOpen}
          onClose={() => setIsWifiModalOpen(false)}
          initialTab={wifiModalTab}
        />

        {/* Create VM Modal */}
        <CreateVmModal
          isOpen={isCreateVmModalOpen}
          onClose={() => setIsCreateVmModalOpen(false)}
        />
      </main>

      <Footer
        currentPage={currentPage}
        onPageChange={handlePageChange}
        onReboot={handleReboot}
        onLogout={handleLogout}
        onFreeboxOptions={handleFreeboxOptionsClick}
        userRole={user?.role}
      />
      
      {/* Freebox Login Modal - Only show if plugin is enabled and not logged in */}
      {shouldShowFreeboxLogin && (
        <LoginModal isOpen={true} />
      )}
    </div>
  );
  }

  // Default return - fallback to dashboard if currentPage is invalid
  console.warn('[App] Invalid currentPage, falling back to dashboard:', currentPage);
  return renderPageWithFooter(
    <>
      <Header 
        systemInfo={systemInfo} 
        connectionStatus={connectionStatus}
        pageType="dashboard"
        user={user || undefined}
        onSettingsClick={handleSettingsClick}
        onAdminClick={handleAdminClick}
        onProfileClick={handleProfileClick}
        onUsersClick={handleUsersClick}
        onLogout={handleLogout}
      />
      <main className="p-4 md:p-6 max-w-[1920px] mx-auto">
        <Suspense fallback={<PageLoader t={t} />}>
        <UnifiedDashboardPage 
          onNavigateToFreebox={() => setCurrentPage('freebox')}
          onNavigateToUniFi={() => setCurrentPage('unifi')}
        />
        </Suspense>
      </main>
    </>
  );
};

export default App;