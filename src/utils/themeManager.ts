/**
 * Theme Manager - Gestion des thèmes
 * 
 * Gère le changement de thème et la persistance dans localStorage
 */

export type Theme = 'dark' | 'glass' | 'modern' | 'nightly' | 'neon';

const THEME_STORAGE_KEY = 'mynetwork_theme';
const DEFAULT_THEME: Theme = 'dark';

/**
 * Applique un thème au document
 */
export const applyTheme = (theme: Theme): void => {
  const html = document.documentElement;
  
  // Validate theme
  if (!['dark', 'glass', 'modern', 'nightly', 'neon'].includes(theme)) {
    console.warn(`Invalid theme: ${theme}, using default: ${DEFAULT_THEME}`);
    theme = DEFAULT_THEME;
  }
  
  // Retirer tous les thèmes existants
  html.removeAttribute('data-theme');
  
  // Appliquer le nouveau thème
  html.setAttribute('data-theme', theme);
  
  // Sauvegarder dans localStorage
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.warn('Failed to save theme to localStorage:', error);
  }
  
  // Debug log
  console.log(`[Theme] Applied theme: ${theme}`);
};

/**
 * Récupère le thème actuel
 */
export const getCurrentTheme = (): Theme => {
  // Vérifier d'abord dans localStorage
  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme && ['dark', 'glass', 'modern', 'nightly', 'neon'].includes(savedTheme)) {
      return savedTheme as Theme;
    }
  } catch (error) {
    console.warn('Failed to read theme from localStorage:', error);
  }
  
  // Vérifier l'attribut data-theme sur le HTML
  const htmlTheme = document.documentElement.getAttribute('data-theme');
  if (htmlTheme && ['dark', 'glass', 'modern', 'nightly', 'neon'].includes(htmlTheme)) {
    return htmlTheme as Theme;
  }
  
  // Retourner le thème par défaut
  return DEFAULT_THEME;
};

/**
 * Initialise le thème au chargement de la page
 * Charge également les couleurs personnalisées depuis le serveur
 */
export const initTheme = async (): Promise<void> => {
  const theme = getCurrentTheme();
  applyTheme(theme);
  
  // Try to load custom colors from server
  try {
    const response = await fetch('/api/settings/theme');
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.result?.customColors) {
        applyCustomColors(data.result.customColors);
      }
    }
  } catch (error) {
    // Silently fail - use default theme colors
    console.warn('Failed to load custom theme colors:', error);
  }
};

/**
 * Apply custom colors as CSS variables
 */
export const applyCustomColors = (customColors: Record<string, string>): void => {
  const root = document.documentElement;
  Object.entries(customColors).forEach(([key, value]) => {
    // Convert camelCase to kebab-case for CSS variables
    const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    root.style.setProperty(cssVar, value);
  });
};

/**
 * Liste tous les thèmes disponibles
 */
export const getAvailableThemes = (): Array<{ id: Theme; name: string; description: string }> => {
  return [
    {
      id: 'dark',
      name: 'Dark',
      description: 'Thème sombre (pas trop noir)'
    },
    {
      id: 'glass',
      name: 'Dark Glass',
      description: 'Effet glassmorphism avec transparence'
    },
    {
      id: 'modern',
      name: 'Moderne',
      description: 'Thème coloré avec dégradés modernes'
    },
    {
      id: 'nightly',
      name: 'Nightly',
      description: 'Thème très sombre pour une utilisation nocturne'
    },
    {
      id: 'neon',
      name: 'Neon',
      description: 'Thème néon avec effets lumineux et bordures colorées'
    }
  ];
};

/**
 * Hook React pour gérer le thème (à utiliser dans les composants)
 * 
 * Exemple d'utilisation :
 * ```tsx
 * const { theme, setTheme, availableThemes } = useTheme();
 * 
 * return (
 *   <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
 *     {availableThemes.map(t => (
 *       <option key={t.id} value={t.id}>{t.name}</option>
 *     ))}
 *   </select>
 * );
 * ```
 */
export const useTheme = () => {
  // Cette fonction sera utilisée avec React hooks
  // Pour l'instant, on retourne les fonctions de base
  return {
    theme: getCurrentTheme(),
    setTheme: applyTheme,
    availableThemes: getAvailableThemes(),
    initTheme
  };
};

