/**
 * Theme Section Component
 * 
 * Complete theme management section with theme selection and color customization
 */

import React, { useState, useEffect } from 'react';
import { Lightbulb, Palette, RefreshCw, Save, Eye, ChevronUp, ChevronDown } from 'lucide-react';
import { applyTheme, getCurrentTheme, getAvailableThemes, type Theme } from '../utils/themeManager';
import { api } from '../api/client';
import { Section, SettingRow } from '../pages/SettingsPage';

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
};

export const ThemeSection: React.FC = () => {
    const [currentTheme, setCurrentTheme] = useState<Theme>(getCurrentTheme());
    const [customColors, setCustomColors] = useState<Partial<ThemeColors>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [isColorEditorOpen, setIsColorEditorOpen] = useState(false); // Fermé par défaut
    const availableThemes = getAvailableThemes();

    useEffect(() => {
        // Load saved theme configuration
        loadThemeConfig();
    }, []);

    useEffect(() => {
        // Apply theme when it changes
        applyTheme(currentTheme);
    }, [currentTheme]);

    const loadThemeConfig = async () => {
        try {
            const response = await api.get<ThemeConfig>('/api/settings/theme');
            if (response.success && response.result) {
                const savedTheme = response.result.theme;
                // Only update if theme is valid
                if (['dark', 'glass', 'modern', 'nightly'].includes(savedTheme)) {
                    setCurrentTheme(savedTheme);
                    setCustomColors(response.result.customColors || {});
                    applyTheme(savedTheme);
                } else {
                    console.warn(`Invalid theme from server: ${savedTheme}, using current: ${currentTheme}`);
                }
            }
        } catch (error) {
            console.error('Failed to load theme config:', error);
            // On error, use current theme from localStorage
            const theme = getCurrentTheme();
            setCurrentTheme(theme);
            applyTheme(theme);
        }
    };

    const handleThemeChange = (theme: Theme) => {
        setCurrentTheme(theme);
        applyTheme(theme);
        // Reset custom colors when changing theme
        setCustomColors({});
        // Clear custom CSS variables to use theme defaults
        const root = document.documentElement;
        // Remove all custom color variables
        Object.keys(DEFAULT_COLORS[theme]).forEach((key) => {
            const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
            root.style.removeProperty(cssVar);
        });
        // Force re-render by triggering a custom event
        window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
        // Save theme change immediately (don't reload from server as it might have old theme)
        saveThemeConfig(theme, {});
    };
    
    const saveThemeConfig = async (theme: Theme, customColors: Partial<ThemeColors>) => {
        try {
            const config: ThemeConfig = {
                theme,
                customColors: Object.keys(customColors).length > 0 ? customColors : undefined
            };
            await api.post('/api/settings/theme', config);
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
        const root = document.documentElement;
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
            root.style.setProperty(`--${cssVarName}`, value as string);
        });
        
        // Also apply theme-specific variables
        if (currentTheme === 'glass') {
            root.style.setProperty('--backdrop-blur', 'blur(20px)');
        } else if (currentTheme === 'modern') {
            root.style.setProperty('--backdrop-blur', 'blur(12px)');
        } else {
            root.style.setProperty('--backdrop-blur', 'none');
        }
        
        // Force re-render by dispatching event
        window.dispatchEvent(new CustomEvent('themeupdate'));
    };

    useEffect(() => {
        // Only apply custom colors if there are any, otherwise let CSS theme handle it
        if (Object.keys(customColors).length > 0) {
            applyCustomColors();
        } else {
            // Clear any custom CSS variables to use theme defaults
            const root = document.documentElement;
            Object.keys(DEFAULT_COLORS[currentTheme]).forEach((key) => {
                const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
                root.style.removeProperty(cssVar);
            });
            // Ensure theme is applied
            applyTheme(currentTheme);
        }
    }, [customColors, currentTheme]);

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
            
            await saveThemeConfig(currentTheme, onlyCustomColors);
            alert('Thème sauvegardé avec succès');
            // Re-apply colors to ensure consistency after save
            applyCustomColors();
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Erreur lors de la sauvegarde');
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        setCustomColors({});
        // Clear custom CSS variables to use theme defaults
        const root = document.documentElement;
        Object.keys(DEFAULT_COLORS[currentTheme]).forEach((key) => {
            const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
            root.style.removeProperty(cssVar);
        });
        // Re-apply theme to ensure defaults are used
        applyTheme(currentTheme);
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
                    <div className="grid grid-cols-4 gap-8 px-6">
                        {availableThemes.map((theme) => {
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
                                            className="text-xs"
                                            style={{ color: themeColors.textSecondary }}
                                        >
                                            {theme.description}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

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

