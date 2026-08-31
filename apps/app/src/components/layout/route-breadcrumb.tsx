"use client";

import { PanelBreadcrumb } from "@sparkyidea/ui/components/panel";
import { Icons } from "@sparkyidea/ui/icons";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface RootSegment {
  href: string;
  icon: ReactNode;
  label: string;
}

const ROOT_SEGMENTS: Record<string, RootSegment> = {
  products: {
    href: "/products",
    icon: <Icons.product className="size-4" />,
    label: "Products",
  },
  listings: {
    href: "/listings",
    icon: <Icons.listing className="size-4" />,
    label: "Listings",
  },
  orders: {
    href: "/orders",
    icon: <Icons.order className="size-4" />,
    label: "Orders",
  },
  shipments: {
    href: "/shipments",
    icon: <Icons.shipping className="size-4" />,
    label: "Shipments",
  },
  explorer: {
    href: "/explorer/listings",
    icon: <Icons.radar className="size-4" />,
    label: "Explorer",
  },
};

// Smart wrapper around the framework-agnostic PanelBreadcrumb primitive:
// resolves the root crumb from the current pathname and renders Next links.
export function RouteBreadcrumb({
  currentLabel,
  parentLabel,
}: {
  currentLabel: ReactNode;
  parentLabel?: ReactNode;
}) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const root = ROOT_SEGMENTS[segments[0] ?? ""];
  const parentHref =
    segments[2] === "variants" ? `/${segments[0]}/${segments[1]}` : null;

  return (
    <PanelBreadcrumb
      current={currentLabel}
      parent={
        parentHref && parentLabel
          ? {
              label: parentLabel,
              render: <Link href={parentHref as Route} />,
            }
          : undefined
      }
      root={
        root
          ? {
              icon: root.icon,
              label: root.label,
              render: <Link href={root.href as Route} />,
            }
          : undefined
      }
    />
  );
}
