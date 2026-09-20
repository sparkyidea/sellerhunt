// @vitest-environment happy-dom

import { act, type ReactNode, useEffect, useLayoutEffect } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PanelMain, PanelRoot, usePanel } from "../panel-root";

const motion = vi.hoisted(() => ({
  finish: undefined as (() => void) | undefined,
  immediate: false,
}));
vi.mock("../../hooks/use-panel-motion", () => ({
  usePanelMotion: (
    _ref: unknown,
    _state: unknown,
    _width: unknown,
    _resizing: unknown,
    finish: () => void
  ) => {
    motion.finish = finish;
    useLayoutEffect(() => {
      if (motion.immediate) {
        finish();
      }
    }, [finish]);
  },
}));

let container: HTMLDivElement;
let root: Root | undefined;
const mounts = new Map<string, number>();
const unmounts = new Map<string, number>();
const navigate = vi.fn();

function Body({ id }: { id: string }) {
  useEffect(() => {
    mounts.set(id, (mounts.get(id) ?? 0) + 1);
    return () => {
      unmounts.set(id, (unmounts.get(id) ?? 0) + 1);
    };
  }, [id]);
  const { expand, mode } = usePanel();
  return (
    <section data-body={id}>
      <input aria-label={id} defaultValue={id} />
      <span>{mode}</span>
      <button onClick={() => expand?.(navigate)} type="button">
        Expand {id}
      </button>
    </section>
  );
}

function tree(
  id = "/items",
  preview = false,
  error = false,
  routeBody?: ReactNode
) {
  return (
    <PanelRoot
      mainId={id}
      preview={
        preview ? { id: "/items/1", children: <Body id="preview" /> } : null
      }
    >
      <PanelMain id={id} replace={error}>
        {routeBody ?? <Body id={error ? "error" : id} />}
      </PanelMain>
    </PanelRoot>
  );
}

async function render(content: ReactNode) {
  await act(() => {
    root ??= createRoot(container);
    root.render(content);
  });
}

async function finish() {
  await act(() => {
    motion.finish?.();
  });
}

async function expand() {
  const button = container.querySelector<HTMLButtonElement>(
    '[data-body="preview"] button'
  );
  if (!button) {
    throw new Error("Missing preview expand button");
  }
  await act(() => {
    button.click();
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  mounts.clear();
  unmounts.clear();
  navigate.mockClear();
  motion.immediate = false;
});

afterEach(async () => {
  await act(() => {
    root?.unmount();
  });
  root = undefined;
  container.remove();
});

describe("server-rendered panel lifecycle", () => {
  it("hydrates server content in place without remounting the route", async () => {
    container.innerHTML = renderToString(tree());
    const body = container.querySelector('[data-body="/items"]');
    expect(body?.closest('[data-variant="main"]')).not.toBeNull();
    const onRecoverableError = vi.fn();
    await act(() => {
      root = hydrateRoot(container, tree(), { onRecoverableError });
    });
    expect(container.querySelector('[data-body="/items"]')).toBe(body);
    expect(mounts.get("/items")).toBe(1);
    expect(onRecoverableError).not.toHaveBeenCalled();
  });

  it("preserves shared route layouts while resetting the page body per route", async () => {
    function Layout({ children }: { children: ReactNode }) {
      useEffect(() => {
        mounts.set("layout", (mounts.get("layout") ?? 0) + 1);
      }, []);
      return children;
    }
    await render(
      <PanelRoot mainId="/settings/account">
        <Layout>
          <PanelMain id="/settings/account">
            <Body id="account" />
          </PanelMain>
        </Layout>
      </PanelRoot>
    );
    await render(
      <PanelRoot mainId="/settings/security">
        <Layout>
          <PanelMain id="/settings/security">
            <Body id="security" />
          </PanelMain>
        </Layout>
      </PanelRoot>
    );
    expect(mounts.get("layout")).toBe(1);
    expect(unmounts.get("account")).toBe(1);
    expect(mounts.get("security")).toBe(1);
  });

  it("does not render a requested preview on the server", () => {
    const html = renderToString(tree("/items", true));
    expect(html).toContain('data-variant="main"');
    expect(html).not.toContain('data-body="preview"');
  });

  it("renders standalone error content without a root", () => {
    expect(
      renderToString(
        <PanelMain id="missing" replace>
          <p>Not found</p>
        </PanelMain>
      )
    ).toBe("<p>Not found</p>");
  });

  it("promotes the same preview DOM and mounts no duplicate or outgoing route body", async () => {
    await render(tree("/items", true));
    await finish();
    const preview = container.querySelector('[data-body="preview"]');
    const input = container.querySelector<HTMLInputElement>(
      '[data-body="preview"] input'
    );
    if (!input) {
      throw new Error("Missing input");
    }
    input.value = "Local edit";
    const outgoing = container.querySelector('[data-body="/items"]');
    await expand();
    expect(navigate).not.toHaveBeenCalled();
    expect(container.querySelector('[data-body="/items"]')).toBe(outgoing);
    await finish();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-body="preview"]')).toBe(preview);
    expect(preview?.closest('[data-variant="main"]')).not.toBeNull();
    expect(container.querySelector('[data-body="/items"]')).toBeNull();
    expect(mounts.get("/items")).toBe(1);
    await render(tree("/items/1"));
    expect(container.querySelector('[data-body="preview"]')).toBe(preview);
    expect(input.value).toBe("Local edit");
    expect(mounts.get("preview")).toBe(1);
    expect(mounts.has("/items/1")).toBe(false);
    expect(container.querySelector('[data-slot="panel-live"]')).toBeNull();
    await render(tree());
    expect(container.querySelector('[data-body="/items"]')).not.toBeNull();
    expect(container.querySelector('[data-body="preview"]')).toBeNull();
  });

  it("lets a different committed route take over and cancels expansion navigation", async () => {
    await render(tree("/items", true));
    await finish();
    await expand();
    const staleFinish = motion.finish;
    await render(tree("/settings", true));
    expect(container.querySelector('[data-body="/settings"]')).not.toBeNull();
    expect(container.querySelector('[data-body="preview"]')).toBeNull();
    expect(mounts.get("/settings")).toBe(1);
    await act(() => {
      staleFinish?.();
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(container.querySelector('[data-body="/settings"]')).not.toBeNull();
  });

  it("navigates once when motion completes immediately, as with reduced motion", async () => {
    motion.immediate = true;
    await render(tree("/items", true));
    await expand();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(
      container
        .querySelector('[data-body="preview"]')
        ?.closest('[data-variant="main"]')
    ).not.toBeNull();
  });

  it("does not navigate twice when expansion is requested twice", async () => {
    await render(tree("/items", true));
    await finish();
    await expand();
    await expand();
    expect(navigate).not.toHaveBeenCalled();
    await finish();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("cancels deferred navigation as soon as another link is clicked", async () => {
    await render(tree("/items", true));
    await finish();
    await expand();
    const link = document.createElement("a");
    link.href = "/settings";
    container.append(link);
    await act(() => {
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });
    await finish();
    expect(navigate).not.toHaveBeenCalled();
    expect(container.querySelector('[data-body="/items"]')).not.toBeNull();
    expect(mounts.get("/items")).toBe(1);
    link.remove();
  });

  it("does not cancel expansion for a modified new-tab click", async () => {
    await render(tree("/items", true));
    await finish();
    await expand();
    const link = document.createElement("a");
    link.href = "/settings";
    container.append(link);
    await act(() => {
      link.dispatchEvent(
        new MouseEvent("click", { bubbles: true, metaKey: true })
      );
    });
    await finish();
    expect(navigate).toHaveBeenCalledTimes(1);
    link.remove();
  });

  it("cancels deferred navigation on browser Back before a route commits", async () => {
    await render(tree("/items", true));
    await finish();
    await expand();
    await act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await finish();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("handles early arrival of the target without mounting a duplicate", async () => {
    await render(tree("/items", true));
    await finish();
    await expand();
    const preview = container.querySelector('[data-body="preview"]');
    await render(tree("/items/1", true));
    expect(container.querySelector('[data-body="preview"]')).toBe(preview);
    expect(mounts.has("/items/1")).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("replaces a promoted preview with a server error and can recover", async () => {
    await render(tree("/items", true));
    await finish();
    await expand();
    await finish();
    await render(tree("/items/1", false, true));
    expect(container.querySelector('[data-body="preview"]')).toBeNull();
    expect(container.querySelector('[data-body="error"]')).not.toBeNull();
    expect(mounts.get("error")).toBe(1);
    await render(tree("/items/1"));
    expect(container.querySelector('[data-body="/items/1"]')).not.toBeNull();
  });

  it("unmounts the outgoing route for settings and mounts it once on return", async () => {
    await render(tree("/items", false, false, <Body id="filtered" />));
    await render(tree("/settings", false, false, <p>Settings</p>));
    expect(unmounts.get("filtered")).toBe(1);
    await render(tree("/items", false, false, <Body id="filtered" />));
    expect(mounts.get("filtered")).toBe(2);
  });
});
