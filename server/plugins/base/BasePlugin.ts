/**
 * Base plugin class
 * 
 * Provides common functionality for all plugins
 */

import type { IPlugin, PluginConfig, PluginStats } from './PluginInterface.js';

export abstract class BasePlugin implements IPlugin {
    protected id: string;
    protected name: string;
    protected version: string;
    protected config: PluginConfig | null = null;

    constructor(id: string, name: string, version: string) {
        this.id = id;
        this.name = name;
        this.version = version;
    }

    getId(): string {
        return this.id;
    }

    getName(): string {
        return this.name;
    }

    getVersion(): string {
        return this.version;
    }

    async initialize(config: PluginConfig): Promise<void> {
        this.config = config;
        console.log(`[Plugin:${this.id}] Initialized`);
    }

    async start(): Promise<void> {
        if (!this.config) {
            throw new Error(`Plugin ${this.id} not initialized`);
        }
        if (!this.config.enabled) {
            // Don't throw error, just return silently
            // PluginManager will only call start() if enabled, but this provides extra safety
            return;
        }
        console.log(`[Plugin:${this.id}] Started`);
    }

    async stop(): Promise<void> {
        console.log(`[Plugin:${this.id}] Stopped`);
    }

    isEnabled(): boolean {
        return this.config?.enabled === true;
    }

    abstract getStats(): Promise<PluginStats>;
    abstract testConnection(): Promise<boolean>;
}

