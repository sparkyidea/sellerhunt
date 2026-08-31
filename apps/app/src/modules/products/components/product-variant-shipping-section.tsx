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
import { useFormContext } from "react-hook-form";

interface ShippingFormValues {
  heightIn: number;
  lengthIn: number;
  weightOz: number;
  widthIn: number;
}

export function ProductVariantShippingSection({
  disabled,
}: {
  disabled: boolean;
}) {
  const { control } = useFormContext<ShippingFormValues>();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shipping</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FormField
          control={control}
          name="weightOz"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Weight (oz)</FormLabel>
              <FormControl>
                <Input
                  disabled={disabled}
                  inputMode="decimal"
                  step="0.01"
                  type="number"
                  {...field}
                  onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-3 gap-3">
          <FormField
            control={control}
            name="lengthIn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Length (in)</FormLabel>
                <FormControl>
                  <Input
                    disabled={disabled}
                    inputMode="decimal"
                    step="0.01"
                    type="number"
                    {...field}
                    onChange={(e) =>
                      field.onChange(e.target.valueAsNumber || 0)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="widthIn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Width (in)</FormLabel>
                <FormControl>
                  <Input
                    disabled={disabled}
                    inputMode="decimal"
                    step="0.01"
                    type="number"
                    {...field}
                    onChange={(e) =>
                      field.onChange(e.target.valueAsNumber || 0)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="heightIn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Height (in)</FormLabel>
                <FormControl>
                  <Input
                    disabled={disabled}
                    inputMode="decimal"
                    step="0.01"
                    type="number"
                    {...field}
                    onChange={(e) =>
                      field.onChange(e.target.valueAsNumber || 0)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}
