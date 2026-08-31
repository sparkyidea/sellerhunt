"use client";

import { FilesMediaProperty } from "@sparkyidea/dataview/properties";
import { Badge } from "@sparkyidea/ui/components/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@sparkyidea/ui/components/hover-card";
import type { ReactNode } from "react";

const TITLE_SEPARATOR = String.fromCharCode(0x1f);

export interface ItemsSummaryItem {
  imageUrl: string | null;
  quantity?: number;
  title: string;
}

interface ItemsSummaryProps {
  countBadge: number;
  items: ItemsSummaryItem[];
}

export function ItemsSummary({ items, countBadge }: ItemsSummaryProps) {
  if (items.length === 0) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  if (items.length === 1) {
    const item = items[0];
    const [productName, variant] = (item.title ?? "").split(TITLE_SEPARATOR);
    return (
      <div className="flex items-center gap-2">
        <FilesMediaProperty value={item.imageUrl ?? "/placeholder.svg"} />
        <CountPill multiple={false}>{countBadge}</CountPill>
        <div className="flex flex-col gap-0.5 text-sm">
          <span className="line-clamp-1">{productName || "—"}</span>
          {variant ? (
            <Badge className="w-fit" variant="secondary">
              {variant}
            </Badge>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <HoverCard>
      <HoverCardTrigger
        closeDelay={100}
        delay={10}
        render={<div className="flex items-center gap-2" />}
      >
        <FilesMediaProperty value="/placeholder.svg" />
        <CountPill multiple>{countBadge}</CountPill>
        <span className="line-clamp-1 text-sm">Multiple Items</span>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80">
        <div className="flex flex-col gap-2">
          <div className="text-muted-foreground text-xs">
            {items.length} items
          </div>
          <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {items.map((item, index) => {
              const [productName, variant] = (item.title ?? "").split(
                TITLE_SEPARATOR
              );
              return (
                <div
                  className="flex items-center gap-2"
                  key={`${item.imageUrl ?? "no-image"}-${item.title}-${index}`}
                >
                  <FilesMediaProperty
                    value={item.imageUrl ?? "/placeholder.svg"}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="line-clamp-1 text-sm">
                      {productName || "—"}
                    </span>
                    {variant ? (
                      <Badge className="w-fit" variant="secondary">
                        {variant}
                      </Badge>
                    ) : null}
                  </div>
                  {item.quantity != null && (
                    <span className="whitespace-nowrap text-muted-foreground text-xs">
                      ×&nbsp;{item.quantity}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function CountPill({
  children,
  multiple,
}: {
  children: ReactNode;
  multiple: boolean;
}) {
  return (
    <div
      className={
        multiple
          ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs"
          : "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-xs"
      }
    >
      {children}
    </div>
  );
}
