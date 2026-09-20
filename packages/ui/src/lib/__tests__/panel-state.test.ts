import { describe, expect, it } from "vitest";
import {
  initialPanelState,
  type PanelSource,
  type PanelState,
  panelReducer as reduce,
} from "../panel-state";

function route(id: string): PanelSource {
  return { type: "main", id, children: id };
}

const listing: PanelSource = {
  type: "preview",
  id: "item-1",
  children: "Preview content",
};

function finish(state: PanelState) {
  return reduce(state, { type: "finish", revision: state.revision });
}

function withPreview() {
  const main = reduce(initialPanelState, {
    type: "navigate",
    content: route("items"),
  });
  return finish(reduce(main, { type: "open", content: listing }));
}

describe("panel lifecycle", () => {
  it("does not start a transition when the current route is republished", () => {
    const beforeSettings = withPreview();
    // A rerender republishes the same route id; both surfaces must stay put.
    const afterSettings = reduce(beforeSettings, {
      type: "navigate",
      content: route("items"),
    });
    expect(afterSettings.preview).toBe(beforeSettings.preview);
    expect(afterSettings.main?.id).toBe(beforeSettings.main?.id);
    expect(afterSettings.phase).toBe("idle");
    expect(afterSettings.revision).toBe(beforeSettings.revision);
  });

  it("updates a preview's content without restarting its closing animation", () => {
    const closing = reduce(withPreview(), { type: "close" });
    const content = { ...listing, children: "Updated content" };
    const updated = reduce(closing, { type: "update-preview", content });
    expect(updated.phase).toBe("closing");
    expect(updated.revision).toBe(closing.revision);
    expect(updated.preview?.id).toBe(closing.preview?.id);
    expect(updated.preview?.content).toBe(content);
    expect(finish(updated).preview).toBeNull();
  });

  it("does not reopen a promoted preview on an ordinary parent rerender", () => {
    const promoted = finish(reduce(withPreview(), { type: "expand" }));
    expect(
      reduce(promoted, {
        type: "update-preview",
        content: { ...listing, children: "Rerendered content" },
      })
    ).toBe(promoted);
  });

  it("returns from a direct detail route to its list without starting a transition", () => {
    const detail = reduce(initialPanelState, {
      type: "navigate",
      content: route(listing.id),
    });
    const list = reduce(detail, {
      type: "navigate",
      content: route("items"),
    });
    expect(list.main?.id).toBe(detail.main?.id);
    expect(list.main?.content.id).toBe("items");
    expect(list.phase).toBe("idle");
    expect(list.preview).toBeNull();
  });
  it("replaces errors and recovered content immediately in the same surface", () => {
    const initial = reduce(initialPanelState, {
      type: "navigate",
      content: route("items"),
    });
    const error: PanelSource = {
      type: "main",
      id: "items",
      children: "Failed",
      replace: true,
    };
    const failed = reduce(initial, { type: "navigate", content: error });
    const recovered = reduce(failed, {
      type: "navigate",
      content: route("items"),
    });
    expect(failed.main?.content).toBe(error);
    expect(recovered.main?.content).toEqual(route("items"));
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
      content: route(listing.id),
    });
    expect(arrived.phase).toBe("expanding");
    expect(finish(arrived).main).toBe(start.preview);
  });

  it("does not remount promoted content when its server route arrives late", () => {
    const promoted = finish(reduce(withPreview(), { type: "expand" }));
    const arrived = reduce(promoted, {
      type: "navigate",
      content: route(listing.id),
    });
    expect(arrived).toBe(promoted);
  });

  it("replaces content inside the promoted main surface without recreating a side preview", () => {
    const promoted = finish(reduce(withPreview(), { type: "expand" }));
    const navigating = reduce(promoted, {
      type: "navigate",
      content: route("items"),
    });
    expect(navigating.main?.id).toBe(promoted.main?.id);
    expect(navigating.main?.content).toEqual(route("items"));
    expect(navigating.preview).toBeNull();
    expect(navigating.phase).toBe("idle");
    expect(finish(navigating)).toBe(navigating);
  });

  it("queues another navigation during expansion and applies it to the promoted surface", () => {
    const start = withPreview();
    const expanding = reduce(start, { type: "expand" });
    const interrupted = reduce(expanding, {
      type: "navigate",
      content: route("account"),
    });
    expect(interrupted.main).toBe(start.main);
    const settled = finish(interrupted);
    expect(settled.main?.id).toBe(start.preview?.id);
    expect(settled.phase).toBe("idle");
    expect(settled.preview).toBeNull();
    expect(settled.main?.content.id).toBe("account");
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
      content: { ...listing, id: "item-2" },
    });
    expect(next.main).toBe(promoted.main);
    expect(next.preview?.id).not.toBe(next.main?.id);
  });

  it("surfaces server errors instead of retaining an invalid or forbidden promoted view", () => {
    const start = reduce(withPreview(), { type: "expand" });
    const error: PanelSource = {
      type: "main",
      id: listing.id,
      children: "Not found",
      replace: true,
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
      content: route("account"),
    });
    const second = reduce(first, {
      type: "navigate",
      content: route("security"),
    });
    expect(first.main?.content.id).toBe("account");
    expect(second.main?.content.id).toBe("security");
    expect(second.preview).toBe(initial.preview);
    expect(second.phase).toBe("closing");
    expect(reduce(second, { type: "finish", revision: first.revision })).toBe(
      second
    );
    expect(finish(second).main?.content.id).toBe("security");
    expect(finish(second).preview).toBeNull();
  });
});
