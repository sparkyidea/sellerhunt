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

const fmtDate = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleString() : "—";

const fmtBool = (b: boolean | null | undefined) => {
  if (b === null || b === undefined) {
    return "—";
  }
  return b ? "Yes" : "No";
};

export function ScanListingSyncCard({ listing }: { listing: ScanListingData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lifecycle</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Row label="Last scanned" value={fmtDate(listing.lastScannedAt)} />
        <Row label="Started" value={fmtDate(listing.startedAt)} />
        <Row label="Ended" value={fmtDate(listing.endedAt)} />
        <Row
          label="Good 'til cancelled"
          value={fmtBool(listing.goodTillCancelled)}
        />
      </CardContent>
    </Card>
  );
}
