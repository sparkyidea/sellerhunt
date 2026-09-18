"use client";

import { Button } from "@sparkyidea/ui/components/button";
import { Panel } from "@sparkyidea/ui/components/panel";
import { ErrorView } from "@/components/error-view";
import { PanelRoute } from "./panel-route";

export function PanelRouteError({ reset }: { reset: () => void }) {
  return (
    <PanelRoute error>
      <Panel>
        <ErrorView message="Failed to load page" />
        <div className="flex justify-center p-4">
          <Button onClick={reset}>Try again</Button>
        </div>
      </Panel>
    </PanelRoute>
  );
}
