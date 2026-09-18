import { describe, expect, it } from "bun:test";
import {
  initialPanelWorkspace,
  type PanelContent,
  type PanelWorkspaceState,
  panelWorkspaceReducer as reduce,
} from "../panel-workspace-state";

function route(href: string): PanelContent {
  return { type: "route", href, children: href };
}

const listing: PanelContent = {
  type: "preview",
  href: "/explorer/listings/listing-1",
  preview: { kind: "scan-listing", id: "listing-1" },
};

function finish(state: PanelWorkspaceState) {
  return reduce(state, { type: "finish", revision: state.revision });
}

function withPreview() {
  const main = reduce(initialPanelWorkspace, {
    type: "navigate",
    content: route("/explorer/listings"),
  });
  return finish(reduce(main, { type: "open", content: listing }));
}

describe("panel workspace lifecycle", () => {
  it("returns from a direct detail route to its list without starting a transition", () => {
    const detail = reduce(initialPanelWorkspace, {
      type: "navigate",
      content: route(listing.href),
    });
    const list = reduce(detail, {
      type: "navigate",
      content: route("/explorer/listings"),
    });
    expect(list.main?.id).toBe(detail.main?.id);
    expect(list.main?.content.href).toBe("/explorer/listings");
    expect(list.phase).toBe("idle");
    expect(list.preview).toBeNull();
  });
  it("replaces errors and recovered content immediately in the same surface", () => {
    const initial = reduce(initialPanelWorkspace, {
      type: "navigate",
      content: route("/explorer/listings"),
    });
    const error: PanelContent = {
      type: "route",
      href: "/explorer/listings",
      children: "Failed",
      error: true,
    };
    const failed = reduce(initial, { type: "navigate", content: error });
    const recovered = reduce(failed, {
      type: "navigate",
      content: route("/explorer/listings"),
    });
    expect(failed.main?.content).toBe(error);
    expect(recovered.main?.content).toEqual(route("/explorer/listings"));
    expect(recovered.main?.id).toBe(initial.main?.id);
    expect(recovered.phase).toBe("idle");
  });
  it("retains both surfaces until expansion finishes, then promotes the exact preview", () => {
    const start = withPreview();
    const expanding = reduce(start, { type: "expand" });
    expect(expanding.main).toBe(start.main);
    expect(expanding.preview).toBe(start.preview);
    const settled = finish(expanding);
    expect(settled.main).toBe(start.preview);
    expect(settled.preview).toBeNull();
    expect(settled.phase).toBe("idle");
  });

  it("does not replace preview content when its server route arrives before expansion finishes", () => {
    const start = withPreview();
    const expanding = reduce(start, { type: "expand" });
    const arrived = reduce(expanding, {
      type: "navigate",
      content: route(listing.href),
    });
    expect(arrived.phase).toBe("expanding");
    expect(finish(arrived).main).toBe(start.preview);
  });

  it("does not remount promoted content when its server route arrives late", () => {
    const promoted = finish(reduce(withPreview(), { type: "expand" }));
    const arrived = reduce(promoted, {
      type: "navigate",
      content: route(listing.href),
    });
    expect(arrived).toBe(promoted);
  });

  it("replaces content inside the promoted main surface without recreating a side preview", () => {
    const promoted = finish(reduce(withPreview(), { type: "expand" }));
    const navigating = reduce(promoted, {
      type: "navigate",
      content: route("/explorer/listings"),
    });
    expect(navigating.main?.id).toBe(promoted.main?.id);
    expect(navigating.main?.content).toEqual(route("/explorer/listings"));
    expect(navigating.preview).toBeNull();
    expect(navigating.phase).toBe("idle");
    expect(finish(navigating)).toBe(navigating);
  });

  it("queues another navigation during expansion and applies it to the promoted surface", () => {
    const start = withPreview();
    const expanding = reduce(start, { type: "expand" });
    const interrupted = reduce(expanding, {
      type: "navigate",
      content: route("/settings/account"),
    });
    expect(interrupted.main).toBe(start.main);
    const settled = finish(interrupted);
    expect(settled.main?.id).toBe(start.preview?.id);
    expect(settled.phase).toBe("idle");
    expect(settled.preview).toBeNull();
    expect(settled.main?.content.href).toBe("/settings/account");
  });

  it("keeps closing content mounted and ignores stale transition completions after reopening", () => {
    const start = withPreview();
    const closing = reduce(start, { type: "close" });
    expect(closing.preview).toBe(start.preview);
    const reopened = reduce(closing, { type: "open", content: listing });
    expect(
      reduce(reopened, { type: "finish", revision: closing.revision })
    ).toBe(reopened);
    expect(finish(closing).preview).toBeNull();
  });

  it("creates an independent side preview after promotion", () => {
    const promoted = finish(reduce(withPreview(), { type: "expand" }));
    const next = reduce(promoted, {
      type: "open",
      content: { ...listing, href: "/explorer/listings/listing-2" },
    });
    expect(next.main).toBe(promoted.main);
    expect(next.preview?.id).not.toBe(next.main?.id);
  });

  it("surfaces server errors instead of retaining an invalid or forbidden promoted view", () => {
    const start = reduce(withPreview(), { type: "expand" });
    const error: PanelContent = {
      type: "route",
      href: listing.href,
      children: "Not found",
      error: true,
    };
    const arrived = reduce(start, { type: "navigate", content: error });
    expect(finish(arrived).main?.content).toBe(error);
    const late = reduce(finish(start), { type: "navigate", content: error });
    expect(late.main?.content).toBe(error);
  });

  it("replaces route content immediately while closing an existing side preview", () => {
    const initial = withPreview();
    const first = reduce(initial, {
      type: "navigate",
      content: route("/settings/account"),
    });
    const second = reduce(first, {
      type: "navigate",
      content: route("/settings/security"),
    });
    expect(first.main?.content.href).toBe("/settings/account");
    expect(second.main?.content.href).toBe("/settings/security");
    expect(second.preview).toBe(initial.preview);
    expect(second.phase).toBe("closing");
    expect(reduce(second, { type: "finish", revision: first.revision })).toBe(
      second
    );
    expect(finish(second).main?.content.href).toBe("/settings/security");
    expect(finish(second).preview).toBeNull();
  });
});
