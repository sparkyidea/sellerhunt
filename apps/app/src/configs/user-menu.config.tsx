import type { UserButtonLink } from "@dashseller/auth/components/auth/user/user-button";
import { hasAdminRole } from "@dashseller/auth/lib/auth/roles";
import { Icons } from "@sparkyidea/ui/icons";

interface MenuUser {
  banned?: boolean | null;
  role?: string | null;
}

export function getUserMenuLinks(
  user: MenuUser | null | undefined,
  navigation: "app" | "admin" = "app"
): UserButtonLink[] {
  if (!user || user.banned || !hasAdminRole(user.role)) {
    return [];
  }
  if (navigation === "admin") {
    return [
      {
        label: "Back to app",
        href: "/explorer/listings",
        icon: <Icons.radar className="text-muted-foreground" />,
        visibility: "authenticated",
      },
    ];
  }
  return [
    {
      label: "Admin dashboard",
      href: "/admin",
      icon: <Icons.security className="text-muted-foreground" />,
      visibility: "authenticated",
    },
  ];
}
