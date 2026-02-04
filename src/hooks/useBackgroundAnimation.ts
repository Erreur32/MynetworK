/**
 * Hook for background animation preference (CSS background for any theme)
 * full-animation theme selection, and animation speed.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentTheme } from '../utils/themeManager';

// Pour les autres thèmes (non full-animation), on peut choisir parmi ces animations
export type BgAnimationVariant = 'off' | 'animation.80.particle-waves' | 'animation.93.particules-line' | 'animation.1.home-assistant-particles';

/** Full animation IDs (lovelace-style). Includes 'animation.all' for cycling through all. Default: animation.80.particle-waves */
export type FullAnimationId =
  | 'animation.all'
  | 'animation.1.home-assistant-particles'
  | 'animation.10.css-dark-particles'
  | 'animation.72.playstation-3-bg-style'
  | 'animation.79.canvas-ribbons'
  | 'animation.80.particle-waves'
  | 'animation.90.aurora'
  | 'animation.92.aurora-v2'
  | 'animation.93.particules-line'
  | 'animation.94.alien-blackout'
  | 'animation.95.bit-ocean'
  | 'animation.96.stars'
  | 'animation.97.space'
  | 'animation.98.sidelined';

/** IDs used when cycling (all except 'animation.all') */
export const CYCLEABLE_ANIMATION_IDS: FullAnimationId[] = [
  'animation.1.home-assistant-particles',
  'animation.10.css-dark-particles',
  'animation.72.playstation-3-bg-style',
  'animation.79.canvas-ribbons',
  'animation.80.particle-waves',
  'animation.90.aurora',
  'animation.92.aurora-v2',
  'animation.93.particules-line',
  'animation.94.alien-blackout',
  'animation.95.bit-ocean',
  'animation.96.stars',
  'animation.97.space',
  'animation.98.sidelined',
];

/** Animation speed slider value: 0-1.5 (0 = très rapide, 1.5 = très lent) */
export type AnimationSpeed = number;

/** Convert slider value (0-1.5) to animation multiplier (0.3-3.0) */
export function speedToMultiplier(speed: number): number {
  // Slider: 0 = rapide (right), 1.5 = lent (left). Mult: plus haut = animation plus rapide.
  // speed = 0 → 3.0 (rapide), speed = 1.5 → 0.3 (lent)
  return 0.3 + ((1.5 - speed) / 1.5) * 2.7;
}

const BG_ANIMATION_KEY = 'mynetwork_bg_animation';
const FULL_ANIMATION_ID_KEY = 'mynetwork_full_animation_id';
const ANIMATION_SPEED_KEY = 'mynetwork_animation_speed';

const DEFAULT_BG: BgAnimationVariant = 'animation.80.particle-waves'; // Par défaut : waves
const DEFAULT_FULL: FullAnimationId = 'animation.80.particle-waves';
const DEFAULT_SPEED: AnimationSpeed = 0.75; // Valeur par défaut (normal, correspond à multiplicateur ~1.0)
export const MIN_SPEED = 0; // Très rapide (multiplicateur 0.3)
export const MAX_SPEED = 1.5; // Lent (multiplicateur 3.0)

export const VALID_FULL_ANIMATION_IDS: FullAnimationId[] = [
  'animation.all',
  ...CYCLEABLE_ANIMATION_IDS,
];

export function getStoredBgAnimation(): BgAnimationVariant {
  try {
    const v = localStorage.getItem(BG_ANIMATION_KEY);
    // Migration : convertir les anciennes valeurs vers les nouvelles
    if (v === 'gradient' || v === 'particles' || v === 'grid') {
      // Migrer vers waves par défaut
      setStoredBgAnimation('animation.80.particle-waves');
      return 'animation.80.particle-waves';
    }
    if (v === 'off' || v === 'animation.80.particle-waves' || v === 'animation.93.particules-line' || v === 'animation.1.home-assistant-particles') {
      return v as BgAnimationVariant;
    }
  } catch {
    // ignore
  }
  return DEFAULT_BG;
}

export function setStoredBgAnimation(variant: BgAnimationVariant): void {
  try {
    localStorage.setItem(BG_ANIMATION_KEY, variant);
  } catch {
    // ignore
  }
}

export function getStoredFullAnimationId(): FullAnimationId {
  try {
    const v = localStorage.getItem(FULL_ANIMATION_ID_KEY);
    // Migration : nettoyer les anciennes animations supprimées
    const removedAnimations = ['animation.95.just-in-case', 'animation.99.media-background'];
    if (v && removedAnimations.includes(v)) {
      // Nettoyer l'ancienne valeur invalide
      localStorage.removeItem(FULL_ANIMATION_ID_KEY);
      // Supprimer aussi les paramètres associés
      const paramKey = `mynetwork_animation_params_${v}`;
      localStorage.removeItem(paramKey);
      return DEFAULT_FULL;
    }
    if (VALID_FULL_ANIMATION_IDS.includes(v as FullAnimationId)) return v as FullAnimationId;
  } catch {
    // ignore
  }
  return DEFAULT_FULL;
}

export function setStoredFullAnimationId(id: FullAnimationId): void {
  try {
    localStorage.setItem(FULL_ANIMATION_ID_KEY, id);
  } catch {
    // ignore
  }
}

export function getStoredAnimationSpeed(): AnimationSpeed {
  try {
    const v = localStorage.getItem(ANIMATION_SPEED_KEY);
    if (v) {
      const num = parseFloat(v);
      if (!isNaN(num) && num >= MIN_SPEED && num <= MAX_SPEED) return num;
    }
  } catch {
    // ignore
  }
  return DEFAULT_SPEED;
}

export function setStoredAnimationSpeed(speed: AnimationSpeed): void {
  try {
    localStorage.setItem(ANIMATION_SPEED_KEY, speed.toString());
  } catch {
    // ignore
  }
}

/** Effective variant for AnimatedBackground: off | gradient | particles | grid | or a FullAnimationId */
export type EffectiveVariant = BgAnimationVariant | FullAnimationId;

export function useBackgroundAnimation(): {
  variant: EffectiveVariant;
  theme: string;
  bgAnimation: BgAnimationVariant;
  setBgAnimation: (v: BgAnimationVariant) => void;
  fullAnimationId: FullAnimationId;
  setFullAnimationId: (id: FullAnimationId) => void;
  animationSpeed: AnimationSpeed;
  setAnimationSpeed: (s: AnimationSpeed) => void;
  minSpeed: number;
  maxSpeed: number;
  prefersReducedMotion: boolean;
} {
  const [bgAnimation, setBgState] = useState<BgAnimationVariant>(getStoredBgAnimation);
  const [fullAnimationId, setFullState] = useState<FullAnimationId>(getStoredFullAnimationId);
  const [cycleIndex, setCycleIndex] = useState(0);
  const [animationSpeed, setSpeedState] = useState<AnimationSpeed>(getStoredAnimationSpeed);
  const [theme, setThemeState] = useState<string>(getCurrentTheme());
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const CYCLE_PARAMS_KEY = 'mynetwork_animation_params_animation.all';
  const getCycleParams = useCallback(() => {
    try {
      const raw = localStorage.getItem(CYCLE_PARAMS_KEY);
      const p = raw ? JSON.parse(raw) : {};
      const cycleAnimations = Array.isArray(p.cycleAnimations)
        ? p.cycleAnimations.filter((id: string) => CYCLEABLE_ANIMATION_IDS.includes(id as FullAnimationId))
        : [];
      return {
        cycleDuration: typeof p.cycleDuration === 'number' ? Math.max(5, Math.min(3600, p.cycleDuration)) : 15,
        cycleRandom: p.cycleRandom === true,
        cycleAnimations: cycleAnimations.length > 0 ? cycleAnimations : CYCLEABLE_ANIMATION_IDS,
      };
    } catch {
      return {
        cycleDuration: 15,
        cycleRandom: false,
        cycleAnimations: CYCLEABLE_ANIMATION_IDS,
      };
    }
  }, []);

  const lastSwitchTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(media.matches);
    const handler = () => setPrefersReducedMotion(media.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const syncTheme = () => setThemeState(getCurrentTheme());
    syncTheme();
    window.addEventListener('themechange', syncTheme);
    return () => window.removeEventListener('themechange', syncTheme);
  }, []);

  const setBgAnimation = useCallback((v: BgAnimationVariant) => {
    setStoredBgAnimation(v);
    setBgState(v);
    window.dispatchEvent(new StorageEvent('storage', { key: BG_ANIMATION_KEY, newValue: v }));
  }, []);

  const setFullAnimationId = useCallback((id: FullAnimationId) => {
    setStoredFullAnimationId(id);
    setFullState(id);
    window.dispatchEvent(new StorageEvent('storage', { key: FULL_ANIMATION_ID_KEY, newValue: id }));
  }, []);

  const setAnimationSpeed = useCallback((s: AnimationSpeed) => {
    setStoredAnimationSpeed(s);
    setSpeedState(s);
    window.dispatchEvent(new StorageEvent('storage', { key: ANIMATION_SPEED_KEY, newValue: String(s) }));
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === BG_ANIMATION_KEY && e.newValue) {
        if (e.newValue === 'off' || e.newValue === 'animation.80.particle-waves' || e.newValue === 'animation.93.particules-line' || e.newValue === 'animation.1.home-assistant-particles') {
          setBgState(e.newValue as BgAnimationVariant);
        }
      }
      if (e.key === FULL_ANIMATION_ID_KEY && e.newValue && VALID_FULL_ANIMATION_IDS.includes(e.newValue as FullAnimationId)) {
        setFullState(e.newValue as FullAnimationId);
      }
      if (e.key === ANIMATION_SPEED_KEY && e.newValue) {
        const num = parseFloat(e.newValue);
        if (!isNaN(num) && num >= MIN_SPEED && num <= MAX_SPEED) {
          setSpeedState(num);
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (fullAnimationId !== 'animation.all' || prefersReducedMotion) return;
    lastSwitchTimeRef.current = Date.now();
    const tickMs = 1000;
    const timer = window.setInterval(() => {
      const params = getCycleParams();
      const list = params.cycleAnimations;
      const durationMs = params.cycleDuration * 1000;
      if (Date.now() - lastSwitchTimeRef.current >= durationMs) {
        lastSwitchTimeRef.current = Date.now();
        setCycleIndex((i) => {
          if (params.cycleRandom) {
            return Math.floor(Math.random() * list.length);
          }
          return (i + 1) % list.length;
        });
      }
    }, tickMs);
    return () => window.clearInterval(timer);
  }, [fullAnimationId, prefersReducedMotion, getCycleParams]);

  const isFullAnimationTheme = theme === 'full-animation';
  const cycleList = fullAnimationId === 'animation.all' ? getCycleParams().cycleAnimations : CYCLEABLE_ANIMATION_IDS;
  const effectiveVariant: EffectiveVariant = prefersReducedMotion
    ? 'off'
    : isFullAnimationTheme
      ? fullAnimationId === 'animation.all'
        ? cycleList[cycleIndex % cycleList.length]
        : fullAnimationId
      : bgAnimation === 'off'
        ? 'off'
        : fullAnimationId === 'animation.all'
          ? cycleList[cycleIndex % cycleList.length]
          : fullAnimationId;
  const variant = effectiveVariant;

  return {
    variant,
    theme,
    bgAnimation,
    setBgAnimation,
    fullAnimationId,
    setFullAnimationId,
    animationSpeed,
    setAnimationSpeed,
    minSpeed: MIN_SPEED,
    maxSpeed: MAX_SPEED,
    prefersReducedMotion,
  };
}
