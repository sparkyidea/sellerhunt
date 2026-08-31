import { Badge } from "@sparkyidea/ui/components/badge";
import type { ListingData } from "../types";

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

export function ListingSyncSection({ listing }: { listing: ListingData }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-medium text-base leading-snug">Sync</h3>
      <Row
        label="Status"
        value={
          listing.syncStatus ? (
            <Badge variant="secondary">{listing.syncStatus}</Badge>
          ) : (
            "—"
          )
        }
      />
      <Row label="Last synced" value={fmtDate(listing.syncedAt)} />
      <Row label="Started" value={fmtDate(listing.startedAt)} />
      <Row label="Ended" value={fmtDate(listing.endedAt)} />
      {listing.syncError && (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Last error</span>
          <span className="wrap-break-word text-destructive text-sm">
            {listing.syncError}
          </span>
        </div>
      )}
    </section>
  );
}
