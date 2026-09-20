"use client";

import { animate } from "motion";
import { type RefObject, useLayoutEffect, useRef } from "react";

// Preserve the original CSS transition timing; Motion durations use seconds.
const PANEL_TRANSITION_SECONDS = 0.2;

export function usePanelMotion(
  ref: RefObject<HTMLDivElement | null>,
  state: "none" | "open" | "closed" | "expanding",
  resizing: boolean,
  onComplete?: () => void
) {
  // CSS resolves 0 = closed, 1 = split, 2 = full width against the live canvas.
  const progress = useRef(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(max-width: 767px)");
    const write = (value: number) => {
      progress.current = value;
      element.style.setProperty("--panel-progress", `${value}`);
    };
    let animation: ReturnType<typeof animate> | undefined;
    let lastTarget: number | undefined;
    const update = () => {
      let target = 0;
      if (!mobile.matches && state !== "none" && state !== "closed") {
        target = state === "expanding" ? 2 : 1;
      }
      if (
        reducedMotion.matches ||
        document.hidden ||
        resizing ||
        state === "none"
      ) {
        lastTarget = target;
        animation?.stop();
        write(target);
        onComplete?.();
        return;
      }
      if (target === lastTarget) {
        return;
      }
      lastTarget = target;
      animation?.stop();
      if (target === progress.current) {
        onComplete?.();
        return;
      }
      animation = animate(progress.current, target, {
        type: "tween",
        ease: "linear",
        duration: PANEL_TRANSITION_SECONDS,
        onUpdate: write,
        onComplete,
      });
    };
    write(progress.current);
    update();
    reducedMotion.addEventListener("change", update);
    mobile.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      animation?.stop();
      reducedMotion.removeEventListener("change", update);
      mobile.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [onComplete, ref, resizing, state]);
}
