/**
 * Network Summary Freebox Widget
 *
 * Displays network summary for Freebox page: Freebox information only (no UniFi).
 * This widget is specifically designed for the Freebox page context.
 */

import React, { useEffect, useState } from 'react';
import { Card } from './Card';
import { Loader2, XCircle } from 'lucide-react';
import { api } from '../../api/client';
import { usePolling } from '../../hooks/usePolling';
import { POLLING_INTERVALS } from '../../utils/constants';

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

interface NetworkSummaryResult {
  role: string;
  gateway: string;
  subnet: string;
  freebox?: FreeboxData;
  dhcpServers: Array<{ source: 'freebox' | 'unifi'; active: boolean; detail?: string }>;
}

export const NetworkSummaryFreeboxWidget: React.FC = () => {
  const [data, setData] = useState<NetworkSummaryResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNetworkSummary = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.get<{ success: boolean; result: NetworkSummaryResult }>('/api/dashboard/network-summary');
      if (res.success && res.result) {
        setData(res.result);
      } else {
        setError('Données indisponibles');
      }
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

  usePolling(fetchNetworkSummary, {
    enabled: true,
    interval: POLLING_INTERVALS.system
  });

  if (isLoading && !data) {
    return (
      <Card title="Récapitulatif Réseau">
        <div className="text-center py-8 text-gray-500">
          <Loader2 size={24} className="mx-auto mb-2 animate-spin" />
          <p className="text-sm">Chargement...</p>
        </div>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card title="Récapitulatif Réseau">
        <div className="text-center py-8 text-red-500">
          <XCircle size={24} className="mx-auto mb-2" />
          <p className="text-sm">{error}</p>
        </div>
      </Card>
    );
  }

  if (!data || !data.freebox) return null;

  // Only show Freebox DHCP server (filter out UniFi)
  const freeboxDhcp = data.dhcpServers.find((entry) => entry.source === 'freebox');

  return (
    <Card title="Récapitulatif Réseau">
      <div className="space-y-3">
        {/* Network information */}
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">Passerelle:</span>
          <span className="text-cyan-400 font-mono text-sm">{data.gateway}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">Sous-réseau:</span>
          <span className="text-purple-400 font-mono text-sm">{data.subnet}</span>
        </div>

        {/* Freebox section */}
        <div className="pt-2 border-t border-gray-800" />
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">Freebox:</span>
          <span className="text-blue-400 font-mono text-sm">{data.freebox.ip || 'N/A'}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">Mode:</span>
          <span className="text-gray-300 text-sm">
            {data.freebox.mode === 'bridge' ? 'Bridge' : 'Routeur'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">DMZ:</span>
          <span className="text-sm">
            {data.freebox.dmz?.enabled ? (
              <span className="text-amber-400" title={`DMZ → ${data.freebox.dmz.ip || ''}`}>
                Actif → {data.freebox.dmz.ip || '?'}
              </span>
            ) : (
              <span className="text-gray-500">Inactif</span>
            )}
          </span>
        </div>

        {/* DHCP Freebox */}
        {freeboxDhcp && (
          <>
            <div className="pt-2 border-t border-gray-800" />
            <div className="text-gray-400 text-xs font-semibold mb-1">DHCP Freebox</div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Statut:</span>
              <span
                className={`text-sm font-medium ${freeboxDhcp.active ? 'text-green-400' : 'text-gray-500'}`}
                title={freeboxDhcp.detail}
              >
                {freeboxDhcp.active ? 'Actif' : 'Inactif'}
                {freeboxDhcp.detail && freeboxDhcp.detail !== 'Actif' && freeboxDhcp.detail !== 'Inactif' && (
                  <span className="text-gray-500 font-normal ml-1">({freeboxDhcp.detail})</span>
                )}
              </span>
            </div>
            {(data.freebox.dhcp?.range || (data.freebox.dhcp?.ipStart && data.freebox.dhcp?.ipEnd)) && (
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Plage IP:</span>
                <span className="text-gray-300 font-mono text-sm">
                  {data.freebox.dhcp.range || `${data.freebox.dhcp.ipStart} - ${data.freebox.dhcp.ipEnd}`}
                </span>
              </div>
            )}
          </>
        )}

        {/* NAT rules - Freebox */}
        {data.freebox.natRules && data.freebox.natRules.length > 0 && (
          <>
            <div className="pt-2 border-t border-gray-800" />
            <div className="text-gray-400 text-xs font-semibold mb-1">Règles NAT</div>
            <ul className="space-y-1 max-h-32 overflow-y-auto">
              {data.freebox.natRules.map((r, i) => (
                <li key={r.id ?? i} className="text-xs flex items-center gap-2">
                  {r.enabled ? (
                    <span className="text-emerald-500" title="Activée">●</span>
                  ) : (
                    <span className="text-gray-600" title="Désactivée">○</span>
                  )}
                  <span className="text-gray-300 truncate">{r.comment || `Règle #${r.id ?? i + 1}`}</span>
                  <span className="text-gray-500 font-mono shrink-0">
                    {r.proto}/{r.wanPort} → {r.lanIp}:{r.lanPort}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Gestionnaire d'IPs - Freebox */}
        {data.freebox.dhcp?.enabled &&
          data.freebox.dhcp.totalIps != null &&
          data.freebox.dhcp.usedIps != null && (
            <>
              <div className="pt-2 border-t border-gray-800 space-y-2">
                <div className="text-gray-400 text-xs font-semibold mb-2">Gestionnaire d'IPs Réseau</div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">IPv4 libres:</span>
                  <span className="text-emerald-400 font-mono text-sm font-semibold">
                    {data.freebox.dhcp.freeIps ?? '-'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">IPv4 utilisées:</span>
                  <span className="text-orange-400 font-mono text-sm font-semibold">
                    {data.freebox.dhcp.usedIps}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Utilisation:</span>
                  <span className="text-yellow-400 font-mono text-sm font-semibold">
                    {data.freebox.dhcp.usagePercentage ?? 0}%
                  </span>
                </div>
              </div>
            </>
          )}
      </div>
    </Card>
  );
};
