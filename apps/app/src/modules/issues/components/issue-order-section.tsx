"use client";

import { Button } from "@sparkyidea/ui/components/button";
import { Label } from "@sparkyidea/ui/components/label";
import { ArrowUpRight } from "lucide-react";
import { useOpenPreview } from "@/hooks/use-open-preview";
import type { IssueData } from "../types";

function formatDate(date: Date | string | null | undefined): string | null {
  if (!date) {
    return null;
  }
  return new Date(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function IssueOrderSection({ issue }: { issue: IssueData }) {
  const openPreview = useOpenPreview();
  const order = issue.order;

  if (!order) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border bg-card p-3">
        <Label>Order</Label>
        <p className="text-muted-foreground text-sm">No linked order</p>
      </section>
    );
  }

  const identifier = order.orderNumber ?? order.reference ?? "—";
  const orderedAt = formatDate(order.orderedAt ?? order.createdAt);
  const customer = order.billingName ?? order.shippingName ?? null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <Label>Order</Label>
        <Button
          onClick={() => openPreview.order(order.id)}
          size="sm"
          variant="outline"
        >
          Open <ArrowUpRight className="size-3.5" />
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-medium text-sm">{identifier}</span>
        {orderedAt && (
          <span className="text-muted-foreground text-xs">{orderedAt}</span>
        )}
      </div>
      {customer && (
        <div className="flex flex-col gap-1">
          <Label>Customer</Label>
          <span className="text-sm">{customer}</span>
        </div>
      )}
    </section>
  );
}
