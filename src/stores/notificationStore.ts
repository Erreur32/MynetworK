// Notification (sonner toast) preferences store
// Persisted to localStorage so user choices survive reloads

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ToastPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type ToastTheme = 'light' | 'dark' | 'system';

export type NotificationSoundType = 'success' | 'error' | 'info';

export interface NotificationPrefs {
  position: ToastPosition;
  offsetX: number;
  offsetY: number;
  duration: number;
  theme: ToastTheme;
  richColors: boolean;
  closeButton: boolean;
  expand: boolean;
  visibleToasts: number;
  soundEnabled: boolean;
}

interface NotificationStore extends NotificationPrefs {
  setPrefs: (partial: Partial<NotificationPrefs>) => void;
  reset: () => void;
}

const DEFAULT_PREFS: NotificationPrefs = {
  position: 'bottom-right',
  offsetX: 16,
  offsetY: 90,
  duration: 4000,
  theme: 'dark',
  richColors: true,
  closeButton: true,
  expand: false,
  visibleToasts: 3,
  soundEnabled: false,
};

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFS,
      setPrefs: (partial) => set((state) => ({ ...state, ...partial })),
      reset: () => set({ ...DEFAULT_PREFS }),
    }),
    { name: 'mynetwork-notification-prefs' }
  )
);

let audioCtx: AudioContext | null = null;
export const playNotificationSound = (type: NotificationSoundType = 'info') => {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const freq = type === 'error' ? 220 : type === 'success' ? 660 : 440;
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    // Audio context blocked — ignore
  }
};
