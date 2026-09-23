import { create } from 'zustand';

interface UnifiBandwidthPoint {
  time: string;
  download: number; // KB/s
  upload: number;   // KB/s
  lanDownload?: number; // KB/s, LAN estimate (total client traffic minus WAN), see pushPoint
  lanUpload?: number;   // KB/s
}

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
      history: [...state.history.slice(-59), { time, download, upload, lanDownload: lan.download, lanUpload: lan.upload }],
    }));
  },

  setConnected: (connected: boolean) => set({ isConnected: connected }),

  reset: () => set({ download: 0, upload: 0, history: [], topClients: [], lanDownload: 0, lanUpload: 0, isConnected: false }),
}));
