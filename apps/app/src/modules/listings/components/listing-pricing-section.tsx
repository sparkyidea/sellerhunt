"use client";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@sparkyidea/ui/components/form";
import { Input } from "@sparkyidea/ui/components/input";
import { Separator } from "@sparkyidea/ui/components/separator";
import { Switch } from "@sparkyidea/ui/components/switch";
import { useFormContext } from "react-hook-form";
import { InputCurrency } from "@/components/ui/input-currency";
import type { EbayListingFormValues } from "../marketplace/ebay/ebay-listing-form-schema";

export function ListingPricingSection({ disabled }: { disabled: boolean }) {
  const { control, watch } = useFormContext<EbayListingFormValues>();
  const offerEnabled = watch("offer");

  return (
    <section className="flex flex-col gap-4">
      <h3 className="font-medium text-base leading-snug">Pricing</h3>
      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={control}
          name="price"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Price</FormLabel>
              <FormControl>
                <InputCurrency
                  disabled={disabled}
                  onChange={(v) => field.onChange(v ?? 0)}
                  value={field.value}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Quantity</FormLabel>
              <FormControl>
                <Input
                  disabled={disabled}
                  inputMode="numeric"
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10);
                    field.onChange(
                      Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
                    );
                  }}
                  value={field.value}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <Separator />

      <FormField
        control={control}
        name="offer"
        render={({ field }) => (
          <FormItem className="flex items-center justify-between">
            <FormLabel>Accept best offer</FormLabel>
            <FormControl>
              <Switch
                checked={field.value}
                disabled={disabled}
                onCheckedChange={field.onChange}
              />
            </FormControl>
          </FormItem>
        )}
      />
      {offerEnabled && (
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={control}
            name="offerAcceptPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Auto-accept at</FormLabel>
                <FormControl>
                  <InputCurrency
                    disabled={disabled}
                    onChange={field.onChange}
                    value={field.value}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="offerDeclinePrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Auto-decline below</FormLabel>
                <FormControl>
                  <InputCurrency
                    disabled={disabled}
                    onChange={field.onChange}
                    value={field.value}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}
    </section>
  );
}
