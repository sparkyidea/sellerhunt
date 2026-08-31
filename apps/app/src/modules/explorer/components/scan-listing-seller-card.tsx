import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@sparkyidea/ui/components/avatar";
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

const fmtPercent = (p: string | null | undefined) => {
  if (!p) {
    return "—";
  }
  const n = Number.parseFloat(p);
  if (!Number.isFinite(n)) {
    return "—";
  }
  return `${(n * 100).toFixed(1)}%`;
};

const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString();

export function ScanListingSellerCard({
  listing,
}: {
  listing: ScanListingData;
}) {
  const seller = listing.seller;

  if (!seller) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Seller</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No seller information.
          </p>
        </CardContent>
      </Card>
    );
  }

  const displayName = seller.displayName ?? seller.reference;
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seller</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar size="lg">
            {seller.logoUrl ? (
              <AvatarImage alt={displayName} src={seller.logoUrl} />
            ) : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-sm">{displayName}</span>
            <span className="truncate text-muted-foreground text-xs">
              @{seller.reference}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t pt-3">
          <Row label="Feedback" value={fmtNum(seller.feedbackScore)} />
          <Row label="Positive" value={fmtPercent(seller.feedbackPercent)} />
          <Row label="Total sold" value={fmtNum(seller.totalItemsSold)} />
        </div>
      </CardContent>
    </Card>
  );
}
