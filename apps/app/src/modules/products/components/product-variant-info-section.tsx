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
import { ProductFormMediaGrid } from "./product-form-media-grid";

export function ProductVariantInfoSection({
  disabled,
  attributeKeys,
}: {
  disabled: boolean;
  attributeKeys: string[];
}) {
  const { control } = useFormContext<ProductVariantFormValues>();

  return (
    <section className="flex flex-col gap-4">
      <FormField
        control={control}
        name="imageUrls"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Media</FormLabel>
            <FormControl>
              <ProductFormMediaGrid
                disabled={disabled}
                onChange={field.onChange}
                value={field.value}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {attributeKeys.map((key) => (
        <FormField
          control={control}
          key={key}
          name={`attributes.${key}` as const}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="capitalize">{key}</FormLabel>
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
