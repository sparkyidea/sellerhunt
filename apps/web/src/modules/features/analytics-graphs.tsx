"use client";

import { motion } from "motion/react";

import { cn } from "@/lib/utils";

import { RevenueCard } from "@/modules/features/orders-marquee/revenue-card";
import { WeeklyOrdersCard } from "@/modules/features/orders-marquee/weekly-orders-card";

interface AnalyticsGraphsProps {
  className?: string;
  isHovered: boolean;
}

export const AnalyticsGraphs = ({
  isHovered,
  className,
}: AnalyticsGraphsProps) => {
  const first = {
    initial: {
      x: 20,
      rotate: -5,
    },
    hover: {
      x: 0,
      rotate: 0,
    },
  };
  const second = {
    initial: {
      x: -20,
      rotate: 5,
    },
    hover: {
      x: 0,
      rotate: 0,
    },
  };

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <motion.div
        animate={isHovered ? "hover" : "initial"}
        className="flex h-auto min-h-[6rem] w-[600px] flex-row space-x-2"
        initial="initial"
      >
        <motion.div className="h-full w-1/2" variants={first}>
          <WeeklyOrdersCard />
        </motion.div>
        <motion.div className="h-full w-1/2" variants={second}>
          <RevenueCard />
        </motion.div>
      </motion.div>
    </div>
  );
};
