"use client";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@sparkyidea/ui/components/form";
import { Input } from "@sparkyidea/ui/components/input";
import { useFormContext } from "react-hook-form";
import type { ProductFormValues } from "../views/product/product-form-schema";

const PRODUCT_FIELDS = [
  { key: "brand", label: "Brand" },
  { key: "manufacturer", label: "Manufacturer" },
] as const;

const VARIANT_FIELDS = [
  { key: "sku", label: "SKU" },
  { key: "model", label: "Model" },
  { key: "upc", label: "UPC" },
  { key: "ean", label: "EAN" },
  { key: "isbn", label: "ISBN" },
  { key: "gtin", label: "GTIN" },
] as const;

export function ProductSpecificsSection({
  disabled,
  showVariantFields,
}: {
  disabled: boolean;
  showVariantFields: boolean;
}) {
  const { control } = useFormContext<ProductFormValues>();

  const fields = showVariantFields
    ? [...PRODUCT_FIELDS, ...VARIANT_FIELDS]
    : PRODUCT_FIELDS;

  return (
    <section className="flex flex-col gap-4">
      {fields.map((f) => (
        <FormField
          control={control}
          key={f.key}
          name={f.key}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{f.label}</FormLabel>
              <FormControl>
                <Input disabled={disabled} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ))}
    </section>
  );
}
