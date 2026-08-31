"use client";

import type React from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface OrbitingCirclesProps {
  animate?: boolean;
  children?: React.ReactNode;
  className?: string;
  duration?: number;
  offset?: number;
  path?: boolean;
  radius?: number;
  reverse?: boolean;
}

const calculateInitialPosition = (
  offset: number,
  radius: number,
  reverse: boolean
) => {
  const angle = (offset / 180) * Math.PI * (reverse ? -1 : 1);
  const x = Math.round(Math.cos(angle) * radius * 1e10) / 1e10;
  const y = Math.round(Math.sin(angle) * radius * 1e10) / 1e10;
  return { x, y };
};

export default function OrbitingCircles({
  className,
  children,
  reverse = false,
  duration = 20,
  radius = 50,
  path = true,
  animate = true,
  offset = 0,
}: OrbitingCirclesProps) {
  const orbitRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const progressRef = useRef(offset / 360);
  const lastTimeRef = useRef<number | null>(null);

  const [initialPosition] = useState(() =>
    calculateInitialPosition(offset, radius, reverse)
  );

  const calculatePosition = useCallback(
    (currentProgress: number) => {
      if (!orbitRef.current) {
        return;
      }

      const angle = 2 * Math.PI * currentProgress * (reverse ? -1 : 1);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      orbitRef.current.style.setProperty("--x", `${x}px`);
      orbitRef.current.style.setProperty("--y", `${y}px`);
    },
    [radius, reverse]
  );

  useLayoutEffect(() => {
    calculatePosition(progressRef.current);

    if (!animate) {
      return;
    }

    const updatePosition = (timestamp: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = timestamp;
      }
      const deltaTime = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      progressRef.current =
        (progressRef.current + deltaTime / (duration * 1000)) % 1;
      calculatePosition(progressRef.current);

      animationRef.current = requestAnimationFrame(updatePosition);
    };

    lastTimeRef.current = null;
    animationRef.current = requestAnimationFrame(updatePosition);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animate, duration, calculatePosition]);

  return (
    <>
      {path && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full"
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            className="stroke-1 stroke-black/10 dark:stroke-white/10"
            cx="50%"
            cy="50%"
            fill="none"
            r={radius}
          />
        </svg>
      )}
      <div
        className={cn(
          "absolute flex size-full transform-gpu items-center justify-center rounded-full border bg-black/10 dark:bg-white/10",
          "translate-x-[var(--x,var(--initial-x))] translate-y-[var(--y,var(--initial-y))]",
          className
        )}
        ref={orbitRef}
        style={
          {
            "--duration": `${duration}`,
            "--radius": `${radius}`,
            "--initial-x": `${initialPosition.x}px`,
            "--initial-y": `${initialPosition.y}px`,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </>
  );
}
