import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@sparkyidea/ui/components/card";
import type { ScanListingData } from "../types";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export function ScanListingClassificationCard({
  listing,
}: {
  listing: ScanListingData;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Classification</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Row label="Condition" value={listing.condition ?? "—"} />
        <Row label="Variations" value={listing.variant ? "Yes" : "No"} />
        <Row
          label="Category ID"
          value={listing.marketplaceCategoryReference ?? "—"}
        />
        <Row label="Reference" value={listing.reference} />
      </CardContent>
    </Card>
  );
}
