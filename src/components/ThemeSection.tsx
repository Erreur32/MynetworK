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
        accentPrimary: '#60a5fa',
        accentPrimaryHover: '#3b82f6',
        accentSuccess: '#34d399',
        accentWarning: '#fbbf24',
        accentError: '#f87171',
        accentInfo: '#06b6d4',
        bgPrimary: 'rgba(15, 15, 15, 0.7)',
        bgSecondary: 'rgba(26, 26, 26, 0.6)',
        bgTertiary: 'rgba(37, 37, 37, 0.5)',
        bgCard: 'rgba(26, 26, 26, 0.5)',
        bgHeader: 'rgba(17, 17, 17, 0.8)',
        bgFooter: 'rgba(10, 10, 10, 0.7)',
        textPrimary: '#ffffff',
        textSecondary: '#cccccc',
        textTertiary: '#aaaaaa',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderColorLight: 'rgba(255, 255, 255, 0.15)',
        borderColorHover: 'rgba(255, 255, 255, 0.25)',
        buttonBg: 'rgba(26, 26, 26, 0.6)',
        buttonText: '#ffffff',
        buttonHoverBg: 'rgba(37, 37, 37, 0.7)',
        buttonHoverText: '#ffffff',
        buttonActiveBg: '#60a5fa',
        buttonActiveText: '#ffffff',
        buttonBorder: 'rgba(255, 255, 255, 0.1)',
    },
    modern: {
        accentPrimary: '#c084fc', // Mauve plus doux
        accentPrimaryHover: '#a855f7', // Mauve plus intense
        accentSuccess: '#34d399', // Vert émeraude moderne
        accentWarning: '#fbbf24', // Ambre doux
        accentError: '#f87171', // Rouge rose moderne
        accentInfo: '#60a5fa', // Bleu ciel moderne
        bgPrimary: 'rgba(15, 15, 25, 0.7)', // Fond sombre avec transparence
        bgSecondary: 'rgba(30, 25, 45, 0.6)', // Fond secondaire avec teinte mauve
        bgTertiary: 'rgba(45, 35, 65, 0.5)', // Fond tertiaire
        bgCard: 'rgba(40, 30, 60, 0.5)', // Cartes avec effet glass
        bgHeader: 'rgba(20, 15, 35, 0.8)', // Header avec transparence
        bgFooter: 'rgba(15, 15, 25, 0.75)', // Footer
        textPrimary: '#f8fafc', // Blanc cassé
        textSecondary: '#e2e8f0', // Gris clair
        textTertiary: '#cbd5e1', // Gris moyen
        borderColor: 'rgba(192, 132, 252, 0.25)', // Bordure mauve subtile
        borderColorLight: 'rgba(192, 132, 252, 0.35)', // Bordure plus visible
        borderColorHover: 'rgba(167, 139, 250, 0.4)', // Bordure mauve au hover
        buttonBg: 'rgba(192, 132, 252, 0.2)', // Fond bouton mauve transparent
        buttonText: '#f8fafc', // Texte blanc
        buttonHoverBg: 'rgba(167, 139, 250, 0.25)', // Fond mauve au hover
        buttonHoverText: '#ffffff', // Texte blanc pur
        buttonActiveBg: 'rgba(192, 132, 252, 0.5)', // Fond mauve actif
        buttonActiveText: '#ffffff', // Texte blanc
        buttonBorder: 'rgba(192, 132, 252, 0.4)', // Bordure mauve
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
                if (['dark', 'glass', 'modern'].includes(savedTheme)) {
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                                            ? `linear-gradient(135deg, ${themeColors.bgPrimary} 0%, ${themeColors.bgSecondary} 100%)`
                                            : theme.id === 'modern'
                                            ? 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 40%, #3b82f6 80%, #8b5cf6 100%)'
                                            : themeColors.bgSecondary,
                                        backdropFilter: theme.id === 'glass' || theme.id === 'modern' ? 'blur(12px)' : 'none',
                                        color: themeColors.textPrimary
                                    }}
                                >
                                    {/* Preview gradient overlay */}
                                    {theme.id === 'glass' && (
                                        <div 
                                            className="absolute inset-0 opacity-20"
                                            style={{
                                                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, rgba(139, 92, 246, 0.3) 50%, rgba(236, 72, 153, 0.3) 100%)'
                                            }}
                                        />
                                    )}
                                    {theme.id === 'modern' && (
                                        <>
                                            {/* Main gradient overlay - Mauve/Bleu élégant (rose réduit) */}
                                            <div 
                                                className="absolute inset-0 opacity-60"
                                                style={{
                                                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.8) 0%, rgba(167, 139, 250, 0.6) 40%, rgba(59, 130, 246, 0.8) 80%, rgba(139, 92, 246, 0.6) 100%)'
                                                }}
                                            />
                                            {/* Radial gradient accents - Effets de lumière (rose réduit) */}
                                            <div 
                                                className="absolute inset-0 opacity-30"
                                                style={{
                                                    background: 'radial-gradient(circle at 20% 30%, rgba(167, 139, 250, 0.4) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(59, 130, 246, 0.6) 0%, transparent 50%), radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.4) 0%, transparent 60%)'
                                                }}
                                            />
                                            {/* Glass effect - Reflet élégant */}
                                            <div 
                                                className="absolute inset-0 opacity-40"
                                                style={{
                                                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, transparent 40%, rgba(255, 255, 255, 0.08) 60%, transparent 100%)'
                                                }}
                                            />
                                            {/* Glass shine effect - Ligne de lumière */}
                                            <div 
                                                className="absolute inset-0 opacity-20"
                                                style={{
                                                    background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.2) 0%, transparent 30%, transparent 70%, rgba(255, 255, 255, 0.1) 100%)'
                                                }}
                                            />
                                            {/* Border glow effect - Lueur douce (rose réduit) */}
                                            <div 
                                                className="absolute inset-0 rounded-xl"
                                                style={{
                                                    boxShadow: 'inset 0 0 30px rgba(192, 132, 252, 0.4), inset 0 0 60px rgba(167, 139, 250, 0.2), 0 0 20px rgba(139, 92, 246, 0.3)'
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
                                        
                                        <div className={`text-lg font-semibold mb-1 ${isActive ? 'text-white' : ''}`}>
                                            {theme.name}
                                        </div>
                                        <div className={`text-xs ${isActive ? 'text-white/90' : 'opacity-80'}`}>
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

                            {/* Primary Colors */}
                            <div className="bg-theme-secondary rounded-xl border border-theme p-5">
                                <h5 className="text-sm font-semibold text-theme-primary mb-4 flex items-center gap-2">
                                    <div className="w-1 h-5 bg-blue-500 rounded-full" />
                                    Couleurs principales
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Couleur primaire
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('accentPrimary')}
                                                onChange={(e) => handleColorChange('accentPrimary', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('accentPrimary')}
                                                onChange={(e) => handleColorChange('accentPrimary', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                                placeholder="#3b82f6"
                                            />
                                            <div 
                                                className="w-10 h-10 rounded border border-theme flex items-center justify-center text-xs font-medium transition-all"
                                                style={{ backgroundColor: getColorValue('accentPrimary'), color: '#fff' }}
                                            >
                                                Ex
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Couleur primaire (hover)
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('accentPrimaryHover')}
                                                onChange={(e) => handleColorChange('accentPrimaryHover', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('accentPrimaryHover')}
                                                onChange={(e) => handleColorChange('accentPrimaryHover', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                                placeholder="#2563eb"
                                            />
                                            <div 
                                                className="w-10 h-10 rounded border border-theme flex items-center justify-center text-xs font-medium transition-all"
                                                style={{ backgroundColor: getColorValue('accentPrimaryHover'), color: '#fff' }}
                                            >
                                                Ex
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Status Colors */}
                            <div className="bg-theme-secondary rounded-xl border border-theme p-5">
                                <h5 className="text-sm font-semibold text-theme-primary mb-4 flex items-center gap-2">
                                    <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                                    Couleurs de statut
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2 flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full bg-emerald-500" />
                                            Succès
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('accentSuccess')}
                                                onChange={(e) => handleColorChange('accentSuccess', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('accentSuccess')}
                                                onChange={(e) => handleColorChange('accentSuccess', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <div 
                                                className="w-10 h-10 rounded border border-theme flex items-center justify-center text-xs font-medium transition-all"
                                                style={{ backgroundColor: getColorValue('accentSuccess'), color: '#fff' }}
                                            >
                                                ✓
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2 flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full bg-yellow-500" />
                                            Avertissement
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('accentWarning')}
                                                onChange={(e) => handleColorChange('accentWarning', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('accentWarning')}
                                                onChange={(e) => handleColorChange('accentWarning', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <div 
                                                className="w-10 h-10 rounded border border-theme flex items-center justify-center text-xs font-medium transition-all"
                                                style={{ backgroundColor: getColorValue('accentWarning'), color: '#000' }}
                                            >
                                                ⚠
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2 flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full bg-red-500" />
                                            Erreur
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('accentError')}
                                                onChange={(e) => handleColorChange('accentError', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('accentError')}
                                                onChange={(e) => handleColorChange('accentError', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <div 
                                                className="w-10 h-10 rounded border border-theme flex items-center justify-center text-xs font-medium transition-all"
                                                style={{ backgroundColor: getColorValue('accentError'), color: '#fff' }}
                                            >
                                                ✕
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2 flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full bg-cyan-500" />
                                            Information
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('accentInfo')}
                                                onChange={(e) => handleColorChange('accentInfo', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('accentInfo')}
                                                onChange={(e) => handleColorChange('accentInfo', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <div 
                                                className="w-10 h-10 rounded border border-theme flex items-center justify-center text-xs font-medium transition-all"
                                                style={{ backgroundColor: getColorValue('accentInfo'), color: '#fff' }}
                                            >
                                                i
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Background Colors */}
                            <div className="bg-theme-secondary rounded-xl border border-theme p-5">
                                <h5 className="text-sm font-semibold text-theme-primary mb-4 flex items-center gap-2">
                                    <div className="w-1 h-5 bg-purple-500 rounded-full" />
                                    Arrière-plans
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Arrière-plan principal
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('bgPrimary').replace(/rgba?\([^)]+\)/, '#0f0f0f')}
                                                onChange={(e) => handleColorChange('bgPrimary', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('bgPrimary')}
                                                onChange={(e) => handleColorChange('bgPrimary', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <div 
                                                className="w-10 h-10 rounded border border-theme transition-all"
                                                style={{ backgroundColor: getColorValue('bgPrimary') }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Arrière-plan secondaire
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('bgSecondary').replace(/rgba?\([^)]+\)/, '#1a1a1a')}
                                                onChange={(e) => handleColorChange('bgSecondary', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('bgSecondary')}
                                                onChange={(e) => handleColorChange('bgSecondary', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <div 
                                                className="w-10 h-10 rounded border border-theme transition-all"
                                                style={{ backgroundColor: getColorValue('bgSecondary') }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Arrière-plan tertiaire
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('bgTertiary').replace(/rgba?\([^)]+\)/, '#252525')}
                                                onChange={(e) => handleColorChange('bgTertiary', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('bgTertiary')}
                                                onChange={(e) => handleColorChange('bgTertiary', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <div 
                                                className="w-10 h-10 rounded border border-theme transition-all"
                                                style={{ backgroundColor: getColorValue('bgTertiary') }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Arrière-plan des cartes
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('bgCard').replace(/rgba?\([^)]+\)/, '#1a1a1a')}
                                                onChange={(e) => handleColorChange('bgCard', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('bgCard')}
                                                onChange={(e) => handleColorChange('bgCard', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <div 
                                                className="w-10 h-10 rounded border border-theme transition-all"
                                                style={{ backgroundColor: getColorValue('bgCard') }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Arrière-plan header
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('bgHeader').replace(/rgba?\([^)]+\)/, '#111111')}
                                                onChange={(e) => handleColorChange('bgHeader', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('bgHeader')}
                                                onChange={(e) => handleColorChange('bgHeader', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <div 
                                                className="w-10 h-10 rounded border border-theme transition-all"
                                                style={{ backgroundColor: getColorValue('bgHeader') }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Arrière-plan footer
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('bgFooter').replace(/rgba?\([^)]+\)/, 'rgba(10, 10, 10, 0.9)')}
                                                onChange={(e) => handleColorChange('bgFooter', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('bgFooter')}
                                                onChange={(e) => handleColorChange('bgFooter', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <div 
                                                className="w-10 h-10 rounded border border-theme transition-all"
                                                style={{ backgroundColor: getColorValue('bgFooter') }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Text Colors */}
                            <div className="bg-theme-secondary rounded-xl border border-theme p-5">
                                <h5 className="text-sm font-semibold text-theme-primary mb-4 flex items-center gap-2">
                                    <div className="w-1 h-5 bg-cyan-500 rounded-full" />
                                    Couleurs de texte
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Texte principal
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('textPrimary')}
                                                onChange={(e) => handleColorChange('textPrimary', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('textPrimary')}
                                                onChange={(e) => handleColorChange('textPrimary', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <div 
                                                className="w-10 h-10 rounded border border-theme flex items-center justify-center text-xs font-medium transition-all"
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
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Texte secondaire
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('textSecondary')}
                                                onChange={(e) => handleColorChange('textSecondary', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('textSecondary')}
                                                onChange={(e) => handleColorChange('textSecondary', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <div 
                                                className="w-10 h-10 rounded border border-theme flex items-center justify-center text-xs font-medium transition-all"
                                                style={{ 
                                                    backgroundColor: getColorValue('bgSecondary'),
                                                    color: getColorValue('textSecondary')
                                                }}
                                            >
                                                Aa
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Texte tertiaire
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('textTertiary')}
                                                onChange={(e) => handleColorChange('textTertiary', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('textTertiary')}
                                                onChange={(e) => handleColorChange('textTertiary', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <div 
                                                className="w-10 h-10 rounded border border-theme flex items-center justify-center text-xs font-medium transition-all"
                                                style={{ 
                                                    backgroundColor: getColorValue('bgSecondary'),
                                                    color: getColorValue('textTertiary')
                                                }}
                                            >
                                                Aa
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Border Colors */}
                            <div className="bg-theme-secondary rounded-xl border border-theme p-5">
                                <h5 className="text-sm font-semibold text-theme-primary mb-4 flex items-center gap-2">
                                    <div className="w-1 h-5 bg-gray-500 rounded-full" />
                                    Couleurs de bordure
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Bordure
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('borderColor').replace(/rgba?\([^)]+\)/, '#333333')}
                                                onChange={(e) => handleColorChange('borderColor', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('borderColor')}
                                                onChange={(e) => handleColorChange('borderColor', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <div 
                                                className="w-10 h-10 rounded border-2 transition-all"
                                                style={{ 
                                                    backgroundColor: getColorValue('bgSecondary'),
                                                    borderColor: getColorValue('borderColor')
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Bordure (light)
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('borderColorLight').replace(/rgba?\([^)]+\)/, '#444444')}
                                                onChange={(e) => handleColorChange('borderColorLight', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('borderColorLight')}
                                                onChange={(e) => handleColorChange('borderColorLight', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <div 
                                                className="w-10 h-10 rounded border-2 transition-all"
                                                style={{ 
                                                    backgroundColor: getColorValue('bgSecondary'),
                                                    borderColor: getColorValue('borderColorLight')
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Bordure (hover)
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('borderColorHover').replace(/rgba?\([^)]+\)/, '#555555')}
                                                onChange={(e) => handleColorChange('borderColorHover', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('borderColorHover')}
                                                onChange={(e) => handleColorChange('borderColorHover', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <div 
                                                className="w-10 h-10 rounded border-2 transition-all"
                                                style={{ 
                                                    backgroundColor: getColorValue('bgSecondary'),
                                                    borderColor: getColorValue('borderColorHover')
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Button Colors */}
                            <div className="bg-theme-secondary rounded-xl border border-theme p-5">
                                <h5 className="text-sm font-semibold text-theme-primary mb-4 flex items-center gap-2">
                                    <div className="w-1 h-5 bg-orange-500 rounded-full" />
                                    Couleurs des boutons
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Fond du bouton
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('buttonBg').replace(/rgba?\([^)]+\)/, '#1a1a1a')}
                                                onChange={(e) => handleColorChange('buttonBg', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('buttonBg')}
                                                onChange={(e) => handleColorChange('buttonBg', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <button 
                                                className="w-10 h-10 rounded border border-theme flex items-center justify-center text-xs font-medium transition-all"
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
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Texte du bouton
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('buttonText')}
                                                onChange={(e) => handleColorChange('buttonText', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('buttonText')}
                                                onChange={(e) => handleColorChange('buttonText', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <button 
                                                className="w-10 h-10 rounded border border-theme flex items-center justify-center text-xs font-medium transition-all"
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
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Fond du bouton (hover)
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('buttonHoverBg').replace(/rgba?\([^)]+\)/, '#252525')}
                                                onChange={(e) => handleColorChange('buttonHoverBg', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('buttonHoverBg')}
                                                onChange={(e) => handleColorChange('buttonHoverBg', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <button 
                                                className="w-10 h-10 rounded border border-theme flex items-center justify-center text-xs font-medium transition-all"
                                                style={{ 
                                                    backgroundColor: getColorValue('buttonHoverBg'),
                                                    color: getColorValue('buttonHoverText')
                                                }}
                                            >
                                                Hov
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Texte du bouton (hover)
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('buttonHoverText')}
                                                onChange={(e) => handleColorChange('buttonHoverText', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('buttonHoverText')}
                                                onChange={(e) => handleColorChange('buttonHoverText', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <button 
                                                className="w-10 h-10 rounded border border-theme flex items-center justify-center text-xs font-medium transition-all"
                                                style={{ 
                                                    backgroundColor: getColorValue('buttonHoverBg'),
                                                    color: getColorValue('buttonHoverText')
                                                }}
                                            >
                                                Hov
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Fond du bouton (actif)
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('buttonActiveBg')}
                                                onChange={(e) => handleColorChange('buttonActiveBg', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('buttonActiveBg')}
                                                onChange={(e) => handleColorChange('buttonActiveBg', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <button 
                                                className="w-10 h-10 rounded border border-theme flex items-center justify-center text-xs font-medium transition-all"
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
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Texte du bouton (actif)
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('buttonActiveText')}
                                                onChange={(e) => handleColorChange('buttonActiveText', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('buttonActiveText')}
                                                onChange={(e) => handleColorChange('buttonActiveText', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <button 
                                                className="w-10 h-10 rounded border border-theme flex items-center justify-center text-xs font-medium transition-all"
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
                                        <label className="block text-xs font-medium text-theme-secondary mb-2">
                                            Bordure du bouton
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={getColorValue('buttonBorder').replace(/rgba?\([^)]+\)/, '#333333')}
                                                onChange={(e) => handleColorChange('buttonBorder', e.target.value)}
                                                className="w-8 h-8 rounded border border-theme cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={getColorValue('buttonBorder')}
                                                onChange={(e) => handleColorChange('buttonBorder', e.target.value)}
                                                className="flex-1 px-2 py-1.5 bg-theme-primary border border-theme rounded-lg text-theme-primary text-xs font-mono focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
                                            />
                                            <div 
                                                className="w-10 h-10 rounded border-2 transition-all"
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
                    )}
                </div>
            </div>
        </Section>
    );
};

