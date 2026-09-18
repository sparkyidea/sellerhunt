"use client";

import { animate } from "motion";
import { type RefObject, useLayoutEffect, useRef } from "react";

// Preserve the original CSS transition timing; Motion durations use seconds.
const PANEL_TRANSITION_SECONDS = 0.2;

export function usePanelMotion(
  ref: RefObject<HTMLDivElement | null>,
  state: "none" | "open" | "closed" | "expanding",
  width: number,
  resizing: boolean,
  onComplete?: () => void
) {
  const position = useRef(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(max-width: 767px)");
    const write = (value: number) => {
      position.current = value;
      element.style.setProperty("--panel-reserved", `${value}px`);
    };
    let animation: ReturnType<typeof animate> | undefined;
    let lastTarget: number | undefined;
    const update = () => {
      const gap =
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize) *
        0.5;
      let target = 0;
      if (!mobile.matches && state !== "none" && state !== "closed") {
        target =
          state === "expanding" ? element.clientWidth + gap : width + gap;
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
      if (target === position.current) {
        onComplete?.();
        return;
      }
      animation = animate(position.current, target, {
        type: "tween",
        ease: "linear",
        duration: PANEL_TRANSITION_SECONDS,
        onUpdate: write,
        onComplete,
      });
    };
    write(position.current);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    reducedMotion.addEventListener("change", update);
    mobile.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      animation?.stop();
      observer.disconnect();
      reducedMotion.removeEventListener("change", update);
      mobile.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [onComplete, ref, resizing, state, width]);
}
