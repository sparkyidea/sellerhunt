"use client";

import type { LucideIcon } from "lucide-react";
import type React from "react";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export const Background = ({
  className,
  ...props
}: React.SVGProps<SVGSVGElement>) => {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      id="a"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M12,.15c6.53,0,11.85,5.32,11.85,11.85s-5.32,11.85-11.85,11.85S.15,18.53.15,12,5.47.15,12,.15M12,0C5.37,0,0,5.37,0,12s5.37,12,12,12,12-5.37,12-12S18.63,0,12,0h0Z" />
      <path d="M21.5.15c1.3,0,2.35,1.05,2.35,2.35v19c0,1.3-1.05,2.35-2.35,2.35H2.5c-1.3,0-2.35-1.05-2.35-2.35V2.5C.15,1.2,1.2.15,2.5.15h19M21.5,0H2.5C1.12,0,0,1.12,0,2.5v19c0,1.38,1.12,2.5,2.5,2.5h19c1.38,0,2.5-1.12,2.5-2.5V2.5c0-1.38-1.12-2.5-2.5-2.5h0Z" />
      <path d="M21.5,3.15c1.3,0,2.35,1.05,2.35,2.35v13c0,1.3-1.05,2.35-2.35,2.35H2.5c-1.3,0-2.35-1.05-2.35-2.35V5.5c0-1.3,1.05-2.35,2.35-2.35h19M21.5,3H2.5c-1.38,0-2.5,1.12-2.5,2.5v13c0,1.38,1.12,2.5,2.5,2.5h19c1.38,0,2.5-1.12,2.5-2.5V5.5c0-1.38-1.12-2.5-2.5-2.5h0Z" />
      <path d="M18.5.15c1.3,0,2.35,1.05,2.35,2.35v19c0,1.3-1.05,2.35-2.35,2.35H5.5c-1.3,0-2.35-1.05-2.35-2.35V2.5C3.15,1.2,4.2.15,5.5.15h13M18.5,0H5.5c-1.38,0-2.5,1.12-2.5,2.5v19c0,1.38,1.12,2.5,2.5,2.5h13c1.38,0,2.5-1.12,2.5-2.5V2.5c0-1.38-1.12-2.5-2.5-2.5h0Z" />
      <path d="M20.5,1.15c1.3,0,2.35,1.05,2.35,2.35v17c0,1.3-1.05,2.35-2.35,2.35H3.5c-1.3,0-2.35-1.05-2.35-2.35V3.5c0-1.3,1.05-2.35,2.35-2.35h17M20.5,1H3.5c-1.38,0-2.5,1.12-2.5,2.5v17c0,1.38,1.12,2.5,2.5,2.5h17c1.38,0,2.5-1.12,2.5-2.5V3.5c0-1.38-1.12-2.5-2.5-2.5h0Z" />
    </svg>
  );
};

interface GlowSquirrelProps {
  className?: string;
  defaultX?: number;
  defaultY?: number;
  icon: LucideIcon;
  isHovered?: boolean;
  size?: number;
}

export function GlowIcon({
  icon: Icon,
  size = 100,
  defaultX = 0.65,
  defaultY = 0.65,
  isHovered = false,
  className,
}: GlowSquirrelProps) {
  const outerDivRef = useRef<HTMLDivElement>(null);
  const innerDivRef = useRef<HTMLDivElement>(null);
  const isHoveredRef = useRef(isHovered);
  const gradientId = useId();
  const [gradientCenter, setGradientCenter] = useState({
    cx: `${defaultX * 100}%`,
    cy: `${defaultY * 100}%`,
  });

  useEffect(() => {
    isHoveredRef.current = isHovered;
  }, [isHovered]);

  useEffect(() => {
    const el = outerDivRef.current;
    if (!el) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!isHoveredRef.current || innerDivRef.current === null) {
        return;
      }

      const rect = innerDivRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
      const y = Math.max(0, Math.min(event.clientY - rect.top, rect.height));

      setGradientCenter({
        cx: `${(x / rect.width) * 100}%`,
        cy: `${(y / rect.height) * 100}%`,
      });
    };

    el.addEventListener("pointermove", handlePointerMove);
    return () => {
      el.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  return (
    <div
      className={cn("flex h-fit w-fit items-center justify-center", className)}
      ref={outerDivRef}
    >
      <div
        className="relative flex items-center justify-center"
        ref={innerDivRef}
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        <Background className="absolute inset-0 h-full w-full text-border" />
        <div
          className="relative z-10 flex items-center justify-center"
          style={{ width: "95%", height: "95%" }}
        >
          <svg
            aria-hidden="true"
            className="h-full w-full drop-shadow-lg"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <radialGradient
                cx={gradientCenter.cx}
                cy={gradientCenter.cy}
                gradientUnits="userSpaceOnUse"
                id={gradientId}
                r="35%"
              >
                <stop offset="0%" stopColor="var(--primary)" />
                <stop offset="100%" stopColor="var(--secondary)" />
              </radialGradient>
            </defs>
            <Icon className="h-full w-full" stroke={`url(#${gradientId})`} />
          </svg>
        </div>
      </div>
    </div>
  );
}
