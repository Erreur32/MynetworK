/**
 * Logger utility with colors and debug level control
 * 
 * Provides colored console output and configurable debug level
 */

import { getDatabase } from '../database/connection.js';
import { logBuffer } from './logBuffer.js';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose';

class Logger {
  private debugEnabled: boolean = false;
  private verboseEnabled: boolean = false;

  constructor() {
    this.loadDebugConfig();
  }

  private redactString(input: string): string {
    if (!input) return input;

    // Redact common credential patterns in plain text and JSON-ish strings.
    return input
      // key=value patterns
      .replace(
        /\b(password|passwd|pass|api[_-]?key|token|access[_-]?token|refresh[_-]?token|authorization|cookie|set-cookie|sessioncookie|psk|passphrase|wpa[_-]?key|secret|private[_-]?key|app[_-]?token)\b\s*[:=]\s*([^\s,;]+)/gi,
        (_m, key) => `${key}=[REDACTED]`
      )
      // "key":"value" JSON patterns
      .replace(
        /("?(password|passwd|pass|api[_-]?key|token|access[_-]?token|refresh[_-]?token|authorization|cookie|set-cookie|sessionCookie|psk|passphrase|wpa[_-]?key|secret|private[_-]?key|app[_-]?token)"?\s*:\s*)(".*?"|'.*?'|[^,\}\]]+)/gi,
        (_m, prefix) => `${prefix}"[REDACTED]"`
      );
  }

  private isSensitiveKey(keyLower: string): boolean {
    return (
      keyLower.includes('password') ||
      keyLower === 'pass' ||
      keyLower === 'key' ||          // WiFi WPA key field
      keyLower === 'psk' ||          // Pre-shared key
      keyLower === 'secret' ||
      keyLower.includes('passphrase') ||
      keyLower.includes('apikey') ||
      keyLower.includes('api_key') ||
      keyLower.includes('app_token') ||
      keyLower.includes('token') ||
      keyLower.includes('authorization') ||
      keyLower.includes('cookie') ||
      keyLower.includes('session') ||
      keyLower.includes('private_key') ||
      keyLower.includes('wpa') ||    // wpa_key, wpa_password, etc.
      keyLower.includes('credential')
    );
  }

  private sanitizeArg(value: any, depth: number = 0): any {
    if (depth > 5) return '[Truncated]';
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
      return this.redactString(value);
    }

    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return value;
    }

    if (value instanceof Error) {
      // Error messages/stacks can sometimes include URLs with credentials or headers.
      return {
        name: value.name,
        message: this.redactString(value.message || ''),
        stack: this.redactString(value.stack || '')
      };
    }

    if (Array.isArray(value)) {
      return value.map((v) => this.sanitizeArg(v, depth + 1));
    }

    if (typeof value === 'object') {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = this.isSensitiveKey(k.toLowerCase()) ? '[REDACTED]' : this.sanitizeArg(v, depth + 1);
      }
      return out;
    }

    // Functions, symbols, etc.
    try {
      return this.redactString(String(value));
    } catch {
      return '[Unserializable]';
    }
  }

  private sanitizeArgs(args: any[]): any[] {
    return args.map((a) => this.sanitizeArg(a));
  }

  /**
   * Load debug configuration from database
   */
  private loadDebugConfig(): void {
    try {
      const db = getDatabase();
      // Check if app_config table exists (database might not be initialized yet)
      const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_config'").get();
      if (!tableCheck) {
        // Table doesn't exist yet, use defaults
        // Default should be quiet unless explicitly enabled via config/UI.
        this.debugEnabled = false;
        this.verboseEnabled = false;
        return;
      }
      
      const stmt = db.prepare('SELECT value FROM app_config WHERE key = ?');
      const row = stmt.get('debug_config') as { value: string } | undefined;
      
      if (row) {
        const config = JSON.parse(row.value);
        this.debugEnabled = config.debug === true;
        this.verboseEnabled = config.verbose === true;
      } else {
        // Default should be quiet unless explicitly enabled via config/UI.
        this.debugEnabled = false;
        this.verboseEnabled = false;
      }
    } catch (error) {
      // If database not ready, use defaults
      // Default should be quiet unless explicitly enabled via config/UI.
      this.debugEnabled = false;
      this.verboseEnabled = false;
    }
  }

  /**
   * Reload debug configuration (call after config change)
   */
  reloadConfig(): void {
    this.loadDebugConfig();
  }

  /**
   * Get current debug configuration
   */
  getConfig(): { debug: boolean; verbose: boolean } {
    return {
      debug: this.debugEnabled,
      verbose: this.verboseEnabled
    };
  }

  /**
   * Set debug configuration
   */
  setConfig(debug: boolean, verbose: boolean = false): void {
    this.debugEnabled = debug;
    this.verboseEnabled = verbose;
    
    // Save to database
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        INSERT INTO app_config (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `);
      stmt.run('debug_config', JSON.stringify({ debug, verbose }));
    } catch (error) {
      console.error('[Logger] Failed to save debug config:', error);
    }
  }

  /**
   * Format log message with colors based on level
   */
  private formatMessage(level: LogLevel, prefix: string, message: string, ...args: any[]): string {
    let color = colors.reset;
    let levelColor = colors.reset;
    
    switch (level) {
      case 'error':
        color = colors.red;
        levelColor = colors.bright + colors.red;
        break;
      case 'warn':
        color = colors.yellow;
        levelColor = colors.bright + colors.yellow;
        break;
      case 'info':
        color = colors.cyan;
        levelColor = colors.bright + colors.cyan;
        break;
      case 'debug':
        color = colors.blue;
        levelColor = colors.dim + colors.blue;
        break;
      case 'verbose':
        color = colors.magenta;
        levelColor = colors.dim + colors.magenta;
        break;
    }

    const timestamp = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const formattedPrefix = `${colors.dim}[${timestamp}]${colors.reset} ${levelColor}[${prefix}]${colors.reset}`;
    
    return `${formattedPrefix} ${color}${message}${colors.reset}`;
  }

  /**
   * Log error message (always shown)
   */
  error(prefix: string, message: string, ...args: any[]): void {
    const formatted = this.formatMessage('error', prefix, this.redactString(message));
    const safeArgs = this.sanitizeArgs(args);
    console.error(formatted, ...safeArgs);
    logBuffer.add('error', prefix, this.redactString(message), ...safeArgs);
  }

  /**
   * Log warning message (always shown)
   */
  warn(prefix: string, message: string, ...args: any[]): void {
    const formatted = this.formatMessage('warn', prefix, this.redactString(message));
    const safeArgs = this.sanitizeArgs(args);
    console.warn(formatted, ...safeArgs);
    logBuffer.add('warn', prefix, this.redactString(message), ...safeArgs);
  }

  /**
   * Log info message (always shown)
   */
  info(prefix: string, message: string, ...args: any[]): void {
    const formatted = this.formatMessage('info', prefix, this.redactString(message));
    const safeArgs = this.sanitizeArgs(args);
    console.log(formatted, ...safeArgs);
    logBuffer.add('info', prefix, this.redactString(message), ...safeArgs);
  }

  /**
   * Log debug message (only if debug enabled)
   */
  debug(prefix: string, message: string, ...args: any[]): void {
    if (this.debugEnabled) {
      const formatted = this.formatMessage('debug', prefix, this.redactString(message));
      const safeArgs = this.sanitizeArgs(args);
      console.log(formatted, ...safeArgs);
      logBuffer.add('debug', prefix, this.redactString(message), ...safeArgs);
    }
  }

  /**
   * Log verbose message (only if verbose enabled)
   */
  verbose(prefix: string, message: string, ...args: any[]): void {
    if (this.verboseEnabled) {
      const formatted = this.formatMessage('verbose', prefix, this.redactString(message));
      const safeArgs = this.sanitizeArgs(args);
      console.log(formatted, ...safeArgs);
      logBuffer.add('verbose', prefix, this.redactString(message), ...safeArgs);
    }
  }

  /**
   * Log important success message (always shown, green)
   */
  success(prefix: string, message: string, ...args: any[]): void {
    const timestamp = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const formattedPrefix = `${colors.dim}[${timestamp}]${colors.reset} ${colors.bright}${colors.green}[${prefix}]${colors.reset}`;
    const safeMessage = this.redactString(message);
    const formatted = `${formattedPrefix} ${colors.green}${safeMessage}${colors.reset}`;
    const safeArgs = this.sanitizeArgs(args);
    console.log(formatted, ...safeArgs);
    logBuffer.add('info', prefix, safeMessage, ...safeArgs); // Store as info level
  }
}

// Export singleton instance
export const logger = new Logger();
