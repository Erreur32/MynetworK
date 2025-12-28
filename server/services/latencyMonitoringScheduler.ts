/**
 * Latency Monitoring Scheduler Service
 * 
 * Handles automatic latency monitoring scheduling using node-cron
 * Pings monitored IPs every 15 seconds
 */

import cron from 'node-cron';
import { latencyMonitoringService } from './latencyMonitoringService.js';
import { logger } from '../utils/logger.js';

class LatencyMonitoringSchedulerService {
    private monitoringTask: ReturnType<typeof cron.schedule> | null = null;
    private isRunning: boolean = false;

    /**
     * Start the latency monitoring scheduler
     * Runs every 15 seconds (cron expression: every 15 seconds)
     */
    start(): void {
        if (this.monitoringTask) {
            logger.warn('LatencyMonitoringScheduler', 'Scheduler already started');
            return;
        }

        // Cron expression: every 15 seconds
        // Format: second minute hour day month dayOfWeek
        // */15 * * * * * means every 15 seconds
        const cronExpression = '*/15 * * * * *';

        logger.info('LatencyMonitoringScheduler', `Starting latency monitoring scheduler (every 15 seconds)`);

        this.monitoringTask = cron.schedule(cronExpression, async () => {
            await this.executeMonitoringCycle();
        }, {
            scheduled: true,
            timezone: 'Europe/Paris'
        } as any);

        this.isRunning = true;
        logger.success('LatencyMonitoringScheduler', 'Latency monitoring scheduler started');
    }

    /**
     * Stop the latency monitoring scheduler
     */
    stop(): void {
        if (this.monitoringTask) {
            this.monitoringTask.stop();
            this.monitoringTask = null;
            this.isRunning = false;
            logger.info('LatencyMonitoringScheduler', 'Latency monitoring scheduler stopped');
        }
    }

    /**
     * Execute one monitoring cycle
     * Pings all enabled IPs
     */
    private async executeMonitoringCycle(): Promise<void> {
        try {
            const enabledIps = latencyMonitoringService.getMonitoringStatus();
            
            if (enabledIps.length === 0) {
                // No IPs to monitor, skip
                return;
            }

            // Ping all enabled IPs
            // We ping sequentially to avoid overwhelming the system
            // In the future, we could add concurrent pings with a limit
            const pingPromises = enabledIps.map(ip => 
                latencyMonitoringService.pingAndRecord(ip).catch(error => {
                    logger.error('LatencyMonitoringScheduler', `Failed to ping ${ip} in cycle:`, error.message || error);
                })
            );

            await Promise.all(pingPromises);

            // Log occasionally (every ~100 cycles, approximately every 25 minutes)
            if (Math.random() < 0.01) {
                logger.debug('LatencyMonitoringScheduler', `Monitoring cycle completed for ${enabledIps.length} IP(s)`);
            }
        } catch (error: any) {
            logger.error('LatencyMonitoringScheduler', 'Error in monitoring cycle:', error.message || error);
        }
    }

    /**
     * Check if scheduler is running
     */
    isSchedulerRunning(): boolean {
        return this.isRunning && this.monitoringTask !== null;
    }

    /**
     * Get status of the scheduler
     */
    getStatus(): {
        running: boolean;
        enabledIpsCount: number;
    } {
        return {
            running: this.isRunning,
            enabledIpsCount: latencyMonitoringService.getMonitoringStatus().length
        };
    }
}

export const latencyMonitoringScheduler = new LatencyMonitoringSchedulerService();

