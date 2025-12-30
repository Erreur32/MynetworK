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
    scanType: 'full' | 'quick';
}

// New unified configuration structure
interface UnifiedAutoScanConfig {
    enabled: boolean; // Master switch - if false, all auto scans are disabled
    fullScan?: {
        enabled: boolean;
        interval: number; // minutes: 15, 30, 60, 120, 360, 720, 1440
        // scanType retiré - scan complet toujours en mode 'full'
    };
    refresh?: {
        enabled: boolean;
        interval: number; // minutes: 5, 10, 15, 30, 60
        scanType: 'full' | 'quick'; // Choix entre quick et full pour refresh
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
                
                // Verify schedulers are started after a short delay
                setTimeout(() => {
                    this.verifySchedulersStarted();
                }, 2000); // Wait 2 more seconds to verify schedulers are running
                
                // Trigger a quick refresh on startup to update stats and ensure everything is up to date
                // This runs after schedulers are initialized (with additional delay for database readiness)
                setTimeout(() => {
                    this.triggerStartupRefresh();
                }, 8000); // Wait 8 seconds total (5s initial + 3s additional) to ensure everything is ready
                
                logger.info('NetworkScanScheduler', 'Network scan scheduler initialized successfully');
            } catch (error) {
                logger.error('NetworkScanScheduler', 'Failed to initialize scheduler:', error);
                logger.error('NetworkScanScheduler', 'Error stack:', (error as Error).stack);
            }
        }, 5000); // Wait 5 seconds for database to be ready (Docker may need more time)
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
                
                // Note: Initial scan on startup is disabled by default to avoid unexpected scans after Docker restart
                // Users can manually trigger a scan or wait for the scheduled scan according to their configuration
                // If you want to enable automatic scan on startup, uncomment the code below:
                /*
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
                        'full' // Toujours 'full' pour scan complet
                    ).then(() => {
                        logger.info('NetworkScanScheduler', `Initial scan on startup completed (range: ${defaultRange})`);
                    }).catch((error) => {
                        logger.error('NetworkScanScheduler', 'Initial scan on startup failed:', error);
                    });
                }
                */
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
            // However, we need to verify that refresh scheduler is actually started
            const unifiedConfigStr = AppConfigRepository.get('network_scan_unified_auto');
            if (unifiedConfigStr) {
                try {
                    const unifiedConfig: UnifiedAutoScanConfig = JSON.parse(unifiedConfigStr);
                    // Verify that refresh scheduler is started if it should be
                    if (unifiedConfig.enabled && unifiedConfig.refresh?.enabled && this.isPluginEnabled()) {
                        // If refresh should be enabled but task is null, restart it
                        if (!this.refreshTask) {
                            logger.warn('NetworkScanScheduler', 'Refresh scheduler should be enabled but task is null - restarting...');
                            this.updateUnifiedConfig(unifiedConfig);
                        }
                    }
                } catch (e) {
                    logger.error('NetworkScanScheduler', 'Failed to parse unified config in loadAndStartRefreshScheduler:', e);
                }
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

        const scanType = 'full'; // Scan complet toujours en mode 'full'
        logger.info('NetworkScanScheduler', `Scheduling auto scan: every ${config.interval} minutes (${cronExpression}), type: ${scanType}`);

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

            logger.info('NetworkScanScheduler', `Executing scheduled scan (type: ${scanType})...`);
            try {
                // Auto-detect network range
                const range = networkScanService.getNetworkRange();
                if (!range) {
                    logger.warn('NetworkScanScheduler', 'Could not auto-detect network range, skipping scan');
                    return;
                }

                await networkScanService.scanNetwork(range, scanType);
                
                // Update scheduler metrics: record last run
                metricsCollector.updateSchedulerMetrics(true, Date.now());
                
                // Track last auto scan
                const { AppConfigRepository } = await import('../database/models/AppConfig.js');
                AppConfigRepository.set('network_scan_last_auto', JSON.stringify({
                    type: 'full',
                    scanType: scanType, // Toujours 'full'
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

        logger.info('NetworkScanScheduler', `Scheduling auto refresh: every ${config.interval} minutes (${cronExpression}), type: ${config.scanType || 'quick'}`);

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

            const scanType = config.scanType || 'quick';
            logger.info('NetworkScanScheduler', `Executing scheduled refresh (type: ${scanType})...`);
            try {
                await networkScanService.refreshExistingIps(scanType);
                
                // Track last auto refresh
                const { AppConfigRepository } = await import('../database/models/AppConfig.js');
                AppConfigRepository.set('network_scan_last_auto', JSON.stringify({
                    type: 'refresh',
                    scanType: scanType,
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
        // Check if a scan is actually running by checking scan progress
        const scanProgress = networkScanService.getScanProgress();
        const isScanRunning = scanProgress !== null && scanProgress.isActive === true;
        
        return {
            enabled: this.scanTask !== null,
            running: isScanRunning // Only true if a scan is actually in progress
        };
    }

    /**
     * Get current refresh scheduler status
     */
    getRefreshStatus(): { enabled: boolean; running: boolean } {
        const status = this.refreshTask?.getStatus();
        // Check if a refresh is actually running by checking scan progress
        // Note: refresh uses the same progress tracking as scan
        const scanProgress = networkScanService.getScanProgress();
        const isRefreshRunning = scanProgress !== null && scanProgress.isActive === true;
        
        return {
            enabled: this.refreshTask !== null,
            running: isRefreshRunning // Only true if a refresh is actually in progress
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
            logger.info('NetworkScanScheduler', `Starting full scan scheduler: interval=${config.fullScan.interval}min, type=full (always)`);
            this.updateScanScheduler({
                enabled: true,
                interval: config.fullScan.interval,
                scanType: 'full' // Toujours 'full' pour scan complet
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
            logger.info('NetworkScanScheduler', `Starting refresh scheduler: interval=${config.refresh.interval}min, type=${config.refresh.scanType || 'quick'}`);
            this.updateRefreshScheduler({
                enabled: true,
                interval: config.refresh.interval,
                scanType: config.refresh.scanType || 'quick'
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

    /**
     * Trigger a quick refresh on startup to update stats and ensure everything is up to date
     * This runs automatically after Docker restart
     */
    private async triggerStartupRefresh(): Promise<void> {
        try {
            // Only trigger refresh if plugin is enabled
            if (!this.isPluginEnabled()) {
                logger.info('NetworkScanScheduler', 'Plugin is disabled - skipping startup refresh');
                return;
            }

            // Check if there are any existing IPs to refresh
            // Use NetworkScanRepository directly to check for existing IPs
            const { NetworkScanRepository } = await import('../database/models/NetworkScan.js');
            const existingScans = NetworkScanRepository.find({ limit: 1 });
            if (existingScans.length === 0) {
                logger.info('NetworkScanScheduler', 'No existing IPs found - skipping startup refresh');
                return;
            }

            // Get total count for logging
            const allScans = NetworkScanRepository.find({ limit: 10000 });
            const totalIps = allScans.length;
            logger.info('NetworkScanScheduler', `Triggering startup refresh for ${totalIps} existing IPs...`);
            
            // Trigger a quick refresh (ping only, no MAC/hostname detection)
            const result = await networkScanService.refreshExistingIps('quick');
            
            logger.info('NetworkScanScheduler', `Startup refresh completed: ${result.online} online, ${result.offline} offline, ${result.scanned} scanned in ${result.duration}ms`);
        } catch (error: any) {
            // Don't fail startup if refresh fails - just log the error
            logger.error('NetworkScanScheduler', `Failed to trigger startup refresh: ${error.message || error}`);
            logger.debug('NetworkScanScheduler', `Startup refresh error stack: ${error.stack || 'N/A'}`);
        }
    }

    /**
     * Verify that schedulers are started correctly after initialization
     * This helps detect issues after container restart
     */
    private verifySchedulersStarted(): void {
        try {
            const unifiedConfigStr = AppConfigRepository.get('network_scan_unified_auto');
            if (!unifiedConfigStr) {
                logger.debug('NetworkScanScheduler', 'No unified config found - skipping verification');
                return;
            }

            const unifiedConfig: UnifiedAutoScanConfig = JSON.parse(unifiedConfigStr);
            
            if (!unifiedConfig.enabled) {
                logger.debug('NetworkScanScheduler', 'Unified config is disabled - schedulers should not be running');
                return;
            }

            if (!this.isPluginEnabled()) {
                logger.debug('NetworkScanScheduler', 'Plugin is disabled - schedulers should not be running');
                return;
            }

            // Check full scan scheduler
            if (unifiedConfig.fullScan?.enabled) {
                if (!this.scanTask) {
                    logger.warn('NetworkScanScheduler', 'Full scan scheduler should be enabled but task is null - restarting...');
                    this.updateUnifiedConfig(unifiedConfig);
                } else {
                    const status = this.scanTask.getStatus();
                    logger.info('NetworkScanScheduler', `Full scan scheduler status: ${status}`);
                    if (status !== 'scheduled' && status !== 'idle') {
                        logger.warn('NetworkScanScheduler', `Full scan scheduler has unexpected status: ${status} - restarting...`);
                        this.updateUnifiedConfig(unifiedConfig);
                    }
                }
            }

            // Check refresh scheduler
            if (unifiedConfig.refresh?.enabled) {
                if (!this.refreshTask) {
                    logger.warn('NetworkScanScheduler', 'Refresh scheduler should be enabled but task is null - restarting...');
                    this.updateUnifiedConfig(unifiedConfig);
                } else {
                    const status = this.refreshTask.getStatus();
                    logger.info('NetworkScanScheduler', `Refresh scheduler status: ${status}`);
                    if (status !== 'scheduled' && status !== 'idle') {
                        logger.warn('NetworkScanScheduler', `Refresh scheduler has unexpected status: ${status} - restarting...`);
                        this.updateUnifiedConfig(unifiedConfig);
                    }
                }
            }
        } catch (error) {
            logger.error('NetworkScanScheduler', 'Failed to verify schedulers:', error);
        }
    }
}

export const networkScanScheduler = new NetworkScanSchedulerService();
export type { UnifiedAutoScanConfig };

