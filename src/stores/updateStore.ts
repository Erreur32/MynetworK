/**
 * Update Store
 * 
 * Manages update checking and configuration
 */

import { create } from 'zustand';
import { api } from '../api/client';

interface UpdateInfo {
  enabled: boolean;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  error?: string;
  /** ISO date of last check (from backend 12h cache) */
  lastCheckAt?: string;
}

interface UpdateConfig {
  enabled: boolean;
}

interface UpdateStore {
  updateInfo: UpdateInfo | null;
  updateConfig: UpdateConfig | null;
  isLoading: boolean;
  lastCheck: Date | null;
  
  // Actions
  checkForUpdates: () => Promise<void>;
  /** Force a fresh check (bypass 12h cache). Returns result for inline notification. */
  checkForUpdatesForce: () => Promise<UpdateInfo | null>;
  loadConfig: () => Promise<void>;
  setConfig: (enabled: boolean) => Promise<void>;
}

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  updateInfo: null,
  updateConfig: null,
  isLoading: false,
  lastCheck: null,
  
  checkForUpdates: async () => {
    set({ isLoading: true });
    try {
      const response = await api.get<{ success: boolean; result?: UpdateInfo }>('/api/updates/check');
      if (response.success && response.result) {
        const result = response.result;
        set({
          updateInfo: result,
          lastCheck: result.lastCheckAt ? new Date(result.lastCheckAt) : new Date(),
          isLoading: false
        });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('[UpdateStore] Error checking for updates:', error);
      set({ isLoading: false });
    }
  },

  checkForUpdatesForce: async (): Promise<UpdateInfo | null> => {
    set({ isLoading: true });
    try {
      const response = await api.get<{ success: boolean; result?: UpdateInfo }>('/api/updates/check?force=1');
      if (response.success && response.result) {
        const result = response.result;
        set({
          updateInfo: result,
          lastCheck: result.lastCheckAt ? new Date(result.lastCheckAt) : new Date(),
          isLoading: false
        });
        return result;
      }
      set({ isLoading: false });
      return null;
    } catch (error) {
      console.error('[UpdateStore] Error forcing update check:', error);
      set({ isLoading: false });
      return null;
    }
  },
  
  loadConfig: async () => {
    try {
      const response = await api.get<UpdateConfig>('/api/updates/config');
      if (response.success && response.result) {
        set({ updateConfig: response.result });
      }
    } catch (error) {
      console.error('[UpdateStore] Error loading config:', error);
    }
  },
  
  setConfig: async (enabled: boolean) => {
    try {
      const response = await api.post<UpdateConfig>('/api/updates/config', { enabled });
      if (response.success && response.result) {
        set({ updateConfig: response.result });
        // If enabling, check for updates immediately
        if (enabled) {
          get().checkForUpdates();
        }
      }
    } catch (error) {
      console.error('[UpdateStore] Error setting config:', error);
      throw error;
    }
  }
}));
