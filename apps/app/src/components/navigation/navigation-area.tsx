"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  getNavigationArea,
  getSettingsReturnLocation,
  isSettingsPath,
  type NavigationArea,
  SETTINGS_HOME,
} from "@/lib/navigation-area";

interface NavigationAreaValue {
  area: NavigationArea;
  /** Return to the page settings was opened from, or home. */
  closeSettings: () => void;
  /** Call from a settings link before it navigates (`onNavigate`). */
  openSettings: () => void;
}

const NavigationAreaContext = createContext<NavigationAreaValue>({
  area: "app",
  openSettings: () => undefined,
  closeSettings: () => undefined,
});

/**
 * The dashboard area comes from the pathname. Settings routes belong to the
 * area they were opened from, which is remembered in memory for the session:
 * captured when a settings link is clicked, kept across settings tabs, reset
 * by a reload or a fresh tab (then settings closes to home in the app area).
 *
 * Nothing here reads search params, so the shell prerenders as static HTML and
 * the return location is never user input.
 */
export function NavigationAreaProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const area = getNavigationArea(
    isSettingsPath(pathname) && returnTo ? returnTo : pathname
  );

  const openSettings = useCallback(() => {
    setReturnTo(getSettingsReturnLocation(window.location));
  }, []);
  const closeSettings = useCallback(() => {
    router.push((returnTo ?? SETTINGS_HOME) as Route);
  }, [returnTo, router]);

  const value = useMemo(
    () => ({ area, openSettings, closeSettings }),
    [area, openSettings, closeSettings]
  );
  return (
    <NavigationAreaContext value={value}>{children}</NavigationAreaContext>
  );
}

export function useNavigationArea() {
  return useContext(NavigationAreaContext).area;
}

export function useSettingsNavigation() {
  const { openSettings, closeSettings } = useContext(NavigationAreaContext);
  return { openSettings, closeSettings };
}
