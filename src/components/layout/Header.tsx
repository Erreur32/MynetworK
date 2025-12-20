import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Cpu,
  HardDrive,
  Fan,
  ArrowDown,
  ArrowUp,
  Wifi,
  Activity,
  Phone,
  AlertTriangle,
  Search
} from 'lucide-react';
import logoUltra from '../../icons/logo_ultra.svg';
import logoMynetworK from '../../icons/logo_mynetwork.svg';
import logoUnifi from '../../icons/logo_unifi.svg';
import { StatusBadge, UserMenu } from '../ui';
import { useAuthStore } from '../../stores/authStore';
import { useConnectionStore } from '../../stores';
import { formatSpeed, formatTemperature } from '../../utils/constants';
import { useCapabilitiesStore } from '../../stores/capabilitiesStore';
import { useFavicon } from '../../hooks/useFavicon';
import { useUpdateStore } from '../../stores/updateStore';
import { getVersionString } from '../../constants/version';
import type { SystemInfo, ConnectionStatus, SystemSensor, SystemFan } from '../../types/api';
import type { PageType } from './Footer';

// Map model to display name
const getDisplayName = (model: string): string => {
  switch (model) {
    case 'ultra': return 'Freebox Ultra';
    case 'delta': return 'Freebox Delta';
    case 'pop': return 'Freebox Pop';
    case 'revolution': return 'Freebox Revolution';
    default: return 'Freebox';
  }
};

interface HeaderProps {
  systemInfo?: SystemInfo | null;
  connectionStatus?: ConnectionStatus | null;
  pageType?: PageType;
  onHomeClick?: () => void;
  user?: {
    username: string;
    email?: string;
    role: 'admin' | 'user' | 'viewer';
    avatar?: string;
  } | null;
  onSettingsClick?: () => void;
  onAdminClick?: () => void;
  onProfileClick?: () => void;
  onLogout?: () => void;
  unifiStats?: {
    network?: {
      download?: number;
      upload?: number;
    };
    system?: {
      uptime?: number;
    };
    devices?: Array<{
      type?: string;
      active?: boolean;
    }>;
  } | null;
}

// Helper to get CPU sensors (sorted alphabetically by id)
const getCpuSensors = (info: SystemInfo | null | undefined): SystemSensor[] => {
  if (!info) return [];

  // API v15+: sensors array format
  if (info.sensors && Array.isArray(info.sensors)) {
    return info.sensors
      .filter(s => s.id.startsWith('temp_cpu'))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  // Legacy format: build sensors array from individual fields
  const sensors: SystemSensor[] = [];
  if (info.temp_cpu0 != null) sensors.push({ id: 'temp_cpu0', name: 'CPU 0', value: info.temp_cpu0 });
  if (info.temp_cpu1 != null) sensors.push({ id: 'temp_cpu1', name: 'CPU 1', value: info.temp_cpu1 });
  if (info.temp_cpu2 != null) sensors.push({ id: 'temp_cpu2', name: 'CPU 2', value: info.temp_cpu2 });
  if (info.temp_cpu3 != null) sensors.push({ id: 'temp_cpu3', name: 'CPU 3', value: info.temp_cpu3 });
  if (info.temp_cpum != null) sensors.push({ id: 'temp_cpum', name: 'CPU Main', value: info.temp_cpum });
  if (info.temp_cpub != null) sensors.push({ id: 'temp_cpub', name: 'CPU Box', value: info.temp_cpub });
  if (info.temp_sw != null) sensors.push({ id: 'temp_sw', name: 'Switch', value: info.temp_sw });

  return sensors.sort((a, b) => a.id.localeCompare(b.id));
};

// Helper to get HDD sensors (sorted alphabetically by id)
const getHddSensors = (info: SystemInfo | null | undefined): SystemSensor[] => {
  if (!info) return [];

  // API v15+: sensors array format
  if (info.sensors && Array.isArray(info.sensors)) {
    return info.sensors
      .filter(s => s.id.startsWith('temp_hdd') || s.id.includes('disk'))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  return [];
};

// Helper to get average temperature from sensors
const getAvgTemp = (sensors: SystemSensor[]): number | null => {
  if (sensors.length === 0) return null;
  const avg = sensors.reduce((sum, s) => sum + s.value, 0) / sensors.length;
  return Math.round(avg);
};

// Helper to get all fans (API v8+)
const getFans = (info: SystemInfo | null | undefined): SystemFan[] => {
  if (!info) return [];

  // API v8+: fans array
  if (info.fans && Array.isArray(info.fans)) {
    return info.fans.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Legacy format: single fan_rpm field
  if (info.fan_rpm != null) {
    return [{ id: 'fan_rpm', name: 'Ventilateur', value: info.fan_rpm }];
  }

  return [];
};

// Helper to get average fan RPM
const getAvgFanRpm = (fans: SystemFan[]): number | null => {
  if (fans.length === 0) return null;
  const avg = fans.reduce((sum, f) => sum + f.value, 0) / fans.length;
  return Math.round(avg);
};

// Generic tooltip item type
interface TooltipItem {
  id: string;
  name: string;
  value: number;
}

// Tooltip component that renders in a portal to avoid overflow issues
const Tooltip: React.FC<{
  show: boolean;
  title: string;
  items: TooltipItem[];
  color: string;
  unit: string;
  parentRef: React.RefObject<HTMLDivElement | null>;
  pluginName?: string;
}> = ({ show, title, items, color, unit, parentRef, pluginName }) => {
  // Determine plugin color based on plugin name
  const getPluginColorClasses = (name?: string): { text: string; border: string; bg: string } => {
    if (!name) {
      return { text: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500/5' };
    }
    const lowerName = name.toLowerCase();
    if (lowerName === 'freebox') {
      return { text: 'text-red-400', border: 'border-red-500/30', bg: 'bg-red-500/5' }; // Freebox red (atténué)
    } else if (lowerName === 'unifi' || lowerName.includes('unifi')) {
      return { text: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500/5' }; // UniFi/Ubiquiti blue
    }
    return { text: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500/5' }; // Default blue
  };

  const pluginColors = getPluginColorClasses(pluginName);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (show && parentRef.current) {
      const rect = parentRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        left: rect.left
      });
    } else {
      setPosition(null);
    }
  }, [show, parentRef]);

  // Don't render until position is calculated
  if (!show || items.length === 0 || !position) return null;

  const tooltipContent = (
    <div
      className="fixed z-[9999] bg-theme-secondary border border-theme rounded-lg shadow-xl p-3 min-w-[200px] whitespace-nowrap"
      style={{ top: position.top, left: position.left }}
    >
      {pluginName && (
        <div className="mb-2 flex justify-center">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${pluginColors.text} ${pluginColors.bg} border ${pluginColors.border}`}>
            {pluginName}
          </span>
        </div>
      )}
      <div className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">{title}</div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.id} className="flex justify-between items-center text-sm gap-4">
            <span className="text-gray-300">{item.name}</span>
            <span className={`${color} font-medium`}>{item.value}{unit}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // Use portal to render tooltip at document body level
  return createPortal(tooltipContent, document.body);
};

export const Header: React.FC<HeaderProps> = ({ 
  systemInfo, 
  connectionStatus,
  pageType = 'dashboard',
  onHomeClick,
  user,
  onSettingsClick,
  onAdminClick,
  onProfileClick,
  onLogout,
  onSearchClick,
  unifiStats
}) => {
  // Get capabilities for model name (respects mock mode)
  const { getModel } = useCapabilitiesStore();
  
  // Get network history for compact chart (dashboard only)
  const connectionStore = useConnectionStore();
  const networkHistory = connectionStore?.history || [];

  // State for tooltips
  const [showCpuTooltip, setShowCpuTooltip] = useState(false);
  const [showHddTooltip, setShowHddTooltip] = useState(false);
  const [showFanTooltip, setShowFanTooltip] = useState(false);
  
  // State for current time (for search page and dashboard)
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Update time every minute (for search page and dashboard)
  useEffect(() => {
    if (pageType === 'search' || pageType === 'dashboard') {
      const updateTime = () => setCurrentTime(new Date());
      updateTime(); // Set initial time
      const interval = setInterval(updateTime, 60000); // Update every minute
      return () => clearInterval(interval);
    }
  }, [pageType]);

  // Refs for tooltip positioning
  const cpuRef = React.useRef<HTMLDivElement | null>(null);
  const hddRef = React.useRef<HTMLDivElement | null>(null);
  const fanRef = React.useRef<HTMLDivElement | null>(null);

  // Set favicon dynamically based on current page
  // invert=true to make white SVG visible on light browser tab backgrounds
  const faviconIcon = pageType === 'freebox'
    ? logoUltra
    : pageType === 'unifi'
      ? logoUnifi
      : logoMynetworK;
  useFavicon(faviconIcon, true);

  // Get CPU and HDD sensors
  const cpuSensors = getCpuSensors(systemInfo);
  const hddSensors = getHddSensors(systemInfo);
  const fans = getFans(systemInfo);

  // Calculate averages
  const cpuAvgTemp = getAvgTemp(cpuSensors);
  const hddAvgTemp = getAvgTemp(hddSensors);
  const fanAvgRpm = getAvgFanRpm(fans);

  // Format for display
  const cpuTemp = cpuAvgTemp != null ? formatTemperature(cpuAvgTemp) : '--';
  const hddTemp = hddAvgTemp != null ? formatTemperature(hddAvgTemp) : '--';
  const fanDisplay = fanAvgRpm != null ? `${fanAvgRpm} T/min` : '--';
  const downloadSpeed = connectionStatus
    ? formatSpeed(connectionStatus.rate_down).replace(' ', '')
    : '--';
  const uploadSpeed = connectionStatus
    ? formatSpeed(connectionStatus.rate_up).replace(' ', '')
    : '--';
  
  // Calculate current values for compact chart
  const parseSpeed = (speed: string): [string, string] => {
    if (speed === '--') return ['0', 'kb/s'];
    // Format: "17Mb/s" or "289kb/s" - extract number and unit
    const match = speed.match(/^(\d+\.?\d*)([a-zA-Z]+)\/s$/);
    if (match) {
      return [match[1], `${match[2]}/s`];
    }
    return [speed, ''];
  };
  const [downloadValue, downloadUnit] = parseSpeed(downloadSpeed);
  const [uploadValue, uploadUnit] = parseSpeed(uploadSpeed);
  
  // Helper function to generate compact network chart
  const generateCompactChart = (data: typeof networkHistory, dataKey: 'download' | 'upload', color: string) => {
    if (!data || data.length === 0) return null;
    
    const values = data.slice(-30).map(d => d[dataKey]); // Last 30 points
    const maxValue = Math.max(...values, 1);
    const minValue = Math.min(...values, 0);
    const range = maxValue - minValue || 1;
    
    const width = 60;
    const height = 20;
    const padding = 1;
    
    const points = values.map((value, index) => {
      const x = (index / (values.length - 1 || 1)) * width;
      const y = height - padding - ((value - minValue) / range) * (height - padding * 2);
      return { x, y };
    });
    
    if (points.length < 2) return null;
    
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpX = (prev.x + curr.x) / 2;
      path += ` Q ${prev.x + (curr.x - prev.x) / 4} ${prev.y}, ${cpX} ${(prev.y + curr.y) / 2}`;
      path += ` Q ${curr.x - (curr.x - prev.x) / 4} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    
    const areaPath = `${path} L ${width} ${height} L 0 ${height} Z`;
    
    return { path, areaPath, gradientId: `header-gradient-${dataKey}` };
  };
  
  // Generate compact charts from network history
  const downloadChart = networkHistory && networkHistory.length > 0 ? generateCompactChart(networkHistory, 'download', '#3b82f6') : null;
  const uploadChart = networkHistory && networkHistory.length > 0 ? generateCompactChart(networkHistory, 'upload', '#10b981') : null;
  
  const wifiStatus = 'OK';
  const phoneStatus = 'OK'; // Phone line status - would need API endpoint to get real status
  const connectionState = connectionStatus?.state === 'up' ? 'UP' : 'DOWN';
  const ipv4 = connectionStatus?.ipv4 || '--';

  // Get simplified display name based on model (e.g., "Freebox Ultra", "Freebox Pop")
  const model = getModel();
  const boxName = getDisplayName(model);

  // Update page title based on page type and model
  useEffect(() => {
    if (pageType === 'dashboard') {
      document.title = 'MynetworK - Dashboard Multi-Sources';
    } else if (pageType === 'freebox') {
      const modelSuffix = model === 'unknown' ? '' : ` ${model.charAt(0).toUpperCase() + model.slice(1)}`;
      document.title = `Freebox OS${modelSuffix}`;
    } else if (pageType === 'unifi') {
      document.title = 'UniFi Controller - MynetworK';
    } else if (pageType === 'search') {
      document.title = 'Recherche - MynetworK';
    } else {
      document.title = 'MynetworK';
    }
  }, [pageType, model]);

  // Freebox session status (for visual indicator in header)
  const { isLoggedIn: isFreeboxLoggedIn } = useAuthStore();
  
  // Update check info
  const { updateInfo } = useUpdateStore();

  // Determine if we should show Freebox info
  // Only show Freebox badges on Freebox page, NEVER on dashboard
  // Strict check: must be exactly 'freebox' page type AND have connectionStatus
  // IMPORTANT: Even if connectionStatus exists on dashboard, we NEVER show Freebox badges there
  const showFreeboxInfo = pageType === 'freebox' && !!connectionStatus;
  const showSystemInfo = pageType === 'dashboard';
  
  // Safety check: ensure showFreeboxInfo is false on dashboard (even if connectionStatus exists)
  const finalShowFreeboxInfo = showFreeboxInfo && pageType !== 'dashboard';
  
  // Debug: log if badges would show on dashboard (should never happen)
  // Removed verbose debug log - was spamming console
  // if (pageType === 'dashboard' && connectionStatus && process.env.NODE_ENV === 'development') {
  //   console.warn('[Header] Dashboard page with connectionStatus - Freebox badges should NOT show', {
  //     pageType,
  //     hasConnectionStatus: !!connectionStatus,
  //     showFreeboxInfo,
  //     finalShowFreeboxInfo
  //   });
  // }

  return (
    <header className="flex flex-col md:flex-row items-center justify-between p-4 bg-theme-header border-b border-theme gap-4 relative z-40" style={{ backdropFilter: 'var(--backdrop-blur)' }}>
      {/* Logo / Box identifier */}
      <div className="flex items-center gap-3 bg-theme-secondary px-3 py-2 rounded-lg border border-theme">
        {pageType === 'dashboard' ? (
          <>
            <img src={logoMynetworK} alt="MynetworK" className="w-12 h-12 flex-shrink-0" />
            <div className="flex flex-col leading-tight relative">
              <span className="font-semibold text-theme-primary">MynetworK</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400 font-normal">{getVersionString()}</span>
                {updateInfo?.updateAvailable && updateInfo.enabled && (
                  <span className="text-[9px] font-semibold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/30">
                    Nouvelle version disponible
                  </span>
                )}
              </div>
            </div>
          </>
        ) : pageType === 'freebox' ? (
          <>
            <img src={logoUltra} alt="Freebox Ultra" className="w-7 h-7 flex-shrink-0" />
            <div className="flex flex-col leading-tight">
              <span className="font-semibold text-theme-primary">{boxName}</span>
              <span className="text-[10px] text-gray-400 font-normal">{getVersionString()}</span>
            </div>
          </>
        ) : pageType === 'unifi' ? (
          <>
            <div className="w-7 h-7 flex items-center justify-center">
              {/* UniFi icon (custom SVG, same color palette as original) */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="w-7 h-7"
              >
                <path
                  fill="#1fb0ec"
                  d="M5.343 4.222h1.099v1.1H5.343zm7.438 14.435a7.2 7.2 0 0 1-3.51-.988a6.5 6.5 0 0 0 2.947 3.936l.66.364c5.052-.337 8.009-3.6 8.009-7.863v-.924c-1.201 3.918-3.995 5.66-8.106 5.475m-4.107-2.291V8.355H7.562v4.1H6.448V10h-1.11v1.1H4.225V5.042H3.113v9.063c0 4.508 3.3 7.9 8.888 7.9a6.82 6.82 0 0 1-3.327-5.639M7.562 4.772h1.112v1.1H7.562zM3.113 2h1.112v1.111H3.113zm2.231 5.805h1.1v1.1h-1.1zm1.111-1.649h1.1v1.1h-1.1zm-.006-3.045h1.113V4.21H6.449zm8.876 2.677v10.577a9 9 0 0 1-.164 1.7c2.671-.486 4.414-2.137 5.3-5.014l.431-1.407V2.012c-5.042 0-5.567 1.931-5.567 3.776"
                />
              </svg>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-semibold text-gray-200">UniFi Controller</span>
              <span className="text-[10px] text-gray-400 font-normal">{getVersionString()}</span>
            </div>
          </>
        ) : pageType === 'search' ? (
          <>
            <div className="w-7 h-7 flex items-center justify-center">
              <Search className="w-7 h-7 text-accent-primary" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-semibold text-theme-primary">Recherche</span>
              <span className="text-[10px] text-gray-400 font-normal">Recherche globale</span>
            </div>
          </>
        ) : (
          <>
            <img src={logoMynetworK} alt="MynetworK" className="w-8 h-8 flex-shrink-0" />
            <div className="flex flex-col leading-tight">
              <span className="font-semibold text-theme-primary">MynetworK</span>
              <span className="text-[10px] text-gray-400 font-normal">{getVersionString()}</span>
            </div>
          </>
        )}
      </div>

      {/* Search bar - Only on dashboard */}
      {pageType === 'dashboard' && onSearchClick && (
        <div className="flex-1 max-w-md mx-4 hidden md:flex">
          <div className="relative w-full">
            <input
              type="text"
              placeholder="Rechercher (nom, MAC, IP, port...)"
              className="w-full px-4 py-2 pl-10 bg-theme-secondary border border-theme rounded-lg text-theme-primary placeholder-theme-tertiary focus:outline-none transition-colors"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && onSearchClick) {
                  const query = (e.target as HTMLInputElement).value.trim();
                  if (query) {
                    sessionStorage.setItem('searchQuery', query);
                    onSearchClick();
                  }
                }
              }}
            />
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-theme-tertiary" />
          </div>
        </div>
      )}

      {/* Date and Time - Only on search page (center) */}
      {pageType === 'search' && (
        <div className="flex-1 flex items-center justify-center mx-4 hidden md:flex">
          <div className="flex items-center gap-2 bg-theme-secondary px-3 py-2 rounded-lg border border-theme">
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
      )}

      {/* Status badges and actions */}
      <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-hide" style={{ overflowY: 'visible' }}>
        {/* Dashboard: Compact network chart (Freebox only) */}
        {pageType === 'dashboard' && connectionStatus && (connectionStatus.rate_down != null || connectionStatus.rate_up != null) && (
          <div className="flex items-center gap-3 bg-theme-secondary px-3 py-2 rounded-lg border border-theme min-w-[280px] max-w-[280px]">
            {/* Download chart */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {downloadChart ? (
                <div className="relative w-[60px] h-[20px] flex-shrink-0">
                  <svg viewBox="0 0 60 20" preserveAspectRatio="none" className="w-full h-full">
                    <defs>
                      <linearGradient id={downloadChart.gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={downloadChart.areaPath} fill={`url(#${downloadChart.gradientId})`} />
                    <path d={downloadChart.path} fill="none" stroke="#3b82f6" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              ) : (
                <div className="relative w-[60px] h-[20px] bg-gray-800/50 rounded flex-shrink-0" />
              )}
              <div className="flex items-center gap-1 min-w-0">
                <ArrowDown size={12} className="text-blue-400 flex-shrink-0" />
                <span className="text-xs font-semibold text-white whitespace-nowrap">{downloadValue}</span>
                <span className="text-[10px] text-gray-400 whitespace-nowrap">{downloadUnit}</span>
              </div>
            </div>
            <div className="w-px h-4 bg-gray-700 flex-shrink-0" />
            {/* Upload chart */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {uploadChart ? (
                <div className="relative w-[60px] h-[20px] flex-shrink-0">
                  <svg viewBox="0 0 60 20" preserveAspectRatio="none" className="w-full h-full">
                    <defs>
                      <linearGradient id={uploadChart.gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={uploadChart.areaPath} fill={`url(#${uploadChart.gradientId})`} />
                    <path d={uploadChart.path} fill="none" stroke="#10b981" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              ) : (
                <div className="relative w-[60px] h-[20px] bg-gray-800/50 rounded flex-shrink-0" />
              )}
              <div className="flex items-center gap-1 min-w-0">
                <ArrowUp size={12} className="text-green-400 flex-shrink-0" />
                <span className="text-xs font-semibold text-white whitespace-nowrap">{uploadValue}</span>
                <span className="text-[10px] text-gray-400 whitespace-nowrap">{uploadUnit}</span>
              </div>
            </div>
          </div>
        )}

        {/* Dashboard: System stats only */}
        {showSystemInfo && systemInfo && (
          <>
            <div
              ref={cpuRef}
              className="cursor-pointer"
              onMouseEnter={() => setShowCpuTooltip(true)}
              onMouseLeave={() => setShowCpuTooltip(false)}
            >
              <StatusBadge
                icon={<Cpu size={16} />}
                value={cpuTemp}
                color="text-emerald-400"
              />
            </div>
            <Tooltip
              show={showCpuTooltip}
              title="Températures CPU"
              items={cpuSensors}
              color="text-emerald-400"
              unit="°C"
              parentRef={cpuRef}
              pluginName="Freebox"
            />
            {hddSensors.length > 0 && (
              <>
                <div
                  ref={hddRef}
                  className="cursor-pointer"
                  onMouseEnter={() => setShowHddTooltip(true)}
                  onMouseLeave={() => setShowHddTooltip(false)}
                >
                  <StatusBadge
                    icon={<HardDrive size={16} />}
                    value={hddTemp}
                    color="text-blue-400"
                  />
                </div>
                <Tooltip
                  show={showHddTooltip}
                  title="Températures Disques"
                  items={hddSensors}
                  color="text-blue-400"
                  unit="°C"
                  parentRef={hddRef}
                  pluginName="Freebox"
                />
              </>
            )}
          </>
        )}

        {/* Freebox: All Freebox info */}
        {/* Use finalShowFreeboxInfo to ensure badges never show on dashboard */}
        {finalShowFreeboxInfo && (
          <>
            {/* Network speeds */}
            <div className="flex items-center gap-4 bg-theme-secondary px-3 py-2 rounded-lg border border-theme mx-2">
              <div className="flex items-center gap-2">
                <ArrowDown size={16} className="text-blue-400" />
                <span className="text-sm font-medium">{downloadSpeed}</span>
              </div>
              <div className="w-px h-4 bg-gray-700" />
              <div className="flex items-center gap-2">
                <ArrowUp size={16} className="text-green-400" />
                <span className="text-sm font-medium">{uploadSpeed}</span>
              </div>
            </div>

            {/* CPU Temperature badge with tooltip */}
            <div
              ref={cpuRef}
              className="cursor-pointer"
              onMouseEnter={() => setShowCpuTooltip(true)}
              onMouseLeave={() => setShowCpuTooltip(false)}
            >
              <StatusBadge
                icon={<Cpu size={16} />}
                value={cpuTemp}
                color="text-emerald-400"
              />
            </div>
            <Tooltip
              show={showCpuTooltip}
              title="Températures CPU"
              items={cpuSensors}
              color="text-emerald-400"
              unit="°C"
              parentRef={cpuRef}
              pluginName="Freebox"
            />

            {/* HDD Temperature badge with tooltip */}
            {hddSensors.length > 0 && (
              <>
                <div
                  ref={hddRef}
                  className="cursor-pointer"
                  onMouseEnter={() => setShowHddTooltip(true)}
                  onMouseLeave={() => setShowHddTooltip(false)}
                >
                  <StatusBadge
                    icon={<HardDrive size={16} />}
                    value={hddTemp}
                    color="text-blue-400"
                  />
                </div>
                <Tooltip
                  show={showHddTooltip}
                  title="Températures Disques"
                  items={hddSensors}
                  color="text-blue-400"
                  unit="°C"
                  parentRef={hddRef}
                  pluginName="Freebox"
                />
              </>
            )}

            {/* Fan badge with tooltip */}
            <div
              ref={fanRef}
              className="cursor-pointer"
              onMouseEnter={() => setShowFanTooltip(true)}
              onMouseLeave={() => setShowFanTooltip(false)}
            >
              <StatusBadge
                icon={<Fan size={16} />}
                value={fanDisplay}
                color="text-orange-400"
              />
            </div>
            <Tooltip
              show={showFanTooltip}
              title="Ventilateurs"
              items={fans}
              color="text-orange-400"
              unit=" T/min"
              parentRef={fanRef}
              pluginName="Freebox"
            />

            <StatusBadge
              icon={<Wifi size={16} />}
              value={wifiStatus}
              color="text-green-400"
            />
            <StatusBadge
              icon={<Phone size={16} />}
              value={phoneStatus}
              color={phoneStatus === 'OK' ? 'text-green-400' : 'text-red-400'}
            />
            <StatusBadge
              icon={<Activity size={16} />}
              value={connectionState}
              color={connectionState === 'UP' ? 'text-green-400' : 'text-red-400'}
            />

            {/* IPv4 */}
            <div className="hidden lg:flex items-center gap-2 bg-theme-secondary px-3 py-2 rounded-lg border border-theme ml-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-sm font-mono text-theme-secondary">{ipv4} (IPv4)</span>
            </div>
          </>
        )}

        {/* UniFi: UniFi stats badges */}
        {pageType === 'unifi' && unifiStats && (() => {
            const devices = Array.isArray(unifiStats.devices) ? (unifiStats.devices as any[]) : [];
            const totalDevices = devices.length;
            const activeDevices = devices.filter((d: any) => d.active !== false).length;
            const hasNetworkTraffic =
              !!unifiStats.network &&
              !!((unifiStats.network as any).download || (unifiStats.network as any).upload);

            // Any device (non-client) with an available update
            const nonClientDevices = devices.filter(
              (d: any) => (d.type || '').toString().toLowerCase() !== 'client'
            );
            const anyUpgradable = nonClientDevices.some(
              (d: any) =>
                d.upgradable === true || !!d.upgrade_to_firmware || !!d.required_version
            );

            // Clients per SSID (wireless only)
            const clients = devices.filter((d: any) => {
              const type = (d.type || '').toString().toLowerCase();
              const isClient = type === 'client';
              const isWireless =
                d.is_wired === false || !!d.radio || !!d.ssid || !!d.essid;
              return isClient && isWireless;
            });
            const ssidCounts = new Map<string, number>();
            for (const c of clients) {
              const rawSsid = (c.ssid || c.essid || '') as string;
              const ssid = rawSsid.trim() || 'SSID inconnu';
              ssidCounts.set(ssid, (ssidCounts.get(ssid) || 0) + 1);
            }
            const ssidEntries = Array.from(ssidCounts.entries()).sort(
              (a, b) => b[1] - a[1]
            );
            const topSsidEntries = ssidEntries.slice(0, 3);

            return (
              <>
                {/* Network speeds */}
                {hasNetworkTraffic && (
                  <div className="flex items-center gap-4 bg-theme-secondary px-3 py-2 rounded-lg border border-theme mx-2">
                    <div className="flex items-center gap-2">
                      <ArrowDown size={16} className="text-blue-400" />
                      <span className="text-sm font-medium">{formatSpeed(unifiStats.network.download || 0)}</span>
                    </div>
                    <div className="w-px h-4 bg-gray-700" />
                    <div className="flex items-center gap-2">
                      <ArrowUp size={16} className="text-green-400" />
                      <span className="text-sm font-medium">{formatSpeed(unifiStats.network.upload || 0)}</span>
                    </div>
                  </div>
                )}

                {/* Uptime badge */}
                {unifiStats.system?.uptime && (
                  <StatusBadge
                    icon={<Activity size={16} />}
                    value={`${Math.floor((unifiStats.system.uptime || 0) / 3600)}h`}
                    color="text-cyan-400"
                  />
                )}

                {/* Update available badge (any UniFi device) */}
                {anyUpgradable && (
                  <StatusBadge
                    icon={<AlertTriangle size={16} />}
                    value="MAJ dispo"
                    color="text-amber-300"
                  />
                )}

                {/* Devices count badge */}
                {totalDevices > 0 && (
                  <StatusBadge
                    icon={
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        className="w-4 h-4"
                      >
                        <path
                          fill="currentColor"
                          d="M5.343 4.222h1.099v1.1H5.343zm7.438 14.435a7.2 7.2 0 0 1-3.51-.988a6.5 6.5 0 0 0 2.947 3.936l.66.364c5.052-.337 8.009-3.6 8.009-7.863v-.924c-1.201 3.918-3.995 5.66-8.106 5.475m-4.107-2.291V8.355H7.562v4.1H6.448V10h-1.11v1.1H4.225V5.042H3.113v9.063c0 4.508 3.3 7.9 8.888 7.9a6.82 6.82 0 0 1-3.327-5.639M7.562 4.772h1.112v1.1H7.562zM3.113 2h1.112v1.111H3.113zm2.231 5.805h1.1v1.1h-1.1zm1.111-1.649h1.1v1.1h-1.1zm-.006-3.045h1.113V4.21H6.449zm8.876 2.677v10.577a9 9 0 0 1-.164 1.7c2.671-.486 4.414-2.137 5.3-5.014l.431-1.407V2.012c-5.042 0-5.567 1.931-5.567 3.776"
                        />
                      </svg>
                    }
                    value={`${totalDevices} devices`}
                    color="text-unifi-accent"
                  />
                )}

                {/* Active devices count */}
                {activeDevices > 0 && (
                  <StatusBadge
                    icon={<Activity size={16} />}
                    value={`${activeDevices} actifs`}
                    color="text-green-400"
                  />
                )}

                {/* Clients per SSID summary */}
                {topSsidEntries.length > 0 && (
                  <div className="hidden lg:flex items-center gap-2 bg-theme-secondary px-3 py-2 rounded-lg border border-theme ml-2">
                    {topSsidEntries.map(([ssid, count]) => (
                      <div key={ssid} className="flex items-center gap-1 text-xs text-sky-300">
                        <Wifi size={14} className="text-sky-400" />
                        <span className="font-medium">
                          {ssid}: {count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}

        {/* Date and Time - Dashboard only (next to user menu, like admin page) */}
        {pageType === 'dashboard' && (
          <div className="flex items-center gap-2 bg-[#1a1a1a] px-3 py-2 rounded-lg border border-gray-700">
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
        )}

        {/* User Menu */}
        {user && user.username && (
          <UserMenu
            user={user}
            onSettingsClick={onSettingsClick}
            onAdminClick={onAdminClick}
            onProfileClick={onProfileClick}
            onLogout={onLogout}
          />
        )}
      </div>
    </header>
  );
};
