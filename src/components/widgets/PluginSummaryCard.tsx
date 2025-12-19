/**
 * Plugin Summary Card
 * 
 * Displays a summary card for a specific plugin with key statistics
 */

import React from 'react';
import { Card } from './Card';
import { BarChart } from './BarChart';
import { StatusBadge } from '../ui';
import { usePluginStore } from '../../stores/pluginStore';
import { useConnectionStore } from '../../stores';
import { useAuthStore } from '../../stores/authStore';
import { useSystemStore } from '../../stores/systemStore';
import { formatSpeed, formatTemperature } from '../../utils/constants';
import { Server, Wifi, Activity, ArrowRight, CheckCircle, XCircle, AlertCircle, Cpu, HardDrive, Fan, Phone, ArrowDown, ArrowUp } from 'lucide-react';
import type { SystemSensor, SystemFan } from '../../types/api';

interface PluginSummaryCardProps {
    pluginId: string;
    onViewDetails?: () => void;
}

// Helper functions for Freebox stats (copied from Header.tsx)
const getCpuSensors = (info: any): SystemSensor[] => {
    if (!info) return [];
    if (info.sensors && Array.isArray(info.sensors)) {
        return info.sensors
            .filter((s: any) => s.id.startsWith('temp_cpu'))
            .sort((a: any, b: any) => a.id.localeCompare(b.id));
    }
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

const getHddSensors = (info: any): SystemSensor[] => {
    if (!info) return [];
    if (info.sensors && Array.isArray(info.sensors)) {
        return info.sensors
            .filter((s: any) => s.id.startsWith('temp_hdd') || s.id.includes('disk'))
            .sort((a: any, b: any) => a.id.localeCompare(b.id));
    }
    return [];
};

const getAvgTemp = (sensors: SystemSensor[]): number | null => {
    if (sensors.length === 0) return null;
    const avg = sensors.reduce((sum, s) => sum + s.value, 0) / sensors.length;
    return Math.round(avg);
};

const getFans = (info: any): SystemFan[] => {
    if (!info) return [];
    if (info.fans && Array.isArray(info.fans)) {
        return info.fans.sort((a: any, b: any) => a.name.localeCompare(b.name));
    }
    if (info.fan_rpm != null) {
        return [{ id: 'fan_rpm', name: 'Ventilateur', value: info.fan_rpm }];
    }
    return [];
};

const getAvgFanRpm = (fans: SystemFan[]): number | null => {
    if (fans.length === 0) return null;
    const avg = fans.reduce((sum, f) => sum + f.value, 0) / fans.length;
    return Math.round(avg);
};

export const PluginSummaryCard: React.FC<PluginSummaryCardProps> = ({ pluginId, onViewDetails }) => {
    const { plugins, pluginStats } = usePluginStore();
    const { status: connectionStatus, history: networkHistory } = useConnectionStore();
    const { login: loginFreebox, isLoggedIn: isFreeboxLoggedIn } = useAuthStore();
    const { info: systemInfo } = useSystemStore();
    
    const plugin = plugins.find(p => p.id === pluginId);
    const stats = pluginStats[pluginId];

    if (!plugin) return null;

    const isActive = plugin.enabled && plugin.connectionStatus;
    const hasStats = stats && (stats.network || stats.devices || stats.system);

    // Helpers for UniFi plugin: derive APs, switches and clients summary
    interface UnifiApRow {
        name: string;
        ip?: string;
        clientsActive: number;
        clientsTotal: number;
    }

    interface UnifiSwitchRow {
        name: string;
        ip?: string;
        activePorts: number;
        totalPorts: number;
    }

    let unifiApRows: UnifiApRow[] = [];
    let unifiSwitchRows: UnifiSwitchRow[] = [];
    let unifiClientsConnected = 0;
    let unifiClientsTotal = 0;
    let unifiControllerVersion: string | undefined;
    let unifiControllerUpdateAvailable: boolean | undefined;
    let unifiControllerIp: string | undefined;
    let unifiWlans: Array<{ name: string; enabled: boolean; ssid?: string }> = [];

    // Helpers for Freebox plugin: firmware / update status when exposed by backend
    let freeboxVersion: string | undefined;
    let freeboxPlayerVersion: string | undefined;
    let freeboxUpdateAvailable: boolean | undefined;
    let freeboxWifiNetworks: Array<{ ssid: string; band: string; enabled: boolean }> = [];

    if (pluginId === 'unifi' && stats) {
        const devices = (stats.devices || []) as Array<any>;
        const clients = devices.filter((d) => d.type === 'client');
        unifiClientsTotal = clients.length;
        unifiClientsConnected = clients.filter((c) => c.active !== false).length;
        
        // Get WiFi networks (SSIDs) from stats
        unifiWlans = (stats.wlans || []) as Array<{ name: string; enabled: boolean; ssid?: string }>;

        // Build rows for APs (bornes Wi‑Fi)
        unifiApRows = devices
            .filter((d) => {
                const t = (d.type || '').toString().toLowerCase();
                return t.startsWith('uap');
            })
            .map((d) => {
                const name = d.name || d.model || d.ip || 'Borne Wi‑Fi';
                const mac = (d.mac || '').toString().toLowerCase();

                const clientsForDevice = clients.filter((client) => {
                    const lastUplinkName = (client.last_uplink_name || client.uplink_name || '') as string;
                    const lastUplinkMac = (client.last_uplink_mac || client.sw_mac || '') as string;
                    return (
                        lastUplinkName === name ||
                        lastUplinkMac.toLowerCase() === mac
                    );
                });

                const clientsActive = clientsForDevice.filter((c) => c.active !== false).length;

                return {
                    name,
                    ip: d.ip as string | undefined,
                    clientsActive,
                    clientsTotal: clientsForDevice.length
                };
            });

        // Build rows for switches
        unifiSwitchRows = devices
            .filter((d) => {
                const t = (d.type || '').toString().toLowerCase();
                return t.startsWith('usw');
            })
            .map((d) => {
                const name = d.name || d.model || d.ip || 'Switch';

                // UniFi switch models expose port information in different fields depending on firmware / API version.
                // We try several common patterns to build a consistent ports array:
                const rawPorts =
                    (d as any).eth_port_table || // le plus fiable sur les firmwares récents
                    (d as any).port_table ||
                    (d as any).ports ||
                    (d as any).port_overrides ||
                    [];
                const ports = Array.isArray(rawPorts) ? (rawPorts as any[]) : [];

                // Total number of ports: prefer explicit array length, then fallback to numeric hint (num_port)
                let totalPorts = 0;
                if (ports.length > 0) {
                    totalPorts = ports.length;
                } else if (typeof (d as any).num_port === 'number' && (d as any).num_port > 0) {
                    totalPorts = (d as any).num_port as number;
                }

                // Active ports: consider several flags commonly used by UniFi
                const activePorts = ports.filter((p) => {
                    const upFlag = p.up === true || p.enable === true;
                    const linkUp = p.link_state === 'up' || p.media === 'GE' || p.media === '10GE';
                    const speedUp = typeof p.speed === 'number' && p.speed > 0;
                    return upFlag || linkUp || speedUp;
                }).length;

                return {
                    name,
                    ip: d.ip as string | undefined,
                    activePorts,
                    totalPorts
                };
            });

        // Controller IP from plugin settings URL (hostname part)
        const url = plugin.settings?.url as string | undefined;
        if (url) {
            try {
                const parsed = new URL(url);
                unifiControllerIp = parsed.hostname;
            } catch {
                // If URL parsing fails, fallback to raw string
                unifiControllerIp = url;
            }
        }

        // Controller version / update status from system stats when exposed by backend
        const sys: any = (stats as any).system || {};
        unifiControllerVersion = sys.version as string | undefined;
        unifiControllerUpdateAvailable =
            (sys.updateAvailable as boolean | undefined) ?? (sys.update_available as boolean | undefined);
    }

    if (pluginId === 'freebox' && stats && (stats as any).system) {
        const sys: any = (stats as any).system;
        // Box firmware: prefer normalized field from backend, then raw system fields as fallback
        freeboxVersion =
            (sys.firmware as string | undefined) ||
            (sys.firmware_version as string | undefined) ||
            (sys.version as string | undefined);

        // Player firmware (only displayed when backend / API exposes it)
        freeboxPlayerVersion =
            (sys.playerFirmware as string | undefined) ||
            (sys.player_firmware as string | undefined) ||
            (sys.player_firmware_version as string | undefined) ||
            (sys.player_version as string | undefined);
        freeboxUpdateAvailable =
            (sys.updateAvailable as boolean | undefined) ?? (sys.update_available as boolean | undefined);
    }

    // Current Freebox speed values (used for the "État de la Freebox" graph)
    const currentDownload = connectionStatus
        ? formatSpeed(connectionStatus.rate_down)
        : '-- kb/s';
    const currentUpload = connectionStatus
        ? formatSpeed(connectionStatus.rate_up)
        : '-- kb/s';

    // Get icon based on plugin
    const getIcon = () => {
        switch (pluginId) {
            case 'freebox':
                return (
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="25 23.39 550 203.23"
                        className="h-6"
                    >
                        <path
                            d="m 187.24133,23.386327 c -14.98294,0.01847 -31.16732,4.917913 -41.74251,9.8272 l 0,-0.03081 c -17.70535,8.087262 -29.24956,16.441925 -37.86091,25.630825 -8.274459,8.82635 -13.79935,18.347312 -19.6236,28.9271 l -32.007722,0 c -0.927639,0 -1.76557,0.528637 -2.187247,1.355475 l -4.189654,8.194475 c -0.389391,0.763987 -0.354765,1.672163 0.09242,2.402888 0.447184,0.73072 1.268849,1.17064 2.125634,1.17064 l 30.313378,0 -56.930003,121.03787 c -0.434171,0.92135 -0.243567,2.03654 0.462094,2.77256 l 1.139832,1.17064 c 0.558802,0.58297 1.358434,0.86405 2.15644,0.73935 l 23.227934,-3.60434 c 0.772991,-0.11988 1.456644,-0.60023 1.81757,-1.29386 l 62.814004,-120.82222 39.95574,0 c 0.89584,0 1.71899,-0.48182 2.15644,-1.263065 l 4.55933,-8.194463 c 0.42512,-0.761537 0.41033,-1.682025 -0.0308,-2.4337 -0.44115,-0.752912 -1.2532,-1.23225 -2.12564,-1.23225 l -37.89172,0 11.58316,-23.844062 0.0308,-0.0308 c 2.64355,-5.680688 5.57101,-11.577 10.41252,-15.988463 2.42384,-2.211887 5.31224,-4.079988 8.99544,-5.421913 3.68196,-1.340687 8.17722,-2.155199 13.73959,-2.156437 3.99619,-0.0038 7.9776,0.940212 11.95284,1.9408 3.97524,0.988263 7.91475,2.054163 11.98364,2.064025 2.12317,0.0025 4.06766,-0.5422 5.69916,-1.386287 2.45711,-1.27415 4.25866,-3.180438 5.48352,-5.083038 0.61243,-0.956225 1.08562,-1.906287 1.41709,-2.834175 0.32901,-0.93405 0.51754,-1.834825 0.5237,-2.772562 0.002,-0.941438 -0.20331,-1.859475 -0.58531,-2.68015 -0.67527,-1.445425 -1.82004,-2.48545 -3.08062,-3.265463 -1.90753,-1.169412 -4.18351,-1.838525 -6.65417,-2.279662 -2.47066,-0.433763 -5.12,-0.6149 -7.73237,-0.616125 z M 390.68599,74.98684 c -28.09779,0.0099 -55.87396,8.808125 -76.76925,21.656812 -10.44703,6.432348 -19.18737,13.899788 -25.38437,21.872458 -6.1859,7.96527 -9.85062,16.49443 -9.858,25.07632 -0.002,3.65633 0.82683,7.3993 2.68013,10.87461 2.7775,5.22215 7.83219,9.8012 15.43395,13.00025 7.61039,3.20719 17.78878,5.0807 31.14515,5.08304 34.03231,0.004 62.25209,-11.37134 87.55144,-25.81567 0.75045,-0.42882 1.24581,-1.22991 1.26306,-2.09482 0.0185,-0.86405 -0.43745,-1.69768 -1.17063,-2.15644 l -5.32949,-3.32707 c -0.7258,-0.45495 -1.63643,-0.50537 -2.40289,-0.12323 -21.47691,10.70185 -43.58843,18.02881 -65.09368,18.02166 -8.69352,0.009 -16.19301,-1.32947 -21.25632,-3.66593 -2.53598,-1.16104 -4.45705,-2.54104 -5.66836,-4.03563 -1.20884,-1.50705 -1.77444,-3.0672 -1.78677,-4.95981 0.005,-4.40594 0.57297,-8.50763 2.24887,-12.7538 20.33528,-1.05164 47.90178,-3.83477 70.85443,-9.64238 11.76924,-2.98697 22.31238,-6.7441 30.12854,-11.61396 3.90624,-2.44109 7.16678,-5.1656 9.48834,-8.3177 2.32032,-3.139773 3.67334,-6.783535 3.66595,-10.689773 0.004,-1.733775 -0.40788,-3.384987 -1.17064,-4.836587 -1.34315,-2.555688 -3.61666,-4.438563 -6.31529,-5.9148 -4.06642,-2.2082 -9.2579,-3.567375 -14.87943,-4.436113 -5.6203,-0.8601 -11.65463,-1.200212 -17.37474,-1.201437 z m 144.57386,0 c -28.09655,0.0099 -55.83946,8.808125 -76.73844,21.656812 -10.44826,6.432348 -19.18615,13.899788 -25.38437,21.872458 -6.18714,7.96527 -9.88142,16.49443 -9.88881,25.07632 -0.002,3.65633 0.82684,7.3993 2.68015,10.87461 2.77749,5.22215 7.83341,9.8012 15.43394,13.00025 7.61038,3.20719 17.78877,5.0807 31.14515,5.08304 34.0434,0.004 62.2521,-11.37232 87.55143,-25.81567 0.75168,-0.42882 1.24458,-1.22978 1.26307,-2.09482 0.0172,-0.86344 -0.43868,-1.69681 -1.17064,-2.15644 l -5.32949,-3.32707 c -0.7258,-0.45434 -1.63642,-0.50537 -2.40289,-0.12323 -21.48922,10.70185 -43.60073,18.02881 -65.09366,18.02166 -8.69354,0.009 -16.19301,-1.32947 -21.25634,-3.66593 -2.53597,-1.16104 -4.42625,-2.54104 -5.63755,-4.03563 -1.20883,-1.50705 -1.80525,-3.0672 -1.81756,-4.95981 0.005,-4.4016 0.57826,-8.50277 2.24885,-12.7538 20.33739,-1.05066 47.89511,-3.83249 70.85444,-9.64238 11.768,-2.98697 22.31361,-6.7441 30.12855,-11.61396 3.905,-2.44109 7.16676,-5.1656 9.48832,-8.3177 2.3191,-3.139773 3.67458,-6.784773 3.66595,-10.689773 0.004,-1.733775 -0.40787,-3.384987 -1.17063,-4.836587 -1.34315,-2.55445 -3.61667,-4.438563 -6.31529,-5.9148 -4.0652,-2.2082 -9.26036,-3.567375 -14.87944,-4.436113 -5.61536,-0.8601 -11.66325,-1.200212 -17.37474,-1.201437 z m -311.79033,2.341275 c -5.07688,0.0061 -10.61832,1.282775 -16.29653,3.234662 -8.51116,2.933988 -17.33407,7.424313 -24.95309,11.891226 -7.62023,4.471837 -14.01438,8.903007 -17.68279,11.706387 -0.62845,0.47934 -0.97964,1.24334 -0.955,2.03321 0.0247,0.78988 0.42144,1.53045 1.07822,1.9716 l 4.95981,3.32708 c 0.81451,0.54712 1.88534,0.56191 2.71095,0.0308 2.97835,-1.91862 8.31646,-5.16067 14.10928,-7.88641 2.89456,-1.36288 5.90001,-2.60251 8.74898,-3.48111 2.84526,-0.882292 5.53404,-1.38998 7.73238,-1.38628 1.99255,0.0061 3.18166,0.553275 3.88158,1.139825 0.70732,0.586545 0.90817,1.264285 0.89338,1.478695 0.005,0.36968 -0.0936,1.1004 -0.33886,1.94081 -0.7184,2.55938 -2.54337,6.1933 -3.88159,8.37931 l -0.0308,0.0616 -29.97452,54.03421 c -0.19715,0.30807 -0.4436,0.68155 -0.67773,1.17064 -0.22797,0.48663 -0.45839,1.12259 -0.46209,1.9408 -0.001,0.53381 0.14664,1.02868 0.33886,1.41709 0.37338,0.73306 0.84164,1.16189 1.29386,1.5095 0.80098,0.58866 1.66232,0.96127 2.64935,1.32467 1.4713,0.53147 3.19523,0.95882 4.99062,1.26307 1.79416,0.30078 3.65855,0.49141 5.36028,0.4929 3.45278,-0.001 6.71332,-0.0447 9.33432,-0.27727 1.31727,-0.11977 2.4608,-0.28206 3.4811,-0.55451 0.51385,-0.13911 1.00675,-0.31816 1.50951,-0.58531 0.4892,-0.27245 1.06344,-0.64299 1.50951,-1.4171 l 0.0308,-0.0308 6.839,-12.53815 c 6.22878,-9.9283 16.02539,-24.27044 27.38678,-36.04336 5.6967,-5.90864 11.768,-11.15557 17.92925,-14.87943 6.16496,-3.73372 12.3755,-5.91974 18.32973,-5.91481 4.2981,-0.01 9.23327,0.7603 14.07848,0.77016 3.29627,0.002 6.14154,-0.69869 8.53334,-1.87919 3.59817,-1.76951 6.08855,-4.530985 7.63996,-7.301085 0.77755,-1.389975 1.3259,-2.77995 1.69434,-4.097237 0.36721,-1.3185 0.55328,-2.568 0.55451,-3.69675 0.004,-1.4368 -0.32531,-2.85635 -1.04741,-4.097238 -0.53727,-0.93035 -1.28278,-1.751025 -2.15644,-2.402887 -1.31728,-0.9784 -2.91428,-1.611788 -4.74416,-2.033213 -1.83237,-0.4202 -3.90132,-0.614887 -6.28449,-0.616125 -6.58638,0.01238 -13.6176,2.33635 -20.70181,5.822388 -10.61708,5.244462 -21.38695,13.213425 -30.52903,20.825047 -4.0492,3.37288 -7.707,6.61989 -10.93622,9.58075 l 8.00962,-14.910235 0.0308,-0.03081 c 1.1694,-2.220513 2.14165,-4.280838 2.86498,-6.16125 0.36105,-0.94145 0.68021,-1.859475 0.89339,-2.710963 0.21071,-0.85395 0.3364,-1.663537 0.33886,-2.4953 0.0111,-1.795387 -0.55204,-3.505762 -1.60193,-4.8674 -0.78001,-1.025225 -1.79292,-1.850837 -2.92658,-2.4953 -1.70544,-0.966087 -3.71155,-1.571125 -5.97643,-1.9716 -2.26364,-0.396787 -4.80085,-0.584087 -7.57834,-0.585325 z M 381.937,86.200327 c 4.66408,-0.0086 8.2068,0.818213 10.32011,2.0024 1.06343,0.589025 1.75966,1.23965 2.18724,1.879188 0.42636,0.6457 0.60996,1.284 0.61613,2.094825 -0.004,2.230375 -0.59148,4.240175 -1.72515,6.222875 -1.97407,3.458925 -5.78419,6.741635 -10.99784,9.580755 -7.80507,4.27345 -18.62794,7.57094 -30.31338,9.8272 -10.16586,1.96993 -20.99063,3.19288 -31.11435,3.72756 1.5237,-2.24361 3.57388,-4.80537 6.06884,-7.45513 6.01831,-6.41264 14.5455,-13.45371 24.18294,-18.822635 9.63866,-5.38 20.38142,-9.065662 30.77546,-9.057037 z m 144.57388,0 c 4.66406,-0.0086 8.21295,0.819438 10.3201,2.0024 1.05973,0.587788 1.76089,1.238413 2.18724,1.879188 0.4239,0.6457 0.60997,1.282775 0.61612,2.094825 -0.004,2.231612 -0.59024,4.240175 -1.72515,6.222875 -1.97282,3.458925 -5.78541,6.741635 -10.99784,9.580755 -7.80261,4.27345 -18.5996,7.57094 -30.28257,9.8272 -10.17496,1.97191 -21.01299,3.19371 -31.14514,3.72756 1.52363,-2.24361 3.57386,-4.80537 6.06883,-7.45513 6.01955,-6.41264 14.57507,-13.45371 24.21373,-18.822635 9.64114,-5.38 20.3457,-9.065662 30.74468,-9.057037 z"
                            style={{ fill: '#cd1e25', fillOpacity: 1, fillRule: 'nonzero', stroke: 'none' }}
                        />
                    </svg>
                );
            case 'unifi':
                return (
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
                );
            default:
                return <Activity size={20} className="text-gray-400" />;
        }
    };

    return (
        <Card
            title={
                <div className="flex items-center gap-2">
                    {getIcon()}
                    <span>{plugin.name}</span>
                </div>
            }
            actions={
                <div className="flex items-center gap-2">

                    {pluginId === 'freebox' && (
                        <button
                            onClick={() => {
                                loginFreebox().catch(() => {});
                            }}
                            className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1 transition-colors px-2 py-1 rounded border border-gray-700/60 bg-[#1a1a1a] hover:bg-[#252525]"
                            title={isFreeboxLoggedIn ? 'Rafraîchir la session Freebox' : 'Se reconnecter à la Freebox'}
                        >
                            <span className="w-1.5 h-1.5 rounded-full mr-1"
                                  style={{ backgroundColor: isFreeboxLoggedIn ? '#22c55e' : '#ef4444' }} />
                            <span>Auth</span>
                        </button>
                    )}
                    {onViewDetails && (
                        <button
                            onClick={onViewDetails}
                            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 rounded border border-blue-500/30"
                        >
                            Accéder
                            <ArrowRight size={14} />
                        </button>
                    )}
                </div>
            }
        >
            <div className="flex flex-col h-full">
                <div className="space-y-4 flex-1">
                {/* Status */}
                <div className="flex items-center gap-2">
                    {isActive ? (
                         <div className="flex items-center gap-1.5 text-green-400 text-xs">
                    
                     </div> 
                    ) : plugin.enabled ? (
                        <div className="flex items-center gap-1.5 text-yellow-400 text-xs">
                            <AlertCircle size={14} />
                            <span>Configuration requise</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                            <XCircle size={14} />
                            <span>Désactivé</span>
                        </div>
                    )}
                </div>

                {/* Error/Warning indicator for enabled but not connected plugins */}
                {plugin.enabled && !plugin.connectionStatus && (
                    <div className="bg-red-900/20 border border-red-700/60 rounded-lg p-2.5 space-y-1">
                        <div className="flex items-center gap-2 text-red-300 text-xs font-medium">
                            <AlertCircle size={14} />
                            <span>Problème de connexion</span>
                        </div>
                        <p className="text-[11px] text-red-400/80 pl-6">
                            {pluginId === 'unifi' 
                                ? 'Vérifiez l\'URL, les identifiants et le nom du site dans la configuration.'
                                : pluginId === 'freebox'
                                ? 'Vérifiez la connexion à l\'API Freebox.'
                                : 'Vérifiez la configuration du plugin.'}
                        </p>
                        <p className="text-[10px] text-red-500/60 pl-6 italic">
                            Consultez les logs backend pour plus de détails.
                        </p>
                    </div>
                )}

                {/* Stats / résumé */}
                {hasStats && isActive && stats ? (
                    <div className="space-y-3">
                        {/* Network Stats (plugin-level, all plugins) */}
                        {pluginId !== 'freebox' && stats.network && (stats.network.download > 0 || stats.network.upload > 0) && (
                            <div className="bg-[#1a1a1a] rounded-lg p-3 space-y-2">
                                <h4 className="text-xs text-gray-400">Débit (plugin)</h4>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <span className="text-gray-500">↓</span>
                                        <span className="ml-1 text-blue-400 font-semibold">
                                            {formatSpeed(stats.network.download || 0)}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">↑</span>
                                        <span className="ml-1 text-green-400 font-semibold">
                                            {formatSpeed(stats.network.upload || 0)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Devices (generic counter: total number of devices reported by the plugin)
                            For Freebox, we hide this counter to keep the card focused on WAN / DHCP / NAT summary. */}


                        {((unifiControllerVersion || unifiControllerUpdateAvailable !== undefined || unifiControllerIp || (stats.system as any)?.name) && (
                                    <div className="bg-[#1a1a1a] rounded-lg p-3 space-y-2 text-xs">
                                        <div className="flex items-center justify-between">
                                        <span className="text-gray-400">Controller</span>
                                        <div className="flex flex-col items-end gap-0.5 text-gray-200">
                                            {(stats.system as any)?.name && (
                                                <span className="text-[10px] text-gray-300">
                                                    Site&nbsp;:&nbsp;
                                                    <span className="text-gray-100">
                                                        {(stats.system as any).name}
                                                    </span>
                                                </span>
                                            )}
                                            {unifiControllerIp && (
                                                <span className="text-[10px] text-gray-400">
                                                    IP&nbsp;:&nbsp;
                                                    <span className="text-gray-200">{unifiControllerIp}</span>
                                                </span>
                                            )}
                                            <span className="flex items-center gap-2">
                                                {unifiControllerVersion && (
                                                    <span>v{unifiControllerVersion}</span>
                                                )}
                                                {unifiControllerUpdateAvailable && (
                                                    <span className="px-1.5 py-0.5 rounded-full bg-amber-900/40 border border-amber-600 text-amber-300 text-[10px]">
                                                        Mise à jour dispo
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                    </div>
                                ))}                            
 
                                {(unifiClientsTotal > 0 || unifiClientsConnected > 0) && (
                                    <div className="flex flex-col gap-1 pt-1 border-t border-gray-800 mt-1 text-[11px]">
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-400">Clients connectés</span>
                                            <span className="inline-flex items-center justify-end min-w-[2.75rem] px-2 py-0.5 rounded-full bg-emerald-900/40 border border-emerald-700 text-emerald-300 font-semibold">
                                                {unifiClientsConnected}
                                            </span>
                                        </div>
                                <div className="flex items-center justify-between">
                                            <span className="text-gray-400">Total</span>
                                            <span className="inline-flex items-center justify-end min-w-[2.75rem] px-2 py-0.5 rounded-full bg-slate-900/60 border border-slate-700 text-gray-200 font-medium">
                                                {unifiClientsTotal}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* UniFi infrastructure details: APs, switches, clients, controller */}
                        {pluginId === 'unifi' && stats.devices && stats.devices.length > 0 && (
                            <div className="bg-[#1a1a1a] rounded-lg p-3 space-y-2 text-xs">
                                {/* Wi‑Fi APs table */}
                                {unifiApRows.length > 0 && (
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-gray-400">Bornes Wi‑Fi</span>
                                        </div>
                                        <div className="rounded border border-gray-800 overflow-hidden">
                                            <table className="w-full text-[11px] text-gray-300 table-fixed">
                                                <thead className="bg-[#181818] text-gray-400">
                                                    <tr>
                                                        <th className="px-2 py-1 text-left w-2/5">Nom</th>
                                                        <th className="px-2 py-1 text-left w-1/5">IP</th>
                                                        <th className="px-2 py-1 text-right w-1/5">Clients</th>
                                                        <th className="px-2 py-1 text-right w-1/5">Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {unifiApRows.map((row, index) => (
                                                        <tr
                                                            key={`ap-${row.name}-${index}`}
                                                            className={index % 2 === 0 ? 'bg-[#101010]' : 'bg-[#141414]'}
                                                        >
                                                            <td className="px-2 py-1 text-gray-200 truncate">
                                                                {row.name}
                                                            </td>
                                                            <td className="px-2 py-1 text-gray-400 truncate">
                                                                {row.ip || 'n/a'}
                                                            </td>
                                                            <td className="px-2 py-1 text-right text-gray-200">
                                                                {row.clientsActive}
                                                            </td>
                                                            <td className="px-2 py-1 text-right text-gray-200">
                                                                {row.clientsTotal}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Switches table */}
                                {unifiSwitchRows.length > 0 && (
                                    <div className="space-y-2 pt-2 border-t border-gray-800 mt-2">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-gray-400">Switches</span>
                                        </div>
                                        <div className="rounded border border-gray-800 overflow-hidden">
                                            <table className="w-full text-[11px] text-gray-300 table-fixed">
                                                <thead className="bg-[#181818] text-gray-400">
                                                    <tr>
                                                        <th className="px-2 py-1 text-left w-2/5">Nom</th>
                                                        <th className="px-2 py-1 text-left w-1/5">IP</th>
                                                        <th className="px-2 py-1 text-right w-1/5">Ports actifs</th>
                                                        <th className="px-2 py-1 text-right w-1/5">Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {unifiSwitchRows.map((row, index) => (
                                                        <tr
                                                            key={`sw-${row.name}-${index}`}
                                                            className={index % 2 === 0 ? 'bg-[#101010]' : 'bg-[#141414]'}
                                                        >
                                                            <td className="px-2 py-1 text-gray-200 truncate">
                                                                {row.name}
                                                            </td>
                                                            <td className="px-2 py-1 text-gray-400 truncate">
                                                                {row.ip || 'n/a'}
                                                            </td>
                                                            <td className="px-2 py-1 text-right text-emerald-300">
                                                                {row.totalPorts > 0 ? row.activePorts : '-'}
                                                            </td>
                                                            <td className="px-2 py-1 text-right text-gray-200">
                                                                {row.totalPorts > 0 ? row.totalPorts : '-'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* WiFi Networks (SSIDs) */}
                                {unifiWlans.length > 0 && (
                                    <div className="space-y-2 pt-2 border-t border-gray-800 mt-2">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-gray-400">Réseaux Wi‑Fi (SSID)</span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {unifiWlans
                                                .filter(wlan => wlan.enabled)
                                                .map((wlan, index) => (
                                                    <span
                                                        key={`wlan-${wlan.name}-${index}`}
                                                        className="px-2 py-1 rounded-full bg-blue-900/40 border border-blue-700 text-blue-300 text-[11px] font-medium"
                                                    >
                                                        {wlan.ssid || wlan.name}
                                                    </span>
                                                ))}
                                        </div>
                                    </div>
                                )}

                            </div>
                        )}

                        {/* Freebox controller / firmware / WAN IP / DHCP & Port forwarding summary */}
                        {pluginId === 'freebox' && (freeboxVersion || freeboxPlayerVersion || freeboxUpdateAvailable || (connectionStatus?.ipv4) || (stats.system && ((stats.system as any).dhcp || (stats.system as any).portForwarding))) && (
                            <div className="bg-[#1a1a1a] rounded-lg p-3 space-y-2 text-xs">
                                {/* Freebox, Firmware and LAN Network - Labels on first line, data on second line */}
                                <div className="space-y-1">
                                    {/* First line: Labels */}
                                    <div className="grid grid-cols-4 gap-4 items-center">
                                        <div className="flex flex-col">
                                            <span className="text-gray-400 text-[10px]">Freebox</span>
                                        </div>
                                        {(freeboxVersion || freeboxPlayerVersion) ? (
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-gray-500 uppercase tracking-wide">Firmware</span>
                                            </div>
                                        ) : <div></div>}
                                        {(() => {
                                            // Extract LAN network from device IPs
                                            let lanNetwork: string | undefined;
                                            if (stats?.devices && Array.isArray(stats.devices)) {
                                                const deviceIps = stats.devices
                                                    .map((d: any) => d.ip || d.l3connectivities?.[0]?.addr)
                                                    .filter((ip: any) => ip && typeof ip === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(ip));
                                                
                                                if (deviceIps.length > 0) {
                                                    const firstIp = deviceIps[0];
                                                    const parts = firstIp.split('.');
                                                    if (parts.length === 4) {
                                                        lanNetwork = `${parts[0]}.${parts[1]}.${parts[2]}`;
                                                    }
                                                }
                                            }
                                            return lanNetwork ? (
                                    <div className="flex flex-col">
                                                    <span className="text-[10px] text-gray-500 uppercase tracking-wide">Réseau LAN</span>
                                                </div>
                                            ) : <div></div>;
                                        })()}
                                        <div className="flex items-center justify-end gap-2">
                                            {freeboxUpdateAvailable && (
                                                <span className="px-1.5 py-0.5 rounded-full bg-amber-900/40 border border-amber-600 text-amber-300 text-[10px]">
                                                    Mise à jour dispo
                                                </span>
                                            )}
                                            {connectionStatus && connectionStatus.ipv4 && (
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[10px] text-gray-400">IP Public</span>
                                                </div>
                                        )}
                                        </div>
                                    </div>
                                    
                                    {/* Second line: Data */}
                                    <div className="grid grid-cols-4 gap-4 items-center">
                                        <div className="flex flex-col">
                                            <span className="text-gray-400 text-xs">Freebox</span>
                                        </div>
                                        {(freeboxVersion || freeboxPlayerVersion) ? (
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    {freeboxVersion && (
                                                        <div className="flex items-center gap-1 text-sm text-gray-100">
                                                            <span className="text-[11px] text-gray-400">Box</span>
                                                            <span className="font-semibold">
                                                                v{freeboxVersion}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {freeboxPlayerVersion && (
                                                        <div className="flex items-center gap-1 text-sm text-gray-100">
                                                            <span className="text-[11px] text-gray-400">Player</span>
                                                            <span className="font-semibold">
                                                                v{freeboxPlayerVersion}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : <div></div>}
                                        {(() => {
                                            // Extract LAN network from device IPs
                                            let lanNetwork: string | undefined;
                                            if (stats?.devices && Array.isArray(stats.devices)) {
                                                const deviceIps = stats.devices
                                                    .map((d: any) => d.ip || d.l3connectivities?.[0]?.addr)
                                                    .filter((ip: any) => ip && typeof ip === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(ip));
                                                
                                                if (deviceIps.length > 0) {
                                                    const firstIp = deviceIps[0];
                                                    const parts = firstIp.split('.');
                                                    if (parts.length === 4) {
                                                        lanNetwork = `${parts[0]}.${parts[1]}.${parts[2]}`;
                                                    }
                                                }
                                            }
                                            
                                            return lanNetwork ? (
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-mono text-gray-300 font-semibold">
                                                        {lanNetwork}.x
                                                    </span>
                                                </div>
                                            ) : <div></div>;
                                        })()}
                                        <div className="flex items-center justify-end gap-2">
                                            {connectionStatus && connectionStatus.ipv4 && (
                                                <div className="flex flex-col items-end">
                                                    <span className="text-sky-300 font-medium text-xs">
                                                        {connectionStatus.ipv4}
                                            </span>
                                                </div>
                                        )}
                                        </div>
                                    </div>
                                </div>
                                {/* DHCP and NAT summary - two columns layout */}
                                {/* Only show DHCP and NAT data if plugin is active (authenticated) */}
                                {(isActive && stats.system && ((stats.system as any).dhcp || (stats.system as any).portForwarding)) && (
                                    <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-800 mt-1 text-[11px]">
                                        {/* DHCP column */}
                                        {isActive && stats.system && (stats.system as any).dhcp && (
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-gray-400">DHCP</span>
                                                    <span
                                                        className={
                                                            (stats.system as any).dhcp.enabled
                                                                ? 'inline-flex items-center justify-end min-w-[2.75rem] px-2 py-0.5 rounded-full bg-emerald-900/40 border border-emerald-700 text-emerald-300 font-semibold'
                                                                : 'inline-flex items-center justify-end min-w-[2.75rem] px-2 py-0.5 rounded-full bg-red-900/40 border border-red-700 text-red-300 font-semibold'
                                                        }
                                                    >
                                                        {(stats.system as any).dhcp.enabled ? 'Actif' : 'Désactivé'}
                                                    </span>
                                                </div>
                                                {((stats.system as any).dhcp.activeLeases != null ||
                                                    (stats.system as any).dhcp.totalConfigured != null) && (
                                                    <>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-gray-400">Actifs</span>
                                                            <span className="inline-flex items-center justify-end min-w-[2.75rem] px-2 py-0.5 rounded-full bg-emerald-900/40 border border-emerald-700 text-emerald-300 font-semibold">
                                                                {(stats.system as any).dhcp.activeLeases ?? 0}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-gray-400">Total</span>
                                                            <span className="inline-flex items-center justify-end min-w-[2.75rem] px-2 py-0.5 rounded-full bg-slate-900/60 border border-slate-700 text-gray-200 font-medium">
                                                                {(stats.system as any).dhcp.totalConfigured ?? 0}
                                                            </span>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        {/* NAT column (renamed from Port Forwarding) */}
                                        {isActive && stats.system && (stats.system as any).portForwarding && (
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-gray-400">NAT</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-gray-400">Actives</span>
                                                    <span className="inline-flex items-center justify-end min-w-[2.75rem] px-2 py-0.5 rounded-full bg-emerald-900/40 border border-emerald-700 text-emerald-300 font-semibold">
                                                        {(stats.system as any).portForwarding.enabledRules ?? 0}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-gray-400">Total</span>
                                                    <span className="inline-flex items-center justify-end min-w-[2.75rem] px-2 py-0.5 rounded-full bg-slate-900/60 border border-slate-700 text-gray-200 font-medium">
                                                        {(stats.system as any).portForwarding.totalRules ?? 0}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Freebox state graph (only for Freebox plugin, on all dashboards) */}
                        {pluginId === 'freebox' && connectionStatus && networkHistory && networkHistory.length > 0 && (
                            <div className="space-y-3">
                                <div className="space-y-3">
                                    <BarChart
                                        data={networkHistory}
                                        dataKey="download"
                                        color="#3b82f6"
                                        title="Descendant en temps réel"
                                        currentValue={currentDownload.split(' ')[0]}
                                        unit={currentDownload.split(' ')[1] || 'kb/s'}
                                        trend="down"
                                    />
                                    <BarChart
                                        data={networkHistory}
                                        dataKey="upload"
                                        color="#10b981"
                                        title="Montant en temps réel"
                                        currentValue={currentUpload.split(' ')[0]}
                                        unit={currentUpload.split(' ')[1] || 'kb/s'}
                                        trend="up"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Freebox badges and stats (copied from header) */}
                        {pluginId === 'freebox' && connectionStatus && (
                            <div className="bg-[#1a1a1a] rounded-lg p-3 space-y-3 text-xs">
                                <div className="text-gray-400 text-[11px] uppercase tracking-wide mb-2">État système</div>
                                
 

                                {/* System badges */}
                                <div className="flex flex-wrap items-center gap-2">
                                    {/* CPU Temperature */}
                                    {systemInfo && (() => {
                                        const cpuSensors = getCpuSensors(systemInfo);
                                        const cpuAvgTemp = getAvgTemp(cpuSensors);
                                        const cpuTemp = cpuAvgTemp != null ? formatTemperature(cpuAvgTemp) : '--';
                                        return cpuTemp !== '--' ? (
                                            <StatusBadge
                                                icon={<Cpu size={14} />}
                                                value={cpuTemp}
                                                color="text-emerald-400"
                                            />
                                        ) : null;
                                    })()}

                                    {/* HDD Temperature */}
                                    {systemInfo && (() => {
                                        const hddSensors = getHddSensors(systemInfo);
                                        const hddAvgTemp = getAvgTemp(hddSensors);
                                        const hddTemp = hddAvgTemp != null ? formatTemperature(hddAvgTemp) : '--';
                                        return hddTemp !== '--' ? (
                                            <StatusBadge
                                                icon={<HardDrive size={14} />}
                                                value={hddTemp}
                                                color="text-blue-400"
                                            />
                                        ) : null;
                                    })()}

                                    {/* Fan */}
                                    {systemInfo && (() => {
                                        const fans = getFans(systemInfo);
                                        const fanAvgRpm = getAvgFanRpm(fans);
                                        const fanDisplay = fanAvgRpm != null ? `${fanAvgRpm} T/min` : '--';
                                        return fanDisplay !== '--' ? (
                                            <StatusBadge
                                                icon={<Fan size={14} />}
                                                value={fanDisplay}
                                                color="text-orange-400"
                                            />
                                        ) : null;
                                    })()}

                                    {/* Wifi Status */}
                                    <StatusBadge
                                        icon={<Wifi size={14} />}
                                        value="OK"
                                        color="text-green-400"
                                    />

                                    {/* Phone Status */}
                                    <StatusBadge
                                        icon={<Phone size={14} />}
                                        value="OK"
                                        color="text-green-400"
                                    />

                                    {/* Connection State */}
                                    <StatusBadge
                                        icon={<Activity size={14} />}
                                        value={connectionStatus.state === 'up' ? 'UP' : 'DOWN'}
                                        color={connectionStatus.state === 'up' ? 'text-green-400' : 'text-red-400'}
                                    />

                                    {/* Freebox Session */}
                                    <StatusBadge
                                        icon={<Wifi size={14} />}
                                        value={isFreeboxLoggedIn ? 'Session OK' : 'Session expirée'}
                                        color={isFreeboxLoggedIn ? 'text-emerald-400' : 'text-red-400'}
                                    />

                                    {/* WiFi Networks (SSIDs) with frequency bands */}
                                    {(() => {
                                        // Get WiFi networks from system stats
                                        const wifiNetworks = (stats?.system as any)?.wifiNetworks || [];
                                        if (wifiNetworks.length === 0) {
                                            return null;
                                        }
                                        // Filter: only enabled networks with valid SSID (not MAC addresses)
                                        const validNetworks = wifiNetworks.filter((wlan: { enabled: boolean; ssid: string }) => {
                                            if (wlan.enabled === false) return false;
                                            if (!wlan.ssid || wlan.ssid.trim() === '') return false;
                                            // Skip if SSID looks like a MAC address
                                            const macPattern = /^[0-9a-fA-F]{2}[:-]?([0-9a-fA-F]{2}[:-]?){4}[0-9a-fA-F]{2}$/;
                                            return !macPattern.test(wlan.ssid);
                                        });
                                        
                                        if (validNetworks.length === 0) {
                                            return null;
                                        }
                                        
                                        return validNetworks.map((wlan: { ssid: string; band: string }, index: number) => (
                                            <StatusBadge
                                                key={`wifi-${wlan.ssid}-${index}`}
                                                icon={<Wifi size={14} />}
                                                value={`${wlan.ssid} (${wlan.band})`}
                                                color="text-cyan-400"
                                            />
                                        ));
                                    })()}
                                </div>
                            </div>
                        )}

                        {/* System Info (only temperature here, uptime globalisé en pied de carte) */}
                        {stats.system && stats.system.temperature && (
                            <div className="bg-[#1a1a1a] rounded-lg p-3 space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-400">Température</span>
                                        <span className="text-gray-300">
                                            {stats.system.temperature}°C
                                        </span>
                                    </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-4 text-gray-500 text-xs">
                        {plugin.enabled ? (
                            <p>Configuration requise pour voir les stats</p>
                        ) : (
                            <p>Activez le plugin pour voir les stats</p>
                        )}
                    </div>
                )}
                </div>

                {/* Uptime unifié en pied de carte (Freebox / UniFi) */}
                {stats?.system?.uptime && (
                    <div className="mt-3 pt-2 border-t border-gray-800 flex items-center justify-between text-[11px] text-gray-400">
                        <span>Uptime</span>
                        <span className="text-gray-300 font-medium">
                            {Math.floor(stats.system.uptime / 3600)}h
                        </span>
                    </div>
                )}
            </div>
        </Card>
    );
};

