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

export function ScanListingVariantsCard({
  listing,
}: {
  listing: ScanListingData;
}) {
  const variants = listing.variants;
  const attributeKeys = Array.from(
    new Set(variants.flatMap((v) => Object.keys(v.attributes ?? {})))
  );

  return (
    <Card className="gap-2">
      <CardHeader>
        <CardTitle>Variants ({variants.length})</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                {attributeKeys.map((key) => (
                  <th
                    className="px-4 py-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide"
                    key={key}
                  >
                    {key}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Price
                </th>
              </tr>
            </thead>
            <tbody>
              {variants.map((variant) => (
                <tr className="border-b last:border-0" key={variant.id}>
                  {attributeKeys.map((key) => (
                    <td className="px-4 py-2" key={key}>
                      {variant.attributes?.[key] ?? "—"}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatPrice(variant.price, listing.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
