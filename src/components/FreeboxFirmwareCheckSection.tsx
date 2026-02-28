/**
 * Freebox Firmware Check Section
 *
 * Options for checking Freebox Server/Player firmware updates (dev.freebox.fr/blog).
 * Used in Administration > Plugins (Options Freebox). Renders content only (parent provides Section).
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw } from 'lucide-react';
import { useFreeboxFirmwareStore } from '../stores/freeboxFirmwareStore';

const SettingRow: React.FC<{ label: string; description?: string; children: React.ReactNode }> = ({ label, description, children }) => (
  <div className="flex items-center justify-between py-3 border-b border-gray-800 last:border-b-0">
    <div className="flex-1">
      <h4 className="text-sm font-medium text-white">{label}</h4>
      {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
    </div>
    <div className="ml-4">{children}</div>
  </div>
);

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

export const FreeboxFirmwareCheckSection: React.FC = () => {
  const { t } = useTranslation();
  const { config, firmwareInfo, loadConfig, setConfig, forceCheck, checkFirmware, isChecking } = useFreeboxFirmwareStore();
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    if (config?.enabled) {
      checkFirmware();
    }
  }, [config?.enabled]);

  const handleToggle = async (enabled: boolean) => {
    setIsSaving(true);
    try {
      await setConfig({ enabled });
    } catch (error) {
      console.error('[FreeboxFirmwareCheckSection] Error setting config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleIntervalChange = async (intervalHours: number) => {
    setIsSaving(true);
    try {
      await setConfig({ intervalHours });
    } catch (error) {
      console.error('[FreeboxFirmwareCheckSection] Error setting interval:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const intervalOptions = [
    { value: 1, labelKey: 'admin.freeboxFirmwareCheck.interval1h' },
    { value: 3, labelKey: 'admin.freeboxFirmwareCheck.interval3h' },
    { value: 6, labelKey: 'admin.freeboxFirmwareCheck.interval6h' },
    { value: 12, labelKey: 'admin.freeboxFirmwareCheck.interval12h' },
    { value: 24, labelKey: 'admin.freeboxFirmwareCheck.interval24h' },
  ] as const;

  return (
    <>
      <SettingRow
        label={t('admin.freeboxFirmwareCheck.autoCheckLabel')}
        description={t('admin.freeboxFirmwareCheck.autoCheckDescription')}
      >
        <Toggle
          enabled={config?.enabled ?? true}
          onChange={handleToggle}
          disabled={isSaving}
        />
      </SettingRow>
      {config?.enabled && (
        <>
          <SettingRow
            label={t('admin.freeboxFirmwareCheck.checkInterval')}
          >
            <select
              value={config.intervalHours}
              onChange={(e) => handleIntervalChange(Number(e.target.value))}
              disabled={isSaving}
              className="px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            >
              {intervalOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </SettingRow>
          <div className="py-3 border-t border-gray-800 space-y-2">
            {firmwareInfo?.lastCheck && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">{t('admin.freeboxFirmwareCheck.lastCheck')}</span>
                <span className="text-white">{new Date(firmwareInfo.lastCheck).toLocaleString()}</span>
              </div>
            )}
            {firmwareInfo?.server && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">{t('admin.freeboxFirmwareCheck.currentVersion')} (Server)</span>
                  <span className="text-white font-mono">{firmwareInfo.server.currentVersion || '--'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">{t('admin.freeboxFirmwareCheck.latestVersionAvailable')} (Server)</span>
                  <span className={`font-mono ${firmwareInfo.server.updateAvailable ? 'text-amber-400' : 'text-white'}`}>
                    {firmwareInfo.server.latestVersion}
                  </span>
                </div>
              </>
            )}
            {firmwareInfo?.player && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">{t('admin.freeboxFirmwareCheck.currentVersion')} (Player)</span>
                  <span className="text-white font-mono">{firmwareInfo.player.currentVersion || '--'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">{t('admin.freeboxFirmwareCheck.latestVersionAvailable')} (Player)</span>
                  <span className={`font-mono ${firmwareInfo.player.updateAvailable ? 'text-amber-400' : 'text-white'}`}>
                    {firmwareInfo.player.latestVersion}
                  </span>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => forceCheck()}
            disabled={isChecking}
            className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 text-amber-400 text-sm rounded-lg border border-amber-500/30 hover:bg-amber-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isChecking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {t('admin.freeboxFirmwareCheck.checkNow')}
          </button>
        </>
      )}
    </>
  );
};
