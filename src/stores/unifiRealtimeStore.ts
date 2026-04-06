import { create } from 'zustand';

interface UnifiBandwidthPoint {
  time: string;
  download: number; // KB/s
  upload: number;   // KB/s
}

interface UnifiRealtimeState {
  download: number;
  upload: number;
  history: UnifiBandwidthPoint[];
  isConnected: boolean;

  pushPoint: (download: number, upload: number) => void;
  setConnected: (connected: boolean) => void;
  reset: () => void;
}

export const useUnifiRealtimeStore = create<UnifiRealtimeState>((set) => ({
  download: 0,
  upload: 0,
  history: [],
  isConnected: false,

  pushPoint: (download: number, upload: number) => {
    const time = new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    set((state) => ({
      download,
      upload,
      history: [...state.history.slice(-299), { time, download, upload }],
    }));
  },

  setConnected: (connected: boolean) => set({ isConnected: connected }),

  reset: () => set({ download: 0, upload: 0, history: [], isConnected: false }),
}));
