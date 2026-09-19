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
import { useTRPC } from "@/lib/utils/trpc/client";
import type { ScanListingData } from "../types";

const formatCount = (value: number | null) =>
  value?.toLocaleString() ?? "Unknown";

export function ScanListingHistoryCard({
  listing,
}: {
  listing: ScanListingData;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales history</CardTitle>
        <CardDescription>
          Sales counters recorded on each completed scan. Unknown sales are not
          estimated.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ListingHistory listingId={listing.id} />
      </CardContent>
    </Card>
  );
}

function ListingHistory({ listingId }: { listingId: string }) {
  const trpc = useTRPC();
  const history = useInfiniteQuery(
    trpc.scanListing.getListingHistory.infiniteQueryOptions(
      { listingId, limit: 50 },
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
          <EmptyTitle>No scans recorded yet</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Scanned</TableHead>
            <TableHead>Lifetime sold</TableHead>
            <TableHead>Sales change</TableHead>
            <TableHead>Sold last 24h</TableHead>
            <TableHead>Sold last 30 days</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{new Date(row.createdAt).toLocaleString()}</TableCell>
              <TableCell>{formatCount(row.itemSold)}</TableCell>
              <TableCell>{row.salesDelta?.toLocaleString() ?? "—"}</TableCell>
              <TableCell>{formatCount(row.soldLast24h)}</TableCell>
              <TableCell>{formatCount(row.soldLast30Days)}</TableCell>
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
          {history.isFetchingNextPage ? "Loading…" : "Load older scans"}
        </Button>
      ) : null}
    </>
  );
}
