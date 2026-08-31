"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

export const THEME_COOKIE_NAME = "dashseller-theme";

const cookieToLocalStorageScript = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE_NAME}=([^;]+)/);if(m){var v=decodeURIComponent(m[1]);if(window.localStorage.getItem("${THEME_COOKIE_NAME}")!==v){window.localStorage.setItem("${THEME_COOKIE_NAME}",v);}}}catch(e){}})();`;

export function ThemeCookieScript() {
  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: required to run synchronously before next-themes' inline script
    <script dangerouslySetInnerHTML={{ __html: cookieToLocalStorageScript }} />
  );
}

const IP_HOST_PATTERN = /^[\d.]+$/;
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function getCookieDomain(): string | undefined {
  if (typeof window === "undefined") {
    return;
  }
  const host = window.location.hostname;
  if (host === "localhost" || IP_HOST_PATTERN.test(host)) {
    return;
  }
  const parts = host.split(".");
  if (parts.length < 2) {
    return;
  }
  return `.${parts.slice(-2).join(".")}`;
}

function writeThemeCookie(value: string) {
  if (typeof document === "undefined") {
    return;
  }
  const domain = getCookieDomain();
  const domainPart = domain ? `; domain=${domain}` : "";
  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API does not yet have full cross-browser support; document.cookie is required for cross-subdomain theme sync
  document.cookie = `${THEME_COOKIE_NAME}=${encodeURIComponent(value)}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax${domainPart}`;
}

export function useThemeCookieSync() {
  const { theme } = useTheme();
  useEffect(() => {
    if (theme) {
      writeThemeCookie(theme);
    }
  }, [theme]);
}

export function ThemeCookieWriter() {
  useThemeCookieSync();
  return null;
}
