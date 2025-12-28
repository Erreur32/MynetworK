/**
 * Latency Monitoring Service
 * 
 * Handles continuous latency monitoring for selected IP addresses
 * Pings IPs every 15 seconds and records measurements
 */

import { LatencyMonitoringRepository } from '../database/models/LatencyMonitoring.js';
import { networkScanService } from './networkScanService.js';
import { logger } from '../utils/logger.js';

export class LatencyMonitoringService {
    /**
     * Start monitoring for an IP address
     */
    startMonitoring(ip: string): void {
        try {
            LatencyMonitoringRepository.enableMonitoring(ip);
            logger.info('LatencyMonitoringService', `Started monitoring for IP: ${ip}`);
        } catch (error: any) {
            logger.error('LatencyMonitoringService', `Failed to start monitoring for ${ip}:`, error.message || error);
            throw error;
        }
    }

    /**
     * Stop monitoring for an IP address
     */
    stopMonitoring(ip: string): void {
        try {
            LatencyMonitoringRepository.disableMonitoring(ip);
            logger.info('LatencyMonitoringService', `Stopped monitoring for IP: ${ip}`);
        } catch (error: any) {
            logger.error('LatencyMonitoringService', `Failed to stop monitoring for ${ip}:`, error.message || error);
            throw error;
        }
    }

    /**
     * Check if monitoring is enabled for an IP
     */
    isMonitoringEnabled(ip: string): boolean {
        return LatencyMonitoringRepository.isMonitoringEnabled(ip);
    }

    /**
     * Get all IPs with monitoring enabled
     */
    getMonitoringStatus(): string[] {
        return LatencyMonitoringRepository.getEnabledIps();
    }

    /**
     * Get monitoring status for multiple IPs
     */
    getMonitoringStatusBatch(ips: string[]): Record<string, boolean> {
        return LatencyMonitoringRepository.getMonitoringStatusBatch(ips);
    }

    /**
     * Ping an IP and record the measurement
     * This is called by the scheduler every 15 seconds for each monitored IP
     */
    async pingAndRecord(ip: string): Promise<void> {
        try {
            // Use the existing pingHost method from networkScanService
            const result = await networkScanService.pingHost(ip);
            
            // Record the measurement
            const latency = result.success ? (result.latency ?? null) : null;
            const packetLoss = !result.success;
            
            // Log every measurement for debugging (temporarily)
            logger.debug('LatencyMonitoringService', `[${ip}] Ping result: success=${result.success}, latency=${latency}ms, packetLoss=${packetLoss}`);
            
            LatencyMonitoringRepository.createMeasurement(ip, latency, packetLoss);
            
            // Log occasionally for debugging (only failures or high latency)
            if (packetLoss || (latency !== null && latency > 100)) {
                logger.debug('LatencyMonitoringService', `[${ip}] Ping recorded: ${packetLoss ? 'PACKET LOSS' : latency + 'ms'}`);
            }
        } catch (error: any) {
            // Log error but don't throw - we want to continue monitoring other IPs
            logger.error('LatencyMonitoringService', `Failed to ping and record for ${ip}:`, error.message || error);
            
            // Record as packet loss
            try {
                LatencyMonitoringRepository.createMeasurement(ip, null, true);
            } catch (recordError: any) {
                logger.error('LatencyMonitoringService', `Failed to record packet loss for ${ip}:`, recordError.message || recordError);
            }
        }
    }

    /**
     * Get measurements for an IP
     */
    getMeasurements(ip: string, days: number = 30): Array<{
        latency: number | null;
        packetLoss: boolean;
        measuredAt: Date;
    }> {
        const measurements = LatencyMonitoringRepository.getMeasurements(ip, days);
        return measurements.map(m => ({
            latency: m.latency,
            packetLoss: m.packetLoss,
            measuredAt: m.measuredAt
        }));
    }

    /**
     * Get statistics for an IP
     */
    getStatistics(ip: string): {
        avg1h: number | null;
        max: number | null;
        min: number | null;
        avg24h: number | null;
        packetLossPercent: number;
        totalMeasurements: number;
    } {
        return LatencyMonitoringRepository.getStatistics(ip);
    }

    /**
     * Get statistics for multiple IPs in batch
     */
    getStatisticsBatch(ips: string[]): Record<string, { avg1h: number | null; max: number | null }> {
        return LatencyMonitoringRepository.getStatisticsBatch(ips);
    }
}

export const latencyMonitoringService = new LatencyMonitoringService();

