/**
 * Hook for managing animation-specific parameters
 * Each animation can have its own configurable parameters
 * State is shared via AnimationParametersContext so that sliders (ThemeSection)
 * and AnimatedBackground (App) use the same values.
 */

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import type { FullAnimationId } from './useBackgroundAnimation';
import { CYCLEABLE_ANIMATION_IDS } from './useBackgroundAnimation';

export type AnimationParameterValue = string | number | boolean | any[];

export interface AnimationParameter {
  name: string;
  type: 'color' | 'number' | 'range' | 'boolean' | 'string' | 'array';
  default: AnimationParameterValue;
  min?: number;
  max?: number;
  step?: number;
  /** Optional i18n key for label/description (e.g. theme.cycleAnimationsDesc). Used when rendering in ThemeSection. */
  descriptionKey?: string;
  description?: string;
  enum?: string[];
}

export type AnimationParameters = Record<string, AnimationParameterValue>;

/**
 * Options spécifiques par animation — chaque ID a sa propre liste de paramètres.
 * Ne pas réutiliser les mêmes options pour toutes les animations.
 * Validation: chaque clé doit exister dans FullAnimationId (useBackgroundAnimation)
 * et les props passées dans AnimatedBackground.tsx doivent correspondre aux noms ici.
 */
export const ANIMATION_PARAMETERS: Record<FullAnimationId, AnimationParameter[]> = {
  /* All: cycle through selected animations */
  'animation.all': [
    {
      name: 'cycleAnimations',
      type: 'array',
      default: [...CYCLEABLE_ANIMATION_IDS],
      descriptionKey: 'theme.cycleAnimationsDesc',
    },
    {
      name: 'cycleDuration',
      type: 'range',
      default: 15,
      min: 5,
      max: 3600,
      step: 5,
      descriptionKey: 'theme.cycleDurationDesc',
    },
    {
      name: 'cycleRandom',
      type: 'boolean',
      default: false,
      descriptionKey: 'theme.cycleRandomDesc',
    },
  ],
  /* Playstation 3 - RetroArch Menu Ribbon (Boris Šehovac / Codepen), port Canvas 2D */
  'animation.72.playstation-3-bg-style': [
    {
      name: 'speed',
      type: 'range',
      default: 0.5,
      min: 0.1,
      max: 2.0,
      step: 0.1,
      description: 'Vitesse du ruban (0.1-2.0)',
    },
    {
      name: 'waveColor',
      type: 'color',
      default: 'rgb(31, 29, 139)',
      description: 'Couleur du ruban (format RGB)',
    },
    {
      name: 'targetFPS',
      type: 'range',
      default: 60,
      min: 10,
      max: 100,
      step: 5,
      description: 'Images par seconde cible (10-100)',
    },
    {
      name: 'animationTimeout',
      type: 'range',
      default: 5000,
      min: 0,
      max: 60000,
      step: 1000,
      description: 'Arrêt après (ms), 0 = infini',
    },
    {
      name: 'enableAnimationTimeout',
      type: 'boolean',
      default: false,
      description: 'Arrêt de l\'animation après le délai (désactivé par défaut, économie CPU)',
    },
  ],
  'animation.1.home-assistant-particles': [
    {
      name: 'particleCount',
      type: 'range',
      default: 50,
      min: 20,
      max: 100,
      step: 5,
      description: 'Nombre de particules',
    },
    {
      name: 'connectionDistance',
      type: 'range',
      default: 150,
      min: 100,
      max: 250,
      step: 10,
      description: 'Distance de connexion',
    },
    {
      name: 'particleColor',
      type: 'color',
      default: '#6366f1',
      description: 'Couleur des particules',
    },
  ],
  'animation.80.particle-waves': [
    {
      name: 'speed',
      type: 'range',
      default: 0.2,
      min: 0.1,
      max: 2.0,
      step: 0.1,
      description: 'Vitesse d\'animation (0.1-2.0)',
    },
    {
      name: 'particleSize',
      type: 'range',
      default: 1.2,
      min: 0.5,
      max: 3.0,
      step: 0.1,
      description: 'Taille des particules',
    },
    {
      name: 'waveHeight',
      type: 'range',
      default: 3,
      min: 1,
      max: 8,
      step: 0.5,
      description: 'Hauteur des vagues',
    },
  ],
  'animation.93.particules-line': [
    {
      name: 'speed',
      type: 'range',
      default: 0.2,
      min: 0.1,
      max: 2.0,
      step: 0.1,
      description: 'Vitesse d\'animation (0.1-2.0)',
    },
    {
      name: 'particleSize',
      type: 'range',
      default: 1.2,
      min: 0.5,
      max: 3.0,
      step: 0.1,
      description: 'Taille des particules',
    },
  ],
  'animation.10.css-dark-particles': [
    {
      name: 'speed',
      type: 'range',
      default: 0.1,
      min: 0.05,
      max: 2.0,
      step: 0.05,
      description: 'Vitesse d\'animation (0.05=lent, 2.0=rapide)',
    },
    {
      name: 'particleCount',
      type: 'range',
      default: 200,
      min: 50,
      max: 400,
      step: 10,
      description: 'Nombre de particules (50-400)',
    },
  ],
  'animation.79.canvas-ribbons': [
    {
      name: 'speed',
      type: 'range',
      default: 0.1,
      min: 0.1,
      max: 2.0,
      step: 0.1,
      description: 'Vitesse d\'animation (0.1-2.0)',
    },
    {
      name: 'wavesCount',
      type: 'range',
      default: 3,
      min: 1,
      max: 8,
      step: 1,
      description: 'Nombre de vagues (1-8)',
    },
    {
      name: 'ribbonWidth',
      type: 'range',
      default: 120,
      min: 50,
      max: 200,
      step: 10,
      description: 'Largeur des rubans (50-200)',
    },
    {
      name: 'amplitude',
      type: 'range',
      default: 0.5,
      min: 0.1,
      max: 1.5,
      step: 0.1,
      description: 'Amplitude des courbes (0.1-1.5)',
    },
    {
      name: 'rotation',
      type: 'range',
      default: 45,
      min: 0,
      max: 360,
      step: 5,
      description: 'Rotation en degrés (0-360)',
    },
  ],
  'animation.90.aurora': [
    {
      name: 'speed',
      type: 'range',
      default: 0.5,
      min: 0.1,
      max: 2.0,
      step: 0.1,
      description: 'Vitesse de mouvement (0.1-2.0)',
    },
    {
      name: 'blurIntensity',
      type: 'range',
      default: 60,
      min: 10,
      max: 100,
      step: 5,
      description: 'Intensité du flou (10-100)',
    },
    {
      name: 'colorIntensity',
      type: 'range',
      default: 0.7,
      min: 0.3,
      max: 1.0,
      step: 0.1,
      description: 'Intensité des couleurs (0.3-1.0)',
    },
    {
      name: 'streakCount',
      type: 'range',
      default: 7,
      min: 3,
      max: 12,
      step: 1,
      description: 'Nombre de streaks d\'aurore (3-12)',
    },
    {
      name: 'targetFPS',
      type: 'range',
      default: 60,
      min: 10,
      max: 100,
      step: 5,
      description: 'Images par seconde cible (10-100)',
    },
    {
      name: 'animationTimeout',
      type: 'range',
      default: 5000,
      min: 0,
      max: 60000,
      step: 1000,
      description: 'Arrêt après (ms), 0 = infini',
    },
    {
      name: 'enableAnimationTimeout',
      type: 'boolean',
      default: false,
      description: 'Arrêt de l\'animation après le délai (désactivé par défaut, économie CPU)',
    },
  ],
  /* Icelandic Aurora v2 (improved performance): speed, blur, color, streakCount, targetFPS, timeout options. */
  'animation.92.aurora-v2': [
    {
      name: 'speed',
      type: 'range',
      default: 0.5,
      min: 0.1,
      max: 2.0,
      step: 0.1,
      description: 'Vitesse de mouvement (0.1-2.0)',
    },
    {
      name: 'blurIntensity',
      type: 'range',
      default: 60,
      min: 10,
      max: 100,
      step: 5,
      description: 'Intensité du flou (10-100)',
    },
    {
      name: 'colorIntensity',
      type: 'range',
      default: 0.7,
      min: 0.3,
      max: 1.0,
      step: 0.1,
      description: 'Intensité des couleurs (0.3-1.0)',
    },
    {
      name: 'streakCount',
      type: 'range',
      default: 7,
      min: 3,
      max: 12,
      step: 1,
      description: 'Nombre de streaks d\'aurore (3-12)',
    },
    {
      name: 'targetFPS',
      type: 'range',
      default: 60,
      min: 10,
      max: 100,
      step: 5,
      description: 'Images par seconde cible (10-100)',
    },
    {
      name: 'animationTimeout',
      type: 'range',
      default: 5000,
      min: 0,
      max: 60000,
      step: 1000,
      description: 'Arrêt après (ms), 0 = infini',
    },
    {
      name: 'enableAnimationTimeout',
      type: 'boolean',
      default: false,
      description: 'Arrêt de l\'animation après le délai (désactivé par défaut, économie CPU)',
    },
  ],
  /* Alien: Blackout Intro Scene (React + WebGL style, Canvas 2D) – Boris Šehovac / Codepen */
  'animation.94.alien-blackout': [
    {
      name: 'speed',
      type: 'range',
      default: 0.5,
      min: 0.1,
      max: 2.0,
      step: 0.1,
      description: 'Vitesse de défilement des étoiles (0.1-2.0)',
    },
    {
      name: 'starCount',
      type: 'range',
      default: 2000,
      min: 500,
      max: 5000,
      step: 100,
      description: 'Nombre d\'étoiles (500-5000)',
    },
    {
      name: 'starSize',
      type: 'range',
      default: 2.5,
      min: 1.0,
      max: 5.0,
      step: 0.1,
      description: 'Taille des étoiles (1.0-5.0)',
    },
    {
      name: 'targetFPS',
      type: 'range',
      default: 60,
      min: 10,
      max: 100,
      step: 5,
      description: 'Images par seconde cible (10-100)',
    },
    {
      name: 'animationTimeout',
      type: 'range',
      default: 5000,
      min: 0,
      max: 60000,
      step: 1000,
      description: 'Arrêt après (ms), 0 = infini',
    },
    {
      name: 'enableAnimationTimeout',
      type: 'boolean',
      default: false,
      description: 'Arrêt de l\'animation après le délai (désactivé par défaut, économie CPU)',
    },
  ],
  /* Bit Ocean (Griffin Moyer / Codepen) - grille de points animée par bruit, couleurs changeantes */
  'animation.95.bit-ocean': [
    {
      name: 'speed',
      type: 'range',
      default: 1.0,
      min: 0.2,
      max: 2.0,
      step: 0.1,
      description: 'Vitesse de l\'océan (0.2-2.0)',
    },
    {
      name: 'pointSize',
      type: 'range',
      default: 2,
      min: 1,
      max: 5,
      step: 0.5,
      description: 'Taille des points (1-5)',
    },
  ],
  'animation.96.stars': [
    {
      name: 'speed',
      type: 'range',
      default: 0.1,
      min: 0.1,
      max: 2.0,
      step: 0.1,
      description: 'Vitesse d\'animation (0.1-2.0)',
    },
    {
      name: 'starCount',
      type: 'range',
      default: 1200,
      min: 300,
      max: 3000,
      step: 100,
      description: 'Nombre d\'étoiles (300-3000)',
    },
    {
      name: 'hue',
      type: 'range',
      default: 217,
      min: 0,
      max: 360,
      step: 1,
      description: 'Teinte des étoiles (0-360)',
    },
  ],
  'animation.97.space': [
    {
      name: 'speed',
      type: 'range',
      default: 0.5,
      min: 0.1,
      max: 2.0,
      step: 0.1,
      description: 'Vitesse d\'animation (0.1-2.0)',
    },
    {
      name: 'particleCount',
      type: 'range',
      default: 500,
      min: 100,
      max: 1000,
      step: 50,
      description: 'Nombre de particules (100-1000)',
    },
    {
      name: 'particleSize',
      type: 'range',
      default: 0.5,
      min: 0.1,
      max: 2.0,
      step: 0.1,
      description: 'Taille de base des particules (0.1-2.0)',
    },
    {
      name: 'defaultSpeed',
      type: 'range',
      default: 0.4,
      min: 0.1,
      max: 1.0,
      step: 0.1,
      description: 'Vitesse normale (0.1-1.0)',
    },
    {
      name: 'boostSpeed',
      type: 'range',
      default: 300,
      min: 100,
      max: 500,
      step: 10,
      description: 'Vitesse boostée (100-500)',
    },
  ],
  'animation.98.sidelined': [
    {
      name: 'speed',
      type: 'range',
      default: 0.5,
      min: 0.1,
      max: 2.0,
      step: 0.1,
      description: 'Vitesse d\'animation (0.1-2.0)',
    },
    {
      name: 'lineCount',
      type: 'range',
      default: 3,
      min: 2,
      max: 10,
      step: 1,
      description: 'Nombre de lignes (2-10)',
    },
    {
      name: 'hue',
      type: 'range',
      default: 260,
      min: 0,
      max: 360,
      step: 1,
      description: 'Teinte des lignes (0-360)',
    },
  ],
};

const ANIMATION_PARAMS_KEY_PREFIX = 'mynetwork_animation_params_';

function getStorageKey(animationId: FullAnimationId): string {
  return `${ANIMATION_PARAMS_KEY_PREFIX}${animationId}`;
}

export function getStoredAnimationParameters(animationId: FullAnimationId): AnimationParameters {
  try {
    const key = getStorageKey(animationId);
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Valider et compléter avec les valeurs par défaut
      const defaults = getDefaultParameters(animationId);
      return { ...defaults, ...parsed };
    }
  } catch {
    // ignore
  }
  return getDefaultParameters(animationId);
}

export function setStoredAnimationParameters(
  animationId: FullAnimationId,
  params: AnimationParameters
): void {
  try {
    const key = getStorageKey(animationId);
    localStorage.setItem(key, JSON.stringify(params));
  } catch {
    // ignore
  }
}

export function getDefaultParameters(animationId: FullAnimationId): AnimationParameters {
  const params: AnimationParameters = {};
  const definitions = ANIMATION_PARAMETERS[animationId] || [];
  definitions.forEach((param) => {
    params[param.name] = param.default;
  });
  return params;
}

/** Context value: same shape as useAnimationParameters return. Shared so ThemeSection sliders and AnimatedBackground stay in sync. */
export type AnimationParametersContextValue = {
  parameters: AnimationParameters;
  setParameter: (name: string, value: AnimationParameterValue) => void;
  resetParameters: () => void;
  parameterDefinitions: AnimationParameter[];
};

export const AnimationParametersContext = createContext<AnimationParametersContextValue | null>(null);

/** Use animation parameters from the shared context (e.g. in ThemeSection). Must be used inside a provider that passes useAnimationParameters(animationId). */
export function useAnimationParametersContext(): AnimationParametersContextValue {
  const ctx = useContext(AnimationParametersContext);
  if (!ctx) {
    throw new Error('useAnimationParametersContext must be used within a provider that supplies AnimationParametersContext');
  }
  return ctx;
}

export function useAnimationParameters(animationId: FullAnimationId) {
  const [parameters, setParametersState] = useState<AnimationParameters>(() =>
    getStoredAnimationParameters(animationId)
  );

  const setParameter = useCallback(
    (name: string, value: AnimationParameterValue) => {
      const newParams = { ...parameters, [name]: value };
      setParametersState(newParams);
      setStoredAnimationParameters(animationId, newParams);
    },
    [animationId, parameters]
  );

  const resetParameters = useCallback(() => {
    const defaults = getDefaultParameters(animationId);
    setParametersState(defaults);
    setStoredAnimationParameters(animationId, defaults);
  }, [animationId]);

  // Recharger les paramètres si l'animation change
  useEffect(() => {
    setParametersState(getStoredAnimationParameters(animationId));
  }, [animationId]);

  return {
    parameters,
    setParameter,
    resetParameters,
    parameterDefinitions: ANIMATION_PARAMETERS[animationId] || [],
  };
}
