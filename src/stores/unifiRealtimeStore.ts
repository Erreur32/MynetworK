import { create } from 'zustand';

interface UnifiBandwidthPoint {
  time: string;
  download: number; // KB/s
  upload: number;   // KB/s
  lanDownload?: number; // KB/s, LAN estimate (total client traffic minus WAN), see pushPoint
  lanUpload?: number;   // KB/s
  ts?: number;          // epoch ms, used to place server points when filling a gap
}

/** Point of GET /api/plugins/unifi/bandwidth-history (server in-memory WAN history) */
export interface UnifiServerBandwidthPoint {
  time: string;
  timestamp: number;
  download: number; // KB/s
  upload: number;   // KB/s
}

// Live window kept by pushPoint (60 points at 1s interval)
const LIVE_HISTORY_POINTS = 60;
const LIVE_HISTORY_MS = 60 * 1000;

export interface UnifiTopClient {
  mac: string;
  name: string;
  ip?: string;
  vendor?: string | null;
  download: number; // KB/s
  upload: number;   // KB/s
}

interface UnifiRealtimeState {
  download: number;
  upload: number;
  history: UnifiBandwidthPoint[];
  topClients: UnifiTopClient[];
  lanDownload: number; // KB/s, LAN estimate (total client traffic minus WAN)
  lanUpload: number;   // KB/s
  isConnected: boolean;

  pushPoint: (
    download: number,
    upload: number,
    topClients?: UnifiTopClient[],
    lan?: { download: number; upload: number }
  ) => void;
  fillGap: (points: UnifiServerBandwidthPoint[], since: number) => void;
  setConnected: (connected: boolean) => void;
  reset: () => void;
}

export const useUnifiRealtimeStore = create<UnifiRealtimeState>((set) => ({
  download: 0,
  upload: 0,
  history: [],
  topClients: [],
  lanDownload: 0,
  lanUpload: 0,
  isConnected: false,

  pushPoint: (download: number, upload: number, topClients: UnifiTopClient[] = [], lan = { download: 0, upload: 0 }) => {
    // Skip history growth when the tab is hidden, prevents a render storm
    // in recharts (ResponsiveContainer ResizeObserver loop → React #185)
    // when the tab becomes visible again after accumulated WS messages.
    if (typeof document !== 'undefined' && document.hidden) {
      set({ download, upload, topClients, lanDownload: lan.download, lanUpload: lan.upload });
      return;
    }
    const time = new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    set((state) => ({
      download,
      upload,
      topClients,
      lanDownload: lan.download,
      lanUpload: lan.upload,
      // Keep last 60 points (60 seconds at 1s interval), short live window
      history: [...state.history.slice(-(LIVE_HISTORY_POINTS - 1)), { time, download, upload, lanDownload: lan.download, lanUpload: lan.upload, ts: Date.now() }],
    }));
  },

  // Fills the live history gap left while the tab was hidden or the socket was down
  // (since = start of the gap, epoch ms) with the server's in-memory WAN history.
  fillGap: (points: UnifiServerBandwidthPoint[], since: number) => {
    set((state) => {
      const after = state.history.filter((p) => (p.ts ?? 0) >= since);
      // Points from before a gap longer than the live window are stale: dropped
      const before = Date.now() - since > LIVE_HISTORY_MS ? [] : state.history.filter((p) => (p.ts ?? 0) < since);
      const from = before.length > 0 ? before[before.length - 1].ts ?? 0 : 0;
      const to = after.length > 0 ? after[0].ts ?? Date.now() : Date.now();
      const fill = points
        .filter((p) => p.timestamp > from && p.timestamp < to)
        .map((p) => ({ time: p.time, download: p.download, upload: p.upload, ts: p.timestamp }));
      if (fill.length === 0 && before.length + after.length === state.history.length) return {};
      return { history: [...before, ...fill, ...after].slice(-LIVE_HISTORY_POINTS) };
    });
  },

  setConnected: (connected: boolean) => set({ isConnected: connected }),

  reset: () => set({ download: 0, upload: 0, history: [], topClients: [], lanDownload: 0, lanUpload: 0, isConnected: false }),
}));
