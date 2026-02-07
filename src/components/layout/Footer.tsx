import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Settings,
  Tv,
  Phone,
  BarChart2,
  Folder,
  Server,
  Power,
  LogOut,
  Home,
  Plug,
  Users,
  FileText,
  AlertTriangle,
  Search
} from 'lucide-react';
import { useCapabilitiesStore } from '../../stores/capabilitiesStore';
import { usePluginStore } from '../../stores/pluginStore';

export type PageType = 'dashboard' | 'freebox' | 'unifi' | 'tv' | 'phone' | 'files' | 'vms' | 'analytics' | 'settings' | 'plugins' | 'users' | 'logs' | 'search' | 'network-scan';

interface FooterProps {
  currentPage?: PageType;
  onPageChange?: (page: PageType) => void;
  onReboot?: () => void;
  onLogout?: () => void;
  onFreeboxOptions?: () => void;
  userRole?: 'admin' | 'user' | 'viewer';
}

// Tab ids for which we need translated labels (labels resolved in component via t())
const TAB_IDS: { id: PageType; labelKey: string; icon: React.ElementType; adminOnly?: boolean }[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: Home },
  { id: 'freebox', labelKey: 'nav.freebox', icon: Server },
  { id: 'unifi', labelKey: 'nav.unifi', icon: BarChart2 },
  { id: 'tv', labelKey: 'nav.television', icon: Tv },
  { id: 'phone', labelKey: 'nav.phone', icon: Phone },
  { id: 'files', labelKey: 'nav.files', icon: Folder },
  { id: 'vms', labelKey: 'nav.vms', icon: Server },
  { id: 'analytics', labelKey: 'nav.analytics', icon: BarChart2 },
  { id: 'plugins', labelKey: 'nav.plugins', icon: Plug },
  { id: 'users', labelKey: 'nav.users', icon: Users, adminOnly: true },
  { id: 'logs', labelKey: 'nav.logs', icon: FileText, adminOnly: true },
  { id: 'settings', labelKey: 'nav.settings', icon: Settings }
];

export const Footer: React.FC<FooterProps> = ({
  currentPage = 'dashboard',
  onPageChange,
  onReboot,
  onLogout,
  onFreeboxOptions,
  userRole
}) => {
  const { t } = useTranslation();
  const { capabilities } = useCapabilitiesStore();
  const { plugins, pluginStats } = usePluginStore();

  // Filter tabs based on capabilities, user role, active plugins, and current page
  const visibleTabs = useMemo(() => {
    return TAB_IDS.filter(tab => {
      // UniFi tab: never shown on the left; navigation via plugin button on the right
      if (tab.id === 'unifi') {
        return false;
      }
      // On dashboard: hide Freebox, Settings and Freebox tabs (access via cards/plugins)
      // App "Administration" button is handled separately in the dashboard footer
      if (currentPage === 'dashboard') {
        if (tab.id === 'freebox' || 
            tab.id === 'tv' || tab.id === 'phone' || tab.id === 'files' || 
            tab.id === 'vms' || tab.id === 'analytics' || tab.id === 'settings') {
          return false;
        }
      }
      
      // On search page: show the same tabs as on the dashboard
      if (currentPage === 'search') {
        if (tab.id === 'freebox' || 
            tab.id === 'tv' || tab.id === 'phone' || tab.id === 'files' || 
            tab.id === 'vms' || tab.id === 'analytics' || tab.id === 'settings') {
          return false;
        }
      }
      
      // On network-scan page: show the same tabs as on the dashboard
      if (currentPage === 'network-scan') {
        if (tab.id === 'freebox' || 
            tab.id === 'tv' || tab.id === 'phone' || tab.id === 'files' || 
            tab.id === 'vms' || tab.id === 'analytics' || tab.id === 'settings') {
          return false;
        }
      }
      
      // On Freebox pages (freebox, tv, phone, files, vms, analytics):
      // show Freebox-related tabs + Dashboard so user can easily return to Freebox dashboard
      if (['freebox', 'tv', 'phone', 'files', 'vms', 'analytics'].includes(currentPage)) {
        if (['tv', 'phone', 'files', 'vms', 'analytics', 'freebox', 'dashboard'].includes(tab.id)) {
          // Continue with other filters (capabilities, role, etc.)
        } else if (tab.id !== 'settings' && tab.id !== 'plugins' && tab.id !== 'users' && tab.id !== 'logs') {
          return false;
        }
      }
      
      // On UniFi page: hide Freebox tabs (they remain accessible via the plugin button)
      if (currentPage === 'unifi') {
        if (tab.id === 'tv' || tab.id === 'phone' || tab.id === 'files' || tab.id === 'vms' || tab.id === 'analytics') {
          return false;
        }
        // Hide Freebox tab - it will be shown as button in actions if active
        if (tab.id === 'freebox') {
          return false;
        }
      }
      
      // On other pages (plugins, users, settings, logs): hide Freebox tabs
      // and plugins, users, logs, settings (accessible via Administration)
      if (['plugins', 'users', 'settings', 'logs'].includes(currentPage)) {
        if (tab.id === 'freebox' || 
            tab.id === 'tv' || tab.id === 'phone' || tab.id === 'files' || 
            tab.id === 'vms' || tab.id === 'analytics') {
          return false;
        }
      }
      
      // Hide plugins, users, logs, settings from footer - accessible via Administration (settings page)
      if (tab.id === 'plugins' || tab.id === 'users' || tab.id === 'logs' || tab.id === 'settings') {
        return false;
      }
      
      // Hide VMs tab only if we know the model doesn't support VMs
      if (tab.id === 'vms' && capabilities?.vmSupport === 'none') {
        return false;
      }
      
      // Hide admin-only tabs for non-admin users
      if (tab.adminOnly && userRole !== 'admin') {
        return false;
      }
      
      // Freebox tab: visible only if plugin is enabled and connected AND we're on the Freebox page
      // Never show it on dashboard or UniFi page (plugin button on the right instead)
      if (tab.id === 'freebox') {
        const freeboxPlugin = plugins.find(p => p.id === 'freebox');
        const isFreeboxActive = freeboxPlugin?.enabled && freeboxPlugin?.connectionStatus;
        // Show as tab on all Freebox pages (freebox, tv, phone, files, vms, analytics)
        if (!['freebox', 'tv', 'phone', 'files', 'vms', 'analytics'].includes(currentPage)) {
          return false;
        }
        return isFreeboxActive;
      }
      
      return true;
    });
  }, [capabilities?.vmSupport, userRole, plugins, currentPage]);

  const handleTabClick = (tabId: PageType) => {
    // App settings (Administration) always use the "settings" page
    onPageChange?.(tabId);
  };

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-theme-footer backdrop-blur-md border-t border-theme p-3 z-50" style={{ backdropFilter: 'var(--backdrop-blur)' }}>
      <div className="flex items-center justify-between max-w-[1920px] mx-auto px-2">
        {/* Navigation tabs + Freebox actions (left) */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentPage === tab.id;

            // Pour bien séparer :
            // - Tab "settings" (global Administration) is handled via dedicated button on dashboard
            const displayLabel = t(tab.labelKey);

            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                  isActive
                    ? 'btn-theme-active border-theme-hover text-theme-primary'
                    : 'btn-theme border-transparent text-theme-secondary hover:bg-theme-tertiary hover:text-theme-primary'
                }`}
              >
                <Icon size={18} />
                <span className="text-sm font-medium whitespace-nowrap">{displayLabel}</span>
              </button>
            );
          })}
          
          {/* Show Search button on dashboard, search page, and network-scan page */}
          {(currentPage === 'dashboard' || currentPage === 'search' || currentPage === 'network-scan') && (
            <button
              onClick={() => onPageChange?.('search')}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                currentPage === 'search'
                  ? 'btn-theme-active border-theme-hover text-theme-primary'
                  : 'btn-theme border-transparent text-theme-secondary hover:bg-theme-tertiary hover:text-theme-primary'
              }`}
            >
              <Search size={18} />
              <span className="text-sm font-medium whitespace-nowrap">{t('nav.search')}</span>
            </button>
          )}
          
          {/* Show Administration button on dashboard, search page, and network-scan page if settings tab is hidden */}
          {(currentPage === 'dashboard' || currentPage === 'search' || currentPage === 'network-scan') && !visibleTabs.find(t => t.id === 'settings') && (
            <button
              onClick={() => {
                sessionStorage.setItem('adminMode', 'true');
                onPageChange?.('settings');
              }}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border transition-all btn-theme border-transparent text-theme-secondary hover:bg-theme-tertiary hover:text-theme-primary"
            >
              <Settings size={18} />
              <span className="text-sm font-medium whitespace-nowrap">{t('nav.administration')}</span>
            </button>
          )}

          {/* Freebox actions - Only show on Freebox page, to the right of tabs (after Analytics) */}
          {currentPage === 'freebox' && (
            <>
              <button
                onClick={() => onFreeboxOptions?.()}
                className="flex items-center gap-2 px-4 py-2 btn-theme hover:bg-theme-tertiary text-theme-primary rounded-lg border-theme transition-colors"
              >
                <Settings size={18} />
                <span className="hidden sm:inline text-sm font-medium">{t('nav.options')}</span>
              </button>
              <button
                onClick={onReboot}
                className="flex items-center gap-2 px-4 py-2 border border-red-500 text-red-200 hover:bg-red-900/30 rounded-lg transition-colors"
              >
                <Power size={18} />
                <span className="hidden sm:inline text-sm font-medium">Reboot</span>
              </button>
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-4 py-2 border border-orange-500 text-orange-200 hover:bg-orange-900/30 rounded-lg transition-colors"
              >
                <LogOut size={18} />
                <span className="hidden sm:inline text-sm font-medium">{t('common.disconnect')}</span>
              </button>
            </>
          )}
        </div>

        {/* Actions (quick plugins, UniFi summary) */}
        <div className="flex items-center gap-2 pl-4">
          {/* Plugin buttons - always visible on the right for each active plugin, with custom SVG icons */}
          {(() => {
            const freeboxPlugin = plugins.find(p => p.id === 'freebox');
            const unifiPlugin = plugins.find(p => p.id === 'unifi');
            const scanReseauPlugin = plugins.find(p => p.id === 'scan-reseau');
            const isFreeboxActive = freeboxPlugin?.enabled && freeboxPlugin?.connectionStatus;
            const isUniFiActive = unifiPlugin?.enabled && unifiPlugin?.connectionStatus;
            // Scan-reseau does not require external connection, so we only check if enabled
            const isScanReseauActive = scanReseauPlugin?.enabled;

            const showFreeboxButton = !!isFreeboxActive;
            const showUniFiButton = !!isUniFiActive;
            const showScanReseauButton = !!isScanReseauActive;

            if (!showFreeboxButton && !showUniFiButton && !showScanReseauButton) {
              return null;
            }
            
            return (
              <>
                {showFreeboxButton && (
                  <button
                    onClick={() => onPageChange?.('freebox')}
                    className="flex items-center gap-2 px-4 py-2 btn-theme hover:bg-accent-primary/20 text-theme-primary hover:text-accent-primary rounded-lg border-theme transition-colors"
                  >
                    {/* Custom Freebox icon (full version) */}
                    <span className="w-6 h-4 flex items-center justify-center">
                       <svg xmlns="http://www.w3.org/2000/svg" viewBox="25 23.39 180 203.23" className="w-5 h-4"><path fill="#cd1e25" d="m 187.24133,23.386327 c -14.98294,0.01847 -31.16732,4.917913 -41.74251,9.8272 l 0,-0.03081 c -17.70535,8.087262 -29.24956,16.441925 -37.86091,25.630825 -8.274459,8.82635 -13.79935,18.347312 -19.6236,28.9271 l -32.007722,0 c -0.927639,0 -1.76557,0.528637 -2.187247,1.355475 l -4.189654,8.194475 c -0.389391,0.763987 -0.354765,1.672163 0.09242,2.402888 0.447184,0.73072 1.268849,1.17064 2.125634,1.17064 l 30.313378,0 -56.930003,121.03787 c -0.434171,0.92135 -0.243567,2.03654 0.462094,2.77256 l 1.139832,1.17064 c 0.558802,0.58297 1.358434,0.86405 2.15644,0.73935 l 23.227934,-3.60434 c 0.772991,-0.11988 1.456644,-0.60023 1.81757,-1.29386 l 62.814004,-120.82222 39.95574,0 c 0.89584,0 1.71899,-0.48182 2.15644,-1.263065 l 4.55933,-8.194463 c 0.42512,-0.761537 0.41033,-1.682025 -0.0308,-2.4337 -0.44115,-0.752912 -1.2532,-1.23225 -2.12564,-1.23225 l -37.89172,0 11.58316,-23.844062 0.0308,-0.0308 c 2.64355,-5.680688 5.57101,-11.577 10.41252,-15.988463 2.42384,-2.211887 5.31224,-4.079988 8.99544,-5.421913 3.68196,-1.340687 8.17722,-2.155199 13.73959,-2.156437 3.99619,-0.0038 7.9776,0.940212 11.95284,1.9408 3.97524,0.988263 7.91475,2.054163 11.98364,2.064025 2.12317,0.0025 4.06766,-0.5422 5.69916,-1.386287 2.45711,-1.27415 4.25866,-3.180438 5.48352,-5.083038 0.61243,-0.956225 1.08562,-1.906287 1.41709,-2.834175 0.32901,-0.93405 0.51754,-1.834825 0.5237,-2.772562 0.002,-0.941438 -0.20331,-1.859475 -0.58531,-2.68015 -0.67527,-1.445425 -1.82004,-2.48545 -3.08062,-3.265463 -1.90753,-1.169412 -4.18351,-1.838525 -6.65417,-2.279662 -2.47066,-0.433763 -5.12,-0.6149 -7.73237,-0.616125 z"></path></svg>
                    </span>
                    <span className="hidden sm:inline text-sm font-medium">Freebox</span>
                  </button>
                )}
                {showUniFiButton && (
                  <button
                    onClick={() => onPageChange?.('unifi')}
                    className="flex items-center gap-2 px-4 py-2 btn-theme hover:bg-accent-primary/20 text-theme-primary hover:text-accent-primary rounded-lg border-theme transition-colors"
                  >
                    {/* Custom UniFi icon */}
                    <span className="w-5 h-5 flex items-center justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        className="w-5 h-5"
                      >
                        <path
                          fill="#1fb0ec"
                          d="M5.343 4.222h1.099v1.1H5.343zm7.438 14.435a7.2 7.2 0 0 1-3.51-.988a6.5 6.5 0 0 0 2.947 3.936l.66.364c5.052-.337 8.009-3.6 8.009-7.863v-.924c-1.201 3.918-3.995 5.66-8.106 5.475m-4.107-2.291V8.355H7.562v4.1H6.448V10h-1.11v1.1H4.225V5.042H3.113v9.063c0 4.508 3.3 7.9 8.888 7.9a6.82 6.82 0 0 1-3.327-5.639M7.562 4.772h1.112v1.1H7.562zM3.113 2h1.112v1.111H3.113zm2.231 5.805h1.1v1.1h-1.1zm1.111-1.649h1.1v1.1h-1.1zm-.006-3.045h1.113V4.21H6.449zm8.876 2.677v10.577a9 9 0 0 1-.164 1.7c2.671-.486 4.414-2.137 5.3-5.014l.431-1.407V2.012c-5.042 0-5.567 1.931-5.567 3.776"
                        />
                      </svg>
                    </span>
                    <span className="hidden sm:inline text-sm font-medium">UniFi</span>
                  </button>
                )}
                {showScanReseauButton && (
                  <button
                    onClick={() => onPageChange?.('network-scan')}
                    className="flex items-center gap-2 px-4 py-2 btn-theme hover:bg-accent-primary/20 text-theme-primary hover:text-accent-primary rounded-lg border-theme transition-colors"
                  >
                    {/* Custom Network Scan icon */}
                    <span className="w-5 h-5 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 50 50" className="w-5 h-5">
                        <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                          <path stroke="currentColor" d="M25 35.417v-2.084M8.333 25h33.334zm8.334-10.417v2.084zm8.333 0v2.084zm-8.333 20.834v-2.084zm16.666-20.834v2.084zm0 20.834v-2.084z"/>
                          <path stroke="currentColor" d="M6.25 16.667V8.333A2.083 2.083 0 0 1 8.333 6.25h8.334M43.75 16.667V8.333a2.083 2.083 0 0 0-2.083-2.083h-8.334M6.25 33.333v8.334a2.083 2.083 0 0 0 2.083 2.083h8.334m16.666 0h8.334a2.083 2.083 0 0 0 2.083-2.083v-8.334"/>
                        </g>
                      </svg>
                    </span>
                    <span className="hidden sm:inline text-sm font-medium">IPs</span>
                  </button>
                )}

                {/* UniFi summary badge in footer when on UniFi page */}
                {currentPage === 'unifi' && pluginStats && pluginStats['unifi'] && (() => {
                  const stats: any = pluginStats['unifi'];
                  const devices = Array.isArray(stats.devices) ? stats.devices : [];
                  const nonClientDevices = devices.filter((d: any) => (d.type || '').toLowerCase() !== 'client');
                  const apsOnline = nonClientDevices.filter((d: any) => {
                    const type = (d.type || '').toLowerCase();
                    return (type === 'uap' || type.includes('uap') || type === 'ap' || type.includes('ap')) && d.active !== false;
                  }).length;
                  const switchesOnline = nonClientDevices.filter((d: any) => {
                    const type = (d.type || '').toLowerCase();
                    return type.startsWith('usw') && d.active !== false;
                  }).length;
                  // More precise check: upgradable must be explicitly true
                  // OR upgrade_to_firmware must exist and be different from current version
                  const anyUpgradable = nonClientDevices.some((d: any) => {
                    const hasUpgradeToFirmware = !!d.upgrade_to_firmware && 
                                                  d.upgrade_to_firmware !== d.version &&
                                                  d.upgrade_to_firmware !== d.firmware_version;
                    return d.upgradable === true || hasUpgradeToFirmware;
                  });

                  return (
                    <div className="hidden sm:flex items-center gap-2 ml-2 px-3 py-2 rounded-lg border border-theme bg-theme-secondary/60">
                      {anyUpgradable && (
                        <span className="flex items-center gap-1 text-xs text-amber-300">
                          <AlertTriangle size={14} className="text-amber-400" />
                          <span>{t('nav.updateAvailable')}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-sky-300">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          className="w-3.5 h-3.5 text-sky-400"
                        >
                          <path
                            fill="currentColor"
                            d="M12 18a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3m0-3.5a4.5 4.5 0 0 0-3.536 1.682a.75.75 0 1 0 1.156.948A3 3 0 0 1 12 15.5a3 3 0 0 1 2.38 1.63a.75.75 0 1 0 1.34-.66A4.5 4.5 0 0 0 12 14.5m0-4a8.5 8.5 0 0 0-6.47 3.004a.75.75 0 1 0 1.14.974A7 7 0 0 1 12 11.5a7 7 0 0 1 5.33 2.978a.75.75 0 1 0 1.2-.9A8.5 8.5 0 0 0 12 10.5m0-4a12.5 12.5 0 0 0-9.52 4.326a.75.75 0 1 0 1.116.996A11 11 0 0 1 12 7.5c3.27 0 6.25 1.422 8.404 3.822a.75.75 0 1 0 1.192-.92A12.5 12.5 0 0 0 12 6.5"
                          />
                        </svg>
                        <span>{apsOnline} AP</span>
                      </span>
                      <span className="flex items-center gap-1 text-xs text-emerald-300">
                        <Server size={14} />
                        <span>{switchesOnline} switches</span>
                      </span>
                    </div>
                  );
                })()}
              </>
            );
          })()}

        </div>
      </div>
    </footer>
  );
};