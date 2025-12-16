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
        accentPrimary: '#3b82f6',
        accentPrimaryHover: '#2563eb',
        accentSuccess: '#10b981',
        accentWarning: '#f59e0b',
        accentError: '#ef4444',
        accentInfo: '#06b6d4',
        bgPrimary: '#0f172a',
        bgSecondary: '#1e293b',
        bgTertiary: '#334155',
        bgCard: 'rgba(30, 41, 59, 0.8)',
        bgHeader: 'rgba(15, 23, 42, 0.95)',
        bgFooter: 'rgba(15, 23, 42, 0.9)',
        textPrimary: '#f1f5f9',
        textSecondary: '#cbd5e1',
        textTertiary: '#94a3b8',
        borderColor: 'rgba(59, 130, 246, 0.3)',
        borderColorLight: 'rgba(59, 130, 246, 0.4)',
        borderColorHover: 'rgba(59, 130, 246, 0.6)',
        buttonBg: 'rgba(30, 41, 59, 0.8)',
        buttonText: '#f1f5f9',
        buttonHoverBg: 'rgba(51, 65, 85, 0.9)',
        buttonHoverText: '#ffffff',
        buttonActiveBg: '#3b82f6',
        buttonActiveText: '#ffffff',
        buttonBorder: 'rgba(59, 130, 246, 0.3)',
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
        <Section title="Thème de l'interface" icon={Lightbulb}>
            <div className="space-y-6">
                {/* Theme Selection */}
                <SettingRow
                    label="Thème principal"
                    description="Sélectionnez le thème de base pour l'interface"
                >
                    <div className="flex gap-3 flex-wrap">
                        {availableThemes.map((theme) => {
                            const themeColors = DEFAULT_COLORS[theme.id];
                            const isActive = currentTheme === theme.id;
                            
                            return (
                                <button
                                    key={theme.id}
                                    onClick={() => handleThemeChange(theme.id)}
                                    className={`relative px-4 py-3 rounded-lg border-2 transition-all overflow-hidden ${
                                        isActive
                                            ? 'border-blue-500 shadow-lg shadow-blue-500/50 scale-105'
                                            : 'border-gray-700 hover:border-gray-600 hover:scale-[1.02]'
                                    }`}
                                    style={{
                                        background: theme.id === 'glass' 
                                            ? `linear-gradient(135deg, ${themeColors.bgPrimary} 0%, ${themeColors.bgSecondary} 100%)`
                                            : theme.id === 'modern'
                                            ? `linear-gradient(135deg, ${themeColors.bgPrimary} 0%, ${themeColors.bgSecondary} 100%)`
                                            : themeColors.bgSecondary,
                                        backdropFilter: theme.id === 'glass' ? 'blur(10px)' : 'none',
                                        color: themeColors.textPrimary
                                    }}
                                >
                                    {/* Preview gradient overlay for glass and modern */}
                                    {theme.id === 'glass' && (
                                        <div 
                                            className="absolute inset-0 opacity-20"
                                            style={{
                                                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, rgba(139, 92, 246, 0.3) 50%, rgba(236, 72, 153, 0.3) 100%)'
                                            }}
                                        />
                                    )}
                                    {theme.id === 'modern' && (
                                        <div 
                                            className="absolute inset-0 opacity-30"
                                            style={{
                                                background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.5) 0%, rgba(124, 58, 237, 0.5) 50%, rgba(236, 72, 153, 0.5) 100%)'
                                            }}
                                        />
                                    )}
                                    
                                    {/* Active indicator */}
                                    {isActive && (
                                        <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-blue-500 shadow-lg shadow-blue-500/50" />
                                    )}
                                    
                                    <div className="relative z-10">
                                        <div className="flex items-center gap-2 mb-2">
                                            {/* Color preview dots */}
                                            <div className="flex gap-1">
                                                <div 
                                                    className="w-3 h-3 rounded-full border border-white/20"
                                                    style={{ backgroundColor: themeColors.accentPrimary }}
                                                />
                                                <div 
                                                    className="w-3 h-3 rounded-full border border-white/20"
                                                    style={{ backgroundColor: themeColors.accentSuccess }}
                                                />
                                                <div 
                                                    className="w-3 h-3 rounded-full border border-white/20"
                                                    style={{ backgroundColor: themeColors.accentWarning }}
                                                />
                                                <div 
                                                    className="w-3 h-3 rounded-full border border-white/20"
                                                    style={{ backgroundColor: themeColors.accentError }}
                                                />
                                            </div>
                                        </div>
                                        <div className={`text-sm font-medium ${isActive ? 'text-white' : ''}`}>
                                            {theme.name}
                                        </div>
                                        <div className={`text-xs mt-0.5 ${isActive ? 'text-white/80' : 'opacity-75'}`}>
                                            {theme.description}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </SettingRow>

                {/* Color Customization - Collapsible */}
                <div className="border-t border-theme pt-6">
                    <button
                        onClick={() => setIsColorEditorOpen(!isColorEditorOpen)}
                        className="w-full flex items-center justify-between p-3 hover:bg-theme-secondary rounded-lg transition-colors">
                        <div className="flex items-center gap-2">
                            <Palette size={16} className="text-theme-secondary" />
                            <h4 className="text-sm font-medium text-theme-primary">
                                Personnalisation des couleurs
                            </h4>
                        </div>
                        <div className="flex items-center gap-2">
                            {isColorEditorOpen ? (
                                <ChevronUp size={16} className="text-theme-secondary" />
                            ) : (
                                <ChevronDown size={16} className="text-theme-secondary" />
                            )}
                        </div>
                    </button>
                    
                    {isColorEditorOpen && (
                        <div className="mt-4 space-y-4">
                            <div className="flex items-center justify-end gap-2 mb-4">
                                <button
                                    onClick={handleReset}
                                    className="px-3 py-1.5 text-xs btn-theme rounded-lg transition-colors flex items-center gap-1">
                                    <RefreshCw size={12} />
                                    Réinitialiser
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="px-3 py-1.5 text-xs bg-accent-primary hover:bg-accent-primary-hover rounded-lg text-white transition-colors disabled:opacity-50 flex items-center gap-1">
                                    {isSaving ? (
                                        <RefreshCw size={12} className="animate-spin" />
                                    ) : (
                                        <Save size={12} />
                                    )}
                                    Sauvegarder
                                </button>
                            </div>

                            {/* Primary Colors */}
                            <div className="space-y-4">
                                <div>
                                    <h5 className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wide">
                                        Couleurs principales
                                    </h5>
                                    <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">
                                        Couleur primaire
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={getColorValue('accentPrimary')}
                                            onChange={(e) => handleColorChange('accentPrimary', e.target.value)}
                                            className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={getColorValue('accentPrimary')}
                                            onChange={(e) => handleColorChange('accentPrimary', e.target.value)}
                                            className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                            placeholder="#3b82f6"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">
                                        Couleur primaire (hover)
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={getColorValue('accentPrimaryHover')}
                                            onChange={(e) => handleColorChange('accentPrimaryHover', e.target.value)}
                                            className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={getColorValue('accentPrimaryHover')}
                                            onChange={(e) => handleColorChange('accentPrimaryHover', e.target.value)}
                                            className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                            placeholder="#2563eb"
                                        />
                                    </div>
                                </div>
                            </div>
                                </div>

                                {/* Status Colors */}
                                <div>
                                    <h5 className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wide">
                                        Couleurs de statut
                                    </h5>
                                    <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">
                                        Succès
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={getColorValue('accentSuccess')}
                                            onChange={(e) => handleColorChange('accentSuccess', e.target.value)}
                                            className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={getColorValue('accentSuccess')}
                                            onChange={(e) => handleColorChange('accentSuccess', e.target.value)}
                                            className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">
                                        Avertissement
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={getColorValue('accentWarning')}
                                            onChange={(e) => handleColorChange('accentWarning', e.target.value)}
                                            className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={getColorValue('accentWarning')}
                                            onChange={(e) => handleColorChange('accentWarning', e.target.value)}
                                            className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">
                                        Erreur
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={getColorValue('accentError')}
                                            onChange={(e) => handleColorChange('accentError', e.target.value)}
                                            className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={getColorValue('accentError')}
                                            onChange={(e) => handleColorChange('accentError', e.target.value)}
                                            className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">
                                        Information
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={getColorValue('accentInfo')}
                                            onChange={(e) => handleColorChange('accentInfo', e.target.value)}
                                            className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={getColorValue('accentInfo')}
                                            onChange={(e) => handleColorChange('accentInfo', e.target.value)}
                                            className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                            </div>
                                </div>

                                {/* Background Colors */}
                                <div>
                                    <h5 className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wide">
                                        Arrière-plans
                                    </h5>
                                    <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">
                                        Arrière-plan principal
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={getColorValue('bgPrimary').replace(/rgba?\([^)]+\)/, '#0f0f0f')}
                                            onChange={(e) => handleColorChange('bgPrimary', e.target.value)}
                                            className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={getColorValue('bgPrimary')}
                                            onChange={(e) => handleColorChange('bgPrimary', e.target.value)}
                                            className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">
                                        Arrière-plan secondaire
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={getColorValue('bgSecondary').replace(/rgba?\([^)]+\)/, '#1a1a1a')}
                                            onChange={(e) => handleColorChange('bgSecondary', e.target.value)}
                                            className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={getColorValue('bgSecondary')}
                                            onChange={(e) => handleColorChange('bgSecondary', e.target.value)}
                                            className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">
                                        Arrière-plan tertiaire
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={getColorValue('bgTertiary').replace(/rgba?\([^)]+\)/, '#252525')}
                                            onChange={(e) => handleColorChange('bgTertiary', e.target.value)}
                                            className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={getColorValue('bgTertiary')}
                                            onChange={(e) => handleColorChange('bgTertiary', e.target.value)}
                                            className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">
                                        Arrière-plan des cartes
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={getColorValue('bgCard').replace(/rgba?\([^)]+\)/, '#1a1a1a')}
                                            onChange={(e) => handleColorChange('bgCard', e.target.value)}
                                            className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={getColorValue('bgCard')}
                                            onChange={(e) => handleColorChange('bgCard', e.target.value)}
                                            className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">
                                        Arrière-plan header
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={getColorValue('bgHeader').replace(/rgba?\([^)]+\)/, '#111111')}
                                            onChange={(e) => handleColorChange('bgHeader', e.target.value)}
                                            className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={getColorValue('bgHeader')}
                                            onChange={(e) => handleColorChange('bgHeader', e.target.value)}
                                            className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">
                                        Arrière-plan footer
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={getColorValue('bgFooter').replace(/rgba?\([^)]+\)/, 'rgba(10, 10, 10, 0.9)')}
                                            onChange={(e) => handleColorChange('bgFooter', e.target.value)}
                                            className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={getColorValue('bgFooter')}
                                            onChange={(e) => handleColorChange('bgFooter', e.target.value)}
                                            className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                            </div>
                                </div>

                                {/* Text Colors */}
                                <div>
                                    <h5 className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wide">
                                        Couleurs de texte
                                    </h5>
                                    <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">
                                        Texte principal
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={getColorValue('textPrimary')}
                                            onChange={(e) => handleColorChange('textPrimary', e.target.value)}
                                            className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={getColorValue('textPrimary')}
                                            onChange={(e) => handleColorChange('textPrimary', e.target.value)}
                                            className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">
                                        Texte secondaire
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={getColorValue('textSecondary')}
                                            onChange={(e) => handleColorChange('textSecondary', e.target.value)}
                                            className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={getColorValue('textSecondary')}
                                            onChange={(e) => handleColorChange('textSecondary', e.target.value)}
                                            className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5">
                                        Texte tertiaire
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={getColorValue('textTertiary')}
                                            onChange={(e) => handleColorChange('textTertiary', e.target.value)}
                                            className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={getColorValue('textTertiary')}
                                            onChange={(e) => handleColorChange('textTertiary', e.target.value)}
                                            className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                            </div>
                            </div>
                                </div>

                                {/* Border Colors */}
                                <div>
                                    <h5 className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wide">
                                        Couleurs de bordure
                                    </h5>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1.5">
                                                Bordure
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={getColorValue('borderColor').replace(/rgba?\([^)]+\)/, '#333333')}
                                                    onChange={(e) => handleColorChange('borderColor', e.target.value)}
                                                    className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                                />
                                                <input
                                                    type="text"
                                                    value={getColorValue('borderColor')}
                                                    onChange={(e) => handleColorChange('borderColor', e.target.value)}
                                                    className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1.5">
                                                Bordure (light)
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={getColorValue('borderColorLight').replace(/rgba?\([^)]+\)/, '#444444')}
                                                    onChange={(e) => handleColorChange('borderColorLight', e.target.value)}
                                                    className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                                />
                                                <input
                                                    type="text"
                                                    value={getColorValue('borderColorLight')}
                                                    onChange={(e) => handleColorChange('borderColorLight', e.target.value)}
                                                    className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1.5">
                                                Bordure (hover)
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={getColorValue('borderColorHover').replace(/rgba?\([^)]+\)/, '#555555')}
                                                    onChange={(e) => handleColorChange('borderColorHover', e.target.value)}
                                                    className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                                />
                                                <input
                                                    type="text"
                                                    value={getColorValue('borderColorHover')}
                                                    onChange={(e) => handleColorChange('borderColorHover', e.target.value)}
                                                    className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Button Colors */}
                                <div>
                                    <h5 className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wide">
                                        Couleurs des boutons
                                    </h5>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1.5">
                                                Fond du bouton
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={getColorValue('buttonBg').replace(/rgba?\([^)]+\)/, '#1a1a1a')}
                                                    onChange={(e) => handleColorChange('buttonBg', e.target.value)}
                                                    className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                                />
                                                <input
                                                    type="text"
                                                    value={getColorValue('buttonBg')}
                                                    onChange={(e) => handleColorChange('buttonBg', e.target.value)}
                                                    className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1.5">
                                                Texte du bouton
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={getColorValue('buttonText')}
                                                    onChange={(e) => handleColorChange('buttonText', e.target.value)}
                                                    className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                                />
                                                <input
                                                    type="text"
                                                    value={getColorValue('buttonText')}
                                                    onChange={(e) => handleColorChange('buttonText', e.target.value)}
                                                    className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1.5">
                                                Fond du bouton (hover)
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={getColorValue('buttonHoverBg').replace(/rgba?\([^)]+\)/, '#252525')}
                                                    onChange={(e) => handleColorChange('buttonHoverBg', e.target.value)}
                                                    className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                                />
                                                <input
                                                    type="text"
                                                    value={getColorValue('buttonHoverBg')}
                                                    onChange={(e) => handleColorChange('buttonHoverBg', e.target.value)}
                                                    className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1.5">
                                                Texte du bouton (hover)
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={getColorValue('buttonHoverText')}
                                                    onChange={(e) => handleColorChange('buttonHoverText', e.target.value)}
                                                    className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                                />
                                                <input
                                                    type="text"
                                                    value={getColorValue('buttonHoverText')}
                                                    onChange={(e) => handleColorChange('buttonHoverText', e.target.value)}
                                                    className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1.5">
                                                Fond du bouton (actif)
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={getColorValue('buttonActiveBg')}
                                                    onChange={(e) => handleColorChange('buttonActiveBg', e.target.value)}
                                                    className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                                />
                                                <input
                                                    type="text"
                                                    value={getColorValue('buttonActiveBg')}
                                                    onChange={(e) => handleColorChange('buttonActiveBg', e.target.value)}
                                                    className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1.5">
                                                Texte du bouton (actif)
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={getColorValue('buttonActiveText')}
                                                    onChange={(e) => handleColorChange('buttonActiveText', e.target.value)}
                                                    className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                                />
                                                <input
                                                    type="text"
                                                    value={getColorValue('buttonActiveText')}
                                                    onChange={(e) => handleColorChange('buttonActiveText', e.target.value)}
                                                    className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1.5">
                                                Bordure du bouton
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={getColorValue('buttonBorder').replace(/rgba?\([^)]+\)/, '#333333')}
                                                    onChange={(e) => handleColorChange('buttonBorder', e.target.value)}
                                                    className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                                                />
                                                <input
                                                    type="text"
                                                    value={getColorValue('buttonBorder')}
                                                    onChange={(e) => handleColorChange('buttonBorder', e.target.value)}
                                                    className="flex-1 px-2 py-1.5 bg-[#1a1a1a] border border-gray-700 rounded text-white text-xs font-mono focus:outline-none focus:border-blue-500"
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

