"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

/**
 * Reads the theme the inline bootstrap script in layout.tsx already applied to
 * <html data-theme>, then lets the UI toggle it. localStorage keeps the choice
 * per browser; there's nothing server-side to sync (E: v3.1 critique).
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("nh-theme", next);
      } catch {
        // private browsing / storage disabled — theme still applies for this load
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
