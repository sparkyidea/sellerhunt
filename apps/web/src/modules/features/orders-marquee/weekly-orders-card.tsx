"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@sparkyidea/ui/components/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@sparkyidea/ui/components/chart";
import {
  Bar,
  BarChart,
  Label,
  Rectangle,
  ReferenceLine,
  XAxis,
} from "recharts";

export function WeeklyOrdersCard() {
  return (
    <Card className="lg:max-w-md">
      <CardHeader className="space-y-0 pb-2">
        <CardDescription>This Week&apos;s Orders</CardDescription>
        <CardTitle className="text-4xl tabular-nums">
          184{" "}
          <span className="font-normal font-sans text-muted-foreground text-sm tracking-normal">
            orders
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{
            orders: {
              label: "Orders",
              color: "var(--chart-blue-2)",
            },
          }}
        >
          <BarChart
            accessibilityLayer
            data={[
              { date: "2024-01-01", orders: 20 },
              { date: "2024-01-02", orders: 25 },
              { date: "2024-01-03", orders: 30 },
              { date: "2024-01-04", orders: 22 },
              { date: "2024-01-05", orders: 28 },
              { date: "2024-01-06", orders: 35 },
              { date: "2024-01-07", orders: 24 },
            ]}
            margin={{
              left: -4,
              right: -4,
            }}
          >
            <Bar
              activeBar={<Rectangle fillOpacity={0.8} />}
              dataKey="orders"
              fill="var(--color-orders)"
              fillOpacity={0.6}
              radius={5}
            />
            <XAxis
              axisLine={false}
              dataKey="date"
              tickFormatter={(value) => {
                return new Date(value).toLocaleDateString("en-US", {
                  weekday: "short",
                });
              }}
              tickLine={false}
              tickMargin={4}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideIndicator
                  labelFormatter={(value) => {
                    return new Date(String(value)).toLocaleDateString("en-US", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    });
                  }}
                />
              }
              cursor={false}
              defaultIndex={2}
            />
            <ReferenceLine
              stroke="var(--muted-foreground)"
              strokeDasharray="3 3"
              strokeWidth={1}
              y={26}
            >
              <Label
                fill="var(--foreground)"
                offset={10}
                position="insideBottomLeft"
                value="Average Orders"
              />
              <Label
                className="text-lg"
                fill="var(--foreground)"
                offset={10}
                position="insideTopLeft"
                startOffset={100}
                value="26"
              />
            </ReferenceLine>
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-1">
        <CardDescription>
          Over the past 7 days, you have received{" "}
          <span className="font-medium text-foreground">184</span> orders.
        </CardDescription>
        <CardDescription>
          You are <span className="font-medium text-foreground">16</span> orders
          away from reaching your weekly goal.
        </CardDescription>
      </CardFooter>
    </Card>
  );
}
