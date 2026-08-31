"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@sparkyidea/ui/components/card";
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

function NumberField({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  disabled?: boolean;
  onChange: (value: number) => void;
  placeholder?: string;
  value: number;
}) {
  return (
    <Input
      disabled={disabled}
      inputMode="numeric"
      onChange={(e) => {
        const text = e.target.value.trim();
        const parsed = Number.parseInt(text, 10);
        onChange(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0);
      }}
      placeholder={placeholder}
      value={value}
    />
  );
}

export function ListingShippingSection({ disabled }: { disabled: boolean }) {
  const { control, watch } = useFormContext<EbayListingFormValues>();
  const domesticEnabled = watch("domesticShipping");
  const internationalEnabled = watch("internationalShipping");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shipping</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FormField
          control={control}
          name="localPickup"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between">
              <FormLabel>Local pickup</FormLabel>
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

        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={control}
            name="handlingTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Handling time (days)</FormLabel>
                <FormControl>
                  <NumberField
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
            name="handlingFee"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Handling fee</FormLabel>
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

        <Separator />

        <FormField
          control={control}
          name="domesticShipping"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between">
              <FormLabel>Domestic shipping</FormLabel>
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
        {domesticEnabled && (
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={control}
              name="domesticShippingType"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Service</FormLabel>
                  <FormControl>
                    <Input disabled={disabled} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="domesticShippingBaseFee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Base fee</FormLabel>
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
              name="domesticShippingAdditionalFee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional fee</FormLabel>
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

        <Separator />

        <FormField
          control={control}
          name="internationalShipping"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between">
              <FormLabel>International shipping</FormLabel>
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
        {internationalEnabled && (
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={control}
              name="internationalShippingType"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Service</FormLabel>
                  <FormControl>
                    <Input disabled={disabled} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="internationalShippingBaseFee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Base fee</FormLabel>
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
              name="internationalShippingAdditionalFee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional fee</FormLabel>
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
      </CardContent>
    </Card>
  );
}
