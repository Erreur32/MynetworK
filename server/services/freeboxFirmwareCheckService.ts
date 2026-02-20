/**
 * Freebox Firmware Check Service
 *
 * Periodically scrapes dev.freebox.fr/blog for latest firmware versions
 * (Freebox Server + Player), compares with current installed firmware,
 * and caches the result for display in the UI.
 */

import { getDatabase } from '../database/connection.js';
import { compareVersions } from '../utils/version.js';
import { logger } from '../utils/logger.js';

const BLOG_URL = 'https://dev.freebox.fr/blog/';
const CONFIG_KEY = 'freebox_firmware_check_config';

export interface FirmwareEntry {
  latestVersion: string;
  currentVersion?: string;
  updateAvailable: boolean;
  changelog: string;
  date: string;
  blogUrl: string;
  model?: string;
}

export interface FreeboxFirmwareInfo {
  server: FirmwareEntry;
  player: FirmwareEntry | null;
  lastCheck: string;
}

interface FirmwareCheckConfig {
  enabled: boolean;
  intervalHours: number;
}

const DEFAULT_CONFIG: FirmwareCheckConfig = {
  enabled: true,
  intervalHours: 6,
};

const DATE_PATTERN = /Le\s+(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})\s+[àa]\s+(\d{1,2}):(\d{2})/i;

/** Decode HTML entities for proper French accents and quotes */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&agrave;/g, 'à')
    .replace(/&eacute;/g, 'é')
    .replace(/&egrave;/g, 'è')
    .replace(/&ecirc;/g, 'ê')
    .replace(/&ccedil;/g, 'ç')
    .replace(/&icirc;/g, 'î')
    .replace(/&ucirc;/g, 'û')
    .replace(/&ocirc;/g, 'ô')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

class FreeboxFirmwareCheckService {
  private cachedInfo: FreeboxFirmwareInfo | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isChecking = false;

  getConfig(): FirmwareCheckConfig {
    try {
      const db = getDatabase();
      const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(CONFIG_KEY) as { value: string } | undefined;
      if (row) {
        const parsed = JSON.parse(row.value) as Partial<FirmwareCheckConfig>;
        return {
          enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
          intervalHours: Math.min(24, Math.max(1, parsed.intervalHours ?? DEFAULT_CONFIG.intervalHours)),
        };
      }
    } catch (error) {
      logger.error('FreeboxFirmwareCheck', 'Failed to load config:', error);
    }
    return { ...DEFAULT_CONFIG };
  }

  saveConfig(config: Partial<FirmwareCheckConfig>): void {
    const db = getDatabase();
    const current = this.getConfig();
    const merged = { ...current, ...config };
    const value = JSON.stringify(merged);
    db.prepare(`
      INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(CONFIG_KEY, value);
  }

  /**
   * Parse HTML content from the blog to extract firmware info
   */
  private parseBlogContent(html: string): { server: FirmwareEntry | null; player: FirmwareEntry | null } {
    let server: FirmwareEntry | null = null;
    let player: FirmwareEntry | null = null;

    // Strip HTML tags and decode entities for simpler regex matching
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&agrave;/g, 'à')
      .replace(/&eacute;/g, 'é')
      .replace(/&egrave;/g, 'è');

    // Split by post separators (--- or Tweet or hr)
    const blocks = text.split(/\s*---\s*|\s*<hr\s*\/?>\s*|Tweet\s*/i);

    for (const block of blocks) {
      const blockTrimmed = block.trim();
      if (!blockTrimmed || blockTrimmed.length < 40) continue;

      // Try Server pattern: "Mise à jour du Freebox Server (Revolution/Pop/Delta/Ultra) 4.9.16"
      const serverMatch = blockTrimmed.match(/Mise\s+[àa]\s+jour\s+du\s+Freebox\s+Server\s*\([^)]+\)\s+([\d.]+)/i);
      if (serverMatch) {
        const version = serverMatch[1];
        const dateMatch = blockTrimmed.match(DATE_PATTERN);
        const dateStr = dateMatch ? `${dateMatch[1]} ${dateMatch[2]} ${dateMatch[3]}` : '';

        const changelogParts: string[] = [];
        const ajouts = blockTrimmed.match(/(?:###\s*)?Ajouts\s*([\s\S]*?)(?=###|Corrections|Modifications|Nouveautés|$)/i);
        const corrections = blockTrimmed.match(/(?:###\s*)?Corrections?\s*([\s\S]*?)(?=###|Ajouts|Modifications|Nouveautés|$)/i);
        const modifs = blockTrimmed.match(/(?:###\s*)?Modifications?\s*([\s\S]*?)(?=###|Ajouts|Corrections|$)/i);
        const nouveautes = blockTrimmed.match(/(?:###\s*)?Nouveaut[eé]s\s*([\s\S]*?)(?=###|Ajouts|Corrections|$)/i);
        if (ajouts?.[1]) changelogParts.push('Ajouts: ' + decodeHtmlEntities(ajouts[1].trim().slice(0, 500)));
        if (nouveautes?.[1]) changelogParts.push('Nouveautés: ' + decodeHtmlEntities(nouveautes[1].trim().slice(0, 500)));
        if (corrections?.[1]) changelogParts.push('Corrections: ' + decodeHtmlEntities(corrections[1].trim().slice(0, 500)));
        if (modifs?.[1]) changelogParts.push('Modifications: ' + decodeHtmlEntities(modifs[1].trim().slice(0, 500)));
        const changelog = changelogParts.length > 0 ? changelogParts.join('\n') : 'Voir le blog pour les détails.';

        if (!server || compareVersions(version, server.latestVersion) > 0) {
          server = {
            latestVersion: version,
            updateAvailable: false,
            changelog: decodeHtmlEntities(changelog).slice(0, 1500),
            date: dateStr,
            blogUrl: BLOG_URL,
          };
        }
        continue;
      }

      // Try Player pattern: "Mise à jour du Freebox Player Mini 4k 3.7.1" or "Devialet/One 1.5.21" or "Révolution 1.3.54"
      const playerMatch = blockTrimmed.match(/Mise\s+[àa]\s+jour\s+du\s+Freebox\s+Player\s+([^\d]+?)\s+([\d.]+)/i);
      if (playerMatch) {
        const model = playerMatch[1].trim().replace(/\s+/g, ' ');
        const version = playerMatch[2];
        const dateMatch = blockTrimmed.match(DATE_PATTERN);
        const dateStr = dateMatch ? `${dateMatch[1]} ${dateMatch[2]} ${dateMatch[3]}` : '';

        const changelogParts: string[] = [];
        const ajouts = blockTrimmed.match(/(?:###\s*)?Ajouts\s*([\s\S]*?)(?=###|Corrections|Modifications|Nouveautés|$)/i);
        const corrections = blockTrimmed.match(/(?:###\s*)?Corrections?\s*([\s\S]*?)(?=###|Ajouts|Modifications|Nouveautés|$)/i);
        if (ajouts?.[1]) changelogParts.push(decodeHtmlEntities(ajouts[1].trim().slice(0, 500)));
        if (corrections?.[1]) changelogParts.push(decodeHtmlEntities(corrections[1].trim().slice(0, 500)));
        const changelog = changelogParts.length > 0 ? changelogParts.join('\n') : 'Voir le blog pour les détails.';

        if (!player || compareVersions(version, player.latestVersion) > 0) {
          player = {
            latestVersion: version,
            updateAvailable: false,
            changelog: decodeHtmlEntities(changelog).slice(0, 1500),
            date: dateStr,
            blogUrl: BLOG_URL,
            model,
          };
        }
      }
    }

    return { server, player };
  }

  /**
   * Fetch blog and parse firmware info
   */
  async checkForUpdates(): Promise<FreeboxFirmwareInfo | null> {
    if (this.isChecking) {
      return this.cachedInfo;
    }

    const config = this.getConfig();
    if (!config.enabled) {
      return this.cachedInfo;
    }

    this.isChecking = true;
    try {
      const response = await fetch(BLOG_URL, {
        headers: { 'User-Agent': 'MynetworK-FreeboxFirmwareCheck/1.0' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const { server, player } = this.parseBlogContent(html);

      if (!server) {
        logger.warn('FreeboxFirmwareCheck', 'No Freebox Server firmware found on blog');
        return this.cachedInfo;
      }

      const info: FreeboxFirmwareInfo = {
        server: {
          ...server,
          currentVersion: undefined,
          updateAvailable: false,
        },
        player: player
          ? {
              ...player,
              currentVersion: undefined,
              updateAvailable: false,
            }
          : null,
        lastCheck: new Date().toISOString(),
      };

      this.cachedInfo = info;
      logger.info('FreeboxFirmwareCheck', `Fetched firmware: Server ${info.server.latestVersion}, Player ${info.player?.latestVersion ?? 'N/A'}`);
      return info;
    } catch (error) {
      logger.error('FreeboxFirmwareCheck', 'Failed to fetch blog:', error);
      return this.cachedInfo;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Get latest firmware info, merging with current versions from Freebox API
   */
  getLatestFirmwareInfo(currentBoxFirmware?: string, currentPlayerFirmware?: string): FreeboxFirmwareInfo | null {
    const info = this.cachedInfo;
    if (!info) return null;

    const merged = { ...info, lastCheck: info.lastCheck };

    if (currentBoxFirmware && info.server) {
      merged.server = {
        ...info.server,
        currentVersion: currentBoxFirmware,
        updateAvailable: compareVersions(info.server.latestVersion, currentBoxFirmware) > 0,
      };
    }

    if (info.player && currentPlayerFirmware) {
      merged.player = {
        ...info.player,
        currentVersion: currentPlayerFirmware,
        updateAvailable: compareVersions(info.player.latestVersion, currentPlayerFirmware) > 0,
      };
    }

    return merged;
  }

  /**
   * Force an immediate check (bypass cache)
   */
  async forceCheck(): Promise<FreeboxFirmwareInfo | null> {
    this.cachedInfo = null;
    return this.checkForUpdates();
  }

  start(): void {
    if (this.intervalId) return;

    const config = this.getConfig();
    if (!config.enabled) {
      logger.info('FreeboxFirmwareCheck', 'Service disabled, not starting scheduler');
      return;
    }

    const intervalMs = config.intervalHours * 60 * 60 * 1000;
    logger.info('FreeboxFirmwareCheck', `Starting scheduler (interval: ${config.intervalHours}h)`);

    this.checkForUpdates().catch(() => {});

    this.intervalId = setInterval(() => {
      this.checkForUpdates().catch(() => {});
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('FreeboxFirmwareCheck', 'Scheduler stopped');
    }
  }

  restart(): void {
    this.stop();
    this.start();
  }
}

export const freeboxFirmwareCheckService = new FreeboxFirmwareCheckService();
