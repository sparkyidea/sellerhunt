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
import type { EbayListingFormValues } from "../marketplace/ebay/ebay-listing-form-schema";

export function ListingSpecificsSection({ disabled }: { disabled: boolean }) {
  const { control } = useFormContext<EbayListingFormValues>();

  return (
    <section className="flex flex-col gap-4">
      <FormField
        control={control}
        name="brand"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Brand</FormLabel>
            <FormControl>
              <Input disabled={disabled} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="manufacturer"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Manufacturer</FormLabel>
            <FormControl>
              <Input disabled={disabled} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </section>
  );
}
