/**
 * Hook for managing animation-specific parameters
 * Each animation can have its own configurable parameters
 */

import { useState, useEffect, useCallback } from 'react';
import type { FullAnimationId } from './useBackgroundAnimation';

export type AnimationParameterValue = string | number | boolean | any[];

export interface AnimationParameter {
  name: string;
  type: 'color' | 'number' | 'range' | 'boolean' | 'string' | 'array';
  default: AnimationParameterValue;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
  enum?: string[];
}

export type AnimationParameters = Record<string, AnimationParameterValue>;

// Définition des paramètres pour chaque animation
export const ANIMATION_PARAMETERS: Record<FullAnimationId, AnimationParameter[]> = {
  'animation.72.playstation-3-bg-style': [
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
      name: 'waveColor',
      type: 'color',
      default: 'rgb(255, 255, 255)',
      description: 'Couleur de la vague',
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
      default: 0.5,
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
      default: 0.5,
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
      default: 1.0,
      min: 0.1,
      max: 2.0,
      step: 0.1,
      description: 'Vitesse d\'animation (0.1-2.0)',
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
      default: 0.5,
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
      description: 'Vitesse d\'animation (0.1-2.0)',
    },
    {
      name: 'blurIntensity',
      type: 'range',
      default: 40,
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
  ],
  'animation.92.aurora-v2': [
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
  ],
  'animation.94.alien-blackout': [
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
  ],
  'animation.96.stars': [
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
