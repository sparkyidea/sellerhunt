// @vitest-environment happy-dom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PanelFrame } from "../panel";

let container: HTMLDivElement;
let root: Root;
let canvasWidth = 2408;
let renderedWidth = 800;
const resizing = vi.fn();

function Probe() {
  const [ratio, setRatio] = useState(1 / 3);
  return (
    <div
      ref={(canvas) => {
        if (canvas) {
          Object.defineProperty(canvas, "clientWidth", {
            configurable: true,
            get: () => canvasWidth,
          });
          canvas.style.setProperty("--panel-min-width", "320px");
        }
      }}
      style={{ columnGap: "8px" }}
    >
      <PanelFrame
        onRatioChange={setRatio}
        onResizeChange={resizing}
        ratio={ratio}
        ref={(frame) => {
          if (frame) {
            frame.getBoundingClientRect = () =>
              new DOMRect(0, 0, renderedWidth, 900);
          }
        }}
        variant="preview"
      >
        Preview
      </PanelFrame>
    </div>
  );
}

function handle() {
  const element = container.querySelector<HTMLElement>(
    '[aria-label="Resize preview panel"]'
  );
  if (!element) {
    throw new Error("Missing resize handle");
  }
  return element;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  canvasWidth = 2408;
  renderedWidth = 800;
  resizing.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
});

describe("percentage resize input", () => {
  it("converts a drag to a ratio and stops at half of the canvas excluding its gap", async () => {
    await act(() => root.render(<Probe />));
    const separator = handle();
    separator.setPointerCapture = vi.fn();
    separator.releasePointerCapture = vi.fn();
    await act(() => {
      separator.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientX: 1600,
          pointerId: 1,
        })
      );
    });
    await act(() => {
      separator.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: 900,
          pointerId: 1,
        })
      );
    });
    expect(separator.getAttribute("aria-valuenow")).toBe("50");
    await act(() => {
      separator.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, pointerId: 1 })
      );
    });
    expect(resizing.mock.calls).toEqual([[true], [false]]);
  });

  it("uses the rendered width for keyboard input after the canvas has changed", async () => {
    await act(() => root.render(<Probe />));
    // The CSS split has already followed a sidebar/window resize without a React render.
    canvasWidth = 1208;
    renderedWidth = 400;
    await act(() => {
      handle().dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "ArrowLeft",
          shiftKey: true,
        })
      );
    });
    expect(handle().getAttribute("aria-valuenow")).toBe("38");
  });

  it("lets the half-width limit take precedence over the minimum on narrow canvases", async () => {
    canvasWidth = 548;
    renderedWidth = 270;
    await act(() => root.render(<Probe />));
    await act(() => {
      handle().dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" })
      );
    });
    expect(handle().getAttribute("aria-valuenow")).toBe("50");
  });
});
