import React, { useEffect, useState, Suspense, lazy, useMemo } from 'react';
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
  MultiSourceWidget
} from './components/widgets';
import { ActionButton, UnsupportedFeature } from './components/ui';
import { LoginModal, UserLoginModal, TrafficHistoryModal, WifiSettingsModal, CreateVmModal } from './components/modals';

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
import { POLLING_INTERVALS, formatSpeed } from './utils/constants';
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
  ArrowDownWideNarrow
} from 'lucide-react';

// Loading component for lazy-loaded pages
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
      <p className="text-gray-400 text-sm">Chargement...</p>
    </div>
  </div>
);

const App: React.FC = () => {
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
    checkUserAuth();
    
    // Listen for theme changes to force re-render
    const handleThemeChange = () => {
      // Force component re-render when theme changes by updating a dummy state
      setCurrentPage(prev => prev);
    };
    
    window.addEventListener('themechange', handleThemeChange);
    window.addEventListener('themeupdate', handleThemeChange);
    
    return () => {
      window.removeEventListener('themechange', handleThemeChange);
      window.removeEventListener('themeupdate', handleThemeChange);
    };
    
    // Fetch environment info on mount
    fetchEnvironmentInfo();
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

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
          <p className="text-gray-400">Chargement...</p>
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


  // Helper component to render page with footer
  const renderPageWithFooter = (pageContent: React.ReactNode) => (
    <div className="min-h-screen pb-20 bg-theme-primary text-theme-primary font-sans selection:bg-accent-primary/30">
      <Suspense fallback={<PageLoader />}>
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
          <Suspense fallback={<PageLoader />}>
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
          <Suspense fallback={<PageLoader />}>
      <UniFiPage onBack={() => setCurrentPage('dashboard')} />
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
          <Suspense fallback={<PageLoader />}>
            <NetworkScanPage onBack={() => setCurrentPage('dashboard')} />
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
          <Suspense fallback={<PageLoader />}>
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

          {/* Column 1 - Multi-Sources + État de la Freebox */}
          <div className="flex flex-col gap-6">
            {/* Multi-Source Widget - Always visible */}
            <MultiSourceWidget />

            {/* Freebox Status (only if Freebox is connected) */}
            {isFreeboxLoggedIn && (
              <Card
                title="État de la Freebox"
                actions={
                  <div className="flex items-center gap-2">
                    <ActionButton
                      label="Options"
                      icon={Settings}
                      onClick={handleFreeboxOptionsClick}
                    />
                    <ActionButton
                      label="Voir plus"
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
                    title="Descendant en temps réel"
                    currentValue={currentDownload.split(' ')[0]}
                    unit={currentDownload.split(' ')[1] || 'kb/s'}
                    trend="down"
                  />
                  <BarChart
                    data={networkHistory || []}
                    dataKey="upload"
                    color="#10b981"
                    title="Montant en temps réel"
                    currentValue={currentUpload.split(' ')[0]}
                    unit={currentUpload.split(' ')[1] || 'kb/s'}
                    trend="up"
                  />
                </div>
              </Card>
            )}

            {isFreeboxLoggedIn && (
              <Card title="Test de débits">
              <SpeedtestWidget
                downloadSpeed={undefined}
                uploadSpeed={undefined}
                ping={undefined}
                jitter={undefined}
                downloadHistory={[]}
                uploadHistory={[]}
              />
              <p className="text-xs text-gray-500 mt-2 text-center">
                L'API Freebox ne permet pas de lancer des tests de débit via l'API.
                Utilisez l'interface Freebox OS pour effectuer un test.
              </p>
              </Card>
            )}

            {isFreeboxLoggedIn && systemInfo && (
              <Card
                title="Uptime"
                actions={
                  <button className="text-xs bg-[#1a1a1a] border border-gray-700 px-2 py-1 rounded flex items-center gap-1 text-gray-400">
                    <Calendar size={12} /> <span>30J</span>
                  </button>
                }
              >
              {systemInfo ? (
                <UptimeGrid
                  uptimeSeconds={systemInfo.uptime_val}
                />
              ) : (
                <div className="text-center text-gray-500 py-4">
                  Chargement...
                </div>
              )}
            </Card>
            )}
          </div>

          {/* Column 2 - WiFi & Local */}
          <div className="flex flex-col gap-6">
            <Card
              title="Wifi"
              actions={
                <div className="flex flex-wrap gap-1 sm:gap-2">
                  <ActionButton label="Filtrage" icon={Sliders} onClick={() => { setWifiModalTab('filter'); setIsWifiModalOpen(true); }} />
                  <ActionButton label="Planif." icon={Calendar} onClick={() => { setWifiModalTab('planning'); setIsWifiModalOpen(true); }} />
                  <ActionButton label="WPS" icon={WifiIcon} onClick={() => { setWifiModalTab('wps'); setIsWifiModalOpen(true); }} />
                </div>
              }
            >
              {wifiLoading ? (
                <div className="text-center text-gray-500 py-4">Chargement...</div>
              ) : wifiNetworks.length > 0 ? (
                <WifiPanel networks={wifiNetworks} onToggle={handleWifiToggle} />
              ) : (
                <div className="text-center text-gray-500 py-4">
                  Aucun réseau WiFi configuré
                </div>
              )}
            </Card>

            <Card
              title="Local"
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
                    <Filter size={12} /> Actifs
                  </button>
                  <button
                    onClick={() => setDeviceFilter(deviceFilter === 'inactive' ? 'all' : 'inactive')}
                    className={`text-xs px-2 py-1 rounded border transition-colors flex items-center gap-1 ${
                      deviceFilter === 'inactive'
                        ? 'bg-gray-700/30 border-gray-600 text-gray-300'
                        : 'bg-[#1a1a1a] border-gray-700 text-gray-400 hover:bg-[#252525]'
                    }`}
                  >
                    <Filter size={12} /> Hors-ligne
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
                  Afficher tous les appareils ({filteredDevices.length})
                </button>
              )}
              {showAllDevices && filteredDevices.length > 10 && (
                <button
                  onClick={() => setShowAllDevices(false)}
                  className="w-full mt-2 py-2 text-xs text-gray-400 hover:text-gray-300 transition-colors"
                >
                  Réduire la liste
                </button>
              )}
            </Card>
          </div>

          {/* Column 3 - VMs & Fichiers */}
          <div className="flex flex-col gap-6">
            <Card
              title={hasLimitedVmSupport() ? `VMs (max ${getMaxVms()})` : "VMs"}
              actions={supportsVm() && hasDisk && !vmError ? <ActionButton label="Créer" icon={Plus} onClick={() => setIsCreateVmModalOpen(true)} /> : undefined}
            >
              {!supportsVm() ? (
                <UnsupportedFeature
                  feature="Machines Virtuelles"
                  featureType="vm"
                />
              ) : !hasDisk ? (
                <div className="text-center py-8">
                  <Server size={32} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-gray-500 text-sm">Aucun disque détecté</p>
                  <p className="text-gray-600 text-xs mt-1">
                    Connectez un disque dur pour utiliser les VMs
                  </p>
                </div>
              ) : vmLoading ? (
                <div className="text-center text-gray-500 py-4">Chargement...</div>
              ) : vmError ? (
                <div className="text-center py-8">
                  <Server size={32} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-gray-500 text-sm">VMs non disponibles</p>
                  <p className="text-gray-600 text-xs mt-1">
                    Cette fonctionnalité n'est pas supportée sur votre modèle
                  </p>
                </div>
              ) : vms.length > 0 ? (
                <VmPanel vms={vms} onToggle={handleVmToggle} />
              ) : (
                <div className="text-center py-8">
                  <Server size={32} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-gray-500 text-sm">Aucune VM configurée</p>
                  <p className="text-gray-600 text-xs mt-1">
                    Créez une VM pour commencer
                  </p>
                </div>
              )}
            </Card>

            <Card
              title="Téléchargements"
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
              className="flex-grow"
            >
              {!hasDisk ? (
                <div className="text-center py-8">
                  <HardDrive size={32} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-gray-500 text-sm">Aucun disque détecté</p>
                  <p className="text-gray-600 text-xs mt-1">
                    Connectez un disque dur pour télécharger des fichiers
                  </p>
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
                <div className="text-center py-8">
                  <Download size={32} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-gray-500 text-sm">Aucun téléchargement correspondant</p>
                  <p className="text-gray-600 text-xs mt-1">
                    Modifiez les filtres pour voir plus de résultats
                  </p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Download size={32} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-gray-500 text-sm">Aucun téléchargement</p>
                  <p className="text-gray-600 text-xs mt-1">
                    Ajoutez un fichier pour commencer
                  </p>
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
                    {historyFilter === 'all' ? 'Toutes' : historyFilter === 'connection' ? 'Connexion' : historyFilter === 'calls' ? 'Appels' : 'Notifs'}
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
                    {historyPeriod === '30d' ? '30J' : historyPeriod === '7d' ? '7J' : '24H'}
                  </button>
                </div>
              }
              className="h-full"
            >
              {historyLoading ? (
                <div className="text-center text-gray-500 py-4">Chargement...</div>
              ) : filteredHistoryLogs.length > 0 ? (
                <HistoryLog logs={filteredHistoryLogs} />
              ) : historyLogs.length > 0 ? (
                <div className="text-center py-8">
                  <History size={32} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-gray-500 text-sm">Aucun événement correspondant</p>
                  <p className="text-gray-600 text-xs mt-1">
                    Modifiez les filtres pour voir plus de résultats
                  </p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <History size={32} className="mx-auto text-gray-600 mb-2" />
                  <p className="text-gray-500 text-sm">Aucun événement récent</p>
                  <p className="text-gray-600 text-xs mt-1">
                    Les logs de connexion et appels apparaîtront ici
                  </p>
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
        <Suspense fallback={<PageLoader />}>
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