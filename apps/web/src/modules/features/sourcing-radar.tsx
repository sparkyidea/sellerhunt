import { Icons } from "@sparkyidea/ui/icons";

import OrbitingCircles from "@/components/orbiting-circles";
import { cn } from "@/lib/utils";

interface SourcingRadarProps {
  className?: string;
  isHovered?: boolean;
}

export const SourcingRadar = ({ isHovered, className }: SourcingRadarProps) => {
  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col items-center justify-center overflow-hidden",
        className
      )}
    >
      <span className="pointer-events-none whitespace-pre-wrap bg-gradient-to-b from-black to-gray-300 bg-clip-text text-center font-semibold text-8xl text-transparent leading-none dark:from-white dark:to-black">
        Scan
      </span>

      {/* Inner Circles */}

      <OrbitingCircles
        className={`size-[45px] border-none bg-transparent ${isHovered ? "[animation-play-state:running]" : "[animation-play-state:paused]"}`}
        duration={20}
        offset={10}
        radius={50}
      >
        <Icons.facebook.color className="absolute size-[45px]" />
      </OrbitingCircles>

      <OrbitingCircles
        className={`size-[45px] border-none bg-transparent ${isHovered ? "[animation-play-state:running]" : "[animation-play-state:paused]"}`}
        duration={20}
        offset={130}
        radius={50}
      >
        <Icons.mercari.color className="absolute size-[45px]" />
      </OrbitingCircles>

      <OrbitingCircles
        className={`size-[45px] border-none bg-transparent ${isHovered ? "[animation-play-state:running]" : "[animation-play-state:paused]"}`}
        duration={20}
        offset={250}
        radius={50}
      >
        <Icons.newegg.color className="absolute size-[45px]" />
      </OrbitingCircles>

      {/* Outer Circles (reverse) */}
      <OrbitingCircles
        className={`size-[50px] border-none bg-transparent ${isHovered ? "[animation-play-state:running]" : "[animation-play-state:paused]"}`}
        duration={20}
        offset={40}
        radius={100}
        reverse
      >
        <Icons.tiktok.color className="absolute size-[50px]" />
      </OrbitingCircles>

      <OrbitingCircles
        className={`size-[50px] border-none bg-transparent ${isHovered ? "[animation-play-state:running]" : "[animation-play-state:paused]"}`}
        duration={20}
        offset={130}
        radius={100}
        reverse
      >
        <Icons.sears.color className="absolute size-[50px]" />
      </OrbitingCircles>

      <OrbitingCircles
        className={`size-[50px] border-none bg-transparent ${isHovered ? "[animation-play-state:running]" : "[animation-play-state:paused]"}`}
        duration={20}
        offset={220}
        radius={100}
        reverse
      >
        <Icons.bigcommerce className="absolute size-[50px]" />
      </OrbitingCircles>

      <OrbitingCircles
        className={`size-[50px] border-none bg-transparent ${isHovered ? "[animation-play-state:running]" : "[animation-play-state:paused]"}`}
        duration={20}
        offset={310}
        radius={100}
        reverse
      >
        <Icons.wix className="absolute size-[50px]" />
      </OrbitingCircles>

      {/* Most Outer Circles (reverse) */}
      <OrbitingCircles
        className={`size-[55px] border-none bg-transparent ${isHovered ? "[animation-play-state:running]" : "[animation-play-state:paused]"}`}
        duration={40}
        offset={10}
        radius={156}
      >
        <Icons.etsy.color className="absolute size-[55px]" />
      </OrbitingCircles>

      <OrbitingCircles
        className={`size-[55px] border-none bg-transparent ${isHovered ? "[animation-play-state:running]" : "[animation-play-state:paused]"}`}
        duration={40}
        offset={82}
        radius={156}
      >
        <Icons.amazon.color className="absolute size-[55px]" />
      </OrbitingCircles>

      <OrbitingCircles
        className={`size-[55px] border-none bg-transparent ${isHovered ? "[animation-play-state:running]" : "[animation-play-state:paused]"}`}
        duration={40}
        offset={154}
        radius={156}
      >
        <Icons.ebay.color className="absolute size-[55px]" />
      </OrbitingCircles>

      <OrbitingCircles
        className={`size-[55px] border-none bg-transparent ${isHovered ? "[animation-play-state:running]" : "[animation-play-state:paused]"}`}
        duration={40}
        offset={226}
        radius={156}
      >
        <Icons.walmart.color className="absolute size-[55px]" />
      </OrbitingCircles>

      <OrbitingCircles
        className={`size-[55px] border-none bg-transparent ${isHovered ? "[animation-play-state:running]" : "[animation-play-state:paused]"}`}
        duration={40}
        offset={298}
        radius={156}
      >
        <Icons.shopify.color className="absolute size-[55px]" />
      </OrbitingCircles>
    </div>
  );
};
