"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
} from "react";
import type { PanelContent } from "./panel-workspace-state";

export const PanelRouteContext = createContext<
  ((content: PanelContent) => void) | null
>(null);

/**
 * Publishes concrete page content, not Next's router outlet. The workspace
 * owns its lifetime so route unmounts cannot tear down an outgoing panel.
 * Providers needed by the content belong inside this boundary or above the
 * workspace. Keep route params explicit on the rendered view's props.
 */
export function PanelRoute({
  children,
  error = false,
}: {
  children?: ReactNode;
  error?: boolean;
}) {
  const publish = useContext(PanelRouteContext);
  const route = usePathname();
  useLayoutEffect(() => {
    publish?.({ type: "route", href: route, children, error });
  }, [children, route, error, publish]);

  // Also works for a root error/not-found outside the authenticated shell.
  return publish ? null : children;
}
