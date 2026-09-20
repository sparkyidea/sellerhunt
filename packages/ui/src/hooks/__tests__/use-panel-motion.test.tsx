// @vitest-environment happy-dom

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePanelMotion } from "../use-panel-motion";

const motion = vi.hoisted(() => ({ animate: vi.fn(), stop: vi.fn() }));
vi.mock("motion", () => ({ animate: motion.animate }));

let container: HTMLDivElement;
let root: Root;
let reduced = false;
const complete = vi.fn();

function Probe({
  state = "open",
  resizing = false,
}: {
  state?: "none" | "open" | "closed" | "expanding";
  resizing?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  usePanelMotion(ref, state, resizing, complete);
  return <div ref={ref} />;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: query.includes("reduced-motion") && reduced,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  motion.animate.mockReset();
  motion.stop.mockClear();
  motion.animate.mockImplementation((_from, to, options) => {
    options.onUpdate(to);
    return { stop: motion.stop };
  });
  complete.mockClear();
  reduced = false;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("CSS panel progress", () => {
  it("opens, expands and resets without measuring the canvas", async () => {
    const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get");
    await act(() => root.render(<Probe />));
    expect(motion.animate.mock.lastCall?.slice(0, 2)).toEqual([0, 1]);
    await act(() => root.render(<Probe state="expanding" />));
    expect(motion.animate.mock.lastCall?.slice(0, 2)).toEqual([1, 2]);
    expect(container.firstElementChild?.getAttribute("style")).toContain(
      "--panel-progress: 2"
    );
    await act(() => root.render(<Probe state="none" />));
    expect(container.firstElementChild?.getAttribute("style")).toContain(
      "--panel-progress: 0"
    );
    expect(measure).not.toHaveBeenCalled();
    expect(width).not.toHaveBeenCalled();
  });

  it("cancels expansion and closes from its current progress", async () => {
    await act(() => root.render(<Probe state="expanding" />));
    await act(() => root.render(<Probe state="closed" />));
    expect(motion.stop).toHaveBeenCalledOnce();
    expect(motion.animate.mock.lastCall?.slice(0, 2)).toEqual([2, 0]);
  });

  it("settles immediately for reduced motion", async () => {
    reduced = true;
    await act(() => root.render(<Probe state="expanding" />));
    expect(motion.animate).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
    expect(container.firstElementChild?.getAttribute("style")).toContain(
      "--panel-progress: 2"
    );
  });

  it("settles the split immediately when a drag starts", async () => {
    await act(() => root.render(<Probe resizing />));
    expect(motion.animate).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
    expect(container.firstElementChild?.getAttribute("style")).toContain(
      "--panel-progress: 1"
    );
  });
});
