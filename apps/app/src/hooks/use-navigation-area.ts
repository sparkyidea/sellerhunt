"use client";

import { usePathname } from "next/navigation";
import { getNavigationArea } from "@/lib/navigation-area";

/** Which dashboard the current route belongs to. A pure function of the pathname. */
export function useNavigationArea() {
  return getNavigationArea(usePathname());
}
