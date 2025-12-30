/**
 * Plugin management store
 * 
 * Handles plugin listing, configuration, and statistics
 */

import { create } from 'zustand';
import { api } from '../api/client';
import type { ApiResponse } from '../types/api';

// Flag to ensure plugins are logged only once at startup
let pluginsLogged = false;

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
    lastFetchTime: number | null; // Cache timestamp

    // Actions
    fetchPlugins: (force?: boolean) => Promise<void>;
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
    lastFetchTime: null,

    fetchPlugins: async (force = false) => {
        const state = get();
        const CACHE_DURATION = 30000; // 30 seconds
        
        // Check cache if not forcing refresh
        if (!force && state.lastFetchTime && Date.now() - state.lastFetchTime < CACHE_DURATION) {
            return; // Use cached data
        }

        set({ isLoading: true, error: null });

        try {
            const response = await api.get<Plugin[]>('/api/plugins');
            if (response.success && response.result) {
                // Validate response structure
                if (!Array.isArray(response.result)) {
                    throw new Error('Invalid plugins data format: expected array');
                }

                // Validate each plugin structure
                const validatedPlugins = response.result.filter((plugin) => {
                    const isValid = plugin && 
                        typeof plugin.id === 'string' && 
                        typeof plugin.name === 'string' && 
                        typeof plugin.enabled === 'boolean' &&
                        typeof plugin.version === 'string';
                    
                    if (!isValid) {
                        console.warn('Invalid plugin data structure:', plugin);
                    }
                    return isValid;
                });

                set({
                    plugins: validatedPlugins,
                    isLoading: false,
                    lastFetchTime: Date.now()
                });
                
                // Log each loaded plugin with colored background (only once at startup)
                if (!pluginsLogged) {
                    pluginsLogged = true;
                    validatedPlugins.forEach((plugin) => {
                        const statusColor = plugin.enabled && plugin.connectionStatus 
                            ? '#10b981' // green
                            : plugin.enabled 
                            ? '#f97316' // orange (enabled but not connected)
                            : '#6b7280'; // gray (disabled)
                        
                        const statusText = plugin.enabled && plugin.connectionStatus 
                            ? '✓ Actif'
                            : plugin.enabled 
                            ? '⚠ Non connecté'
                            : '✗ Désactivé';
                        
                        const pluginStyles = [
                            `background: ${statusColor}`,
                            'color: white',
                            'padding: 6px 12px',
                            'border-radius: 4px',
                            'font-size: 12px',
                            'font-weight: bold',
                            'font-family: monospace',
                            'margin-right: 8px'
                        ].join(';');
                        
                        const infoStyles = [
                            'background: #1a1a1a',
                            'color: #e5e7eb',
                            'padding: 4px 8px',
                            'border-radius: 4px',
                            'font-size: 11px',
                            'font-family: monospace'
                        ].join(';');
                        
                        console.log(
                            `%c${plugin.name}%c v${plugin.version} - ${statusText}`,
                            pluginStyles,
                            infoStyles
                        );
                    });
                }
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
                // Force refresh plugins list after config update
                await get().fetchPlugins(true);
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

