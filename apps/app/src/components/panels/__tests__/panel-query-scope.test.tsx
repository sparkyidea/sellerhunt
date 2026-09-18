import { afterEach, describe, expect, it, mock } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  QuerySyncProvider,
  useQuerySyncPaused,
} from "../../../../../../packages/dataview/src/lib/providers/query-sync-context";

let pathname = "/explorer/listings";
mock.module("next/navigation", () => ({ usePathname: () => pathname }));
mock.module("@sparkyidea/dataview/providers", () => ({ QuerySyncProvider }));
mock.module("@sparkyidea/ui/components/panel-root", () => ({
  PanelMain: ({ children }: { children: ReactNode }) => children,
}));
const { PanelRoute } = await import("../panel-route");

function Probe() {
  return <span>{useQuerySyncPaused() ? "paused" : "live"}</span>;
}

afterEach(() => {
  pathname = "/explorer/listings";
});

describe("retained panel query ownership", () => {
  it("automatically pauses retained app and admin content during settings", () => {
    for (const owner of ["/explorer/listings", "/admin/mobile-profiles"]) {
      pathname = owner;
      const retained = PanelRoute({ children: <Probe /> });
      expect(renderToStaticMarkup(retained)).toBe("<span>live</span>");
      for (const settings of ["/settings/account", "/settings/security"]) {
        pathname = settings;
        expect(renderToStaticMarkup(retained)).toBe("<span>paused</span>");
      }
      pathname = owner;
      expect(renderToStaticMarkup(retained)).toBe("<span>live</span>");
    }
  });

  it("isolates outgoing panels from the new route's query state", () => {
    const outgoing = PanelRoute({ children: <Probe /> });
    pathname = "/admin/mobile-profiles";
    const incoming = PanelRoute({ children: <Probe /> });
    expect(renderToStaticMarkup(outgoing)).toBe("<span>paused</span>");
    expect(renderToStaticMarkup(incoming)).toBe("<span>live</span>");
  });

  it("leaves settings and other content outside the boundary live", () => {
    const retained = PanelRoute({ children: <Probe /> });
    pathname = "/settings/account";
    expect(
      renderToStaticMarkup(
        <>
          {retained}
          <Probe />
        </>
      )
    ).toBe("<span>paused</span><span>live</span>");
  });
});
