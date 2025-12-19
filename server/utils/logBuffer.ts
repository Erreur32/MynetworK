/**
 * Log Buffer
 * 
 * Stores application logs in memory for real-time viewing
 * 
 * Memory protection: Limits buffer size and argument sizes to prevent Out of Memory errors
 */

interface LogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug' | 'verbose';
  prefix: string;
  message: string;
  args?: any[];
}

// Maximum size for a single argument in bytes (10KB)
const MAX_ARG_SIZE = 10 * 1024;
// Maximum number of log entries to keep in memory
const MAX_BUFFER_SIZE = 500; // Reduced from 1000 to prevent memory issues

/**
 * Safely serialize and limit the size of log arguments to prevent memory issues
 */
function sanitizeArgs(args: any[]): any[] {
  if (args.length === 0) return [];
  
  return args.map(arg => {
    try {
      // If argument is already a string, check its size
      if (typeof arg === 'string') {
        if (arg.length > MAX_ARG_SIZE) {
          return arg.substring(0, MAX_ARG_SIZE) + '...[truncated]';
        }
        return arg;
      }
      
      // For objects, serialize to JSON and check size
      const serialized = JSON.stringify(arg);
      if (serialized.length > MAX_ARG_SIZE) {
        // Try to get a summary of the object
        if (typeof arg === 'object' && arg !== null) {
          const keys = Object.keys(arg);
          const summary: any = {};
          // Keep only first 5 keys to create a summary
          for (let i = 0; i < Math.min(5, keys.length); i++) {
            const key = keys[i];
            const value = arg[key];
            if (typeof value === 'string' && value.length > 100) {
              summary[key] = value.substring(0, 100) + '...[truncated]';
            } else if (typeof value === 'object' && value !== null) {
              summary[key] = '[Object]';
            } else {
              summary[key] = value;
            }
          }
          if (keys.length > 5) {
            summary._truncated = `...${keys.length - 5} more keys`;
          }
          return summary;
        }
        return '[Object too large - truncated]';
      }
      return arg;
    } catch (error) {
      // If serialization fails, return a safe placeholder
      return '[Unable to serialize argument]';
    }
  });
}

class LogBuffer {
  private logs: LogEntry[] = [];
  private maxSize: number = MAX_BUFFER_SIZE;
  private listeners: Set<(log: LogEntry) => void> = new Set();

  /**
   * Add a log entry to the buffer
   * Memory-safe: Limits argument sizes to prevent Out of Memory errors
   */
  add(level: LogEntry['level'], prefix: string, message: string, ...args: any[]): void {
    // Sanitize args to prevent memory issues
    const sanitizedArgs = args.length > 0 ? sanitizeArgs(args) : undefined;
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      prefix,
      message,
      args: sanitizedArgs
    };

    this.logs.push(entry);

    // Keep only the last maxSize entries
    if (this.logs.length > this.maxSize) {
      this.logs.shift();
    }

    // Notify all listeners
    this.listeners.forEach(listener => {
      try {
        listener(entry);
      } catch (error) {
        console.error('[LogBuffer] Error in listener:', error);
      }
    });
  }

  /**
   * Get all logs
   */
  getAll(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs with limit
   */
  getRecent(limit: number = 100): LogEntry[] {
    return this.logs.slice(-limit);
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Subscribe to new log entries
   */
  subscribe(listener: (log: LogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get log count
   */
  getCount(): number {
    return this.logs.length;
  }
}

export const logBuffer = new LogBuffer();
