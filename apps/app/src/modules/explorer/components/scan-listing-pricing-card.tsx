import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@sparkyidea/ui/components/card";
import type { ScanListingData } from "../types";
import { formatScanPriceRange } from "./scan-price";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export function ScanListingPricingCard({
  listing,
}: {
  listing: ScanListingData;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Row
          label="Price"
          value={
            <span className="font-semibold">
              {formatScanPriceRange(listing)}
            </span>
          }
        />
        <Row label="Currency" value={listing.currency ?? "—"} />
      </CardContent>
    </Card>
  );
}
