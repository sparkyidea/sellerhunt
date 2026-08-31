import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@sparkyidea/ui/components/card";
import type { ScanListingData } from "../types";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-semibold text-lg tabular-nums">{value}</span>
    </div>
  );
}

const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString();

export function ScanListingPerformanceCard({
  listing,
}: {
  listing: ScanListingData;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <Stat label="Lifetime sold" value={fmtNum(listing.itemSold)} />
        <Stat label="Sold (24h)" value={fmtNum(listing.soldLast24h)} />
        <Stat label="Sold (30d)" value={fmtNum(listing.soldLast30Days)} />
      </CardContent>
    </Card>
  );
}
