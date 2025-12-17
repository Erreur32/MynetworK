/**
 * Log Buffer
 * 
 * Stores application logs in memory for real-time viewing
 */

interface LogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug' | 'verbose';
  prefix: string;
  message: string;
  args?: any[];
}

class LogBuffer {
  private logs: LogEntry[] = [];
  private maxSize: number = 1000; // Keep last 1000 log entries
  private listeners: Set<(log: LogEntry) => void> = new Set();

  /**
   * Add a log entry to the buffer
   */
  add(level: LogEntry['level'], prefix: string, message: string, ...args: any[]): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      prefix,
      message,
      args: args.length > 0 ? args : undefined
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
