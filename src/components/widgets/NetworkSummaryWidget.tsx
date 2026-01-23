/**
 * Network Summary Widget
 * 
 * Displays network summary information (Router/Gateway, Freebox IP, DHCP range, Subnet mask)
 */

import React, { useEffect, useState } from 'react';
import { Card } from './Card';
import { Network, Loader2, XCircle } from 'lucide-react';
import { api } from '../../api/client';
import { usePolling } from '../../hooks/usePolling';
import { POLLING_INTERVALS } from '../../utils/constants';

interface LanConfig {
    ip: string;
    netmask: string;
    name: string;
}

interface DhcpConfig {
    enabled: boolean;
    ip_start: string;
    ip_end: string;
}

interface NetworkSummary {
    routerGateway: string;
    freeboxIp: string;
    dhcpRange: string;
    netmask: string;
    dhcpEnabled: boolean;
    ipStart?: string;
    ipEnd?: string;
    freeIps?: number;
    usedIps?: number;
    totalIps?: number;
    usagePercentage?: number;
}

export const NetworkSummaryWidget: React.FC = () => {
    const [networkSummary, setNetworkSummary] = useState<NetworkSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchNetworkSummary = async () => {
        try {
            setIsLoading(true);
            setError(null);

            // Fetch LAN config, DHCP config, and DHCP leases in parallel
            const [lanResponse, dhcpResponse, dhcpLeasesResponse, dhcpStaticLeasesResponse] = await Promise.allSettled([
                api.get<any>('/api/settings/lan'),
                api.get<any>('/api/settings/dhcp'),
                api.get<any>('/api/settings/dhcp/leases'),
                api.get<any>('/api/dhcp/static-leases')
            ]);

            let routerGateway = 'N/A';
            let freeboxIp = 'N/A';
            let dhcpRange = 'N/A';
            let netmask = 'N/A';
            let dhcpEnabled = false;
            let ipStart: string | undefined;
            let ipEnd: string | undefined;
            let freeIps: number | undefined;
            let usedIps: number | undefined;
            let totalIps: number | undefined;
            let usagePercentage: number | undefined;

            // Extract LAN config data
            if (lanResponse.status === 'fulfilled' && lanResponse.value.success && lanResponse.value.result) {
                const lanConfig = lanResponse.value.result as any;
                
                // Try to find the main LAN interface
                // The structure might be: { ip: "...", netmask: "...", name: "..." }
                // or it might be nested in an array or object
                if (lanConfig.ip) {
                    freeboxIp = lanConfig.ip;
                    routerGateway = lanConfig.ip; // Gateway is usually the Freebox IP
                } else if (Array.isArray(lanConfig)) {
                    // If it's an array, take the first interface
                    const firstInterface = lanConfig[0];
                    if (firstInterface?.ip) {
                        freeboxIp = firstInterface.ip;
                        routerGateway = firstInterface.ip;
                    }
                    if (firstInterface?.netmask) {
                        netmask = firstInterface.netmask;
                    }
                } else if (lanConfig.netmask) {
                    netmask = lanConfig.netmask;
                }

                // Try to get netmask from various possible locations
                if (netmask === 'N/A' && lanConfig.netmask) {
                    netmask = lanConfig.netmask;
                }
            }

            // Extract DHCP config data
            if (dhcpResponse.status === 'fulfilled' && dhcpResponse.value.success && dhcpResponse.value.result) {
                const dhcpConfig = dhcpResponse.value.result as any;
                const dhcp = dhcpConfig.dhcp || dhcpConfig;
                
                // Check if DHCP is enabled
                dhcpEnabled = dhcp.enabled === true;
                
                // Try different field names for DHCP range
                ipStart = dhcp.ip_start || dhcp.ip_range_start;
                ipEnd = dhcp.ip_end || dhcp.ip_range_end;
                
                if (ipStart && ipEnd) {
                    dhcpRange = `${ipStart} → ${ipEnd}`;
                    
                    // Calculate IP statistics if DHCP is enabled
                    if (dhcpEnabled) {
                        // Convert IP range to total number of IPs
                        const ipToNumber = (ip: string): number => {
                            const parts = ip.split('.').map(Number);
                            return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
                        };
                        
                        const startNum = ipToNumber(ipStart);
                        const endNum = ipToNumber(ipEnd);
                        totalIps = endNum - startNum + 1;
                        
                        // Count used IPs from leases and static leases
                        let usedCount = 0;
                        const usedIpSet = new Set<string>();
                        
                        // Get active leases
                        if (dhcpLeasesResponse.status === 'fulfilled' && dhcpLeasesResponse.value.success && Array.isArray(dhcpLeasesResponse.value.result)) {
                            const leases = dhcpLeasesResponse.value.result as any[];
                            leases.forEach((lease: any) => {
                                // Try different possible field names for IP
                                const ip = lease.ip || lease.static_lease?.ip || lease.dhcp?.ip;
                                if (ip && typeof ip === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
                                    try {
                                        const ipNum = ipToNumber(ip);
                                        if (ipNum >= startNum && ipNum <= endNum) {
                                            usedIpSet.add(ip);
                                        }
                                    } catch (e) {
                                        // Skip invalid IP
                                    }
                                }
                            });
                        }
                        
                        // Get static leases
                        if (dhcpStaticLeasesResponse.status === 'fulfilled' && dhcpStaticLeasesResponse.value.success && Array.isArray(dhcpStaticLeasesResponse.value.result)) {
                            const staticLeases = dhcpStaticLeasesResponse.value.result as any[];
                            staticLeases.forEach((lease: any) => {
                                // Try different possible field names for IP
                                const ip = lease.ip || lease.static_lease?.ip || lease.dhcp?.ip;
                                if (ip && typeof ip === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
                                    try {
                                        const ipNum = ipToNumber(ip);
                                        if (ipNum >= startNum && ipNum <= endNum) {
                                            usedIpSet.add(ip);
                                        }
                                    } catch (e) {
                                        // Skip invalid IP
                                    }
                                }
                            });
                        }
                        
                        usedIps = usedIpSet.size;
                        freeIps = totalIps - usedIps;
                        usagePercentage = totalIps > 0 ? Math.round((usedIps / totalIps) * 100) : 0;
                    }
                }
                
                // Gateway might be in DHCP config
                if (routerGateway === 'N/A' && dhcp.gateway) {
                    routerGateway = dhcp.gateway;
                }
                
                // Netmask might be in DHCP config
                if (netmask === 'N/A' && dhcp.netmask) {
                    netmask = dhcp.netmask;
                }
            }

            setNetworkSummary({
                routerGateway,
                freeboxIp,
                dhcpRange,
                netmask,
                dhcpEnabled,
                ipStart,
                ipEnd,
                freeIps,
                usedIps,
                totalIps,
                usagePercentage
            });
        } catch (err) {
            setError('Erreur lors du chargement des informations réseau');
            console.error('Network summary error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchNetworkSummary();
    }, []);

    // Poll every 30 seconds
    usePolling(fetchNetworkSummary, {
        enabled: true,
        interval: POLLING_INTERVALS.system
    });

    if (isLoading && !networkSummary) {
        return (
            <Card title="Récapitulatif Réseau">
                <div className="text-center py-8 text-gray-500">
                    <Loader2 size={24} className="mx-auto mb-2 animate-spin" />
                    <p className="text-sm">Chargement...</p>
                </div>
            </Card>
        );
    }

    if (error && !networkSummary) {
        return (
            <Card title="Récapitulatif Réseau">
                <div className="text-center py-8 text-red-500">
                    <XCircle size={24} className="mx-auto mb-2" />
                    <p className="text-sm">{error}</p>
                </div>
            </Card>
        );
    }

    if (!networkSummary) return null;

    return (
        <Card title="Récapitulatif Réseau">
            <div className="space-y-3">
                <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Routeur/Gateway:</span>
                    <span className="text-cyan-400 font-mono text-sm">{networkSummary.routerGateway}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Freebox:</span>
                    <span className="text-blue-400 font-mono text-sm">{networkSummary.freeboxIp}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Plage DHCP:</span>
                    <span className="text-emerald-400 font-mono text-sm">{networkSummary.dhcpRange}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Masque:</span>
                    <span className="text-purple-400 font-mono text-sm">{networkSummary.netmask}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-800">
                    <span className="text-gray-400 text-sm">DHCP:</span>
                    <span className={`font-semibold text-sm ${networkSummary.dhcpEnabled ? 'text-green-400' : 'text-red-400'}`}>
                        {networkSummary.dhcpEnabled ? 'Actif' : 'Inactif'}
                    </span>
                </div>
                
                {/* IP Manager - Only show if DHCP is enabled */}
                {networkSummary.dhcpEnabled && networkSummary.freeIps !== undefined && networkSummary.usedIps !== undefined && (
                    <div className="pt-2 border-t border-gray-800 space-y-2">
                        <div className="text-gray-400 text-xs font-semibold mb-2">Gestionnaire d'IPs Réseau</div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400 text-sm">IPv4 libres:</span>
                            <span className="text-emerald-400 font-mono text-sm font-semibold">{networkSummary.freeIps}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400 text-sm">IPv4 utilisées:</span>
                            <span className="text-orange-400 font-mono text-sm font-semibold">{networkSummary.usedIps}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400 text-sm">Utilisation:</span>
                            <span className="text-yellow-400 font-mono text-sm font-semibold">{networkSummary.usagePercentage}%</span>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
};
