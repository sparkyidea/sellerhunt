"use client";

import { Button } from "@sparkyidea/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@sparkyidea/ui/components/card";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
} from "@sparkyidea/ui/components/empty";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sparkyidea/ui/components/select";
import { Skeleton } from "@sparkyidea/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sparkyidea/ui/components/table";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "@/lib/utils/trpc/client";
import type { ScanListingData } from "../types";
import { formatScanPrice, variantLabel } from "./scan-price";

export function ScanListingHistoryCard({
  listing,
}: {
  listing: ScanListingData;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const variantId = selected ?? listing.variants[0]?.id;
  const items = listing.variants.map((v) => ({
    value: v.id,
    label: variantLabel(v),
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Price and sales history</CardTitle>
        <CardDescription>
          Recorded variant prices and lifetime sales. Unknown sales are not
          estimated.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Select
          items={items}
          onValueChange={setSelected}
          value={variantId ?? null}
        >
          <SelectTrigger aria-label="Variant history">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {variantId ? (
          <VariantHistory
            key={variantId}
            listingId={listing.id}
            variantId={variantId}
          />
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No variants</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

function VariantHistory({
  listingId,
  variantId,
}: {
  listingId: string;
  variantId: string;
}) {
  const trpc = useTRPC();
  const history = useInfiniteQuery(
    trpc.scanListing.getVariantHistory.infiniteQueryOptions(
      { listingId, variantId, limit: 50 },
      { getNextPageParam: (page) => page.nextCursor }
    )
  );
  if (history.isPending) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (history.isError) {
    return (
      <div role="alert">
        Could not load history.{" "}
        <Button onClick={() => history.refetch()} variant="outline">
          Retry
        </Button>
      </div>
    );
  }
  const rows = history.data.pages.flatMap((page) => page.items);
  if (!rows.length) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No observations yet</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Observed</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Lifetime sold</TableHead>
            <TableHead>Sales change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{new Date(row.scannedAt).toLocaleString()}</TableCell>
              <TableCell>{formatScanPrice(row.price, row.currency)}</TableCell>
              <TableCell>
                {row.itemSold?.toLocaleString() ?? "Unknown"}
              </TableCell>
              <TableCell>{row.salesDelta?.toLocaleString() ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {history.hasNextPage ? (
        <Button
          disabled={history.isFetchingNextPage}
          onClick={() => history.fetchNextPage()}
          variant="outline"
        >
          {history.isFetchingNextPage ? "Loading…" : "Load older observations"}
        </Button>
      ) : null}
    </>
  );
}
