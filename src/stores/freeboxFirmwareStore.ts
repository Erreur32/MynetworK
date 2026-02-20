/**
 * Freebox Firmware Store
 *
 * Manages Freebox firmware update check (from dev.freebox.fr/blog)
 * and configuration for the check interval.
 */

import { create } from 'zustand';
import { api } from '../api/client';

export interface FirmwareEntry {
  latestVersion: string;
  currentVersion?: string;
  updateAvailable: boolean;
  changelog: string;
  date: string;
  blogUrl: string;
  model?: string;
}

export interface FreeboxFirmwareInfo {
  server: FirmwareEntry;
  player: FirmwareEntry | null;
  lastCheck: string;
}

export interface FirmwareCheckConfig {
  enabled: boolean;
  intervalHours: number;
}

interface FreeboxFirmwareStore {
  firmwareInfo: FreeboxFirmwareInfo | null;
  config: FirmwareCheckConfig | null;
  isLoading: boolean;
  isChecking: boolean;

  checkFirmware: () => Promise<void>;
  loadConfig: () => Promise<void>;
  setConfig: (updates: Partial<FirmwareCheckConfig>) => Promise<void>;
  forceCheck: () => Promise<void>;
}

export const useFreeboxFirmwareStore = create<FreeboxFirmwareStore>((set, get) => ({
  firmwareInfo: null,
  config: null,
  isLoading: false,
  isChecking: false,

  checkFirmware: async () => {
    set({ isLoading: true });
    try {
      const response = await api.get<FreeboxFirmwareInfo>('/api/plugins/freebox/firmware-check');
      if (response.success && response.result) {
        set({ firmwareInfo: response.result, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('[FreeboxFirmwareStore] Error checking firmware:', error);
      set({ isLoading: false });
    }
  },

  loadConfig: async () => {
    try {
      const response = await api.get<FirmwareCheckConfig>('/api/plugins/freebox/firmware-check/config');
      if (response.success && response.result) {
        set({ config: response.result });
      }
    } catch (error) {
      console.error('[FreeboxFirmwareStore] Error loading config:', error);
    }
  },

  setConfig: async (updates: Partial<FirmwareCheckConfig>) => {
    try {
      const response = await api.post<FirmwareCheckConfig>('/api/plugins/freebox/firmware-check/config', updates);
      if (response.success && response.result) {
        set({ config: response.result });
      }
    } catch (error) {
      console.error('[FreeboxFirmwareStore] Error saving config:', error);
      throw error;
    }
  },

  forceCheck: async () => {
    set({ isChecking: true });
    try {
      const response = await api.post<FreeboxFirmwareInfo>('/api/plugins/freebox/firmware-check/force');
      if (response.success && response.result) {
        set({ firmwareInfo: response.result, isChecking: false });
      } else {
        set({ isChecking: false });
      }
    } catch (error) {
      console.error('[FreeboxFirmwareStore] Error forcing firmware check:', error);
      set({ isChecking: false });
    }
  },
}));
