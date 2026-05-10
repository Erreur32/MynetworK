/**
 * Topology scheduler
 *
 * Daily cron at 04:00 to recompute and persist the topology snapshot.
 * Also runs once shortly after boot if no snapshot exists yet, so that the
 * first user visit after install doesn't see an empty graph.
 */

import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { topologyService } from './topologyService.js';
import { TopologySnapshotRepository } from '../database/models/TopologySnapshot.js';

const DAILY_EXPRESSION = '0 4 * * *';
const INITIAL_DELAY_MS = 15_000;

let task: ReturnType<typeof cron.schedule> | null = null;
let initialBuildTimer: NodeJS.Timeout | null = null;

export function startTopologyScheduler(): void {
    if (task) return;

    if (!cron.validate(DAILY_EXPRESSION)) {
        logger.error('TopologyScheduler', `Invalid cron expression: ${DAILY_EXPRESSION}`);
        return;
    }

    task = cron.schedule(DAILY_EXPRESSION, async () => {
        logger.info('TopologyScheduler', 'Running scheduled topology refresh');
        try {
            const graph = await topologyService.buildAndSave();
            logger.success(
                'TopologyScheduler',
                `Snapshot refreshed (nodes=${graph.nodes.length}, edges=${graph.edges.length}, sources=${graph.sources.join(',') || 'none'})`
            );
        } catch (error) {
            logger.error('TopologyScheduler', 'Scheduled refresh failed:', error);
        }
    });
    logger.success('TopologyScheduler', `Daily topology refresh scheduled (${DAILY_EXPRESSION})`);

    // Initial build: rebuild on boot if no snapshot exists OR if the stored
    // snapshot uses an outdated layout convention (topologyService.getStored()
    // returns null for stale schema). Delay so plugins have time to log in.
    initialBuildTimer = setTimeout(async () => {
        try {
            const fresh = await topologyService.getStored();
            if (fresh) return;
            const reason = TopologySnapshotRepository.get() ? 'stale schema' : 'no snapshot';
            logger.info('TopologyScheduler', `Initial build triggered (${reason})`);
            const graph = await topologyService.buildAndSave();
            logger.success(
                'TopologyScheduler',
                `Initial snapshot computed (nodes=${graph.nodes.length}, edges=${graph.edges.length})`
            );
        } catch (error) {
            logger.error('TopologyScheduler', 'Initial snapshot failed:', error);
        }
    }, INITIAL_DELAY_MS);
}

export function stopTopologyScheduler(): void {
    if (task) {
        task.stop();
        task = null;
    }
    if (initialBuildTimer) {
        clearTimeout(initialBuildTimer);
        initialBuildTimer = null;
    }
}
