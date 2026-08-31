"use client";

import createGlobe, { type COBEOptions } from "cobe";
import { useMotionValue, useSpring } from "motion/react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const MOVEMENT_DAMPING = 1400;

const GLOBE_CONFIG: COBEOptions = {
  width: 800,
  height: 800,
  onRender: () => undefined,
  devicePixelRatio: 2,
  phi: 0,
  theta: 0.3,
  dark: 0,
  diffuse: 0.4,
  mapSamples: 16_000,
  mapBrightness: 1.2,
  baseColor: [1, 1, 1],
  markerColor: [251 / 255, 100 / 255, 21 / 255],
  glowColor: [1, 1, 1],
  markers: [
    { location: [14.5995, 120.9842], size: 0.03 },
    { location: [19.076, 72.8777], size: 0.1 },
    { location: [23.8103, 90.4125], size: 0.05 },
    { location: [30.0444, 31.2357], size: 0.07 },
    { location: [39.9042, 116.4074], size: 0.08 },
    { location: [-23.5505, -46.6333], size: 0.1 },
    { location: [19.4326, -99.1332], size: 0.1 },
    { location: [40.7128, -74.006], size: 0.1 },
    { location: [34.6937, 135.5022], size: 0.05 },
    { location: [41.0082, 28.9784], size: 0.06 },
  ],
  opacity: 0.8,
};

export default function Globe({
  className,
  config = GLOBE_CONFIG,
  isAnimated = false,
}: {
  className?: string;
  config?: COBEOptions;
  isAnimated?: boolean;
}) {
  const { resolvedTheme } = useTheme();

  const memoizedConfig = useMemo(
    (): COBEOptions => ({
      ...config,
      dark: resolvedTheme === "dark" ? 1 : 0,
      markerColor: resolvedTheme === "dark" ? [1, 1, 1] : [0.2, 0.2, 0.2],
      glowColor: resolvedTheme === "dark" ? [0.2, 0.2, 0.2] : [1, 1, 1],
    }),
    [config, resolvedTheme]
  );

  const phiRef = useRef(0);
  const widthRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerInteracting = useRef<number | null>(null);
  const pointerInteractionMovement = useRef(0);
  const r = useMotionValue(0);
  const rs = useSpring(r, {
    mass: 1,
    damping: 30,
    stiffness: 100,
  });
  const isSpinning = useRef(isAnimated);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    isSpinning.current = isAnimated || isHovered;
  }, [isAnimated, isHovered]);

  const updatePointerInteraction = useCallback((value: number | null) => {
    pointerInteracting.current = value;
    if (canvasRef.current) {
      canvasRef.current.style.cursor = value === null ? "grab" : "grabbing";
    }
  }, []);

  const updateMovement = useCallback(
    (clientX: number) => {
      if (pointerInteracting.current !== null) {
        const delta = clientX - pointerInteracting.current;
        pointerInteractionMovement.current = delta;
        r.set(r.get() + delta / MOVEMENT_DAMPING);
      }
    },
    [r]
  );

  const onRender = useCallback(
    (state: Record<string, number>) => {
      if (isSpinning.current && pointerInteracting.current === null) {
        phiRef.current += 0.005;
      }
      state.phi = phiRef.current + rs.get();
      state.width = widthRef.current * 2;
      state.height = widthRef.current * 2;
    },
    [rs]
  );

  const onResize = useCallback(() => {
    if (canvasRef.current) {
      widthRef.current = canvasRef.current.offsetWidth;
    }
  }, []);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }
    window.addEventListener("resize", onResize);
    onResize();
    const globe = createGlobe(canvasRef.current, {
      ...memoizedConfig,
      width: widthRef.current * 2,
      height: widthRef.current * 2,
      onRender,
    });

    setTimeout(() => {
      if (canvasRef.current) {
        canvasRef.current.style.opacity = "1";
      }
    }, 0);

    return () => {
      globe.destroy();
      window.removeEventListener("resize", onResize);
    };
  }, [memoizedConfig, onRender, onResize, rs]);

  return (
    <div
      className={cn("mx-auto aspect-square w-full max-w-150", className)}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
      <canvas
        className="contain-[layout_paint_size] size-full opacity-0 transition-opacity duration-500"
        onMouseMove={(e) => updateMovement(e.clientX)}
        onPointerDown={(e) =>
          updatePointerInteraction(
            e.clientX - pointerInteractionMovement.current
          )
        }
        onPointerOut={() => updatePointerInteraction(null)}
        onPointerUp={() => updatePointerInteraction(null)}
        onTouchMove={(e) =>
          e.touches[0] && updateMovement(e.touches[0].clientX)
        }
        ref={canvasRef}
      />
    </div>
  );
}
