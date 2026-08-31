import type { orderLine } from "@dashseller/db/schema";
import {
  FilesMediaProperty,
  NumberProperty,
} from "@sparkyidea/dataview/properties";
import type { DataViewProperty } from "@sparkyidea/dataview/types";
import { Badge } from "@sparkyidea/ui/components/badge";

type OrderLine = typeof orderLine.$inferSelect;

const TITLE_SEPARATOR = String.fromCharCode(0x1f);

export const orderItemsListProperties = [
  {
    name: "Item",
    type: "formula",
    value: (_property, item) => {
      const [productName, variant] = (item.title ?? "").split(TITLE_SEPARATOR);
      return (
        <div className="flex items-center gap-2">
          <FilesMediaProperty value={item.imageUrl ?? "/placeholder.svg"} />
          <div className="flex flex-col">
            <span className="flex items-center gap-1.5">
              <span className="line-clamp-2">{productName || "—"}</span>
              {variant ? (
                <Badge className="shrink-0" variant="secondary">
                  {variant}
                </Badge>
              ) : null}
            </span>
            {item.sku ? (
              <span className="text-muted-foreground text-xs">{item.sku}</span>
            ) : null}
          </div>
        </div>
      );
    },
    size: 400,
  },
  {
    name: "Price",
    type: "formula",
    value: (_property, item) => {
      const unitPrice = item.unitPrice ?? 0;
      const quantity = item.quantity ?? 1;

      return (
        <span className="flex items-center gap-1.5">
          <NumberProperty
            config={{ numberFormat: "dollar", decimalPlaces: 2, scale: 100 }}
            value={unitPrice}
          />
          <span>x</span>
          <span
            className={
              quantity === 1
                ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-xs"
                : "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs"
            }
          >
            {quantity}
          </span>
        </span>
      );
    },
  },
  {
    name: "Total",
    type: "formula",
    value: (_property, item) => {
      const total = (item.quantity ?? 1) * (item.unitPrice ?? 0);
      return (
        <NumberProperty
          config={{ numberFormat: "dollar", decimalPlaces: 2, scale: 100 }}
          value={total}
        />
      );
    },
  },
] as DataViewProperty<OrderLine>[];
