/**
 * Hook for background animation preference (CSS background for any theme)
 * full-animation theme selection, and animation speed.
 */

import { useState, useEffect, useCallback } from 'react';
import { getCurrentTheme } from '../utils/themeManager';

// Pour les autres thèmes (non full-animation), on peut choisir parmi ces animations
export type BgAnimationVariant = 'off' | 'animation.80.particle-waves' | 'animation.93.particules-line' | 'animation.1.home-assistant-particles';

/** Full animation IDs (lovelace-style). Default: animation.80.particle-waves */
export type FullAnimationId =
  | 'animation.1.home-assistant-particles'
  | 'animation.10.css-dark-particles'
  | 'animation.72.playstation-3-bg-style'
  | 'animation.79.canvas-ribbons'
  | 'animation.80.particle-waves'
  | 'animation.90.aurora'
  | 'animation.92.aurora-v2'
  | 'animation.93.particules-line'
  | 'animation.94.alien-blackout'
  | 'animation.96.stars'
  | 'animation.97.space'
  | 'animation.98.sidelined';

/** Animation speed slider value: 0-1.5 (0 = très rapide, 1.5 = très lent) */
export type AnimationSpeed = number;

/** Convert slider value (0-1.5) to animation multiplier (0.3-3.0) */
export function speedToMultiplier(speed: number): number {
  // Transform 0-1.5 range to 0.3-3.0 multiplier range
  // speed = 0 → 0.3 (très rapide)
  // speed = 1.5 → 3.0 (très lent)
  return 0.3 + (speed / 1.5) * 2.7;
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
  'animation.1.home-assistant-particles',
  'animation.10.css-dark-particles',
  'animation.72.playstation-3-bg-style',
  'animation.79.canvas-ribbons',
  'animation.80.particle-waves',
  'animation.90.aurora',
  'animation.92.aurora-v2',
  'animation.93.particules-line',
  'animation.94.alien-blackout',
  'animation.96.stars',
  'animation.97.space',
  'animation.98.sidelined',
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
  const [animationSpeed, setSpeedState] = useState<AnimationSpeed>(getStoredAnimationSpeed);
  const [theme, setThemeState] = useState<string>(getCurrentTheme());
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

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
    window.dispatchEvent(new StorageEvent('storage', { key: ANIMATION_SPEED_KEY, newValue: s }));
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

  const isFullAnimationTheme = theme === 'full-animation';
  const variant: EffectiveVariant = prefersReducedMotion
    ? 'off'
    : isFullAnimationTheme
      ? fullAnimationId
      : bgAnimation === 'off'
        ? 'off'
        : fullAnimationId; // Use fullAnimationId for all themes when animation is enabled

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
