import { useEffect, useRef, useCallback } from 'react';

// Upper bound of the random delay before the catch-up call when the tab becomes visible again
const MAX_RESUME_JITTER_MS = 2000;

interface UsePollingOptions {
  enabled?: boolean;
  interval: number;
  immediate?: boolean;
}

export const usePolling = (
  callback: () => void | Promise<void>,
  options: UsePollingOptions
) => {
  const { enabled = true, interval, immediate = true } = options;
  const savedCallback = useRef(callback);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const enabledRef = useRef(enabled);
  const intervalMsRef = useRef(interval);

  // Remember the latest callback and options
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    intervalMsRef.current = interval;
  }, [interval]);

  // Helper to start/stop interval — always clears before creating
  const startInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (enabledRef.current) {
      intervalRef.current = setInterval(() => {
        savedCallback.current();
      }, intervalMsRef.current);
    }
  }, []);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Set up the interval and visibility handler in a single effect
  useEffect(() => {
    if (!enabled) {
      stopInterval();
      return;
    }

    // Enabled while the tab is hidden: wait for it to be visible again (handled below)
    if (!document.hidden) {
      // Execute immediately if requested
      if (immediate) {
        savedCallback.current();
      }

      // Start interval
      startInterval();
    }

    // Pause when tab is hidden, resume when visible. The resume call is delayed by
    // a 0-2s random jitter so all pollers do not fire in the same instant.
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;
    const clearResumeTimer = () => {
      if (resumeTimer) {
        clearTimeout(resumeTimer);
        resumeTimer = null;
      }
    };
    const handleVisibilityChange = () => {
      clearResumeTimer();
      if (document.hidden) {
        stopInterval();
      } else if (enabledRef.current) {
        resumeTimer = setTimeout(() => {
          resumeTimer = null;
          if (document.hidden || !enabledRef.current) return;
          savedCallback.current();
          startInterval();
        }, Math.random() * MAX_RESUME_JITTER_MS);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearResumeTimer();
      stopInterval();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, interval, immediate, startInterval, stopInterval]);
};

// Hook for multiple polling intervals
interface PollingConfig {
  key: string;
  callback: () => void | Promise<void>;
  interval: number;
  enabled?: boolean;
}

export const useMultiPolling = (configs: PollingConfig[]) => {
  const intervals = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    configs.forEach(({ key, callback, interval, enabled = true }) => {
      // Clear existing interval for this key
      const existing = intervals.current.get(key);
      if (existing) {
        clearInterval(existing);
      }

      if (!enabled) return;

      // Execute immediately
      callback();

      // Set up new interval
      const id = setInterval(callback, interval);
      intervals.current.set(key, id);
    });

    return () => {
      intervals.current.forEach((id) => clearInterval(id));
      intervals.current.clear();
    };
  }, [configs]);
};