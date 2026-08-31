import type { DataViewProperty } from "@sparkyidea/dataview/types";

export interface ListingVariantInventoryRow {
  available: number;
  committed: number;
  id: string;
  onHand: number;
  warehouse: string;
}

interface StockRecord {
  id: string;
  quantity: number;
  reservedQuantity: number;
  warehouse: {
    id: string;
    address1: string;
    city: string;
    state: string;
  } | null;
}

export const toListingVariantInventoryRow = (
  record: StockRecord
): ListingVariantInventoryRow => ({
  id: record.id,
  warehouse: record.warehouse?.address1 ?? "Unknown",
  committed: record.reservedQuantity,
  available: record.quantity - record.reservedQuantity,
  onHand: record.quantity,
});

export const listingVariantInventoryTableProperties = [
  {
    id: "warehouse",
    key: "warehouse",
    name: "Location",
    type: "text",
    size: 320,
  },
  {
    id: "committed",
    key: "committed",
    name: "Committed",
    type: "number",
  },
  {
    id: "available",
    key: "available",
    name: "Available",
    type: "number",
  },
  {
    id: "onHand",
    key: "onHand",
    name: "On hand",
    type: "number",
  },
] as DataViewProperty<ListingVariantInventoryRow>[];
