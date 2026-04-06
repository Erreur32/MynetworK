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
  /** First line of the commit message for the latest tag */
  releaseTitle?: string;
  /** Full commit message body (minus first line) for the latest tag */
  releaseNotes?: string;
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
 * Fetch commit message for a given SHA and split into title + body.
 */
async function fetchCommitMessage(sha: string, headers: Record<string, string>): Promise<{ title: string; body: string } | null> {
  try {
    const url = `https://api.github.com/repos/erreur32/MynetworK/git/commits/${sha}`;
    const response = await fetch(url, { headers });
    if (!response.ok) return null;
    const data = await response.json() as { message?: string };
    const message = data.message || '';
    const lines = message.split('\n');
    const title = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();
    return { title, body };
  } catch {
    return null;
  }
}

/**
 * Check if the Docker image for a given version tag is available in GHCR.
 * This is the definitive proof that the CI build completed and the image was pushed.
 * Uses the OCI manifest endpoint — returns true only if the tag exists in the registry.
 */
async function isDockerImageReady(version: string): Promise<boolean> {
  try {
    // Step 1: Get anonymous token from GHCR (required even for public images)
    let token: string | null = null;
    try {
      const tokenRes = await fetch(
        'https://ghcr.io/token?scope=repository:erreur32/mynetwork:pull',
        { headers: { 'User-Agent': 'MynetworK-UpdateChecker/1.0' } }
      );
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json() as { token?: string };
        token = tokenData.token || null;
      }
    } catch {
      // Cannot get token — cannot verify, assume not ready
      logger.warn('Updates', 'Cannot get GHCR anonymous token');
      return false;
    }

    if (!token) {
      logger.warn('Updates', 'No GHCR token received — cannot verify image');
      return false;
    }

    // Step 2: Check manifest with token — try 'v' prefix first, then without
    const tags = [`v${version}`, version];
    for (const tag of tags) {
      const url = `https://ghcr.io/v2/erreur32/mynetwork/manifests/${tag}`;
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          'Accept': 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'MynetworK-UpdateChecker/1.0'
        }
      });
      if (response.ok) {
        logger.info('Updates', `Docker image ready in GHCR: ${tag}`);
        return true;
      }
      // 404 = tag does not exist yet (build not finished)
      // 401 = token invalid (should not happen with fresh token)
    }
    logger.info('Updates', `Docker image not yet available in GHCR for version ${version}`);
    return false;
  } catch (e) {
    // Network error — assume not ready (safer than false positive)
    logger.warn('Updates', `GHCR manifest check failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/**
 * Check if the GitHub build (CI check runs) for a given commit SHA is validated (all completed runs passed).
 * Returns true if at least one check run completed successfully and none failed.
 */
async function isBuildValidated(sha: string, headers: Record<string, string>): Promise<boolean> {
  try {
    const url = `https://api.github.com/repos/erreur32/MynetworK/commits/${sha}/check-runs`;
    const response = await fetch(url, { headers });
    if (!response.ok) {
      // If we can't check (e.g. no token, rate limit), fall back to allowing the version
      logger.warn('Updates', `Cannot verify build status for ${sha}: ${response.status}`);
      return true;
    }
    const data = await response.json() as { total_count: number; check_runs: Array<{ status: string; conclusion: string | null; name: string }> };
    if (data.total_count === 0) {
      // No check runs → build not validated
      logger.warn('Updates', `No CI check runs found for commit ${sha.slice(0, 7)} — skipping`);
      return false;
    }
    // ALL check runs must be completed (no in_progress or queued)
    const allCompleted = data.check_runs.every(r => r.status === 'completed');
    if (!allCompleted) {
      const pending = data.check_runs.filter(r => r.status !== 'completed').map(r => r.name);
      logger.info('Updates', `Build not finished for ${sha.slice(0, 7)} — pending: ${pending.join(', ')}`);
      return false;
    }
    const hasFailed = data.check_runs.some(r => r.conclusion === 'failure' || r.conclusion === 'cancelled');
    const hasSuccess = data.check_runs.some(r => r.conclusion === 'success');
    return hasSuccess && !hasFailed;
  } catch (e) {
    logger.warn('Updates', `Build validation check failed: ${e instanceof Error ? e.message : String(e)}`);
    return true; // network error → don't block the update check
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
        const tags = await tagsResponse.json() as Array<{ name: string; commit: { sha: string } }>;
        if (tags.length > 0) {
          // Filter to valid version tags, preserve sha for build validation
          const validTags = tags
            .filter(tag => {
              const ok = /^\d+\.\d+\.\d+/.test(tag.name) || /^v\d+\.\d+\.\d+/.test(tag.name) || /^\d+\.\d+$/.test(tag.name) || /^v\d+\.\d+$/.test(tag.name);
              const excluded = ['latest', 'main', 'dev', 'develop', 'master', 'staging', 'beta', 'alpha', 'rc'].includes(tag.name.toLowerCase());
              return ok && !excluded;
            })
            .map(tag => ({ version: tag.name.replace(/^v/, ''), sha: tag.commit.sha }))
            .filter((tag, i, self) => self.findIndex(t => t.version === tag.version) === i)
            .sort((a, b) => compareVersions(b.version, a.version));

          // Find the most recent tag whose build is validated AND Docker image is ready in GHCR
          for (const tag of validTags) {
            const dockerReady = await isDockerImageReady(tag.version);
            if (!dockerReady) {
              logger.info('Updates', `Skipping ${tag.version} — Docker image not yet in GHCR`);
              continue;
            }
            const validated = await isBuildValidated(tag.sha, headers);
            if (validated) {
              versionTags = [tag.version];
              latestVersion = tag.version;
              updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
              logger.info('Updates', `Latest validated version: ${latestVersion} (build OK for ${tag.sha.slice(0, 7)}, image in GHCR)`);
              const commitMsg = await fetchCommitMessage(tag.sha, headers);
              return {
                enabled: true,
                currentVersion,
                latestVersion,
                updateAvailable,
                releaseTitle: commitMsg?.title,
                releaseNotes: commitMsg?.body
              };
            } else {
              logger.info('Updates', `Skipping ${tag.version} — CI build not validated for ${tag.sha.slice(0, 7)}`);
            }
          }
          // All tags failed build check
          lastError = 'No version with a validated build found.';
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
