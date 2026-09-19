import { Badge } from "@sparkyidea/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@sparkyidea/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sparkyidea/ui/components/table";
import type { ScanListingData } from "../types";
import { formatScanPrice, variantLabel } from "./scan-price";

const STATUS_LABELS = {
  in_stock: "In stock",
  out_of_stock: "Out of stock",
  removed: "Removed",
};

export function ScanListingVariantsCard({
  listing,
}: {
  listing: ScanListingData;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {listing.hasVariations ? "Variants" : "Default variant"} (
          {listing.variants.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Variant</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Lifetime sold</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listing.variants.map((v) => (
              <TableRow key={v.id}>
                <TableCell>{variantLabel(v)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {v.status ? STATUS_LABELS[v.status] : "Unknown"}
                  </Badge>
                </TableCell>
                <TableCell>{formatScanPrice(v.price, v.currency)}</TableCell>
                <TableCell>
                  {v.itemSold?.toLocaleString() ?? "Unknown"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
