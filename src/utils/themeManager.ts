/**
 * Theme Manager - Gestion des thèmes
 * 
 * Gère le changement de thème et la persistance dans localStorage
 */

export type Theme = 'dark' | 'glass' | 'modern' | 'nightly' | 'neon' | 'elegant' | 'full-animation';

const THEME_STORAGE_KEY = 'mynetwork_theme';
const CARD_OPACITY_STORAGE_KEY = 'mynetwork_card_opacity';
const DEFAULT_THEME: Theme = 'dark';
const VALID_THEMES: Theme[] = ['dark', 'glass', 'modern', 'nightly', 'neon', 'elegant', 'full-animation'];

/**
 * Applique un thème au document
 */
export const applyTheme = (theme: Theme): void => {
  const html = document.documentElement;
  
  // Validate theme
  if (!VALID_THEMES.includes(theme)) {
    console.warn(`Invalid theme: ${theme}, using default: ${DEFAULT_THEME}`);
    theme = DEFAULT_THEME;
  }
  
  // Retirer tous les thèmes existants
  html.removeAttribute('data-theme');
  
  // Apply the new theme
  html.setAttribute('data-theme', theme);
  
  // Persist to localStorage
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.warn('Failed to save theme to localStorage:', error);
  }
  
  // Debug log (disabled to reduce console spam)
  // console.log(`[Theme] Applied theme: ${theme}`);
};

/**
 * Apply card opacity from localStorage for the given theme.
 * Used at init and ensures --card-opacity is set on root so all pages (not only Settings) get the correct opacity.
 */
export const applyCardOpacity = (theme: Theme): void => {
  const root = document.documentElement;
  let opacity = 1;
  try {
    const raw = localStorage.getItem(CARD_OPACITY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number>;
      if (parsed && typeof parsed[theme] === 'number') {
        opacity = Math.max(0.1, Math.min(1, parsed[theme]));
      }
    }
  } catch {
    // ignore
  }
  root.style.setProperty('--card-opacity', String(opacity));
};

/**
 * Récupère le thème actuel
 */
export const getCurrentTheme = (): Theme => {
  // Vérifier d'abord dans localStorage
  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme && VALID_THEMES.includes(savedTheme as Theme)) {
      return savedTheme as Theme;
    }
  } catch (error) {
    console.warn('Failed to read theme from localStorage:', error);
  }
  
  // Vérifier l'attribut data-theme sur le HTML
  const htmlTheme = document.documentElement.getAttribute('data-theme');
  if (htmlTheme && VALID_THEMES.includes(htmlTheme as Theme)) {
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
  // Apply card opacity from localStorage so it is active on all pages (dashboard, settings, etc.)
  applyCardOpacity(theme);

  // Check if user is authenticated before making API call
  // This prevents 401 errors in console when user is not logged in yet
  let token: string | null = null;
  try {
    if (typeof window !== 'undefined') {
      token = localStorage.getItem('dashboard_user_token');
    }
  } catch (error) {
    // localStorage might not be available (e.g., in private mode)
    return;
  }

  // Only try to load custom colors if user is authenticated
  if (!token) {
    return;
  }

  // Try to load theme config (custom colors + card opacity) from server
  try {
    const response = await fetch('/api/settings/theme', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.result) {
        if (data.result.customColors) {
          applyCustomColors(data.result.customColors);
        }
        // Apply server card opacity for current theme so it is consistent on all pages
        if (typeof data.result.cardOpacity === 'number') {
          const opacity = Math.max(0.1, Math.min(1, data.result.cardOpacity));
          document.documentElement.style.setProperty('--card-opacity', String(opacity));
        }
      }
    }
    // Silently ignore 401/403 errors - user might have logged out or token expired
  } catch (error) {
    // Silently fail - use default theme colors
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
    },
    {
      id: 'elegant',
      name: 'Élégant',
      description: 'Thème animé avec dégradés élégants et animations subtiles'
    },
    {
      id: 'full-animation',
      name: 'Full animation',
      description: 'Arrière-plan animé avec choix d\'animation (étoiles, circuit, rubans, vagues)'
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

