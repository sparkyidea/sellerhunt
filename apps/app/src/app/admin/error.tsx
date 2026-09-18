"use client";

import { PanelRouteError } from "@/components/preview/panel-route-error";

export default function PageError({ reset }: { reset: () => void }) {
  return <PanelRouteError reset={reset} />;
}
