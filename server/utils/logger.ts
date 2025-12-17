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
        this.debugEnabled = process.env.NODE_ENV !== 'production';
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
        // Default: debug enabled in development, disabled in production
        this.debugEnabled = process.env.NODE_ENV !== 'production';
        this.verboseEnabled = false;
      }
    } catch (error) {
      // If database not ready, use defaults
      this.debugEnabled = process.env.NODE_ENV !== 'production';
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

    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const formattedPrefix = `${colors.dim}[${timestamp}]${colors.reset} ${levelColor}[${prefix}]${colors.reset}`;
    
    return `${formattedPrefix} ${color}${message}${colors.reset}`;
  }

  /**
   * Log error message (always shown)
   */
  error(prefix: string, message: string, ...args: any[]): void {
    const formatted = this.formatMessage('error', prefix, message);
    console.error(formatted, ...args);
    logBuffer.add('error', prefix, message, ...args);
  }

  /**
   * Log warning message (always shown)
   */
  warn(prefix: string, message: string, ...args: any[]): void {
    const formatted = this.formatMessage('warn', prefix, message);
    console.warn(formatted, ...args);
    logBuffer.add('warn', prefix, message, ...args);
  }

  /**
   * Log info message (always shown)
   */
  info(prefix: string, message: string, ...args: any[]): void {
    const formatted = this.formatMessage('info', prefix, message);
    console.log(formatted, ...args);
    logBuffer.add('info', prefix, message, ...args);
  }

  /**
   * Log debug message (only if debug enabled)
   */
  debug(prefix: string, message: string, ...args: any[]): void {
    if (this.debugEnabled) {
      const formatted = this.formatMessage('debug', prefix, message);
      console.log(formatted, ...args);
      logBuffer.add('debug', prefix, message, ...args);
    }
  }

  /**
   * Log verbose message (only if verbose enabled)
   */
  verbose(prefix: string, message: string, ...args: any[]): void {
    if (this.verboseEnabled) {
      const formatted = this.formatMessage('verbose', prefix, message);
      console.log(formatted, ...args);
      logBuffer.add('verbose', prefix, message, ...args);
    }
  }

  /**
   * Log important success message (always shown, green)
   */
  success(prefix: string, message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const formattedPrefix = `${colors.dim}[${timestamp}]${colors.reset} ${colors.bright}${colors.green}[${prefix}]${colors.reset}`;
    const formatted = `${formattedPrefix} ${colors.green}${message}${colors.reset}`;
    console.log(formatted, ...args);
    logBuffer.add('info', prefix, message, ...args); // Store as info level
  }
}

// Export singleton instance
export const logger = new Logger();
