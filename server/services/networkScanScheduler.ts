/**
 * Network Scan Scheduler Service
 * 
 * Handles automatic network scanning and refresh scheduling using node-cron
 * IMPORTANT: Scans are paused if the scan-reseau plugin is disabled
 */

import cron from 'node-cron';
import { AppConfigRepository } from '../database/models/AppConfig.js';
import { networkScanService } from './networkScanService.js';
import { logger } from '../utils/logger.js';
import { pluginManager } from './pluginManager.js';
import { metricsCollector } from './metricsCollector.js';

interface AutoScanConfig {
    enabled: boolean;
    interval: number; // minutes: 15, 30, 60, 120, 360, 720, 1440
    scanType: 'full' | 'quick';
}

interface AutoRefreshConfig {
    enabled: boolean;
    interval: number; // minutes: 5, 10, 15, 30, 60
}

// New unified configuration structure
interface UnifiedAutoScanConfig {
    enabled: boolean; // Master switch - if false, all auto scans are disabled
    fullScan?: {
        enabled: boolean;
        interval: number; // minutes: 15, 30, 60, 120, 360, 720, 1440
        scanType: 'full' | 'quick';
    };
    refresh?: {
        enabled: boolean;
        interval: number; // minutes: 5, 10, 15, 30, 60
    };
}

class NetworkScanSchedulerService {
    private scanTask: ReturnType<typeof cron.schedule> | null = null;
    private refreshTask: ReturnType<typeof cron.schedule> | null = null;
    private manualScanInProgress: boolean = false; // Flag to prevent auto scans during manual scan

    /**
     * Check if the scan-reseau plugin is enabled
     * If the plugin is disabled, all automatic scans should be paused
     */
    private isPluginEnabled(): boolean {
        try {
            const plugin = pluginManager.getPlugin('scan-reseau');
            if (!plugin) {
                logger.warn('NetworkScanScheduler', 'scan-reseau plugin not found');
                return false;
            }
            return plugin.isEnabled();
        } catch (error) {
            logger.error('NetworkScanScheduler', 'Failed to check plugin status:', error);
            return false;
        }
    }

    constructor() {
        // Load and start schedulers on initialization
        // Note: This runs when the module is imported, ensure database is ready
        // Delay initialization slightly to ensure database is ready (especially in Docker)
        setTimeout(() => {
            logger.info('NetworkScanScheduler', 'Initializing network scan scheduler...');
            try {
                // Verify database is accessible
                const testConfig = AppConfigRepository.get('network_scan_unified_auto');
                logger.info('NetworkScanScheduler', `Database check: unified config exists=${!!testConfig}`);
                
                this.loadAndStartScanScheduler();
                this.loadAndStartRefreshScheduler();
                logger.info('NetworkScanScheduler', 'Network scan scheduler initialized successfully');
            } catch (error) {
                logger.error('NetworkScanScheduler', 'Failed to initialize scheduler:', error);
                logger.error('NetworkScanScheduler', 'Error stack:', (error as Error).stack);
            }
        }, 3000); // Wait 3 seconds for database to be ready (Docker may need more time)
    }

    /**
     * Load scan config from database and start/update scheduler
     */
    private loadAndStartScanScheduler() {
        try {
            // First check if plugin is enabled - if not, don't start schedulers
            if (!this.isPluginEnabled()) {
                logger.info('NetworkScanScheduler', 'scan-reseau plugin is disabled - schedulers will not be started');
                return;
            }

            // Try unified config first
            const unifiedConfigStr = AppConfigRepository.get('network_scan_unified_auto');
            if (unifiedConfigStr) {
                const unifiedConfig: UnifiedAutoScanConfig = JSON.parse(unifiedConfigStr);
                logger.info('NetworkScanScheduler', `Loading unified config from database: enabled=${unifiedConfig.enabled}, fullScan=${unifiedConfig.fullScan?.enabled || false}, refresh=${unifiedConfig.refresh?.enabled || false}`);
                logger.info('NetworkScanScheduler', `Unified config details: ${JSON.stringify(unifiedConfig)}`);
                this.updateUnifiedConfig(unifiedConfig);
                
                // Launch initial scan on startup if enabled and configured
                // This ensures we have data immediately after container restart
                if (unifiedConfig.enabled && unifiedConfig.fullScan?.enabled && this.isPluginEnabled()) {
                    logger.info('NetworkScanScheduler', 'Launching initial scan on startup...');
                    
                    // Get default range from config, fallback to 192.168.1.0/24
                    const defaultConfigStr = AppConfigRepository.get('network_scan_default');
                    let defaultRange = '192.168.1.0/24';
                    if (defaultConfigStr) {
                        try {
                            const defaultConfig = JSON.parse(defaultConfigStr);
                            if (defaultConfig.defaultRange) {
                                defaultRange = defaultConfig.defaultRange;
                            }
                        } catch (e) {
                            logger.warn('NetworkScanScheduler', 'Failed to parse default config, using fallback range');
                        }
                    }
                    
                    // Launch in background (don't await) to avoid blocking startup
                    networkScanService.scanNetwork(
                        defaultRange,
                        unifiedConfig.fullScan.scanType || 'full'
                    ).then(() => {
                        logger.info('NetworkScanScheduler', `Initial scan on startup completed (range: ${defaultRange})`);
                    }).catch((error) => {
                        logger.error('NetworkScanScheduler', 'Initial scan on startup failed:', error);
                    });
                }
                return;
            }
            
            logger.info('NetworkScanScheduler', 'No unified config found in database, falling back to old configs');
            // Fallback to old configs
            const configStr = AppConfigRepository.get('network_scan_auto');
            if (configStr) {
                const config: AutoScanConfig = JSON.parse(configStr);
                logger.info('NetworkScanScheduler', `Loading old scan config: enabled=${config.enabled}`);
                this.updateScanScheduler(config);
            } else {
                logger.info('NetworkScanScheduler', 'No scan config found in database - schedulers will remain disabled');
            }
        } catch (error) {
            logger.error('NetworkScanScheduler', 'Failed to load scan config:', error);
            logger.error('NetworkScanScheduler', 'Error details:', error);
        }
    }

    /**
     * Load refresh config from database and start/update scheduler
     */
    private loadAndStartRefreshScheduler() {
        try {
            // Unified config is already loaded in loadAndStartScanScheduler
            // This method is kept for backward compatibility
            const unifiedConfigStr = AppConfigRepository.get('network_scan_unified_auto');
            if (unifiedConfigStr) {
                // Already handled in loadAndStartScanScheduler
                return;
            }
            
            // Fallback to old configs
            const configStr = AppConfigRepository.get('network_scan_refresh_auto');
            if (configStr) {
                const config: AutoRefreshConfig = JSON.parse(configStr);
                this.updateRefreshScheduler(config);
            }
        } catch (error) {
            logger.error('NetworkScanScheduler', 'Failed to load refresh config:', error);
        }
    }

    /**
     * Update scan scheduler based on config
     */
    updateScanScheduler(config: AutoScanConfig) {
        // Stop existing task
        if (this.scanTask) {
            this.scanTask.stop();
            this.scanTask = null;
        }

        if (!config.enabled) {
            logger.info('NetworkScanScheduler', 'Auto scan disabled');
            return;
        }

        // Convert interval (minutes) to cron expression
        // Valid intervals: 15, 30, 60, 120, 360, 720, 1440 minutes
        const cronExpression = this.minutesToCron(config.interval);
        
        if (!cronExpression) {
            logger.error('NetworkScanScheduler', `Invalid scan interval: ${config.interval} minutes`);
            return;
        }

        if (!cron.validate(cronExpression)) {
            logger.error('NetworkScanScheduler', `Invalid cron expression: ${cronExpression}`);
            return;
        }

        logger.info('NetworkScanScheduler', `Scheduling auto scan: every ${config.interval} minutes (${cronExpression}), type: ${config.scanType}`);

        this.scanTask = cron.schedule(cronExpression, async () => {
            // Check if plugin is enabled before executing scan
            if (!this.isPluginEnabled()) {
                logger.info('NetworkScanScheduler', 'Skipping scheduled scan: scan-reseau plugin is disabled');
                return;
            }

            // Skip if a manual scan is in progress
            if (this.manualScanInProgress) {
                logger.info('NetworkScanScheduler', 'Skipping scheduled scan: manual scan in progress');
                return;
            }

            logger.info('NetworkScanScheduler', `Executing scheduled scan (type: ${config.scanType})...`);
            try {
                // Auto-detect network range
                const range = networkScanService.getNetworkRange();
                if (!range) {
                    logger.warn('NetworkScanScheduler', 'Could not auto-detect network range, skipping scan');
                    return;
                }

                await networkScanService.scanNetwork(range, config.scanType);
                
                // Update scheduler metrics: record last run
                metricsCollector.updateSchedulerMetrics(true, Date.now());
                
                // Track last auto scan
                const { AppConfigRepository } = await import('../database/models/AppConfig.js');
                AppConfigRepository.set('network_scan_last_auto', JSON.stringify({
                    type: 'full',
                    scanType: config.scanType,
                    range: range,
                    timestamp: new Date().toISOString()
                }));
                
                logger.info('NetworkScanScheduler', 'Scheduled scan completed successfully');
            } catch (error: any) {
                logger.error('NetworkScanScheduler', 'Scheduled scan failed:', error.message || error);
                logger.error('NetworkScanScheduler', 'Scan error details:', error);
            }
        }, {
            scheduled: true,
            timezone: 'Europe/Paris' // Explicit timezone to avoid Docker timezone issues
        } as any);
        
        // Ensure task is started (even though scheduled: true should do it)
        if (this.scanTask && this.scanTask.getStatus() !== 'scheduled') {
            this.scanTask.start();
        }
        
        const taskStatus = this.scanTask.getStatus();
        logger.info('NetworkScanScheduler', `Auto scan scheduler started: ${taskStatus} (cron: ${cronExpression})`);
        
        // Log warning only if task is not scheduled and not idle (idle can be normal immediately after creation)
        if (taskStatus !== 'scheduled' && taskStatus !== 'idle') {
            logger.warn('NetworkScanScheduler', `Warning: Scan task status is '${taskStatus}', expected 'scheduled' or 'idle'`);
        }
    }

    /**
     * Update refresh scheduler based on config
     */
    updateRefreshScheduler(config: AutoRefreshConfig) {
        // Stop existing task
        if (this.refreshTask) {
            this.refreshTask.stop();
            this.refreshTask = null;
        }

        if (!config.enabled) {
            logger.info('NetworkScanScheduler', 'Auto refresh disabled');
            return;
        }

        // Convert interval (minutes) to cron expression
        // Valid intervals: 5, 10, 15, 30, 60 minutes
        const cronExpression = this.minutesToCron(config.interval);
        
        if (!cronExpression) {
            logger.error('NetworkScanScheduler', `Invalid refresh interval: ${config.interval} minutes`);
            return;
        }

        if (!cron.validate(cronExpression)) {
            logger.error('NetworkScanScheduler', `Invalid cron expression: ${cronExpression}`);
            return;
        }

        logger.info('NetworkScanScheduler', `Scheduling auto refresh: every ${config.interval} minutes (${cronExpression})`);

        this.refreshTask = cron.schedule(cronExpression, async () => {
            // Check if plugin is enabled before executing refresh
            if (!this.isPluginEnabled()) {
                logger.info('NetworkScanScheduler', 'Skipping scheduled refresh: scan-reseau plugin is disabled');
                return;
            }

            // Skip if a manual scan is in progress
            if (this.manualScanInProgress) {
                logger.info('NetworkScanScheduler', 'Skipping scheduled refresh: manual scan in progress');
                return;
            }

            logger.info('NetworkScanScheduler', 'Executing scheduled refresh...');
            try {
                await networkScanService.refreshExistingIps('quick');
                
                // Track last auto refresh
                const { AppConfigRepository } = await import('../database/models/AppConfig.js');
                AppConfigRepository.set('network_scan_last_auto', JSON.stringify({
                    type: 'refresh',
                    scanType: 'quick',
                    timestamp: new Date().toISOString()
                }));
                
                logger.info('NetworkScanScheduler', 'Scheduled refresh completed successfully');
            } catch (error: any) {
                logger.error('NetworkScanScheduler', 'Scheduled refresh failed:', error.message || error);
                logger.error('NetworkScanScheduler', 'Refresh error details:', error);
            }
        }, {
            scheduled: true,
            timezone: 'Europe/Paris' // Explicit timezone to avoid Docker timezone issues
        } as any);
        
        // Ensure task is started (even though scheduled: true should do it)
        if (this.refreshTask && this.refreshTask.getStatus() !== 'scheduled') {
            this.refreshTask.start();
        }
        
        const taskStatus = this.refreshTask.getStatus();
        logger.info('NetworkScanScheduler', `Auto refresh scheduler started: ${taskStatus} (cron: ${cronExpression})`);
        
        // Log warning only if task is not scheduled and not idle (idle can be normal immediately after creation)
        if (taskStatus !== 'scheduled' && taskStatus !== 'idle') {
            logger.warn('NetworkScanScheduler', `Warning: Refresh task status is '${taskStatus}', expected 'scheduled' or 'idle'`);
        }
    }

    /**
     * Convert minutes to cron expression
     * Supports: 5, 10, 15, 30, 60, 120, 360, 720, 1440 minutes
     */
    private minutesToCron(minutes: number): string | null {
        // Map common intervals to cron expressions
        const intervalMap: Record<number, string> = {
            5: '*/5 * * * *',      // Every 5 minutes
            10: '*/10 * * * *',    // Every 10 minutes
            15: '*/15 * * * *',    // Every 15 minutes
            30: '*/30 * * * *',    // Every 30 minutes
            60: '0 * * * *',       // Every hour
            120: '0 */2 * * *',    // Every 2 hours
            360: '0 */6 * * *',    // Every 6 hours
            720: '0 */12 * * *',   // Every 12 hours
            1440: '0 0 * * *'      // Every day at midnight
        };

        return intervalMap[minutes] || null;
    }

    /**
     * Get current scan scheduler status
     */
    getScanStatus(): { enabled: boolean; running: boolean } {
        const status = this.scanTask?.getStatus();
        // 'scheduled' means actively scheduled, 'idle' can be normal immediately after creation
        // Both indicate the task is set up and will run
        return {
            enabled: this.scanTask !== null,
            running: this.scanTask !== null && (status === 'scheduled' || status === 'idle')
        };
    }

    /**
     * Get current refresh scheduler status
     */
    getRefreshStatus(): { enabled: boolean; running: boolean } {
        const status = this.refreshTask?.getStatus();
        // 'scheduled' means actively scheduled, 'idle' can be normal immediately after creation
        // Both indicate the task is set up and will run
        return {
            enabled: this.refreshTask !== null,
            running: this.refreshTask !== null && (status === 'scheduled' || status === 'idle')
        };
    }

    /**
     * Update schedulers based on unified configuration
     * This is the new recommended way to configure auto scans
     * IMPORTANT: Also checks if the scan-reseau plugin is enabled
     */
    updateUnifiedConfig(config: UnifiedAutoScanConfig) {
        logger.info('NetworkScanScheduler', `Updating unified config: master=${config.enabled}, fullScan=${config.fullScan?.enabled}, refresh=${config.refresh?.enabled}`);
        
        // Check if plugin is enabled - if not, stop all schedulers regardless of config
        if (!this.isPluginEnabled()) {
            logger.info('NetworkScanScheduler', 'scan-reseau plugin is disabled - stopping all schedulers');
            if (this.scanTask) {
                this.scanTask.stop();
                this.scanTask = null;
                logger.info('NetworkScanScheduler', 'Full scan scheduler stopped (plugin disabled)');
            }
            if (this.refreshTask) {
                this.refreshTask.stop();
                this.refreshTask = null;
                logger.info('NetworkScanScheduler', 'Refresh scheduler stopped (plugin disabled)');
            }
            return;
        }
        
        // If master switch is disabled, stop all schedulers
        if (!config.enabled) {
            logger.info('NetworkScanScheduler', 'Unified auto scan disabled (master switch) - stopping all schedulers');
            if (this.scanTask) {
                this.scanTask.stop();
                this.scanTask = null;
                logger.info('NetworkScanScheduler', 'Full scan scheduler stopped');
            }
            if (this.refreshTask) {
                this.refreshTask.stop();
                this.refreshTask = null;
                logger.info('NetworkScanScheduler', 'Refresh scheduler stopped');
            }
            return;
        }

        // Update full scan scheduler if configured and enabled
        if (config.fullScan && config.fullScan.enabled) {
            logger.info('NetworkScanScheduler', `Starting full scan scheduler: interval=${config.fullScan.interval}min, type=${config.fullScan.scanType}`);
            this.updateScanScheduler({
                enabled: true,
                interval: config.fullScan.interval,
                scanType: config.fullScan.scanType
            });
            
            // Update metrics: scheduler enabled
            metricsCollector.updateSchedulerMetrics(true);
        } else {
            // Stop full scan if disabled
            logger.info('NetworkScanScheduler', 'Stopping full scan scheduler (disabled in config)');
            if (this.scanTask) {
                this.scanTask.stop();
                this.scanTask = null;
            }
            
            // Update metrics: scheduler disabled if no refresh either
            if (!config.refresh || !config.refresh.enabled) {
                metricsCollector.updateSchedulerMetrics(false);
            }
        }

        // Update refresh scheduler if configured and enabled
        if (config.refresh && config.refresh.enabled) {
            logger.info('NetworkScanScheduler', `Starting refresh scheduler: interval=${config.refresh.interval}min`);
            this.updateRefreshScheduler({
                enabled: true,
                interval: config.refresh.interval
            });
            
            // Update metrics: scheduler enabled
            metricsCollector.updateSchedulerMetrics(true);
        } else {
            // Stop refresh if disabled
            logger.info('NetworkScanScheduler', 'Stopping refresh scheduler (disabled in config)');
            if (this.refreshTask) {
                this.refreshTask.stop();
                this.refreshTask = null;
            }
            
            // Update metrics: scheduler disabled if no full scan either
            if (!config.fullScan || !config.fullScan.enabled) {
                metricsCollector.updateSchedulerMetrics(false);
            }
        }
        
        logger.info('NetworkScanScheduler', 'Unified config update completed');
    }

    /**
     * Check plugin status and update schedulers accordingly
     * This should be called when the scan-reseau plugin is enabled/disabled
     */
    checkPluginStatusAndUpdate(): void {
        logger.info('NetworkScanScheduler', 'Checking plugin status and updating schedulers...');
        
        if (!this.isPluginEnabled()) {
            logger.info('NetworkScanScheduler', 'Plugin is disabled - stopping all schedulers');
            if (this.scanTask) {
                this.scanTask.stop();
                this.scanTask = null;
            }
            if (this.refreshTask) {
                this.refreshTask.stop();
                this.refreshTask = null;
            }
            return;
        }

        // Plugin is enabled - reload config and start schedulers
        logger.info('NetworkScanScheduler', 'Plugin is enabled - reloading config and starting schedulers');
        this.loadAndStartScanScheduler();
        this.loadAndStartRefreshScheduler();
    }

    /**
     * Temporarily disable auto scans during manual scan
     * This prevents multiple scans from running simultaneously
     */
    pauseAutoScans(): void {
        if (!this.manualScanInProgress) {
            this.manualScanInProgress = true;
            logger.info('NetworkScanScheduler', 'Auto scans paused (manual scan in progress)');
        }
    }

    /**
     * Resume auto scans after manual scan completes
     */
    resumeAutoScans(): void {
        if (this.manualScanInProgress) {
            this.manualScanInProgress = false;
            logger.info('NetworkScanScheduler', 'Auto scans resumed (manual scan completed)');
        }
    }

    /**
     * Check if manual scan is in progress
     */
    isManualScanInProgress(): boolean {
        return this.manualScanInProgress;
    }
}

export const networkScanScheduler = new NetworkScanSchedulerService();
export type { UnifiedAutoScanConfig };

