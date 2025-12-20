/**
 * Plugin management store
 * 
 * Handles plugin listing, configuration, and statistics
 */

import { create } from 'zustand';
import { api } from '../api/client';
import type { ApiResponse } from '../types/api';

export interface Plugin {
    id: string;
    name: string;
    version: string;
    enabled: boolean;
    configured: boolean;
    connectionStatus: boolean;
    settings: Record<string, unknown>;
    // Freebox specific
    firmware?: string;
    playerFirmware?: string;
    apiVersion?: string;
    // UniFi specific
    controllerFirmware?: string;
    apiMode?: 'controller' | 'site-manager';
}

export interface PluginStats {
    devices?: Array<{
        id: string;
        name: string;
        ip?: string;
        mac?: string;
        active?: boolean;
        [key: string]: unknown;
    }>;
    network?: {
        download?: number;
        upload?: number;
        [key: string]: unknown;
    };
    system?: {
        temperature?: number;
        uptime?: number;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

interface PluginState {
    // State
    plugins: Plugin[];
    pluginStats: Record<string, PluginStats | null>;
    isLoading: boolean;
    error: string | null;

    // Actions
    fetchPlugins: () => Promise<void>;
    fetchPluginStats: (pluginId: string) => Promise<void>;
    fetchAllStats: () => Promise<void>;
    updatePluginConfig: (pluginId: string, config: { enabled?: boolean; settings?: Record<string, unknown> }) => Promise<boolean>;
    testPluginConnection: (pluginId: string, testSettings?: Record<string, any>) => Promise<{ connected: boolean; message: string } | null>;
}

export const usePluginStore = create<PluginState>((set, get) => ({
    plugins: [],
    pluginStats: {},
    isLoading: false,
    error: null,

    fetchPlugins: async () => {
        set({ isLoading: true, error: null });

        try {
            const response = await api.get<Plugin[]>('/api/plugins');
            if (response.success && response.result) {
                set({
                    plugins: response.result,
                    isLoading: false
                });
            } else {
                set({
                    isLoading: false,
                    error: response.error?.message || 'Failed to fetch plugins'
                });
            }
        } catch (error) {
            set({
                isLoading: false,
                error: error instanceof Error ? error.message : 'Failed to fetch plugins'
            });
        }
    },

    fetchPluginStats: async (pluginId: string) => {
        try {
            const response = await api.get<PluginStats>(`/api/plugins/${pluginId}/stats`);
            if (response.success && response.result) {
                set((state) => ({
                    pluginStats: {
                        ...state.pluginStats,
                        [pluginId]: response.result!
                    }
                }));
            }
        } catch (error) {
            console.error(`Failed to fetch stats for plugin ${pluginId}:`, error);
        }
    },

    fetchAllStats: async () => {
        try {
            const response = await api.get<Record<string, PluginStats>>('/api/plugins/stats/all');
            if (response.success && response.result) {
                set({
                    pluginStats: response.result
                });
            }
        } catch (error) {
            console.error('Failed to fetch all plugin stats:', error);
        }
    },

    updatePluginConfig: async (pluginId: string, config: { enabled?: boolean; settings?: Record<string, unknown> }) => {
        try {
            const response = await api.post(`/api/plugins/${pluginId}/config`, config);
            if (response.success) {
                // Refresh plugins list
                await get().fetchPlugins();
                return true;
            }
            return false;
        } catch (error) {
            console.error(`Failed to update plugin ${pluginId} config:`, error);
            return false;
        }
    },

    testPluginConnection: async (pluginId: string, testSettings?: Record<string, any>) => {
        try {
            const body = testSettings ? { settings: testSettings } : {};
            const response = await api.post<{ connected: boolean; message: string }>(`/api/plugins/${pluginId}/test`, body);
            if (response.success && response.result) {
                return {
                    connected: response.result.connected,
                    message: response.result.message
                };
            }
            return null;
        } catch (error) {
            console.error(`Failed to test plugin ${pluginId} connection:`, error);
            return null;
        }
    }
}));

