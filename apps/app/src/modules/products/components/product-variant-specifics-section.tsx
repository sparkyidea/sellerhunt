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
import type { ProductVariantFormValues } from "../views/product-variant/product-variant-form-schema";

const SPECIFICS_FIELDS = [
  { key: "sku", label: "SKU" },
  { key: "model", label: "Model" },
  { key: "upc", label: "UPC" },
  { key: "ean", label: "EAN" },
  { key: "isbn", label: "ISBN" },
  { key: "gtin", label: "GTIN" },
] as const;

export function ProductVariantSpecificsSection({
  disabled,
}: {
  disabled: boolean;
}) {
  const { control } = useFormContext<ProductVariantFormValues>();

  return (
    <section className="flex flex-col gap-4">
      <h3 className="font-medium text-base leading-snug">Specifics</h3>
      {SPECIFICS_FIELDS.map((f) => (
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
