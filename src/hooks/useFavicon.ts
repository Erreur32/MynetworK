import { useEffect, useState } from "react";

/**
 * Hook to dynamically update the favicon based on system color scheme
 * @param iconUrl - The URL of the icon to use as favicon (can be an imported SVG)
 * @param autoInvert - If true, automatically inverts colors based on system theme:
 *                     - Light mode: inverted (dark favicon for light background)
 *                     - Dark mode: normal (light favicon for dark background)
 */
export const useFavicon = (iconUrl: string, autoInvert: boolean = true) => {
  // Track system dark mode preference
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      setIsDarkMode(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!iconUrl) return;

    // Determine if we should invert:
    // - autoInvert enabled + light mode = invert (dark icon on light tab)
    // - autoInvert enabled + dark mode = normal (light icon on dark tab)
    // - autoInvert disabled = use original
    const shouldInvert = autoInvert && !isDarkMode;

    const updateFavicon = async () => {
      // Find existing favicon link or create one
      let link: HTMLLinkElement | null =
        document.querySelector("link[rel~='icon']");

      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }

      if (shouldInvert) {
        try {
          // Vite inlines small SVGs as data: URLs (< assetsInlineLimit). Decoding
          // the payload directly avoids a fetch() on a data: URL, which would
          // hit the CSP connect-src directive.
          let svgText: string;
          if (iconUrl.startsWith("data:image/svg+xml")) {
            const comma = iconUrl.indexOf(",");
            const payload = iconUrl.slice(comma + 1);
            svgText = iconUrl.includes(";base64,")
              ? atob(payload)
              : decodeURIComponent(payload);
          } else {
            const response = await fetch(iconUrl);
            svgText = await response.text();
          }

          svgText = svgText.replace(/#FDFDFD/gi, "#1a1a1a");
          svgText = svgText.replace(/#FFFFFF/gi, "#1a1a1a");
          svgText = svgText.replace(/white/gi, "#1a1a1a");

          link.type = "image/svg+xml";
          link.href = `data:image/svg+xml,${encodeURIComponent(svgText)}`;
        } catch {
          link.type = "image/svg+xml";
          link.href = iconUrl;
        }
      } else {
        // Use the original icon URL (light icon for dark mode)
        link.type = "image/svg+xml";
        link.href = iconUrl;
      }
    };

    updateFavicon();
  }, [iconUrl, autoInvert, isDarkMode]);
};
