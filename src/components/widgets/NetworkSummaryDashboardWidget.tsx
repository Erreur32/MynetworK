/**
 * Network Summary Dashboard Widget
 *
 * Displays network summary for the main dashboard: UniFi + Freebox (if present)
 * Includes detailed DHCP UniFi information.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from './Card';
import { Loader2, XCircle } from 'lucide-react';
import { api } from '../../api/client';
import { usePolling } from '../../hooks/usePolling';
import { POLLING_INTERVALS } from '../../utils/constants';

type NetworkRole = 'freebox' | 'unifi' | 'unifi_via_dmz';

interface DhcpServerEntry {
  source: 'freebox' | 'unifi';
  active: boolean;
  detail?: string;
}

interface NatRule {
  id?: number;
  comment?: string;
  enabled: boolean;
  proto?: string;
  wanPort?: string;
  lanIp?: string;
  lanPort?: number;
}

interface FreeboxData {
  mode?: string;
  ip?: string;
  dmz?: { enabled: boolean; ip?: string };
  dhcp?: {
    enabled: boolean;
    ipStart?: string;
    ipEnd?: string;
    range?: string;
    netmask?: string;
    totalIps?: number;
    usedIps?: number;
    freeIps?: number;
    usagePercentage?: number;
  };
  natRules: NatRule[];
}

interface UnifiData {
  gatewayIp?: string;
  gatewayName?: string;
  deploymentType?: string;
  natRules?: NatRule[];
  dhcpEnabled?: boolean;
  clientsCount?: number;
  dhcpRange?: string;
}

interface NetworkSummaryResult {
  role: NetworkRole;
  gateway: string;
  subnet: string;
  freebox?: FreeboxData;
  unifi?: UnifiData;
  dhcpServers: DhcpServerEntry[];
}

export const NetworkSummaryDashboardWidget: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<NetworkSummaryResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNetworkSummary = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.get<NetworkSummaryResult>('/api/dashboard/network-summary');
      if (res.success && res.result) {
        setData(res.result);
      } else {
        setError(t('network.dataUnavailable'));
      }
    } catch (err) {
      setError(t('network.loadError'));
      console.error('Network summary error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNetworkSummary();
  }, []);

  usePolling(fetchNetworkSummary, {
    enabled: true,
    interval: POLLING_INTERVALS.system
  });

  if (isLoading && !data) {
    return (
      <Card title={t('network.summary')}>
        <div className="text-center py-8 text-gray-500">
          <Loader2 size={24} className="mx-auto mb-2 animate-spin" />
          <p className="text-sm">{t('common.loading')}</p>
        </div>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card title={t('network.summary')}>
        <div className="text-center py-8 text-red-500">
          <XCircle size={24} className="mx-auto mb-2" />
          <p className="text-sm">{error}</p>
        </div>
      </Card>
    );
  }

  if (!data) return null;

  const roleLabel =
    data.role === 'freebox'
      ? t('network.roleFreebox')
      : data.role === 'unifi_via_dmz'
        ? t('network.roleUnifiDmz')
        : t('network.roleUnifiCloud');

  return (
    <Card title={t('network.summary')}>
      <div className="space-y-3">
        {/* Who manages the network */}
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">{t('network.managedBy')}</span>
          <span className="text-gray-300 font-medium text-sm">{roleLabel}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">{t('network.gateway')}</span>
          <span className="text-gray-300 font-mono text-sm">{data.gateway}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">{t('network.subnet')}</span>
          <span className="text-gray-300 font-mono text-sm">{data.subnet}</span>
        </div>

        {/* Freebox section (if present) */}
        {data.freebox && (
          <>
            <div className="pt-2 border-t border-gray-800" />
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">{t('network.freeboxLabel')}</span>
              <span className="text-gray-300 font-mono text-sm">{data.freebox.ip || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">{t('network.modeLabel')}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                data.freebox.mode === 'bridge'
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }`}>
                {data.freebox.mode === 'bridge' ? t('network.bridge') : t('network.router')}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">{t('network.dmz')}:</span>
              <span className="text-sm">
                {data.freebox.dmz?.enabled ? (
                  <span className="text-gray-300" title={`DMZ → ${data.freebox.dmz.ip || ''}`}>
                    {t('network.dmzActive')} {data.freebox.dmz.ip || '?'}
                  </span>
                ) : (
                  <span className="text-gray-500">{t('network.inactive')}</span>
                )}
              </span>
            </div>
          </>
        )}

        {/* UniFi gateway (when present) */}
        {data.unifi?.gatewayIp && (
          <>
            <div className="pt-2 border-t border-gray-800" />
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">{t('network.unifiGateway')}</span>
              <span className="text-gray-300 font-mono text-sm">{data.unifi.gatewayIp}</span>
            </div>
            {data.unifi.gatewayName && data.unifi.gatewayName !== data.unifi.gatewayIp && (
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">{t('network.nameLabel')}</span>
                <span className="text-gray-300 text-sm">{data.unifi.gatewayName}</span>
              </div>
            )}
          </>
        )}

        {/* DHCP - consolidated section */}
        <div className="pt-2 border-t border-gray-800" />
        <div className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">{t('network.dhcpLabel')}</div>
        <div className="space-y-2">
          {/* Freebox DHCP */}
          {data.freebox && (
            <div className="bg-[#1a1a1a] rounded-lg p-2.5 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 font-medium">Freebox</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  data.freebox.dhcp?.enabled ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'
                }`}>
                  {data.freebox.dhcp?.enabled ? t('network.active') : t('network.inactive')}
                </span>
              </div>
              {data.freebox.dhcp?.enabled && (
                <>
                  {data.freebox.dhcp.usedIps != null && data.freebox.dhcp.totalIps != null && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">{t('network.ipv4Used')}</span>
                      <span className="text-gray-300 font-mono">{data.freebox.dhcp.usedIps} / {data.freebox.dhcp.totalIps}</span>
                    </div>
                  )}
                  {data.freebox.dhcp.range && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">{t('network.ipRange')}</span>
                      <span className="text-gray-300 font-mono">{data.freebox.dhcp.range}</span>
                    </div>
                  )}
                  {data.freebox.dhcp.usagePercentage != null && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">{t('network.usage')}</span>
                      <span className="text-gray-300 font-mono">{data.freebox.dhcp.usagePercentage}%</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {/* UniFi DHCP */}
          {data.unifi?.gatewayIp && (
            <div className="bg-[#1a1a1a] rounded-lg p-2.5 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 font-medium">UniFi</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  data.unifi.dhcpEnabled ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'
                }`}>
                  {data.unifi.dhcpEnabled ? t('network.active') : t('network.inactive')}
                </span>
              </div>
              {data.unifi.dhcpEnabled && (
                <>
                  {data.unifi.clientsCount != null && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">{t('network.clientsConnected')}</span>
                      <span className="text-gray-300 font-mono">{data.unifi.clientsCount}</span>
                    </div>
                  )}
                  {data.unifi.dhcpRange && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">{t('network.ipRange')}</span>
                      <span className="text-gray-300 font-mono">{data.unifi.dhcpRange}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* NAT rules - Freebox */}
        {data.freebox?.natRules && data.freebox.natRules.length > 0 && (
          <>
            <div className="pt-2 border-t border-gray-800" />
            <div className="text-gray-400 text-xs font-semibold mb-1">{t('network.natFreebox')}</div>
            <ul className="space-y-1 max-h-32 overflow-y-auto">
              {data.freebox.natRules.map((r, i) => (
                <li key={r.id ?? i} className="text-xs flex items-center gap-2">
                  {r.enabled ? (
                    <span className="text-emerald-500" title={t('common.enabled')}>●</span>
                  ) : (
                    <span className="text-gray-600" title={t('common.disabled')}>○</span>
                  )}
                  <span className="text-gray-300 truncate">{r.comment || t('network.ruleLabel', { id: r.id ?? i + 1 })}</span>
                  <span className="text-gray-500 font-mono shrink-0">
                    {r.proto}/{r.wanPort} → {r.lanIp}:{r.lanPort}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* NAT managed by UniFi */}
        {(data.role === 'unifi' || data.role === 'unifi_via_dmz') && (
          <>
            <div className="pt-2 border-t border-gray-800" />
            <div className="text-gray-400 text-xs font-semibold mb-1">NAT</div>
            <p className="text-gray-500 text-xs">{t('network.natManagedUnifi')}</p>
          </>
        )}

      </div>
    </Card>
  );
};
