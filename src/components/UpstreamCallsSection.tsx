/**
 * Upstream calls section (Administration > Debug)
 *
 * Requests sent to the Freebox and the UniFi controller per endpoint, with the share
 * answered without a call (cache hit or shared in-flight request). Used to measure
 * the effect of the request caches over a chosen window.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RotateCcw } from 'lucide-react';
import { api } from '../api/client';
import { usePolling } from '../hooks/usePolling';

interface Counts { call: number; cache: number; shared: number }

interface EndpointRow { endpoint: string; total: Counts; lastMinute: Counts; lastHour: Counts }

interface SourceStats {
  source: 'freebox' | 'unifi';
  total: Counts;
  lastMinute: Counts;
  lastHour: Counts;
  callsPerMinute: number;
  endpoints: EndpointRow[];
}

interface UpstreamStats {
  since: string;
  uptimeSeconds: number;
  hourWindowMinutes: number;
  sources: SourceStats[];
}

const REFRESH_MS = 10000;
const SOURCE_LABELS: Record<SourceStats['source'], string> = { freebox: 'Freebox', unifi: 'UniFi' };

// Share of reads answered without a request to the device
const savedPercent = (c: Counts): string => {
  const all = c.call + c.cache + c.shared;
  return all === 0 ? '0' : String(Math.round(((c.cache + c.shared) / all) * 100));
};

export const UpstreamCallsSection: React.FC = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<UpstreamStats | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const load = async () => {
    const response = await api.get<UpstreamStats>('/api/debug/upstream-calls');
    if (response.success && response.result) setStats(response.result);
  };

  usePolling(load, { interval: REFRESH_MS });

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await api.delete('/api/debug/upstream-calls');
      await load();
    } finally {
      setIsResetting(false);
    }
  };

  if (!stats) {
    return (
      <div className="py-4 text-center text-gray-500">
        <Loader2 size={20} className="mx-auto mb-2 animate-spin" />
      </div>
    );
  }

  return (
    <div className="py-2 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
        <span>
          {t('admin.upstream.since', {
            date: new Date(stats.since).toLocaleString(),
            minutes: Math.floor(stats.uptimeSeconds / 60),
          })}
        </span>
        <button
          type="button"
          onClick={handleReset}
          disabled={isResetting}
          className="flex items-center gap-1 px-2 py-1 rounded border border-gray-700 hover:bg-gray-800 text-gray-300 disabled:opacity-50"
        >
          <RotateCcw size={12} />
          {t('admin.upstream.reset')}
        </button>
      </div>
      <p className="text-xs text-gray-500">{t('admin.upstream.help')}</p>

      {stats.sources.map((source) => (
        <div key={source.source} className="space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold text-gray-200">{SOURCE_LABELS[source.source]}</span>
            <span className="text-gray-400">
              {t('admin.upstream.lastMinute')}: <span className="text-gray-200">{source.lastMinute.call}</span>
            </span>
            <span className="text-gray-400">
              {t('admin.upstream.perMinute', { minutes: stats.hourWindowMinutes })}: <span className="text-gray-200">{source.callsPerMinute}</span>
            </span>
            <span className="text-gray-400">
              {t('admin.upstream.totalCalls')}: <span className="text-gray-200">{source.total.call}</span>
            </span>
            <span className="text-gray-400">
              {t('admin.upstream.saved')}: <span className="text-emerald-400">{savedPercent(source.total)} %</span>
            </span>
          </div>

          {source.endpoints.length === 0 ? (
            <p className="text-xs text-gray-500">{t('admin.upstream.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-800">
                    <th className="py-1 pr-2 font-medium">{t('admin.upstream.endpoint')}</th>
                    <th className="py-1 px-2 font-medium text-right">{t('admin.upstream.lastMinute')}</th>
                    <th className="py-1 px-2 font-medium text-right">{t('admin.upstream.lastHour')}</th>
                    <th className="py-1 px-2 font-medium text-right">{t('admin.upstream.totalCalls')}</th>
                    <th className="py-1 px-2 font-medium text-right">{t('admin.upstream.cacheHits')}</th>
                    <th className="py-1 pl-2 font-medium text-right">{t('admin.upstream.saved')}</th>
                  </tr>
                </thead>
                <tbody>
                  {source.endpoints.map((row) => (
                    <tr key={row.endpoint} className="border-b border-gray-800/50 text-gray-300">
                      <td className="py-1 pr-2 font-mono break-all">{row.endpoint}</td>
                      <td className="py-1 px-2 text-right">{row.lastMinute.call}</td>
                      <td className="py-1 px-2 text-right">{row.lastHour.call}</td>
                      <td className="py-1 px-2 text-right">{row.total.call}</td>
                      <td className="py-1 px-2 text-right">{row.total.cache + row.total.shared}</td>
                      <td className="py-1 pl-2 text-right text-emerald-400">{savedPercent(row.total)} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
