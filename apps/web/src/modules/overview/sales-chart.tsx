"use client";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@sparkyidea/ui/components/chart";
import { Area, AreaChart, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";

import { chartData } from "./sales-data";

const chartConfig: ChartConfig = {
  amazon: {
    label: "Amazon",
    color: "var(--chart-blue-1)",
  },
  ebay: {
    label: "eBay",
    color: "var(--chart-blue-2)",
  },
};

interface SalesChartProps {
  className?: string;
}

export const SalesChart = ({ className }: SalesChartProps) => {
  return (
    <div className={cn("flex flex-col justify-end", className)}>
      <ChartContainer config={chartConfig}>
        <AreaChart
          accessibilityLayer
          data={chartData}
          margin={{
            left: 0,
            right: 0,
          }}
        >
          <CartesianGrid horizontal={false} vertical={false} />
          <ChartTooltip
            content={<ChartTooltipContent indicator="dot" />}
            cursor={false}
          />
          <Area
            dataKey="ebay"
            fill={chartConfig.ebay.color}
            fillOpacity={0.4}
            stackId="a"
            stroke={chartConfig.ebay.color}
            type="natural"
          />
          <Area
            dataKey="amazon"
            fill={chartConfig.amazon.color}
            fillOpacity={0.4}
            stackId="a"
            stroke={chartConfig.amazon.color}
            type="natural"
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
};
