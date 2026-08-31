import { z } from "zod";
import { inToMm, mgToOz, mmToIn, ozToMg } from "@/lib/utils/unit-conversion";
import type { ProductData, VariantBase } from "../../types";

export const productFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().max(100_000),
  imageUrls: z.array(z.url()).max(30),
  category: z.object({ fullName: z.string(), id: z.string() }).nullable(),
  brand: z.string(),
  manufacturer: z.string(),
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

export type ProductFormValues = z.infer<typeof productFormSchema>;

export function getProductFormDefaults(
  product: ProductData,
  defaultVariant: VariantBase | undefined
): ProductFormValues {
  return {
    title: product.title,
    description: product.description ?? "",
    imageUrls: product.imageUrls ?? [],
    category: product.category
      ? { fullName: product.category.fullName, id: product.category.id }
      : null,
    brand: product.brand ?? "",
    manufacturer: product.manufacturer ?? "",
    sku: defaultVariant?.sku ?? "",
    model: defaultVariant?.model ?? "",
    upc: defaultVariant?.upc ?? "",
    ean: defaultVariant?.ean ?? "",
    isbn: defaultVariant?.isbn ?? "",
    gtin: defaultVariant?.gtin ?? "",
    weightOz: defaultVariant ? mgToOz(defaultVariant.weight) : 0,
    lengthIn: defaultVariant ? mmToIn(defaultVariant.length) : 0,
    widthIn: defaultVariant ? mmToIn(defaultVariant.width) : 0,
    heightIn: defaultVariant ? mmToIn(defaultVariant.height) : 0,
  };
}

export function buildProductUpdatePayload(
  productId: string,
  values: ProductFormValues
) {
  return {
    id: productId,
    title: values.title,
    description: values.description || null,
    imageUrls: values.imageUrls,
    categoryId: values.category?.id ?? null,
    brand: values.brand.trim() || null,
    manufacturer: values.manufacturer.trim() || null,
  };
}

export function buildVariantUpdatePayload(
  variantId: string,
  values: ProductFormValues
) {
  return {
    id: variantId,
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
