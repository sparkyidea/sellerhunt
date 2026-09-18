const UNSAFE_RETURN_CHARACTERS = /[\\\s]/;
// Only used to resolve relative paths; never leaks into the returned value.
const LOCAL_BASE = "http://localhost";
const DEFAULT_RETURN_TO = "/explorer/listings";

export type NavigationArea = "app" | "admin";

export function isSettingsPath(pathname: string) {
  return pathname === "/settings" || pathname.startsWith("/settings/");
}

export function getNavigationArea(pathname: string): NavigationArea {
  return pathname === "/admin" || pathname.startsWith("/admin/")
    ? "admin"
    : "app";
}

function isDashboardPath(pathname: string) {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/explorer" ||
    pathname.startsWith("/explorer/")
  );
}

/**
 * Accept only local dashboard destinations, never an arbitrary redirect URL.
 * The allow-list runs on the normalized pathname so dot segments (`..`, `%2e%2e`)
 * cannot escape `/admin` or `/explorer`, and the normalized value is returned.
 */
export function getSettingsReturnTo(from: string | null) {
  if (!from) {
    return DEFAULT_RETURN_TO;
  }
  // Absolute local path only: no scheme, no protocol-relative `//host`.
  if (
    !from.startsWith("/") ||
    from.startsWith("//") ||
    UNSAFE_RETURN_CHARACTERS.test(from)
  ) {
    return DEFAULT_RETURN_TO;
  }
  let url: URL;
  try {
    url = new URL(from, LOCAL_BASE);
  } catch {
    return DEFAULT_RETURN_TO;
  }
  if (url.origin !== LOCAL_BASE || !isDashboardPath(url.pathname)) {
    return DEFAULT_RETURN_TO;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
