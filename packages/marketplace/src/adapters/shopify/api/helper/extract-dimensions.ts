import convert from "convert-units";

/**
 * Shopify's `WeightUnit` enum (uppercase) → `convert-units` mass abbreviations.
 * https://shopify.dev/docs/api/admin-graphql/latest/enums/WeightUnit
 */
const WEIGHT_UNIT_MAP: Record<string, "g" | "kg" | "oz" | "lb"> = {
  GRAMS: "g",
  KILOGRAMS: "kg",
  OUNCES: "oz",
  POUNDS: "lb",
};

export interface ShopifyVariantDimensions {
  height: number;
  length: number;
  weight: number;
  width: number;
}

export interface ShopifyVariantMeasurement {
  weight?: { unit?: string | null; value?: number | null } | null;
}

/**
 * Map a Shopify variant's `inventoryItem.measurement.weight` to our normalized
 * dimension fields (all integers, weight in milligrams to match the DB column).
 *
 * Shopify exposes weight only — physical dimensions (length/width/height) live
 * on shipping packages or metafields, not on the product/variant itself, so
 * those three return 0. If a seller needs dimensions, surface a metafield read
 * here once the schema is agreed.
 */
export function extractDimensions(
  measurement: ShopifyVariantMeasurement | null | undefined
): ShopifyVariantDimensions {
  const weightValue = measurement?.weight?.value;
  const weightUnitRaw = measurement?.weight?.unit;

  let weight = 0;
  if (
    typeof weightValue === "number" &&
    weightValue > 0 &&
    typeof weightUnitRaw === "string"
  ) {
    const fromUnit = WEIGHT_UNIT_MAP[weightUnitRaw];
    if (fromUnit) {
      weight = Math.round(convert(weightValue).from(fromUnit).to("mg"));
    }
  }

  return { length: 0, width: 0, height: 0, weight };
}
