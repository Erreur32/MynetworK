/**
 * Theme Section Component
 * 
 * Complete theme management section with theme selection and color customization
 */

import React, { useState, useEffect, useRef } from 'react';
import { Lightbulb, Palette, RefreshCw, Save, Eye, ChevronUp, ChevronDown, ChevronDown as ChevronDownIcon, Check } from 'lucide-react';
import { applyTheme, getCurrentTheme, getAvailableThemes, type Theme } from '../utils/themeManager';
import { api } from '../api/client';
import { Section, SettingRow } from '../pages/SettingsPage';
import {
    useBackgroundAnimation,
    type BgAnimationVariant,
    type FullAnimationId,
    type AnimationSpeed
} from '../hooks/useBackgroundAnimation';
import { useAnimationParameters } from '../hooks/useAnimationParameters';

interface ThemeColors {
    // Primary colors
    accentPrimary: string;
    accentPrimaryHover: string;
    
    // Status colors
    accentSuccess: string;
    accentWarning: string;
    accentError: string;
    accentInfo: string;
    
    // Background colors
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    bgCard: string;
    bgHeader: string;
    bgFooter: string;
    
    // Text colors
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    
    // Border colors
    borderColor: string;
    borderColorLight: string;
    borderColorHover: string;
    
    // Button colors
    buttonBg: string;
    buttonText: string;
    buttonHoverBg: string;
    buttonHoverText: string;
    buttonActiveBg: string;
    buttonActiveText: string;
    buttonBorder: string;
}

interface ThemeConfig {
    theme: Theme;
    customColors?: Partial<ThemeColors>;
    cardOpacity?: number; // Opacité des blocs/cartes (0-1)
}

const DEFAULT_COLORS: Record<Theme, ThemeColors> = {
    dark: {
        accentPrimary: '#3b82f6',
        accentPrimaryHover: '#2563eb',
        accentSuccess: '#10b981',
        accentWarning: '#f59e0b',
        accentError: '#ef4444',
        accentInfo: '#06b6d4',
        bgPrimary: '#0f0f0f',
        bgSecondary: '#1a1a1a',
        bgTertiary: '#252525',
        bgCard: '#1a1a1a',
        bgHeader: '#111111',
        bgFooter: 'rgba(10, 10, 10, 0.9)',
        textPrimary: '#e5e5e5',
        textSecondary: '#999999',
        textTertiary: '#666666',
        borderColor: '#333333',
        borderColorLight: '#444444',
        borderColorHover: '#555555',
        buttonBg: '#1a1a1a',
        buttonText: '#e5e5e5',
        buttonHoverBg: '#252525',
        buttonHoverText: '#ffffff',
        buttonActiveBg: '#3b82f6',
        buttonActiveText: '#ffffff',
        buttonBorder: '#333333',
    },
    glass: {
        accentPrimary: '#5b9bd5',
        accentPrimaryHover: '#4a8bc2',
        accentSuccess: '#6bbf8e',
        accentWarning: '#d4a574',
        accentError: '#d87a7a',
        accentInfo: '#6bb3d4',
        bgPrimary: '#0a0a0a',
        bgSecondary: 'rgba(20, 20, 25, 0.75)',
        bgTertiary: 'rgba(30, 30, 35, 0.65)',
        bgCard: 'rgba(22, 22, 28, 0.8)',
        bgHeader: '#0f0f0f',
        bgFooter: '#0f0f0f',
        textPrimary: '#e8e8e8',
        textSecondary: '#b8b8b8',
        textTertiary: '#888888',
        borderColor: 'rgba(255, 255, 255, 0.08)',
        borderColorLight: 'rgba(255, 255, 255, 0.12)',
        borderColorHover: 'rgba(255, 255, 255, 0.18)',
        buttonBg: 'rgba(30, 30, 35, 0.7)',
        buttonText: '#e8e8e8',
        buttonHoverBg: 'rgba(40, 40, 45, 0.8)',
        buttonHoverText: '#ffffff',
        buttonActiveBg: '#5b9bd5',
        buttonActiveText: '#ffffff',
        buttonBorder: 'rgba(255, 255, 255, 0.1)',
    },
    modern: {
        accentPrimary: '#8b7cf6', // Bleu-mauve doux
        accentPrimaryHover: '#7c6af0', // Bleu-mauve plus intense
        accentSuccess: '#6bbf8e', // Vert doux
        accentWarning: '#d4a574', // Orange doux
        accentError: '#e88a8a', // Rouge doux
        accentInfo: '#6bb3d4', // Bleu doux
        bgPrimary: '#0a0d14', // Fond sombre pour gradient
        bgSecondary: 'rgba(30, 25, 50, 0.4)', // Fond secondaire transparent
        bgTertiary: 'rgba(40, 35, 65, 0.35)', // Fond tertiaire transparent
        bgCard: 'rgba(35, 30, 55, 0.5)', // Cartes transparentes
        bgHeader: 'rgba(15, 12, 25, 0.95)', // Header presque opaque
        bgFooter: 'rgba(15, 12, 25, 0.95)', // Footer presque opaque
        textPrimary: '#f0f2f8', // Texte très lisible
        textSecondary: '#c8d0e0', // Texte secondaire lisible
        textTertiary: '#9aa5b8', // Texte tertiaire
        borderColor: 'transparent', // Aucune bordure
        borderColorLight: 'transparent', // Aucune bordure
        borderColorHover: 'transparent', // Aucune bordure
        buttonBg: 'rgba(40, 35, 60, 0.6)', // Bouton transparent
        buttonText: '#f0f2f8', // Texte lisible
        buttonHoverBg: 'rgba(50, 45, 75, 0.7)', // Bouton hover
        buttonHoverText: '#ffffff', // Texte blanc
        buttonActiveBg: '#8b7cf6', // Bouton actif
        buttonActiveText: '#ffffff', // Texte blanc
        buttonBorder: 'transparent', // Aucune bordure
    },
    nightly: {
        accentPrimary: '#3b82f6',
        accentPrimaryHover: '#2563eb',
        accentSuccess: '#10b981',
        accentWarning: '#f59e0b',
        accentError: '#ef4444',
        accentInfo: '#06b6d4',
        bgPrimary: '#0f0f0f',
        bgSecondary: '#1a1a1a',
        bgTertiary: '#252525',
        bgCard: '#1a1a1a',
        bgHeader: '#111111',
        bgFooter: 'rgba(10, 10, 10, 0.9)',
        textPrimary: '#e5e5e5',
        textSecondary: '#999999',
        textTertiary: '#666666',
        borderColor: 'rgba(255, 255, 255, 0.03)',
        borderColorLight: 'rgba(255, 255, 255, 0.05)',
        borderColorHover: 'rgba(255, 255, 255, 0.08)',
        buttonBg: '#1a1a1a',
        buttonText: '#e5e5e5',
        buttonHoverBg: '#252525',
        buttonHoverText: '#ffffff',
        buttonActiveBg: '#3b82f6',
        buttonActiveText: '#ffffff',
        buttonBorder: '#333333',
    },
    neon: {
        accentPrimary: '#c084fc',
        accentPrimaryHover: '#a855f7',
        accentSuccess: '#34d399',
        accentWarning: '#fbbf24',
        accentError: '#f87171',
        accentInfo: '#60a5fa',
        bgPrimary: 'rgba(15, 15, 25, 0.7)',
        bgSecondary: 'rgba(30, 25, 45, 0.6)',
        bgTertiary: 'rgba(45, 35, 65, 0.5)',
        bgCard: 'rgba(40, 30, 60, 0.5)',
        bgHeader: 'rgba(20, 15, 35, 0.8)',
        bgFooter: 'rgba(15, 15, 25, 0.75)',
        textPrimary: '#f8fafc',
        textSecondary: '#e2e8f0',
        textTertiary: '#cbd5e1',
        borderColor: 'rgba(192, 132, 252, 0.25)',
        borderColorLight: 'rgba(192, 132, 252, 0.35)',
        borderColorHover: 'rgba(167, 139, 250, 0.4)',
        buttonBg: 'rgba(192, 132, 252, 0.2)',
        buttonText: '#f8fafc',
        buttonHoverBg: 'rgba(167, 139, 250, 0.25)',
        buttonHoverText: '#ffffff',
        buttonActiveBg: 'rgba(192, 132, 252, 0.5)',
        buttonActiveText: '#ffffff',
        buttonBorder: 'rgba(192, 132, 252, 0.4)',
    },
    elegant: {
        accentPrimary: '#a78bfa',
        accentPrimaryHover: '#8b5cf6',
        accentSuccess: '#10b981',
        accentWarning: '#f59e0b',
        accentError: '#ef4444',
        accentInfo: '#06b6d4',
        bgPrimary: '#1a1a2e',
        bgSecondary: 'rgba(45, 35, 65, 0.6)',
        bgTertiary: 'rgba(60, 50, 80, 0.5)',
        bgCard: 'rgba(35, 30, 55, 0.7)',
        bgHeader: 'rgba(30, 25, 50, 0.85)',
        bgFooter: 'rgba(25, 20, 45, 0.9)',
        textPrimary: '#f0f2f8',
        textSecondary: '#d8d0e8',
        textTertiary: '#b8aed8',
        borderColor: 'rgba(196, 181, 253, 0.4)',
        borderColorLight: 'rgba(196, 181, 253, 0.5)',
        borderColorHover: 'rgba(167, 139, 250, 0.6)',
        buttonBg: 'rgba(196, 181, 253, 0.25)',
        buttonText: '#f0f2f8',
        buttonHoverBg: 'rgba(167, 139, 250, 0.35)',
        buttonHoverText: '#ffffff',
        buttonActiveBg: '#a78bfa',
        buttonActiveText: '#ffffff',
        buttonBorder: 'rgba(196, 181, 253, 0.5)',
    },
    'full-animation': {
        accentPrimary: '#3b82f6',
        accentPrimaryHover: '#2563eb',
        accentSuccess: '#10b981',
        accentWarning: '#f59e0b',
        accentError: '#ef4444',
        accentInfo: '#06b6d4',
        bgPrimary: '#0a0a0f',
        bgSecondary: 'rgba(18, 18, 28, 0.72)',
        bgTertiary: 'rgba(28, 28, 40, 0.6)',
        bgCard: 'rgba(22, 22, 32, 0.78)',
        bgHeader: 'rgba(12, 12, 20, 0.85)',
        bgFooter: 'rgba(12, 12, 20, 0.88)',
        textPrimary: '#e8e8e8',
        textSecondary: '#a8a8b8',
        textTertiary: '#787888',
        borderColor: 'rgba(255, 255, 255, 0.06)',
        borderColorLight: 'rgba(255, 255, 255, 0.08)',
        borderColorHover: 'rgba(255, 255, 255, 0.12)',
        buttonBg: 'rgba(30, 30, 45, 0.7)',
        buttonText: '#e8e8e8',
        buttonHoverBg: 'rgba(40, 40, 55, 0.8)',
        buttonHoverText: '#ffffff',
        buttonActiveBg: '#3b82f6',
        buttonActiveText: '#ffffff',
        buttonBorder: 'rgba(255, 255, 255, 0.08)',
    },
};

const VALID_THEMES: Theme[] = ['dark', 'glass', 'modern', 'nightly', 'neon', 'elegant', 'full-animation'];

// Options d'animation pour les autres thèmes (non full-animation)
const BG_ANIMATION_OPTIONS: { value: BgAnimationVariant; label: string }[] = [
    { value: 'animation.80.particle-waves', label: 'Particle waves' },
    { value: 'animation.93.particules-line', label: 'Particules line' },
    { value: 'animation.1.home-assistant-particles', label: 'Home Assistant particles' },
];

const FULL_ANIMATION_OPTIONS: { value: FullAnimationId | 'off'; label: string }[] = [
    { value: 'off', label: 'NON' },
    { value: 'animation.80.particle-waves', label: 'Particle waves' },
    { value: 'animation.93.particules-line', label: 'Particules line' },
    { value: 'animation.1.home-assistant-particles', label: 'Home Assistant particles' },
    { value: 'animation.72.playstation-3-bg-style', label: 'PlayStation 3 style' },
    { value: 'animation.79.canvas-ribbons', label: 'Canvas ribbons' },
    { value: 'animation.90.aurora', label: 'Icelandic Aurora' },
    { value: 'animation.92.aurora-v2', label: 'Icelandic Aurora v2' },
    { value: 'animation.94.alien-blackout', label: 'Alien Blackout' },
    { value: 'animation.96.stars', label: 'Stars' },
    { value: 'animation.97.space', label: 'Space' },
    { value: 'animation.98.sidelined', label: 'Sidelined' },
    { value: 'animation.10.css-dark-particles', label: 'CSS dark particles' },
];

// Animation speed maintenant numérique (0.5-3.5), géré par slider

// Composant AnimationSelector moderne avec menu déroulant et cartes visuelles
interface AnimationSelectorProps {
    value: FullAnimationId;
    options: { value: FullAnimationId; label: string }[];
    onChange: (value: FullAnimationId) => void;
}

const AnimationSelector: React.FC<AnimationSelectorProps> = ({ value, options, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    return (
        <div className="relative w-full" ref={dropdownRef}>
            {/* Bouton de sélection */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-theme-secondary border border-theme rounded-lg px-4 py-3 text-left flex items-center justify-between hover:border-yellow-500/50 transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
            >
                <span className="text-sm font-medium text-theme-primary">
                    {selectedOption?.label || 'Sélectionner une animation'}
                </span>
                <ChevronDownIcon 
                    className={`w-5 h-5 text-theme-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Menu déroulant - Centré au centre du cadre, avec scroll, sans icônes, plusieurs colonnes */}
            {isOpen && (
                <div className="fixed z-50 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[700px] max-w-[calc(100vw-2rem)] max-h-[70vh] bg-theme-secondary border border-theme rounded-lg shadow-xl overflow-hidden">
                    <div className="p-4 overflow-y-auto max-h-[70vh]">
                        <div className="grid grid-cols-3 gap-2">
                            {options.map((option) => {
                                const isSelected = option.value === value;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => {
                                            onChange(option.value);
                                            setIsOpen(false);
                                        }}
                                        className={`relative p-3 rounded-lg border-2 transition-all text-left ${
                                            isSelected
                                                ? 'border-yellow-500 bg-yellow-500/10 shadow-lg shadow-yellow-500/20'
                                                : 'border-theme hover:border-yellow-500/50 hover:bg-theme-tertiary'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className={`text-sm font-medium ${isSelected ? 'text-yellow-500' : 'text-theme-primary'}`}>
                                                {option.label}
                                            </span>
                                            {isSelected && (
                                                <Check className="w-4 h-4 text-yellow-500 flex-shrink-0 ml-2" />
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export const ThemeSection: React.FC = () => {
    // Initialize with the currently active theme (from DOM or localStorage)
    const [currentTheme, setCurrentTheme] = useState<Theme>(() => {
        const htmlTheme = document.documentElement.getAttribute('data-theme');
        if (htmlTheme && VALID_THEMES.includes(htmlTheme as Theme)) return htmlTheme as Theme;
        return getCurrentTheme();
    });
    const [customColors, setCustomColors] = useState<Partial<ThemeColors>>({});
    const [cardOpacity, setCardOpacity] = useState<Record<Theme, number>>(() => {
        // Valeurs par défaut d'opacité pour chaque thème
        const defaults: Record<Theme, number> = {
            'dark': 1.0,
            'glass': 0.8,
            'modern': 0.5,
            'nightly': 1.0,
            'neon': 0.5,
            'elegant': 0.78,
            'full-animation': 0.7,
        };
        // Charger depuis localStorage si disponible
        try {
            const saved = localStorage.getItem('mynetwork_card_opacity');
            if (saved) {
                const parsed = JSON.parse(saved);
                return { ...defaults, ...parsed };
            }
        } catch (e) {
            console.warn('Failed to load card opacity from localStorage:', e);
        }
        return defaults;
    });
    const [isSaving, setIsSaving] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [isColorEditorOpen, setIsColorEditorOpen] = useState(false);
    const availableThemes = getAvailableThemes();
    const { bgAnimation, setBgAnimation, fullAnimationId, setFullAnimationId, animationSpeed, setAnimationSpeed, minSpeed, maxSpeed, theme } = useBackgroundAnimation();
    
    // Get current animation ID and its parameters
    // For all themes, use fullAnimationId if available, otherwise fallback to bgAnimation
    const currentAnimationId: FullAnimationId = currentTheme === 'full-animation' 
        ? fullAnimationId 
        : (bgAnimation !== 'off' ? (bgAnimation as FullAnimationId) : fullAnimationId);
    const { parameters, setParameter, parameterDefinitions } = useAnimationParameters(currentAnimationId);
    
    // Get animation name for display
    const getCurrentAnimationName = (): string => {
        const animationId = currentTheme === 'full-animation' 
            ? fullAnimationId 
            : (bgAnimation !== 'off' ? bgAnimation : fullAnimationId);
        const option = FULL_ANIMATION_OPTIONS.find(opt => opt.value === animationId);
        return option?.label || 'Aucune';
    };
    
    // Get animation name for a specific theme preview
    const getAnimationNameForTheme = (themeId: Theme): string => {
        if (themeId === 'full-animation') {
            const option = FULL_ANIMATION_OPTIONS.find(opt => opt.value === fullAnimationId);
            return option?.label || 'Particle waves';
        }
        // For other themes, show the animation if it's enabled
        if (bgAnimation !== 'off') {
            // Use fullAnimationId since that's what's actually used for rendering
            const option = FULL_ANIMATION_OPTIONS.find(opt => opt.value === fullAnimationId);
            return option?.label || 'Particle waves';
        }
        // If animation is off, show "NON"
        return 'NON';
    };

    useEffect(() => {
        // Load saved theme configuration from server
        loadThemeConfig();
    }, []);

    useEffect(() => {
        // Sync currentTheme state with actual active theme from DOM
        // This ensures the UI reflects the theme that's actually applied
        const syncTheme = () => {
            const htmlTheme = document.documentElement.getAttribute('data-theme');
            const activeTheme = (htmlTheme && VALID_THEMES.includes(htmlTheme as Theme)) ? htmlTheme as Theme : getCurrentTheme();
            
            // Update state with active theme (setState will only trigger re-render if different)
            setCurrentTheme(prevTheme => {
                // Only update if different to avoid unnecessary re-renders
                return activeTheme !== prevTheme ? activeTheme : prevTheme;
            });
        };
        
        // Sync on mount
        syncTheme();
        
        // Listen for external theme changes (when theme is changed outside this component)
        const handleThemeChange = () => {
            syncTheme();
        };
        window.addEventListener('themechange', handleThemeChange);
        
        return () => {
            window.removeEventListener('themechange', handleThemeChange);
        };
    }, []); // Empty deps - only run on mount

    const loadThemeConfig = async () => {
        try {
            // Get current active theme from DOM (most reliable source of truth)
            const htmlTheme = document.documentElement.getAttribute('data-theme');
            const currentActiveTheme = (htmlTheme && VALID_THEMES.includes(htmlTheme as Theme)) ? htmlTheme as Theme : getCurrentTheme();
            
            // CRITICAL: Keep current active theme in state FIRST to prevent UI flicker
            setCurrentTheme(currentActiveTheme);
            
            const response = await api.get<ThemeConfig>('/api/settings/theme');
            if (response.success && response.result) {
                const savedTheme = response.result.theme;
                // Only process if theme is valid
                if (VALID_THEMES.includes(savedTheme)) {
                    // Load custom colors from server
                    setCustomColors(response.result.customColors || {});
                    
                    // Load card opacity from server if available
                    if (response.result.cardOpacity !== undefined) {
                        setCardOpacity(prev => ({
                            ...prev,
                            [savedTheme]: response.result!.cardOpacity!
                        }));
                    }
                    
                    // IMPORTANT: Only apply server theme if it matches the currently active theme
                    // OR if there's no active theme (first load)
                    // This prevents overwriting user's current selection
                    if (savedTheme === currentActiveTheme) {
                        // Server theme matches active theme - everything is in sync
                        // No need to change anything, just ensure state is correct
                        setCurrentTheme(savedTheme);
                    } else {
                        // Server has different theme, but user has active theme
                        // Keep user's active theme, don't change it
                        // Only update state to show what's actually active
                        setCurrentTheme(currentActiveTheme);
                        // Optionally: could show a notification that server has different theme
                        // But for now, prioritize user's current selection
                    }
                } else {
                    console.warn(`Invalid theme from server: ${savedTheme}, keeping current: ${currentActiveTheme}`);
                    // Keep current theme active
                    setCurrentTheme(currentActiveTheme);
                }
            } else {
                // No theme from server, keep current active theme (don't change anything)
                setCurrentTheme(currentActiveTheme);
            }
        } catch (error) {
            console.error('Failed to load theme config:', error);
            // On error, keep current active theme from DOM/localStorage (don't change it)
            const htmlTheme = document.documentElement.getAttribute('data-theme');
            const theme = (htmlTheme && VALID_THEMES.includes(htmlTheme as Theme)) ? htmlTheme as Theme : getCurrentTheme();
            setCurrentTheme(theme);
        }
    };

    const handleThemeChange = (theme: Theme) => {
        setCurrentTheme(theme);
        applyTheme(theme);
        // Reset custom colors when changing theme
        setCustomColors({});
        // Clear custom CSS variables to use theme defaults
        const rootElement = document.documentElement;
        // Remove all custom color variables
        Object.keys(DEFAULT_COLORS[theme]).forEach((key) => {
            const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
            rootElement.style.removeProperty(cssVar);
        });
        // Apply card opacity for new theme
        const opacity = cardOpacity[theme] ?? 1.0;
        rootElement.style.setProperty('--card-opacity', opacity.toString());
        
        // Force re-render by triggering a custom event
        window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
        // Save theme change immediately (don't reload from server as it might have old theme)
        saveThemeConfig(theme, {}, opacity);
    };
    
    const saveThemeConfig = async (theme: Theme, customColors: Partial<ThemeColors>, opacity?: number) => {
        try {
            const config: ThemeConfig = {
                theme,
                customColors: Object.keys(customColors).length > 0 ? customColors : undefined,
                cardOpacity: opacity !== undefined ? opacity : cardOpacity[theme]
            };
            await api.post('/api/settings/theme', config);
            // Also save to localStorage for quick access
            try {
                localStorage.setItem('mynetwork_card_opacity', JSON.stringify(cardOpacity));
            } catch (e) {
                console.warn('Failed to save card opacity to localStorage:', e);
            }
        } catch (error) {
            console.error('Failed to save theme config:', error);
        }
    };

    const handleColorChange = (key: keyof ThemeColors, value: string) => {
        setCustomColors(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const applyCustomColors = () => {
        const rootElement = document.documentElement;
        const colors = { ...DEFAULT_COLORS[currentTheme], ...customColors };
        
        // Map of custom property names to CSS variable names
        const cssVarMap: Record<string, string> = {
            accentPrimary: 'accent-primary',
            accentPrimaryHover: 'accent-primary-hover',
            accentSuccess: 'accent-success',
            accentWarning: 'accent-warning',
            accentError: 'accent-error',
            accentInfo: 'accent-info',
            bgPrimary: 'bg-primary',
            bgSecondary: 'bg-secondary',
            bgTertiary: 'bg-tertiary',
            bgCard: 'bg-card',
            bgHeader: 'bg-header',
            bgFooter: 'bg-footer',
            textPrimary: 'text-primary',
            textSecondary: 'text-secondary',
            textTertiary: 'text-tertiary',
            borderColor: 'border-color',
            borderColorLight: 'border-color-light',
            borderColorHover: 'border-color-hover',
            buttonBg: 'button-bg',
            buttonText: 'button-text',
            buttonHoverBg: 'button-hover-bg',
            buttonHoverText: 'button-hover-text',
            buttonActiveBg: 'button-active-bg',
            buttonActiveText: 'button-active-text',
            buttonBorder: 'button-border',
        };
        
        // Apply custom colors as CSS variables
        Object.entries(colors).forEach(([key, value]) => {
            const cssVarName = cssVarMap[key] || key.replace(/([A-Z])/g, '-$1').toLowerCase();
            rootElement.style.setProperty(`--${cssVarName}`, value as string);
        });
        
        // Also apply theme-specific variables
        if (currentTheme === 'glass') {
            rootElement.style.setProperty('--backdrop-blur', 'blur(20px)');
        } else if (currentTheme === 'modern') {
            rootElement.style.setProperty('--backdrop-blur', 'blur(12px)');
        } else if (currentTheme === 'full-animation') {
            rootElement.style.setProperty('--backdrop-blur', 'blur(14px)');
        } else {
            rootElement.style.setProperty('--backdrop-blur', 'none');
        }
        
        // Apply card opacity
        const opacity = cardOpacity[currentTheme] ?? 1.0;
        rootElement.style.setProperty('--card-opacity', opacity.toString());
        
        // Force re-render by dispatching event
        window.dispatchEvent(new CustomEvent('themeupdate'));
    };

    useEffect(() => {
        // Apply card opacity whenever theme or opacity changes
        const rootElement = document.documentElement;
        const opacity = cardOpacity[currentTheme] ?? 1.0;
        rootElement.style.setProperty('--card-opacity', opacity.toString());
    }, [cardOpacity, currentTheme]);

    useEffect(() => {
        // Only apply custom colors if there are any, otherwise let CSS theme handle it
        if (Object.keys(customColors).length > 0) {
            applyCustomColors();
        } else {
            // Clear any custom CSS variables to use theme defaults
            const rootElement = document.documentElement;
            Object.keys(DEFAULT_COLORS[currentTheme]).forEach((key) => {
                const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
                rootElement.style.removeProperty(cssVar);
            });
            // Ensure theme is applied
            applyTheme(currentTheme);
            // Apply card opacity
            const opacity = cardOpacity[currentTheme] ?? 1.0;
            rootElement.style.setProperty('--card-opacity', opacity.toString());
        }
    }, [customColors, currentTheme, cardOpacity]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Only save colors that differ from default values
            const defaultColors = DEFAULT_COLORS[currentTheme];
            const onlyCustomColors: Partial<ThemeColors> = {};
            
            Object.entries(customColors).forEach(([key, value]) => {
                const colorKey = key as keyof ThemeColors;
                if (value !== defaultColors[colorKey]) {
                    onlyCustomColors[colorKey] = value as string;
                }
            });
            
            await saveThemeConfig(currentTheme, onlyCustomColors, cardOpacity[currentTheme]);
            alert('Thème sauvegardé avec succès');
            // Re-apply colors to ensure consistency after save
            applyCustomColors();
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Erreur lors de la sauvegarde');
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleCardOpacityChange = (value: number) => {
        setCardOpacity(prev => ({
            ...prev,
            [currentTheme]: value
        }));
        // Apply immediately
        const rootElement = document.documentElement;
        rootElement.style.setProperty('--card-opacity', value.toString());
    };

    const handleReset = () => {
        setCustomColors({});
        // Clear custom CSS variables to use theme defaults
        const rootElement = document.documentElement;
        Object.keys(DEFAULT_COLORS[currentTheme]).forEach((key) => {
            const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
            rootElement.style.removeProperty(cssVar);
        });
        // Re-apply theme to ensure defaults are used
        applyTheme(currentTheme);
        // Apply card opacity
        const opacity = cardOpacity[currentTheme] ?? 1.0;
        rootElement.style.setProperty('--card-opacity', opacity.toString());
        // Force re-render
        window.dispatchEvent(new CustomEvent('themeupdate'));
    };

    const getColorValue = (key: keyof ThemeColors): string => {
        return customColors[key] || DEFAULT_COLORS[currentTheme][key];
    };

    return (
        <Section title="Thème de l'interface" icon={Lightbulb} iconColor="yellow">
            <div className="space-y-8">
                {/* Theme Selection - Professional Cards Layout */}
                <div>
                    <div className="mb-4">
                        <h3 className="text-base font-semibold text-theme-primary mb-1">Thème principal</h3>
                        <p className="text-sm text-theme-secondary">Sélectionnez le thème de base pour l'interface</p>
                    </div>
                    
                    {/* Black themes category */}
                    <div className="mb-8">
                        <h4 className="text-sm font-semibold text-theme-primary mb-4 px-6">Black</h4>
                        <div className="grid grid-cols-4 gap-8 px-6">
                            {availableThemes.filter(theme => ['dark', 'glass', 'nightly'].includes(theme.id)).map((theme) => {
                            const themeColors = DEFAULT_COLORS[theme.id];
                            const isActive = currentTheme === theme.id;
                            
                            return (
                                <button
                                    key={theme.id}
                                    onClick={() => handleThemeChange(theme.id)}
                                    className={`relative group rounded-xl border-2 transition-all overflow-hidden ${
                                        isActive
                                            ? 'border-yellow-500 shadow-xl shadow-yellow-500/30 scale-[1.02]'
                                            : 'border-theme hover:border-yellow-500/50 hover:shadow-lg hover:shadow-yellow-500/10'
                                    } ${theme.id === 'modern' ? 'backdrop-blur-md' : ''}`}
                                    style={{
                                        background: theme.id === 'glass' 
                                            ? '#0a0a0a'
                                            : theme.id === 'modern'
                                            ? 'linear-gradient(135deg, #1a1a2e 0%, #16213e 25%, #0f3460 50%, #533483 75%, #1a1a2e 100%)'
                                            : theme.id === 'nightly'
                                            ? '#0f0f0f'
                                            : '#0f0f0f',
                                        backdropFilter: theme.id === 'glass' || theme.id === 'modern' ? 'blur(12px)' : 'none',
                                        color: themeColors.textPrimary
                                    }}
                                >
                                    {/* Preview overlays pour chaque thème */}
                                    {theme.id === 'dark' && (
                                        <>
                                            {/* Fond sombre avec bordures grises subtiles */}
                                            <div 
                                                className="absolute inset-0"
                                                style={{
                                                    background: '#0f0f0f'
                                                }}
                                            />
                                            {/* Simulation de cartes avec bordures grises */}
                                            <div 
                                                className="absolute inset-0 opacity-40"
                                                style={{
                                                    background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.8) 0%, rgba(37, 37, 37, 0.6) 100%)',
                                                    border: '1px solid rgba(56, 56, 56, 0.5)'
                                                }}
                                            />
                                        </>
                                    )}
                                    {theme.id === 'glass' && (
                                        <>
                                            {/* Glass effect raffiné avec backdrop blur */}
                                        <div 
                                                className="absolute inset-0"
                                            style={{
                                                    background: 'rgba(20, 20, 25, 0.75)',
                                                    backdropFilter: 'blur(16px)'
                                                }}
                                            />
                                            {/* Bordures glass subtiles */}
                                            <div 
                                                className="absolute inset-0 rounded-xl"
                                                style={{
                                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)'
                                                }}
                                            />
                                        </>
                                    )}
                                    {theme.id === 'nightly' && (
                                        <>
                                            {/* Fond très sombre pour nightly */}
                                            <div 
                                                className="absolute inset-0"
                                                style={{
                                                    background: '#0f0f0f'
                                                }}
                                            />
                                            {/* Cartes très sombres avec bordures super fines et légères */}
                                            <div 
                                                className="absolute inset-0 opacity-50"
                                                style={{
                                                    background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.9) 0%, rgba(37, 37, 37, 0.7) 100%)',
                                                    border: '1px solid rgba(255, 255, 255, 0.03)'
                                                }}
                                            />
                                            {/* Ombres plus prononcées pour nightly */}
                                            <div 
                                                className="absolute inset-0 rounded-xl"
                                                style={{
                                                    boxShadow: 'inset 0 0 30px rgba(0, 0, 0, 0.5), 0 4px 16px rgba(0, 0, 0, 0.4)'
                                            }}
                                        />
                                        </>
                                    )}
                                    {theme.id === 'modern' && (
                                        <>
                                            {/* Gradient diagonal bleu-mauve-rose doux - Représentatif du thème réel */}
                                            <div 
                                                className="absolute inset-0"
                                                style={{
                                                    background: 'linear-gradient(135deg, rgba(91, 155, 213, 0.35) 0%, rgba(139, 124, 246, 0.32) 25%, rgba(236, 72, 153, 0.3) 50%, rgba(139, 124, 246, 0.32) 75%, rgba(91, 155, 213, 0.35) 100%)'
                                                }}
                                            />
                                            {/* Glass effect subtil pour les cartes transparentes */}
                                            <div 
                                                className="absolute inset-0 opacity-30"
                                                style={{
                                                    background: 'linear-gradient(135deg, rgba(35, 30, 55, 0.5) 0%, rgba(40, 35, 65, 0.4) 100%)',
                                                    backdropFilter: 'blur(8px)'
                                                }}
                                            />
                                            {/* Légère lueur pour la profondeur */}
                                            <div 
                                                className="absolute inset-0 rounded-xl"
                                                style={{
                                                    boxShadow: 'inset 0 0 20px rgba(139, 124, 246, 0.2), 0 0 15px rgba(91, 155, 213, 0.15)'
                                                }}
                                            />
                                        </>
                                    )}
                                    {theme.id === 'neon' && (
                                        <>
                                            {/* Gradient néon avec effets lumineux */}
                                            <div 
                                                className="absolute inset-0"
                                                style={{
                                                    background: 'linear-gradient(135deg, #8b5cf626, #a78bfa1a, #3b82f626 80%, #8b5cf61a)'
                                                }}
                                            />
                                            {/* Carte avec effet glass et bordures néon */}
                                            <div 
                                                className="absolute inset-0 opacity-60"
                                                style={{
                                                    background: 'rgba(40, 30, 60, 0.5)',
                                                    backdropFilter: 'blur(12px)',
                                                    border: '1px solid rgba(192, 132, 252, 0.25)'
                                                }}
                                            />
                                            {/* Lueur néon pour la profondeur */}
                                            <div 
                                                className="absolute inset-0 rounded-xl"
                                                style={{
                                                    boxShadow: 'inset 0 0 20px rgba(192, 132, 252, 0.15), 0 0 20px rgba(139, 92, 246, 0.3)'
                                                }}
                                            />
                                        </>
                                    )}
                                    
                                    {/* Active indicator */}
                                    {isActive && (
                                        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-yellow-500 shadow-lg shadow-yellow-500/50 flex items-center justify-center">
                                            <div className="w-2 h-2 rounded-full bg-white" />
                                        </div>
                                    )}
                                    
                                    <div className="relative z-10 p-5">
                                        {/* Color palette preview - Only essential colors */}
                                        <div className="flex items-center gap-2 mb-4">
                                            <div className="flex gap-1.5">
                                                <div 
                                                    className="w-4 h-4 rounded-full border-2 border-white/30 shadow-sm"
                                                    style={{ backgroundColor: themeColors.accentPrimary }}
                                                    title="Couleur principale"
                                                />
                                                <div 
                                                    className="w-4 h-4 rounded-full border-2 border-white/30 shadow-sm"
                                                    style={{ backgroundColor: themeColors.textPrimary }}
                                                    title="Couleur texte"
                                                />
                                                <div 
                                                    className="w-4 h-4 rounded-full border-2 border-white/30 shadow-sm"
                                                    style={{ backgroundColor: themeColors.accentSuccess }}
                                                    title="Badge succès"
                                                />
                                                <div 
                                                    className="w-4 h-4 rounded-full border-2 border-white/30 shadow-sm"
                                                    style={{ backgroundColor: themeColors.buttonBg }}
                                                    title="Couleur bouton"
                                                />
                                            </div>
                                        </div>
                                        
                                        <div 
                                            className="text-lg font-semibold mb-1"
                                            style={{ color: themeColors.textPrimary }}
                                        >
                                            {theme.name}
                                        </div>
                                        <div 
                                            className="text-xs mb-1"
                                            style={{ color: themeColors.textSecondary }}
                                        >
                                            {theme.description}
                                        </div>
                                        <div 
                                            className="text-xs font-medium mt-1"
                                            style={{ color: themeColors.accentPrimary }}
                                        >
                                            Animation: {getAnimationNameForTheme(theme.id)}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                        </div>
                    </div>
                    
                    {/* Color themes category */}
                    <div className="mb-8">
                        <h4 className="text-sm font-semibold text-theme-primary mb-4 px-6">Couleur</h4>
                        <div className="grid grid-cols-4 gap-8 px-6">
                            {availableThemes.filter(theme => ['modern', 'neon'].includes(theme.id)).map((theme) => {
                                const themeColors = DEFAULT_COLORS[theme.id];
                                const isActive = currentTheme === theme.id;
                                
                                return (
                                    <button
                                        key={theme.id}
                                        onClick={() => handleThemeChange(theme.id)}
                                        className={`relative group rounded-xl border-2 transition-all overflow-hidden ${
                                            isActive
                                                ? 'border-yellow-500 shadow-xl shadow-yellow-500/30 scale-[1.02]'
                                                : 'border-theme hover:border-yellow-500/50 hover:shadow-lg hover:shadow-yellow-500/10'
                                        } ${theme.id === 'modern' ? 'backdrop-blur-md' : ''}`}
                                        style={{
                                            background: theme.id === 'glass' 
                                                ? '#0a0a0a'
                                                : theme.id === 'modern'
                                                ? 'linear-gradient(135deg, #1a1a2e 0%, #16213e 25%, #0f3460 50%, #533483 75%, #1a1a2e 100%)'
                                                : theme.id === 'nightly'
                                                ? '#0f0f0f'
                                                : '#0f0f0f',
                                            backdropFilter: theme.id === 'glass' || theme.id === 'modern' ? 'blur(12px)' : 'none',
                                            color: themeColors.textPrimary
                                        }}
                                    >
                                        {/* Preview overlays pour chaque thème */}
                                        {theme.id === 'modern' && (
                                            <>
                                                {/* Gradient diagonal bleu-mauve-rose doux - Représentatif du thème réel */}
                                                <div 
                                                    className="absolute inset-0"
                                                    style={{
                                                        background: 'linear-gradient(135deg, rgba(91, 155, 213, 0.35) 0%, rgba(139, 124, 246, 0.32) 25%, rgba(236, 72, 153, 0.3) 50%, rgba(139, 124, 246, 0.32) 75%, rgba(91, 155, 213, 0.35) 100%)'
                                                    }}
                                                />
                                                {/* Glass effect subtil pour les cartes transparentes */}
                                                <div 
                                                    className="absolute inset-0 opacity-30"
                                                    style={{
                                                        background: 'linear-gradient(135deg, rgba(35, 30, 55, 0.5) 0%, rgba(40, 35, 65, 0.4) 100%)',
                                                        backdropFilter: 'blur(8px)'
                                                    }}
                                                />
                                                {/* Légère lueur pour la profondeur */}
                                                <div 
                                                    className="absolute inset-0 rounded-xl"
                                                    style={{
                                                        boxShadow: 'inset 0 0 20px rgba(139, 124, 246, 0.2), 0 0 15px rgba(91, 155, 213, 0.15)'
                                                    }}
                                                />
                                            </>
                                        )}
                                        {theme.id === 'neon' && (
                                            <>
                                                {/* Gradient néon avec effets lumineux */}
                                                <div 
                                                    className="absolute inset-0"
                                                    style={{
                                                        background: 'linear-gradient(135deg, #8b5cf626, #a78bfa1a, #3b82f626 80%, #8b5cf61a)'
                                                    }}
                                                />
                                                {/* Carte avec effet glass et bordures néon */}
                                                <div 
                                                    className="absolute inset-0 opacity-60"
                                                    style={{
                                                        background: 'rgba(40, 30, 60, 0.5)',
                                                        backdropFilter: 'blur(12px)',
                                                        border: '1px solid rgba(192, 132, 252, 0.25)'
                                                    }}
                                                />
                                                {/* Lueur néon pour la profondeur */}
                                                <div 
                                                    className="absolute inset-0 rounded-xl"
                                                    style={{
                                                        boxShadow: 'inset 0 0 20px rgba(192, 132, 252, 0.15), 0 0 20px rgba(139, 92, 246, 0.3)'
                                                    }}
                                                />
                                            </>
                                        )}
                                        
                                        {/* Active indicator */}
                                        {isActive && (
                                            <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-yellow-500 shadow-lg shadow-yellow-500/50 flex items-center justify-center">
                                                <div className="w-2 h-2 rounded-full bg-white" />
                                            </div>
                                        )}
                                        
                                        <div className="relative z-10 p-5">
                                            {/* Color palette preview - Only essential colors */}
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="flex gap-1.5">
                                                    <div 
                                                        className="w-4 h-4 rounded-full border-2 border-white/30 shadow-sm"
                                                        style={{ backgroundColor: themeColors.accentPrimary }}
                                                        title="Couleur principale"
                                                    />
                                                    <div 
                                                        className="w-4 h-4 rounded-full border-2 border-white/30 shadow-sm"
                                                        style={{ backgroundColor: themeColors.textPrimary }}
                                                        title="Couleur texte"
                                                    />
                                                    <div 
                                                        className="w-4 h-4 rounded-full border-2 border-white/30 shadow-sm"
                                                        style={{ backgroundColor: themeColors.accentSuccess }}
                                                        title="Badge succès"
                                                    />
                                                    <div 
                                                        className="w-4 h-4 rounded-full border-2 border-white/30 shadow-sm"
                                                        style={{ backgroundColor: themeColors.buttonBg }}
                                                        title="Couleur bouton"
                                                    />
                                                </div>
                                            </div>
                                            
                                            <div 
                                                className="text-lg font-semibold mb-1"
                                                style={{ color: themeColors.textPrimary }}
                                            >
                                                {theme.name}
                                            </div>
                                            <div 
                                                className="text-xs mb-1"
                                                style={{ color: themeColors.textSecondary }}
                                            >
                                                {theme.description}
                                            </div>
                                            <div 
                                                className="text-xs font-medium mt-1"
                                                style={{ color: themeColors.accentPrimary }}
                                            >
                                                Animation: {getAnimationNameForTheme(theme.id)}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    
                    {/* Animation themes category (elegant + full-animation) */}
                    <div className="mb-8">
                        <h4 className="text-sm font-semibold text-theme-primary mb-4 px-6">Animation</h4>
                        <div className="grid grid-cols-4 gap-8 px-6">
                            {availableThemes.filter(theme => ['elegant', 'full-animation'].includes(theme.id)).map((theme) => {
                                const themeColors = DEFAULT_COLORS[theme.id];
                                const isActive = currentTheme === theme.id;
                                
                                return (
                                    <button
                                        key={theme.id}
                                        onClick={() => handleThemeChange(theme.id)}
                                        className={`relative group rounded-xl border-2 transition-all overflow-hidden ${
                                            isActive
                                                ? 'border-yellow-500 shadow-xl shadow-yellow-500/30 scale-[1.02]'
                                                : 'border-theme hover:border-yellow-500/50 hover:shadow-lg hover:shadow-yellow-500/10'
                                        } backdrop-blur-md`}
                                        style={{
                                            background: theme.id === 'full-animation'
                                                ? 'linear-gradient(135deg, #1a1a2e 0%, #0f0f1a 50%, #1a1a2e 100%)'
                                                : 'linear-gradient(135deg, rgba(147, 197, 253, 0.3) 0%, rgba(196, 181, 253, 0.28) 25%, rgba(251, 207, 232, 0.26) 50%, rgba(196, 181, 253, 0.28) 75%, rgba(147, 197, 253, 0.3) 100%)',
                                            backdropFilter: 'blur(12px)',
                                            color: themeColors.textPrimary,
                                            position: 'relative',
                                            overflow: 'hidden'
                                        }}
                                    >
                                        {theme.id === 'full-animation' && (
                                            <>
                                                <div className="absolute inset-0 opacity-60" style={{ background: 'radial-gradient(circle at 30% 50%, rgba(99,102,241,0.15), transparent 50%)' }} />
                                                <div className="absolute inset-0 opacity-40" style={{ background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.1), transparent)' }} />
                                                {currentTheme === 'full-animation' && (
                                                    <div className="absolute bottom-2 left-2 right-2 px-2 py-1 rounded text-[10px] font-medium" style={{ 
                                                        background: 'rgba(99, 102, 241, 0.2)', 
                                                        color: themeColors.textPrimary,
                                                        backdropFilter: 'blur(4px)'
                                                    }}>
                                                        {FULL_ANIMATION_OPTIONS.find(opt => opt.value === fullAnimationId)?.label || 'Particle waves'}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        {/* Animated gradient background (elegant only) */}
                                        {theme.id === 'elegant' && <div 
                                            className="absolute inset-0 elegant-gradient"
                                            style={{
                                                background: 'linear-gradient(135deg, rgba(147, 197, 253, 0.4) 0%, rgba(196, 181, 253, 0.35) 25%, rgba(251, 207, 232, 0.3) 50%, rgba(196, 181, 253, 0.35) 75%, rgba(147, 197, 253, 0.4) 100%)',
                                                backgroundSize: '400% 400%',
                                                animation: 'elegantGradientShift 12s ease infinite'
                                            }}
                                        />}
                                        {/* Glass effect overlay */}
                                        <div 
                                            className="absolute inset-0 opacity-70"
                                            style={{
                                                background: theme.id === 'full-animation' ? 'rgba(15, 15, 25, 0.7)' : 'rgba(35, 30, 55, 0.6)',
                                                backdropFilter: 'blur(12px)',
                                                border: '1px solid rgba(196, 181, 253, 0.4)'
                                            }}
                                        />
                                        {/* Animated glow effect (elegant only) */}
                                        {theme.id === 'elegant' && <div 
                                            className="absolute inset-0 rounded-xl elegant-preview-glow"
                                            style={{
                                                boxShadow: 'inset 0 0 30px rgba(196, 181, 253, 0.3), 0 0 20px rgba(251, 207, 232, 0.25)',
                                                animation: 'elegantPreviewGlow 3s ease-in-out infinite'
                                            }}
                                        />}
                                        
                                        {/* Active indicator */}
                                        {isActive && (
                                            <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-yellow-500 shadow-lg shadow-yellow-500/50 flex items-center justify-center">
                                                <div className="w-2 h-2 rounded-full bg-white" />
                                            </div>
                                        )}
                                        
                                        <div className="relative z-10 p-5">
                                            {/* Color palette preview */}
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="flex gap-1.5">
                                                    <div 
                                                        className="w-4 h-4 rounded-full border-2 border-white/30 shadow-sm elegant-icon-pulse"
                                                        style={{ backgroundColor: themeColors.accentPrimary }}
                                                        title="Couleur principale"
                                                    />
                                                    <div 
                                                        className="w-4 h-4 rounded-full border-2 border-white/30 shadow-sm"
                                                        style={{ backgroundColor: themeColors.textPrimary }}
                                                        title="Couleur texte"
                                                    />
                                                    <div 
                                                        className="w-4 h-4 rounded-full border-2 border-white/30 shadow-sm elegant-icon-pulse"
                                                        style={{ backgroundColor: themeColors.accentSuccess }}
                                                        title="Badge succès"
                                                    />
                                                    <div 
                                                        className="w-4 h-4 rounded-full border-2 border-white/30 shadow-sm"
                                                        style={{ backgroundColor: themeColors.buttonBg }}
                                                        title="Couleur bouton"
                                                    />
                                                </div>
                                            </div>
                                            
                                            <div 
                                                className="text-lg font-semibold mb-1"
                                                style={{ color: themeColors.textPrimary }}
                                            >
                                                {theme.name}
                                            </div>
                                            <div 
                                                className="text-xs mb-1"
                                                style={{ color: themeColors.textSecondary }}
                                            >
                                                {theme.description}
                                            </div>
                                            <div 
                                                className="text-xs font-medium"
                                                style={{ color: themeColors.accentPrimary }}
                                            >
                                                Animation: {getAnimationNameForTheme(theme.id)}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Opacité des blocs - Au-dessus du choix des animations - Fonctionne même si animation off */}
                <div className="border-t border-theme pt-6 space-y-4">
 
                    <SettingRow
                        label="Opacité des blocs"
                        description={`Réglez l'opacité des cartes et blocs. Valeur actuelle: ${Math.round((cardOpacity[currentTheme] ?? 1.0) * 100)}%`}
                    >
                        <div className="flex items-center gap-3 w-full">
                            <input
                                type="range"
                                min={0.1}
                                max={1.0}
                                step={0.01}
                                value={cardOpacity[currentTheme] ?? 1.0}
                                onChange={(e) => handleCardOpacityChange(parseFloat(e.target.value))}
                                className="flex-1 h-2 bg-theme-secondary rounded-lg appearance-none cursor-pointer accent-yellow-500"
                                style={{
                                    background: `linear-gradient(to right, rgba(251, 191, 36, 0.3) 0%, rgba(251, 191, 36, 0.3) ${((cardOpacity[currentTheme] ?? 1.0) - 0.1) / 0.9 * 100}%, rgba(255, 255, 255, 0.1) ${((cardOpacity[currentTheme] ?? 1.0) - 0.1) / 0.9 * 100}%, rgba(255, 255, 255, 0.1) 100%)`
                                }}
                            />
                            <span className="text-sm text-theme-secondary font-mono min-w-[3rem] text-right">
                                {Math.round((cardOpacity[currentTheme] ?? 1.0) * 100)}%
                            </span>
                        </div>
                    </SettingRow>
                </div>

                {/* Sélection d'animation - Sous l'opacité, en plusieurs colonnes */}
                <div className="border-t border-theme pt-6 space-y-4">
                    <h3 className="text-base font-semibold text-theme-primary mb-1">Sélection de l'animation</h3>
                    <p className="text-sm text-theme-secondary">
                        Choisissez l'animation affichée en arrière-plan pour votre thème.
                    </p>
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                        {FULL_ANIMATION_OPTIONS.filter(option => {
                            // Filtrer les animations supprimées (sécurité supplémentaire)
                            const removedAnimations = ['animation.95.just-in-case', 'animation.99.media-background'];
                            return !removedAnimations.includes(option.value);
                        }).map((option) => {
                            // Use fullAnimationId for all themes when animation is enabled, 'off' when disabled
                            const currentValue = (currentTheme === 'full-animation' || bgAnimation !== 'off')
                                ? fullAnimationId 
                                : 'off';
                            const isSelected = currentValue === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                        if (option.value === 'off') {
                                            // Désactiver l'animation
                                            if (currentTheme !== 'full-animation') {
                                                setBgAnimation('off');
                                            }
                                            // Pour full-animation, on garde l'animation mais on peut la désactiver visuellement
                                            // En fait, pour full-animation, on ne peut pas vraiment désactiver, donc on ne fait rien
                                        } else {
                                            // Always update fullAnimationId for all themes
                                            setFullAnimationId(option.value as FullAnimationId);
                                            // For non-full-animation themes, also update bgAnimation
                                            if (currentTheme !== 'full-animation') {
                                                // Try to set bgAnimation, but if it's not in BG_ANIMATION_OPTIONS, 
                                                // we'll use fullAnimationId in the variant logic
                                                if (['animation.80.particle-waves', 'animation.93.particules-line', 'animation.1.home-assistant-particles'].includes(option.value)) {
                                                    setBgAnimation(option.value as BgAnimationVariant);
                                                } else {
                                                    // For animations not in BG_ANIMATION_OPTIONS, keep bgAnimation as a generic enabled state
                                                    setBgAnimation('animation.80.particle-waves' as BgAnimationVariant);
                                                }
                                            }
                                        }
                                    }}
                                    className={`relative px-1.5 py-2 rounded-md border-2 transition-all text-center ${
                                        option.value === 'off'
                                            ? isSelected
                                                ? 'border-red-500 bg-red-500/10 shadow-md shadow-red-500/20'
                                                : 'border-theme hover:border-red-500/50 hover:bg-theme-tertiary'
                                            : isSelected
                                                ? 'border-yellow-500 bg-yellow-500/10 shadow-md shadow-yellow-500/20'
                                                : 'border-theme hover:border-yellow-500/50 hover:bg-theme-tertiary'
                                    }`}
                                >
                                    <div className={`text-xs font-medium leading-tight ${
                                        option.value === 'off'
                                            ? isSelected ? 'text-red-500' : 'text-theme-primary'
                                            : isSelected ? 'text-yellow-500' : 'text-theme-primary'
                                    }`}>
                                        {option.label}
                                    </div>
                                    {isSelected && (
                                        <div className="absolute top-1 right-1">
                                            <Check className={`w-3 h-3 ${option.value === 'off' ? 'text-red-500' : 'text-yellow-500'}`} />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Vitesse d'animation et paramètres */}
                {(currentTheme === 'full-animation' || bgAnimation !== 'off') && (
                <div className="border-t border-theme pt-6 space-y-4">
                    {/* Vitesse d'animation */}
                    <SettingRow
                        label="Vitesse d'animation"
                        description={`${animationSpeed.toFixed(2)} (${animationSpeed >= 1.2 ? 'Lent' : animationSpeed >= 0.75 ? 'Normal' : animationSpeed >= 0.4 ? 'Rapide' : 'Très rapide'})`}
                    >
                        <div className="flex items-center gap-3 w-full">
                            <input
                                type="range"
                                min={minSpeed}
                                max={maxSpeed}
                                step={0.1}
                                value={animationSpeed}
                                onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
                                className="flex-1 h-2 bg-theme-secondary rounded-lg appearance-none cursor-pointer accent-yellow-500"
                                style={{
                                    background: `linear-gradient(to right, rgba(251, 191, 36, 0.3) 0%, rgba(251, 191, 36, 0.3) ${((animationSpeed - minSpeed) / (maxSpeed - minSpeed)) * 100}%, rgba(255, 255, 255, 0.1) ${((animationSpeed - minSpeed) / (maxSpeed - minSpeed)) * 100}%, rgba(255, 255, 255, 0.1) 100%)`
                                }}
                            />
                            <span className="text-sm text-theme-secondary font-mono min-w-[3rem] text-right">
                                {animationSpeed.toFixed(1)}x
                            </span>
                        </div>
                    </SettingRow>
                    
                    {/* Animation Parameters Configuration */}
                    {parameterDefinitions.length > 0 && parameters && (
                        <div className="mt-4 space-y-4 pt-4 border-t border-theme">
                            <h4 className="text-base font-semibold text-theme-primary mb-4">Paramètres d'animation</h4>
                            {parameterDefinitions.map((param) => {
                                const value = parameters[param.name];
                                
                                if (param.type === 'color') {
                                    // Convertir RGB en hex pour l'input color
                                    const rgbToHex = (rgbStr: string | undefined): string => {
                                        if (!rgbStr || typeof rgbStr !== 'string') {
                                            return '#ffffff';
                                        }
                                        const match = rgbStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                                        if (match) {
                                            const r = parseInt(match[1], 10).toString(16).padStart(2, '0');
                                            const g = parseInt(match[2], 10).toString(16).padStart(2, '0');
                                            const b = parseInt(match[3], 10).toString(16).padStart(2, '0');
                                            return `#${r}${g}${b}`;
                                        }
                                        return rgbStr.startsWith('#') ? rgbStr : '#ffffff';
                                    };
                                    
                                    const colorValue = (value as string) || param.default as string || 'rgb(255, 255, 255)';
                                    
                                    return (
                                        <div key={param.name} className="space-y-2">
                                            <div>
                                                <label className="text-sm font-medium text-theme-primary block mb-1">
                                                    {param.description || param.name}
                                                </label>
                                                <p className="text-xs text-theme-secondary mb-2">Couleur actuelle: {colorValue}</p>
                                            </div>
                                            <div className="flex items-center gap-3 w-full">
                                                <input
                                                    type="color"
                                                    value={rgbToHex(colorValue)}
                                                    onChange={(e) => {
                                                        // Convertir hex en rgb
                                                        const hex = e.target.value;
                                                        const r = parseInt(hex.slice(1, 3), 16);
                                                        const g = parseInt(hex.slice(3, 5), 16);
                                                        const b = parseInt(hex.slice(5, 7), 16);
                                                        setParameter(param.name, `rgb(${r}, ${g}, ${b})`);
                                                    }}
                                                    className="h-10 w-20 rounded border border-theme cursor-pointer"
                                                />
                                                <input
                                                    type="text"
                                                    value={colorValue}
                                                    onChange={(e) => setParameter(param.name, e.target.value)}
                                                    placeholder="rgb(255, 255, 255)"
                                                    className="flex-1 bg-theme-secondary border border-theme rounded-lg px-3 py-2 text-sm text-theme-primary focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                                                />
                                            </div>
                                        </div>
                                    );
                                }
                                
                                if (param.type === 'range') {
                                    const rangeValue = typeof value === 'number' ? value : (param.default as number || 0);
                                    return (
                                        <div key={param.name} className="space-y-2">
                                            <div>
                                                <label className="text-sm font-medium text-theme-primary block mb-1">
                                                    {param.description || param.name}
                                                </label>
                                                <p className="text-xs text-theme-secondary">
                                                    {rangeValue}{param.min !== undefined && param.max !== undefined ? ` (min: ${param.min}, max: ${param.max})` : ''}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3 w-full">
                                                <input
                                                    type="range"
                                                    min={param.min}
                                                    max={param.max}
                                                    step={param.step || 1}
                                                    value={rangeValue}
                                                    onChange={(e) => setParameter(param.name, parseFloat(e.target.value))}
                                                    className="flex-1 h-2 bg-theme-secondary rounded-lg appearance-none cursor-pointer accent-yellow-500"
                                                />
                                                <span className="text-sm text-theme-secondary font-mono min-w-[3rem] text-right">
                                                    {rangeValue.toFixed(param.step && param.step < 1 ? 1 : 0)}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                }
                                
                                if (param.type === 'string') {
                                    const stringValue = typeof value === 'string' ? value : (param.default as string || '');
                                    return (
                                        <div key={param.name} className="space-y-2">
                                            <label className="text-sm font-medium text-theme-primary block">
                                                {param.description || param.name}
                                            </label>
                                            {param.enum ? (
                                                <select
                                                    value={stringValue}
                                                    onChange={(e) => setParameter(param.name, e.target.value)}
                                                    className="w-full px-3 py-2 bg-theme-secondary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                                                >
                                                    {param.enum.map((option) => (
                                                        <option key={option} value={option}>
                                                            {option}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input
                                                    type="text"
                                                    value={stringValue}
                                                    onChange={(e) => setParameter(param.name, e.target.value)}
                                                    className="w-full px-3 py-2 bg-theme-secondary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                                                    placeholder={param.description || param.name}
                                                />
                                            )}
                                        </div>
                                    );
                                }
                                if (param.type === 'array' && param.name === 'mediaList') {
                                    // Éditeur spécial pour la liste des médias
                                    const mediaListValue = Array.isArray(value) ? value : (Array.isArray(param.default) ? param.default : []);
                                    return (
                                        <div key={param.name} className="space-y-2">
                                            <div>
                                                <label className="text-sm font-medium text-theme-primary block mb-1">
                                                    {param.description || param.name}
                                                </label>
                                                <p className="text-xs text-theme-secondary mb-3">{mediaListValue.length} média(s)</p>
                                            </div>
                                            <div className="w-full space-y-3">
                                                {mediaListValue.map((media: any, index: number) => (
                                                    <div key={index} className="p-4 bg-theme-secondary border border-theme rounded-lg space-y-3">
                                                        <div className="space-y-2">
                                                            <label className="text-sm font-medium text-theme-primary block">URL:</label>
                                                            <input
                                                                type="text"
                                                                value={media.file || ''}
                                                                onChange={(e) => {
                                                                    const newList = [...mediaListValue];
                                                                    newList[index] = { ...newList[index], file: e.target.value };
                                                                    setParameter(param.name, newList);
                                                                }}
                                                                className="w-full px-3 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                                                                placeholder="https://..."
                                                            />
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex-1 space-y-2">
                                                                <label className="text-sm font-medium text-theme-primary block">Durée (ms):</label>
                                                                <input
                                                                    type="text"
                                                                    value={media.duration === 'playback' ? 'playback' : (typeof media.duration === 'number' ? media.duration.toString() : '')}
                                                                    onChange={(e) => {
                                                                        const newList = [...mediaListValue];
                                                                        const val = e.target.value;
                                                                        newList[index] = { 
                                                                            ...newList[index], 
                                                                            duration: val === 'playback' ? 'playback' : (val ? parseInt(val, 10) : undefined)
                                                                        };
                                                                        setParameter(param.name, newList);
                                                                    }}
                                                                    className="w-full px-3 py-2 bg-theme-tertiary border border-theme rounded-lg text-theme-primary text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                                                                    placeholder="70000 ou 'playback'"
                                                                />
                                                            </div>
                                                            <div className="flex items-end pb-2">
                                                                <label className="text-sm text-theme-primary flex items-center gap-2 cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={media.muted !== false}
                                                                        onChange={(e) => {
                                                                            const newList = [...mediaListValue];
                                                                            newList[index] = { ...newList[index], muted: e.target.checked };
                                                                            setParameter(param.name, newList);
                                                                        }}
                                                                        className="w-4 h-4 rounded border-theme text-yellow-500 focus:ring-yellow-500/50"
                                                                    />
                                                                    Muet
                                                                </label>
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const newList = mediaListValue.filter((_: any, i: number) => i !== index);
                                                                setParameter(param.name, newList);
                                                            }}
                                                            className="text-xs px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-md transition-colors"
                                                        >
                                                            Supprimer
                                                        </button>
                                                    </div>
                                                ))}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const newList = [...mediaListValue, { file: '', duration: 70000, muted: true }];
                                                        setParameter(param.name, newList);
                                                    }}
                                                    className="px-4 py-2 bg-yellow-500 text-black rounded-lg hover:bg-yellow-400 text-sm font-medium transition-colors"
                                                >
                                                    + Ajouter un média
                                                </button>
                                            </div>
                                        </div>
                                    );
                                }
                                if (param.type === 'boolean') {
                                    const boolValue = value === true || value === false ? value : (param.default as boolean || false);
                                    return (
                                        <div key={param.name} className="flex items-center justify-between py-2">
                                            <div>
                                                <label className="text-sm font-medium text-theme-primary block">
                                                    {param.description || param.name}
                                                </label>
                                                <p className="text-xs text-theme-secondary">{boolValue ? 'Activé' : 'Désactivé'}</p>
                                            </div>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={boolValue === true}
                                                onClick={() => setParameter(param.name, !boolValue)}
                                                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500/50 ${
                                                    boolValue ? 'bg-yellow-500' : 'bg-theme-tertiary'
                                                }`}
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                                                        boolValue ? 'translate-x-5' : 'translate-x-1'
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    );
                                }
                                
                                return null;
                            })}
                        </div>
                    )}
                </div>
                )}

                {/* Color Customization - Professional Layout */}
                <div className="border-t border-theme pt-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-base font-semibold text-theme-primary mb-1 flex items-center gap-2">
                                <Palette size={18} className="text-yellow-400" />
                                Personnalisation des couleurs
                            </h3>
                            <p className="text-sm text-theme-secondary">Ajustez les couleurs selon vos préférences</p>
                        </div>
                        <button
                            onClick={() => setIsColorEditorOpen(!isColorEditorOpen)}
                            className="px-4 py-2 bg-theme-secondary border border-theme hover:border-yellow-500/50 rounded-lg transition-all flex items-center gap-2 text-sm text-theme-primary"
                        >
                            {isColorEditorOpen ? (
                                <>
                                    <ChevronUp size={16} />
                                    <span>Masquer</span>
                                </>
                            ) : (
                                <>
                                    <ChevronDown size={16} />
                                    <span>Afficher</span>
                                </>
                            )}
                        </button>
                    </div>
                    
                    {isColorEditorOpen && (
                        <div className="space-y-6">
                            {/* Action Buttons */}
                            <div className="flex items-center justify-end gap-3 pb-4 border-b border-theme">
                                <button
                                    onClick={handleReset}
                                    className="px-4 py-2 bg-theme-secondary border border-theme hover:border-red-500/50 rounded-lg transition-all flex items-center gap-2 text-sm text-theme-primary hover:bg-theme-primary"
                                >
                                    <RefreshCw size={14} />
                                    Réinitialiser
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="px-4 py-2 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 rounded-lg text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium shadow-lg shadow-yellow-500/20"
                                >
                                    {isSaving ? (
                                        <>
                                            <RefreshCw size={14} className="animate-spin" />
                                            <span>Sauvegarde...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Save size={14} />
                                            <span>Sauvegarder</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Color Categories Grid - Compact blocks like plugin cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                            {/* Primary Colors */}
                            <div className="bg-theme-secondary rounded-xl border border-theme p-4">
                                <h5 className="text-xs font-semibold text-theme-primary mb-3 flex items-center gap-2">
                                    <div className="w-1 h-4 bg-blue-500 rounded-full" />
                                    Couleurs principales
                                </h5>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-[10px] font-medium text-theme-secondary mb-1.5">
                                            Couleur primaire
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="color"
                                                value={getColorValue('accentPrimary')}
                                                onChange={(e) => handleColorChange('accentPrimary', e.target.value)}
                                                className="w-7 h-7 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('accentPrimary')}
                                                onChange={(e) => handleColorChange('accentPrimary', e.target.value)}
                                                className="w-20 px-1.5 py-0.5 bg-theme-primary border border-theme rounded text-theme-primary text-[10px] font-mono focus:outline-none focus:border-yellow-500/50"
                                                placeholder="#3b82f6"
                                            />
                                            <div 
                                                className="w-8 h-8 rounded border border-theme/30 flex items-center justify-center text-[10px] font-medium transition-all"
                                                style={{ backgroundColor: getColorValue('accentPrimary'), color: '#fff' }}
                                            >
                                                Ex
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-theme-secondary mb-1.5">
                                            Couleur primaire (hover)
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="color"
                                                value={getColorValue('accentPrimaryHover')}
                                                onChange={(e) => handleColorChange('accentPrimaryHover', e.target.value)}
                                                className="w-7 h-7 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('accentPrimaryHover')}
                                                onChange={(e) => handleColorChange('accentPrimaryHover', e.target.value)}
                                                className="w-20 px-1.5 py-0.5 bg-theme-primary border border-theme rounded text-theme-primary text-[10px] font-mono focus:outline-none focus:border-yellow-500/50"
                                                placeholder="#2563eb"
                                            />
                                            <div 
                                                className="w-8 h-8 rounded border border-theme/30 flex items-center justify-center text-[10px] font-medium transition-all"
                                                style={{ backgroundColor: getColorValue('accentPrimaryHover'), color: '#fff' }}
                                            >
                                                Ex
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Status Colors */}
                            <div className="bg-theme-secondary rounded-xl border border-theme p-4">
                                <h5 className="text-xs font-semibold text-theme-primary mb-3 flex items-center gap-2">
                                    <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                                    Couleurs de statut
                                </h5>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[10px] font-medium text-theme-secondary mb-1.5 flex items-center gap-1.5">
                                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                            Succès
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="color"
                                                value={getColorValue('accentSuccess')}
                                                onChange={(e) => handleColorChange('accentSuccess', e.target.value)}
                                                className="w-7 h-7 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('accentSuccess')}
                                                onChange={(e) => handleColorChange('accentSuccess', e.target.value)}
                                                className="w-20 px-1.5 py-0.5 bg-theme-primary border border-theme rounded text-theme-primary text-[10px] font-mono focus:outline-none focus:border-yellow-500/50"
                                            />
                                            <div 
                                                className="w-8 h-8 rounded border border-theme/30 flex items-center justify-center text-[10px] font-medium transition-all"
                                                style={{ backgroundColor: getColorValue('accentSuccess'), color: '#fff' }}
                                            >
                                                ✓
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-theme-secondary mb-1.5 flex items-center gap-1.5">
                                            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                                            Avertissement
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="color"
                                                value={getColorValue('accentWarning')}
                                                onChange={(e) => handleColorChange('accentWarning', e.target.value)}
                                                className="w-7 h-7 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('accentWarning')}
                                                onChange={(e) => handleColorChange('accentWarning', e.target.value)}
                                                className="w-20 px-1.5 py-0.5 bg-theme-primary border border-theme rounded text-theme-primary text-[10px] font-mono focus:outline-none focus:border-yellow-500/50"
                                            />
                                            <div 
                                                className="w-8 h-8 rounded border border-theme/30 flex items-center justify-center text-[10px] font-medium transition-all"
                                                style={{ backgroundColor: getColorValue('accentWarning'), color: '#000' }}
                                            >
                                                ⚠
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-theme-secondary mb-1.5 flex items-center gap-1.5">
                                            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                                            Erreur
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="color"
                                                value={getColorValue('accentError')}
                                                onChange={(e) => handleColorChange('accentError', e.target.value)}
                                                className="w-7 h-7 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('accentError')}
                                                onChange={(e) => handleColorChange('accentError', e.target.value)}
                                                className="w-20 px-1.5 py-0.5 bg-theme-primary border border-theme rounded text-theme-primary text-[10px] font-mono focus:outline-none focus:border-yellow-500/50"
                                            />
                                            <div 
                                                className="w-8 h-8 rounded border border-theme/30 flex items-center justify-center text-[10px] font-medium transition-all"
                                                style={{ backgroundColor: getColorValue('accentError'), color: '#fff' }}
                                            >
                                                ✕
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-theme-secondary mb-1.5 flex items-center gap-1.5">
                                            <div className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                                            Information
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="color"
                                                value={getColorValue('accentInfo')}
                                                onChange={(e) => handleColorChange('accentInfo', e.target.value)}
                                                className="w-7 h-7 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('accentInfo')}
                                                onChange={(e) => handleColorChange('accentInfo', e.target.value)}
                                                className="w-20 px-1.5 py-0.5 bg-theme-primary border border-theme rounded text-theme-primary text-[10px] font-mono focus:outline-none focus:border-yellow-500/50"
                                            />
                                            <div 
                                                className="w-8 h-8 rounded border border-theme/30 flex items-center justify-center text-[10px] font-medium transition-all"
                                                style={{ backgroundColor: getColorValue('accentInfo'), color: '#fff' }}
                                            >
                                                i
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Background Colors */}
                            <div className="bg-theme-secondary rounded-xl border border-theme p-4">
                                <h5 className="text-xs font-semibold text-theme-primary mb-3 flex items-center gap-2">
                                    <div className="w-1 h-4 bg-purple-500 rounded-full" />
                                    Arrière-plans
                                </h5>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-[10px] font-medium text-theme-secondary mb-1.5">
                                            Arrière-plan principal
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="color"
                                                value={getColorValue('bgPrimary').replace(/rgba?\([^)]+\)/, '#0f0f0f')}
                                                onChange={(e) => handleColorChange('bgPrimary', e.target.value)}
                                                className="w-7 h-7 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('bgPrimary')}
                                                onChange={(e) => handleColorChange('bgPrimary', e.target.value)}
                                                className="w-20 px-1.5 py-0.5 bg-theme-primary border border-theme rounded text-theme-primary text-[10px] font-mono focus:outline-none focus:border-yellow-500/50"
                                            />
                                            <div 
                                                className="w-8 h-8 rounded border border-theme/30 transition-all"
                                                style={{ backgroundColor: getColorValue('bgPrimary') }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Text Colors */}
                            <div className="bg-theme-secondary rounded-xl border border-theme p-4">
                                <h5 className="text-xs font-semibold text-theme-primary mb-3 flex items-center gap-2">
                                    <div className="w-1 h-4 bg-cyan-500 rounded-full" />
                                    Couleurs de texte
                                </h5>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-[10px] font-medium text-theme-secondary mb-1.5">
                                            Texte principal
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="color"
                                                value={getColorValue('textPrimary')}
                                                onChange={(e) => handleColorChange('textPrimary', e.target.value)}
                                                className="w-7 h-7 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('textPrimary')}
                                                onChange={(e) => handleColorChange('textPrimary', e.target.value)}
                                                className="w-20 px-1.5 py-0.5 bg-theme-primary border border-theme rounded text-theme-primary text-[10px] font-mono focus:outline-none focus:border-yellow-500/50"
                                            />
                                            <div 
                                                className="w-8 h-8 rounded border border-theme/30 flex items-center justify-center text-[10px] font-medium transition-all"
                                                style={{ 
                                                    backgroundColor: getColorValue('bgSecondary'),
                                                    color: getColorValue('textPrimary')
                                                }}
                                            >
                                                Aa
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-theme-secondary mb-1.5">
                                            Texte secondaire
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="color"
                                                value={getColorValue('textSecondary')}
                                                onChange={(e) => handleColorChange('textSecondary', e.target.value)}
                                                className="w-7 h-7 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('textSecondary')}
                                                onChange={(e) => handleColorChange('textSecondary', e.target.value)}
                                                className="w-20 px-1.5 py-0.5 bg-theme-primary border border-theme rounded text-theme-primary text-[10px] font-mono focus:outline-none focus:border-yellow-500/50"
                                            />
                                            <div 
                                                className="w-8 h-8 rounded border border-theme/30 flex items-center justify-center text-[10px] font-medium transition-all"
                                                style={{ 
                                                    backgroundColor: getColorValue('bgSecondary'),
                                                    color: getColorValue('textSecondary')
                                                }}
                                            >
                                                Aa
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Border Colors */}
                            <div className="bg-theme-secondary rounded-xl border border-theme p-4">
                                <h5 className="text-xs font-semibold text-theme-primary mb-3 flex items-center gap-2">
                                    <div className="w-1 h-4 bg-gray-500 rounded-full" />
                                    Couleurs de bordure
                                </h5>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-[10px] font-medium text-theme-secondary mb-1.5">
                                            Bordure
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="color"
                                                value={getColorValue('borderColor').replace(/rgba?\([^)]+\)/, '#333333')}
                                                onChange={(e) => handleColorChange('borderColor', e.target.value)}
                                                className="w-7 h-7 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('borderColor')}
                                                onChange={(e) => handleColorChange('borderColor', e.target.value)}
                                                className="w-20 px-1.5 py-0.5 bg-theme-primary border border-theme rounded text-theme-primary text-[10px] font-mono focus:outline-none focus:border-yellow-500/50"
                                            />
                                            <div 
                                                className="w-8 h-8 rounded border border-theme/30 transition-all"
                                                style={{ 
                                                    backgroundColor: getColorValue('bgSecondary'),
                                                    borderColor: getColorValue('borderColor')
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-theme-secondary mb-1.5">
                                            Bordure (light)
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="color"
                                                value={getColorValue('borderColorLight').replace(/rgba?\([^)]+\)/, '#444444')}
                                                onChange={(e) => handleColorChange('borderColorLight', e.target.value)}
                                                className="w-7 h-7 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('borderColorLight')}
                                                onChange={(e) => handleColorChange('borderColorLight', e.target.value)}
                                                className="w-20 px-1.5 py-0.5 bg-theme-primary border border-theme rounded text-theme-primary text-[10px] font-mono focus:outline-none focus:border-yellow-500/50"
                                            />
                                            <div 
                                                className="w-8 h-8 rounded border border-theme/30 transition-all"
                                                style={{ 
                                                    backgroundColor: getColorValue('bgSecondary'),
                                                    borderColor: getColorValue('borderColorLight')
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Button Colors */}
                            <div className="bg-theme-secondary rounded-xl border border-theme p-4">
                                <h5 className="text-xs font-semibold text-theme-primary mb-3 flex items-center gap-2">
                                    <div className="w-1 h-4 bg-orange-500 rounded-full" />
                                    Couleurs des boutons
                                </h5>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[10px] font-medium text-theme-secondary mb-1.5">
                                            Fond du bouton
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="color"
                                                value={getColorValue('buttonBg').replace(/rgba?\([^)]+\)/, '#1a1a1a')}
                                                onChange={(e) => handleColorChange('buttonBg', e.target.value)}
                                                className="w-7 h-7 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('buttonBg')}
                                                onChange={(e) => handleColorChange('buttonBg', e.target.value)}
                                                className="w-20 px-1.5 py-0.5 bg-theme-primary border border-theme rounded text-theme-primary text-[10px] font-mono focus:outline-none focus:border-yellow-500/50"
                                            />
                                            <button 
                                                className="w-8 h-8 rounded border border-theme/30 flex items-center justify-center text-[10px] font-medium transition-all"
                                                style={{ 
                                                    backgroundColor: getColorValue('buttonBg'),
                                                    color: getColorValue('buttonText')
                                                }}
                                            >
                                                Btn
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-theme-secondary mb-1.5">
                                            Texte du bouton
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="color"
                                                value={getColorValue('buttonText')}
                                                onChange={(e) => handleColorChange('buttonText', e.target.value)}
                                                className="w-7 h-7 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('buttonText')}
                                                onChange={(e) => handleColorChange('buttonText', e.target.value)}
                                                className="w-20 px-1.5 py-0.5 bg-theme-primary border border-theme rounded text-theme-primary text-[10px] font-mono focus:outline-none focus:border-yellow-500/50"
                                            />
                                            <button 
                                                className="w-8 h-8 rounded border border-theme/30 flex items-center justify-center text-[10px] font-medium transition-all"
                                                style={{ 
                                                    backgroundColor: getColorValue('buttonBg'),
                                                    color: getColorValue('buttonText')
                                                }}
                                            >
                                                Btn
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-theme-secondary mb-1.5">
                                            Fond du bouton (actif)
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="color"
                                                value={getColorValue('buttonActiveBg')}
                                                onChange={(e) => handleColorChange('buttonActiveBg', e.target.value)}
                                                className="w-7 h-7 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('buttonActiveBg')}
                                                onChange={(e) => handleColorChange('buttonActiveBg', e.target.value)}
                                                className="w-20 px-1.5 py-0.5 bg-theme-primary border border-theme rounded text-theme-primary text-[10px] font-mono focus:outline-none focus:border-yellow-500/50"
                                            />
                                            <button 
                                                className="w-8 h-8 rounded border border-theme/30 flex items-center justify-center text-[10px] font-medium transition-all"
                                                style={{ 
                                                    backgroundColor: getColorValue('buttonActiveBg'),
                                                    color: getColorValue('buttonActiveText')
                                                }}
                                            >
                                                Act
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-theme-secondary mb-1.5">
                                            Texte du bouton (actif)
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="color"
                                                value={getColorValue('buttonActiveText')}
                                                onChange={(e) => handleColorChange('buttonActiveText', e.target.value)}
                                                className="w-7 h-7 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('buttonActiveText')}
                                                onChange={(e) => handleColorChange('buttonActiveText', e.target.value)}
                                                className="w-20 px-1.5 py-0.5 bg-theme-primary border border-theme rounded text-theme-primary text-[10px] font-mono focus:outline-none focus:border-yellow-500/50"
                                            />
                                            <button 
                                                className="w-8 h-8 rounded border border-theme/30 flex items-center justify-center text-[10px] font-medium transition-all"
                                                style={{ 
                                                    backgroundColor: getColorValue('buttonActiveBg'),
                                                    color: getColorValue('buttonActiveText')
                                                }}
                                            >
                                                Act
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-medium text-theme-secondary mb-1.5">
                                            Bordure du bouton
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="color"
                                                value={getColorValue('buttonBorder').replace(/rgba?\([^)]+\)/, '#333333')}
                                                onChange={(e) => handleColorChange('buttonBorder', e.target.value)}
                                                className="w-7 h-7 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('buttonBorder')}
                                                onChange={(e) => handleColorChange('buttonBorder', e.target.value)}
                                                className="w-20 px-1.5 py-0.5 bg-theme-primary border border-theme rounded text-theme-primary text-[10px] font-mono focus:outline-none focus:border-yellow-500/50"
                                            />
                                            <div 
                                                className="w-8 h-8 rounded border border-theme/30 transition-all"
                                                style={{ 
                                                    backgroundColor: getColorValue('buttonBg'),
                                                    borderColor: getColorValue('buttonBorder')
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            </div>
                            {/* End of Color Categories Grid */}
                        </div>
                    )}
                </div>
            </div>
        </Section>
    );
};

