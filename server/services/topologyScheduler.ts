/**
 * Topology scheduler
 *
 * Daily cron at 04:00 to recompute and persist the topology snapshot.
 * Also runs once shortly after boot if no snapshot exists yet — and once
 * more after a longer delay if an enabled plugin was missing from the
 * initial build (typically because UniFi was still logging in).
 */

import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { topologyService } from './topologyService.js';
import { pluginManager } from './pluginManager.js';
import { TopologySnapshotRepository } from '../database/models/TopologySnapshot.js';
import type { SourcePlugin, TopologyGraph } from '../types/topology.js';

const DAILY_EXPRESSION = '0 4 * * *';
const INITIAL_DELAY_MS = 30_000;
const RETRY_DELAY_MS = 60_000;
const ALL_SOURCES: SourcePlugin[] = ['freebox', 'unifi', 'scan-reseau'];

let task: ReturnType<typeof cron.schedule> | null = null;
let initialBuildTimer: NodeJS.Timeout | null = null;
let retryTimer: NodeJS.Timeout | null = null;

function enabledPluginIds(): SourcePlugin[] {
    return ALL_SOURCES.filter(id => pluginManager.getPlugin(id)?.isEnabled());
}

function missingFromGraph(graph: TopologyGraph): SourcePlugin[] {
    return enabledPluginIds().filter(p => !graph.sources.includes(p));
}

function summarize(graph: TopologyGraph): string {
    const sources = graph.sources.length > 0 ? graph.sources.join(',') : 'none';
    return `nodes=${graph.nodes.length}, edges=${graph.edges.length}, sources=${sources}`;
}

function scheduleRetry(reason: string): void {
    if (retryTimer) return;
    logger.info('TopologyScheduler', `${reason} — retry in ${RETRY_DELAY_MS / 1000}s`);
    retryTimer = setTimeout(async () => {
        retryTimer = null;
        try {
            const graph = await topologyService.buildAndSave();
            const stillMissing = missingFromGraph(graph);
            if (stillMissing.length === 0) {
                logger.success('TopologyScheduler', `Retry succeeded (${summarize(graph)})`);
            } else {
                logger.warn('TopologyScheduler', `Retry still missing: ${stillMissing.join(',')}`);
            }
        } catch (error) {
            logger.error('TopologyScheduler', 'Retry failed:', error);
        }
    }, RETRY_DELAY_MS);
}

async function runInitialBuild(): Promise<void> {
    try {
        const fresh = await topologyService.getStored();
        let graph: TopologyGraph;
        if (fresh) {
            graph = fresh;
        } else {
            const reason = TopologySnapshotRepository.get() ? 'stale schema' : 'no snapshot';
            logger.info('TopologyScheduler', `Initial build triggered (${reason})`);
            graph = await topologyService.buildAndSave();
            logger.success('TopologyScheduler', `Initial snapshot computed (${summarize(graph)})`);
        }
        const missing = missingFromGraph(graph);
        if (missing.length > 0) scheduleRetry(`Snapshot missing ${missing.join(',')}`);
    } catch (error) {
        logger.error('TopologyScheduler', 'Initial snapshot failed:', error);
    }
}

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
            logger.success('TopologyScheduler', `Snapshot refreshed (${summarize(graph)})`);
        } catch (error) {
            logger.error('TopologyScheduler', 'Scheduled refresh failed:', error);
        }
    });
    logger.success('TopologyScheduler', `Daily topology refresh scheduled (${DAILY_EXPRESSION})`);

    // Wait long enough for plugins (especially UniFi) to authenticate before
    // we hit their APIs — otherwise the snapshot will be missing UniFi data.
    initialBuildTimer = setTimeout(runInitialBuild, INITIAL_DELAY_MS);
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
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }
}
