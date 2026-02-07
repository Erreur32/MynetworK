/**
 * Info routes: project README, CHANGELOG and GitHub repo stats.
 * Used by Administration > Info to display README/CHANGELOG content and repository statistics.
 * Fetches from GitHub/raw content via server to avoid CORS and rate limits on the client.
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

const GITHUB_RAW_README_URL = 'https://raw.githubusercontent.com/Erreur32/MynetworK/main/README.md';
const GITHUB_RAW_CHANGELOG_URL = 'https://raw.githubusercontent.com/Erreur32/MynetworK/main/CHANGELOG.md';
const GITHUB_REPO_API_URL = 'https://api.github.com/repos/Erreur32/MynetworK';

/**
 * GET /api/info/readme
 * Fetches the project README from GitHub raw content and returns it as plain text.
 * No auth required (public project info).
 */
router.get('/readme', asyncHandler(async (_req, res) => {
  const response = await fetch(GITHUB_RAW_README_URL, {
    headers: { 'Accept': 'text/plain' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    res.status(response.status).json({ success: false, error: { code: 'FETCH_README', message: 'Failed to fetch README' } });
    return;
  }
  const content = await response.text();
  res.json({ success: true, result: { content } });
}));

/**
 * GET /api/info/changelog
 * Fetches the project CHANGELOG from GitHub raw content and returns it as plain text.
 * No auth required (public project info).
 */
router.get('/changelog', asyncHandler(async (_req, res) => {
  const response = await fetch(GITHUB_RAW_CHANGELOG_URL, {
    headers: { 'Accept': 'text/plain' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    res.status(response.status).json({ success: false, error: { code: 'FETCH_CHANGELOG', message: 'Failed to fetch changelog' } });
    return;
  }
  const content = await response.text();
  res.json({ success: true, result: { content } });
}));

/**
 * GET /api/info/repo-stats
 * Fetches repository statistics from GitHub API (stars, forks, watchers, open_issues).
 * No auth required; unauthenticated requests are rate-limited by GitHub (60/hour).
 */
router.get('/repo-stats', asyncHandler(async (_req, res) => {
  const response = await fetch(GITHUB_REPO_API_URL, {
    headers: { 'Accept': 'application/vnd.github.v3+json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    res.status(response.status).json({
      success: false,
      error: { code: 'FETCH_REPO_STATS', message: 'Failed to fetch repo stats' },
    });
    return;
  }
  const data = (await response.json()) as {
    stargazers_count?: number;
    forks_count?: number;
    watchers_count?: number;
    open_issues_count?: number;
  };
  res.json({
    success: true,
    result: {
      stars: data.stargazers_count ?? 0,
      forks: data.forks_count ?? 0,
      watchers: data.watchers_count ?? 0,
      open_issues: data.open_issues_count ?? 0,
    },
  });
}));

export default router;
