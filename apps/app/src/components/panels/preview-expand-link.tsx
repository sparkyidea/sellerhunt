"use client";

import { PanelExpand } from "@sparkyidea/ui/components/panel";
import { usePanel } from "@sparkyidea/ui/components/panel-root";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** Prefetch immediately, then navigate after promotion. Modified clicks stay native. */
export function PreviewExpandLink({ href }: { href: string }) {
  const { expand } = usePanel();
  const router = useRouter();
  return (
    <PanelExpand
      render={
        <Link
          href={href as Route}
          onNavigate={(event) => {
            if (!expand) {
              return;
            }
            event.preventDefault();
            router.prefetch(href as Route);
            expand(() => router.push(href as Route));
          }}
        />
      }
    />
  );
}
