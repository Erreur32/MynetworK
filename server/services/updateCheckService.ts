/**
 * Update Check Service
 *
 * Runs update check against GitHub/registry and caches result for 12h.
 * Scheduler runs the check every 12 hours when enabled.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDatabase } from '../database/connection.js';
import { compareVersions } from '../utils/version.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const SCHEDULER_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours

export interface UpdateCheckResult {
  enabled: boolean;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  error?: string;
}

let cachedResult: UpdateCheckResult | null = null;
let cachedAt: number = 0;
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

function getCurrentVersion(): string {
  try {
    const packagePath = join(__dirname, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    return packageJson.version || '0.0.0';
  } catch (error) {
    logger.error('Updates', 'Error reading package.json');
    return '0.0.0';
  }
}

/**
 * Perform the actual check (fetch from GitHub/registry). Used by GET /check and scheduler.
 */
export async function performUpdateCheck(): Promise<UpdateCheckResult> {
  const db = getDatabase();
  const configRow = db.prepare('SELECT value FROM app_config WHERE key = ?').get('update_check_config') as { value: string } | undefined;
  let updateCheckEnabled = false;
  if (configRow) {
    try {
      const config = JSON.parse(configRow.value);
      updateCheckEnabled = config.enabled === true;
    } catch {
      // ignore
    }
  }

  if (!updateCheckEnabled) {
    return {
      enabled: false,
      currentVersion: getCurrentVersion(),
      latestVersion: null,
      updateAvailable: false
    };
  }

  const currentVersion = getCurrentVersion();
  let latestVersion: string | null = null;
  let updateAvailable = false;
  let error: string | null = null;
  let versionTags: string[] = [];
  let lastError: string | null = null;

  const githubToken = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'MynetworK-UpdateChecker/1.0',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (githubToken) headers['Authorization'] = `token ${githubToken}`;

  try {
    // Method 1: GitHub Tags API
    try {
      const tagsResponse = await fetch('https://api.github.com/repos/erreur32/MynetworK/tags', { headers });
      if (tagsResponse.ok) {
        const tags = await tagsResponse.json() as Array<{ name: string }>;
        if (tags.length > 0) {
          versionTags = tags
            .map(tag => tag.name)
            .filter(tag => {
              const ok = /^\d+\.\d+\.\d+/.test(tag) || /^v\d+\.\d+\.\d+/.test(tag) || /^\d+\.\d+$/.test(tag) || /^v\d+\.\d+$/.test(tag);
              const excluded = ['latest', 'main', 'dev', 'develop', 'master', 'staging', 'beta', 'alpha', 'rc'].includes(tag.toLowerCase());
              return ok && !excluded;
            })
            .map(tag => tag.replace(/^v/, ''))
            .filter((tag, i, self) => self.indexOf(tag) === i)
            .sort((a, b) => compareVersions(b, a));
          if (versionTags.length > 0) {
            latestVersion = versionTags[0];
            updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
            return { enabled: true, currentVersion, latestVersion, updateAvailable };
          }
        }
      } else if (tagsResponse.status === 403) {
        const reset = tagsResponse.headers.get('x-ratelimit-reset');
        lastError = `GitHub API rate limit. Reset: ${reset ? new Date(parseInt(reset) * 1000).toISOString() : 'unknown'}. Set GITHUB_TOKEN to avoid.`;
      } else {
        lastError = `GitHub API: ${tagsResponse.status} ${tagsResponse.statusText}`;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'GitHub Tags request failed';
    }

    // Method 2: Docker Registry
    try {
      const dockerResponse = await fetch('https://ghcr.io/v2/erreur32/mynetwork/tags/list', {
        headers: { 'Accept': 'application/json', 'User-Agent': 'MynetworK-UpdateChecker/1.0' }
      });
      if (dockerResponse.ok) {
        const data = await dockerResponse.json() as { tags?: string[] };
        if (data.tags?.length) {
          versionTags = data.tags
            .filter(tag => {
              const ok = /^\d+\.\d+\.\d+/.test(tag) || /^v\d+\.\d+\.\d+/.test(tag);
              const excluded = ['latest', 'main', 'dev'].includes(tag.toLowerCase());
              return ok && !excluded;
            })
            .map(tag => tag.replace(/^v/, ''))
            .filter((tag, i, self) => self.indexOf(tag) === i)
            .sort((a, b) => compareVersions(b, a));
          if (versionTags.length > 0) {
            latestVersion = versionTags[0];
            updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
            return { enabled: true, currentVersion, latestVersion, updateAvailable };
          }
        }
      } else if (dockerResponse.status === 401) {
        error = 'Registry requires authentication.';
      } else {
        error = `Registry: ${dockerResponse.status} ${dockerResponse.statusText}`;
      }
    } catch (e) {
      if (!error) error = e instanceof Error ? e.message : 'Registry request failed';
    }

    if (versionTags.length > 0) {
      latestVersion = versionTags[0];
      updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
    } else {
      error = error || lastError || 'Unable to retrieve versions.';
    }
  } catch (err) {
    logger.error('Updates', 'Check failed: ' + (err instanceof Error ? err.message : String(err)));
    error = err instanceof Error ? err.message : 'Unknown error';
  }

  return {
    enabled: true,
    currentVersion,
    latestVersion,
    updateAvailable,
    error: error || undefined
  };
}

export interface CheckResultWithTime extends UpdateCheckResult {
  lastCheckAt?: string; // ISO date
}

/**
 * Get check result: use cache if still valid (< 12h), otherwise run check and cache.
 */
export async function getCheckResult(): Promise<CheckResultWithTime> {
  const now = Date.now();
  const configRow = getDatabase().prepare('SELECT value FROM app_config WHERE key = ?').get('update_check_config') as { value: string } | undefined;
  let enabled = false;
  if (configRow) {
    try {
      const config = JSON.parse(configRow.value);
      enabled = config.enabled === true;
    } catch {
      // ignore
    }
  }

  if (!enabled) {
    const disabledResult: CheckResultWithTime = {
      enabled: false,
      currentVersion: getCurrentVersion(),
      latestVersion: null,
      updateAvailable: false
    };
    return disabledResult;
  }

  if (cachedResult && (now - cachedAt) < CACHE_TTL_MS) {
    return {
      ...cachedResult,
      lastCheckAt: new Date(cachedAt).toISOString()
    };
  }

  const result = await performUpdateCheck();
  cachedResult = result;
  cachedAt = now;
  return {
    ...result,
    lastCheckAt: new Date(cachedAt).toISOString()
  };
}

/**
 * Force a fresh update check (bypass cache). Updates cache and returns result with lastCheckAt.
 */
export async function getCheckResultForce(): Promise<CheckResultWithTime> {
  const configRow = getDatabase().prepare('SELECT value FROM app_config WHERE key = ?').get('update_check_config') as { value: string } | undefined;
  let enabled = false;
  if (configRow) {
    try {
      const config = JSON.parse(configRow.value);
      enabled = config.enabled === true;
    } catch {
      // ignore
    }
  }

  if (!enabled) {
    return {
      enabled: false,
      currentVersion: getCurrentVersion(),
      latestVersion: null,
      updateAvailable: false
    };
  }

  const result = await performUpdateCheck();
  cachedResult = result;
  cachedAt = Date.now();
  return {
    ...result,
    lastCheckAt: new Date(cachedAt).toISOString()
  };
}

/**
 * Start the 12h scheduler. Runs check now and then every 12h. Call when config is enabled.
 */
export function startScheduler(): void {
  stopScheduler();
  logger.info('Updates', 'Starting update check scheduler (every 12h)');
  performUpdateCheck().then((result) => {
    cachedResult = result;
    cachedAt = Date.now();
  }).catch((err) => logger.error('Updates', 'Scheduler initial check failed: ' + (err instanceof Error ? err.message : String(err))));
  schedulerTimer = setInterval(() => {
    performUpdateCheck().then((result) => {
      cachedResult = result;
      cachedAt = Date.now();
      if (result.updateAvailable) {
        logger.info('Updates', `New version available: ${result.latestVersion} (current: ${result.currentVersion})`);
      }
    }).catch((err) => logger.error('Updates', 'Scheduled check failed: ' + (err instanceof Error ? err.message : String(err))));
  }, SCHEDULER_INTERVAL_MS);
}

/**
 * Stop the scheduler. Call when config is disabled.
 */
export function stopScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    logger.info('Updates', 'Update check scheduler stopped');
  }
}
