"use client";

import {
  type CustomThemeConfig,
  generateCustomThemeVars,
  hexToOklch,
} from "@repo/design-system/lib/custom-theme";
import { useEffect, useRef } from "react";

// All CSS variable keys the custom theme sets — used for cleanup
let cachedKeys: string[] | null = null;

function getVarKeys(config: CustomThemeConfig): string[] {
  if (!cachedKeys) {
    cachedKeys = Object.keys(generateCustomThemeVars(config));
  }
  return cachedKeys;
}

export function CustomThemeSyncer({
  activeTheme,
  config,
}: {
  activeTheme: string | undefined;
  config: CustomThemeConfig;
}) {
  const prevThemeRef = useRef(activeTheme);

  useEffect(() => {
    const el = document.documentElement;

    if (activeTheme !== "custom") {
      // Clean up when switching away from custom
      if (prevThemeRef.current === "custom") {
        for (const key of getVarKeys(config)) {
          el.style.removeProperty(key);
        }
        el.removeAttribute("data-custom-dark");
      }
      prevThemeRef.current = activeTheme;
      return;
    }

    // Apply custom theme vars
    const vars = generateCustomThemeVars(config);
    for (const [key, value] of Object.entries(vars)) {
      el.style.setProperty(key, value);
    }

    // Toggle dark mode signal for Tailwind dark: variants
    const bg = hexToOklch(config.backgroundColor);
    if (bg.l < 0.5) {
      el.setAttribute("data-custom-dark", "");
    } else {
      el.removeAttribute("data-custom-dark");
    }

    prevThemeRef.current = activeTheme;
  }, [activeTheme, config]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const el = document.documentElement;
      for (const key of getVarKeys(config)) {
        el.style.removeProperty(key);
      }
      el.removeAttribute("data-custom-dark");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  return null;
}
