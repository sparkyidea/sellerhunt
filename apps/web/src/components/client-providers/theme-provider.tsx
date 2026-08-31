"use client";

import {
  ThemeCookieScript,
  useThemeCookieSync,
} from "@sparkyidea/ui/components/theme-cookie-sync";
import {
  ThemeProvider as NextThemesProvider,
  useTheme as useNextTheme,
} from "next-themes";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
} from "react";

interface Coordinates {
  x: number;
  y: number;
}

interface ThemeContextType {
  toggleTheme: (coords?: Coordinates) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function ThemeProviderWrapper({ children }: { children: ReactNode }) {
  const { theme, setTheme, systemTheme } = useNextTheme();
  useThemeCookieSync();

  const toggleTheme = useCallback(
    (coords?: Coordinates) => {
      let newTheme: string;

      // Handle theme switching logic
      switch (theme) {
        case "light":
          newTheme = "dark";
          break;
        case "dark":
          newTheme = "light";
          break;
        case "system":
          newTheme = systemTheme === "light" ? "dark" : "light";
          break;
        default:
          newTheme = "dark";
      }

      // Check for reduced motion preference
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      // Check if View Transitions API is supported
      if (!document.startViewTransition || prefersReducedMotion) {
        setTheme(newTheme);
        return;
      }

      // Set click position for circular animation
      if (coords) {
        document.documentElement.style.setProperty("--x", `${coords.x}px`);
        document.documentElement.style.setProperty("--y", `${coords.y}px`);
      }

      // Start the view transition
      document.startViewTransition(() => {
        setTheme(newTheme);
      });
    },
    [theme, setTheme, systemTheme]
  );

  return (
    <ThemeContext.Provider value={{ toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <>
      <ThemeCookieScript />
      <NextThemesProvider {...props}>
        <ThemeProviderWrapper>{children}</ThemeProviderWrapper>
      </NextThemesProvider>
    </>
  );
}

export function useTheme() {
  const nextTheme = useNextTheme();
  const themeContext = useContext(ThemeContext);

  if (!themeContext) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return {
    ...nextTheme,
    ...themeContext,
  };
}
