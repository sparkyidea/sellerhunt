"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { createContext, type ReactNode, useContext } from "react";
import {
  getNavigationArea,
  getSettingsReturnTo,
  isSettingsPath,
  type NavigationArea,
} from "@/lib/navigation-area";

const NavigationAreaContext = createContext<NavigationArea>("app");

export function NavigationAreaProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const area = getNavigationArea(
    isSettingsPath(pathname)
      ? getSettingsReturnTo(searchParams.get("from"))
      : pathname
  );

  return <NavigationAreaContext value={area}>{children}</NavigationAreaContext>;
}

export function useNavigationArea() {
  return useContext(NavigationAreaContext);
}
