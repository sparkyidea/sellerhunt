import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import { act, type ReactNode, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { usePreviewStore } from "../../../hooks/use-preview-store";

mock.module("@sparkyidea/ui/components/panel-root", () => ({
  PanelRoot: ({
    children,
    preview,
  }: {
    children: ReactNode;
    preview: { children: ReactNode } | null;
  }) => (
    <main>
      {children}
      {preview?.children}
    </main>
  ),
}));
mock.module("@sparkyidea/ui/components/sidebar", () => ({
  useSidebar: () => ({ setOpen: () => undefined }),
}));
mock.module("@sparkyidea/ui/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));
mock.module("next/navigation", () => ({
  usePathname: () => "/explorer/listings",
}));
mock.module("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));
mock.module("@/components/preview/preview-registry", () => ({
  PREVIEW_REGISTRY: {
    "scan-listing": { page: (id: string) => `/explorer/listings/${id}` },
  },
}));
mock.module("@/components/preview/preview-content", () => ({
  PreviewContent: ({ preview }: { preview: { id: string } }) => (
    <aside>{preview.id}</aside>
  ),
}));
const { AppPanels } = await import("../app-panels");

const browser = new Window();
const previousGlobals = Object.getOwnPropertyDescriptors(globalThis);
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, {
    window: browser,
    document: browser.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  usePreviewStore.getState().close();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  usePreviewStore.getState().close();
  for (const key of ["window", "document", "IS_REACT_ACT_ENVIRONMENT"]) {
    const descriptor = previousGlobals[key];
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, key);
    }
  }
});

describe("app shell preview lifetime", () => {
  it("clears a selection on unmount so a new shell cannot reopen it", async () => {
    await act(() => root.render(<AppPanels>Explorer</AppPanels>));
    await act(() => {
      usePreviewStore.getState().open({ kind: "scan-listing", id: "old-item" });
    });
    expect(container.querySelector("aside")?.textContent).toBe("old-item");
    await act(() => root.render(<p>Sign in</p>));
    expect(usePreviewStore.getState().preview).toBeNull();
    await act(() => root.render(<AppPanels>Explorer</AppPanels>));
    expect(container.querySelector("aside")).toBeNull();
  });

  it("keeps newly opened previews through shell rerenders in Strict Mode", async () => {
    await act(() => {
      root.render(
        <StrictMode>
          <AppPanels>Explorer</AppPanels>
        </StrictMode>
      );
    });
    await act(() => {
      usePreviewStore.getState().open({ kind: "scan-listing", id: "new-item" });
    });
    await act(() => {
      root.render(
        <StrictMode>
          <AppPanels>Updated Explorer</AppPanels>
        </StrictMode>
      );
    });
    expect(container.querySelector("aside")?.textContent).toBe("new-item");
    expect(usePreviewStore.getState().preview?.id).toBe("new-item");
  });
});
