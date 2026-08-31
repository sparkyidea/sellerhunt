import { z } from "zod";
import { inToMm, mgToOz, mmToIn, ozToMg } from "@/lib/utils/unit-conversion";
import type { VariantBase } from "../../types";

export const productVariantFormSchema = z.object({
  imageUrls: z.array(z.url()).max(30),
  attributes: z.record(z.string(), z.string()),
  sku: z.string(),
  model: z.string(),
  upc: z.string(),
  ean: z.string(),
  isbn: z.string(),
  gtin: z.string(),
  weightOz: z.number().min(0, "Weight must be positive"),
  lengthIn: z.number().min(0, "Length must be positive"),
  widthIn: z.number().min(0, "Width must be positive"),
  heightIn: z.number().min(0, "Height must be positive"),
});

export type ProductVariantFormValues = z.infer<typeof productVariantFormSchema>;

export function getProductVariantFormDefaults(
  variant: VariantBase
): ProductVariantFormValues {
  const attributes = variant.attributes ?? {};
  return {
    imageUrls: variant.imageUrls ?? [],
    attributes: Object.fromEntries(
      Object.entries(attributes).map(([k, v]) => [k, v ?? ""])
    ),
    sku: variant.sku ?? "",
    model: variant.model ?? "",
    upc: variant.upc ?? "",
    ean: variant.ean ?? "",
    isbn: variant.isbn ?? "",
    gtin: variant.gtin ?? "",
    weightOz: mgToOz(variant.weight),
    lengthIn: mmToIn(variant.length),
    widthIn: mmToIn(variant.width),
    heightIn: mmToIn(variant.height),
  };
}

export function buildProductVariantUpdatePayload(
  variantId: string,
  values: ProductVariantFormValues
) {
  const attributes = Object.fromEntries(
    Object.entries(values.attributes).map(([k, v]) => [k, v.trim()])
  );
  return {
    id: variantId,
    imageUrls: values.imageUrls,
    attributes,
    sku: values.sku.trim() || null,
    model: values.model.trim() || null,
    upc: values.upc.trim() || null,
    ean: values.ean.trim() || null,
    isbn: values.isbn.trim() || null,
    gtin: values.gtin.trim() || null,
    weight: ozToMg(values.weightOz),
    length: inToMm(values.lengthIn),
    width: inToMm(values.widthIn),
    height: inToMm(values.heightIn),
  };
}
