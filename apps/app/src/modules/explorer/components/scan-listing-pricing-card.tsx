import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@sparkyidea/ui/components/card";
import type { ScanListingData } from "../types";

function formatPrice(cents: number | null, currency: string | null) {
  if (cents == null) {
    return "—";
  }
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: currency ?? "USD",
  });
}

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
              {formatPrice(listing.price, listing.currency)}
            </span>
          }
        />
        <Row label="Currency" value={listing.currency ?? "—"} />
      </CardContent>
    </Card>
  );
}
