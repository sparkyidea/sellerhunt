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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sparkyidea/ui/components/select";
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
  onChange: (value: number | null) => void;
  placeholder?: string;
  value: number | null | undefined;
}) {
  return (
    <Input
      disabled={disabled}
      inputMode="numeric"
      onChange={(e) => {
        const text = e.target.value.trim();
        if (text === "") {
          onChange(null);
          return;
        }
        const parsed = Number.parseInt(text, 10);
        onChange(Number.isFinite(parsed) && parsed >= 0 ? parsed : null);
      }}
      placeholder={placeholder}
      value={value ?? ""}
    />
  );
}

const paidByItems = [
  { label: "Select", value: null },
  { label: "Buyer", value: "buyer" },
  { label: "Seller", value: "seller" },
];

function PaidBySelect({
  value,
  onChange,
  disabled,
}: {
  disabled?: boolean;
  onChange: (value: string | null) => void;
  value: string | null;
}) {
  return (
    <Select
      disabled={disabled}
      items={paidByItems}
      onValueChange={onChange}
      value={value}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {paidByItems.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ListingReturnsSection({ disabled }: { disabled: boolean }) {
  const { control, watch } = useFormContext<EbayListingFormValues>();
  const domesticEnabled = watch("domesticReturn");
  const internationalEnabled = watch("internationalReturn");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Returns</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FormField
          control={control}
          name="domesticReturn"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between">
              <FormLabel>Accept domestic returns</FormLabel>
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
              name="domesticReturnWindow"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Window (days)</FormLabel>
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
              name="domesticReturnPaidBy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paid by</FormLabel>
                  <FormControl>
                    <PaidBySelect
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
          name="internationalReturn"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between">
              <FormLabel>Accept international returns</FormLabel>
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
              name="internationalReturnWindow"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Window (days)</FormLabel>
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
              name="internationalReturnPaidBy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paid by</FormLabel>
                  <FormControl>
                    <PaidBySelect
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
          name="restockingFee"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Restocking fee</FormLabel>
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
      </CardContent>
    </Card>
  );
}
