"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@sparkyidea/ui/components/card";
import { ChartContainer } from "@sparkyidea/ui/components/chart";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";

export function RevenueCard() {
  return (
    <Card className="max-w-xs">
      <CardHeader>
        <CardTitle>Revenue</CardTitle>
        <CardDescription>
          Your revenue has increased this year compared to last year.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid auto-rows-min gap-2">
          <div className="flex items-baseline gap-1 font-bold text-2xl tabular-nums leading-none">
            $125,453
            <span className="font-normal text-muted-foreground text-sm">
              revenue
            </span>
          </div>
          <ChartContainer
            className="aspect-auto h-[32px] w-full"
            config={{
              revenue: {
                label: "Revenue",
                color: "var(--chart-blue-2)",
              },
            }}
          >
            <BarChart
              accessibilityLayer
              data={[{ date: "2024", revenue: 125_453 }]}
              layout="vertical"
              margin={{ left: 0, top: 0, right: 0, bottom: 0 }}
            >
              <Bar
                barSize={32}
                dataKey="revenue"
                fill="var(--color-revenue)"
                radius={4}
              >
                <LabelList
                  dataKey="date"
                  fill="white"
                  fontSize={12}
                  offset={8}
                  position="insideLeft"
                />
              </Bar>
              <YAxis dataKey="date" hide tickCount={1} type="category" />
              <XAxis dataKey="revenue" hide type="number" />
            </BarChart>
          </ChartContainer>
        </div>
        <div className="grid auto-rows-min gap-2">
          <div className="flex items-baseline gap-1 font-bold text-2xl tabular-nums leading-none">
            $101,030
            <span className="font-normal text-muted-foreground text-sm">
              revenue
            </span>
          </div>
          <ChartContainer
            className="aspect-auto h-[32px] w-full"
            config={{
              revenue: {
                label: "Revenue",
                color: "var(--muted)",
              },
            }}
          >
            <BarChart
              accessibilityLayer
              data={[{ date: "2023", revenue: 101_030 }]}
              layout="vertical"
              margin={{ left: 0, top: 0, right: 0, bottom: 0 }}
            >
              <Bar
                barSize={32}
                dataKey="revenue"
                fill="var(--color-revenue)"
                radius={4}
              >
                <LabelList
                  dataKey="date"
                  fill="var(--muted-foreground)"
                  fontSize={12}
                  offset={8}
                  position="insideLeft"
                />
              </Bar>
              <YAxis dataKey="date" hide tickCount={1} type="category" />
              <XAxis dataKey="revenue" hide type="number" />
            </BarChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
