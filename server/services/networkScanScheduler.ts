/**
 * Network Scan Scheduler Service
 * 
 * Handles automatic network scanning and refresh scheduling using node-cron
 */

import cron from 'node-cron';
import { AppConfigRepository } from '../database/models/AppConfig.js';
import { networkScanService } from './networkScanService.js';
import { logger } from '../utils/logger.js';

interface AutoScanConfig {
    enabled: boolean;
    interval: number; // minutes: 15, 30, 60, 120, 360, 720, 1440
    scanType: 'full' | 'quick';
}

interface AutoRefreshConfig {
    enabled: boolean;
    interval: number; // minutes: 5, 10, 15, 30, 60
}

class NetworkScanSchedulerService {
    private scanTask: cron.ScheduledTask | null = null;
    private refreshTask: cron.ScheduledTask | null = null;

    constructor() {
        // Load and start schedulers on initialization
        this.loadAndStartScanScheduler();
        this.loadAndStartRefreshScheduler();
    }

    /**
     * Load scan config from database and start/update scheduler
     */
    private loadAndStartScanScheduler() {
        try {
            const configStr = AppConfigRepository.get('network_scan_auto');
            if (configStr) {
                const config: AutoScanConfig = JSON.parse(configStr);
                this.updateScanScheduler(config);
            }
        } catch (error) {
            logger.error('NetworkScanScheduler', 'Failed to load scan config:', error);
        }
    }

    /**
     * Load refresh config from database and start/update scheduler
     */
    private loadAndStartRefreshScheduler() {
        try {
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
            logger.info('NetworkScanScheduler', `Executing scheduled scan (type: ${config.scanType})...`);
            try {
                // Auto-detect network range
                const range = networkScanService.getNetworkRange();
                if (!range) {
                    logger.warn('NetworkScanScheduler', 'Could not auto-detect network range, skipping scan');
                    return;
                }

                await networkScanService.scanNetwork(range, config.scanType);
                logger.info('NetworkScanScheduler', 'Scheduled scan completed successfully');
            } catch (error: any) {
                logger.error('NetworkScanScheduler', 'Scheduled scan failed:', error.message || error);
            }
        });
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
            logger.info('NetworkScanScheduler', 'Executing scheduled refresh...');
            try {
                await networkScanService.refreshExistingIps('quick');
                logger.info('NetworkScanScheduler', 'Scheduled refresh completed successfully');
            } catch (error: any) {
                logger.error('NetworkScanScheduler', 'Scheduled refresh failed:', error.message || error);
            }
        });
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
        return {
            enabled: this.scanTask !== null,
            running: this.scanTask !== null && this.scanTask.getStatus() === 'scheduled'
        };
    }

    /**
     * Get current refresh scheduler status
     */
    getRefreshStatus(): { enabled: boolean; running: boolean } {
        return {
            enabled: this.refreshTask !== null,
            running: this.refreshTask !== null && this.refreshTask.getStatus() === 'scheduled'
        };
    }
}

export const networkScanScheduler = new NetworkScanSchedulerService();

