import { env } from "@dashseller/env/web";

export interface MenuItemType {
  href: string;
  title: string;
}

export const MenuItems: MenuItemType[] = [
  { title: "Pricing", href: "/pricing" },
  { title: "About", href: "/about" },
];

export const LegalLinks: MenuItemType[] = [
  { title: "Privacy", href: "/legal/privacy" },
  { title: "Terms", href: "/legal/terms" },
  { title: "Cookies", href: "/legal/cookies" },
];

export const SIGN_IN_URL = `${env.NEXT_PUBLIC_APP_URL}/auth/sign-in`;
export const SIGN_UP_URL = `${env.NEXT_PUBLIC_APP_URL}/auth/sign-up`;
