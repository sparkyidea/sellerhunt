export type NavigationArea = "app" | "admin";

/** Where closing settings goes when no origin is known (reload, fresh tab). */
export const SETTINGS_HOME = "/explorer/listings";

export function getNavigationArea(pathname: string): NavigationArea {
  return pathname === "/admin" || pathname.startsWith("/admin/")
    ? "admin"
    : "app";
}

/**
 * The page to return to when settings closes: the current location including
 * filters, read at the moment settings opens. Never taken from the URL, so no
 * allow-list is needed; it only lives in memory and resets on reload.
 */
export function getSettingsReturnLocation(
  location: Pick<Location, "pathname" | "search" | "hash">
) {
  return `${location.pathname}${location.search}${location.hash}`;
}
