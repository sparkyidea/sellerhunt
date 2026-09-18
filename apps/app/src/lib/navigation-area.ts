const UNSAFE_RETURN_CHARACTERS = /[\\\s]/;
const URL_SUFFIX = /[?#]/;

export type NavigationArea = "app" | "admin";

export function isSettingsPath(pathname: string) {
  return pathname === "/settings" || pathname.startsWith("/settings/");
}

export function getNavigationArea(pathname: string): NavigationArea {
  return pathname === "/admin" || pathname.startsWith("/admin/")
    ? "admin"
    : "app";
}

/** Accept only local dashboard destinations, never an arbitrary redirect URL. */
export function getSettingsReturnTo(from: string | null) {
  if (!from || UNSAFE_RETURN_CHARACTERS.test(from)) {
    return "/explorer/listings";
  }
  const pathname = from.split(URL_SUFFIX)[0] ?? "";
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/explorer" ||
    pathname.startsWith("/explorer/")
  ) {
    return from;
  }
  return "/explorer/listings";
}
