"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@sparkyidea/ui/components/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@sparkyidea/ui/components/form";
import { Input } from "@sparkyidea/ui/components/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { InputCurrency } from "@/components/ui/input-currency";
import { useFormSaveBar } from "@/hooks/use-form-save-bar";
import { useTRPC } from "@/lib/utils/trpc/client";
import type { ListingVariantData } from "@/modules/listings/types";

const formSchema = z.object({
  price: z.number().int().min(0),
  quantity: z.number().int().min(0),
});

type FormValues = z.infer<typeof formSchema>;

export function ListingVariantPricingSection({
  variant,
}: {
  variant: ListingVariantData;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const defaults = useMemo<FormValues>(
    () => ({ price: variant.price, quantity: variant.quantity }),
    [variant.price, variant.quantity]
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaults,
  });

  const update = useMutation(
    trpc.listingVariant.update.mutationOptions({
      onError: (error) => toast.error(error.message),
    })
  );

  const onSubmit = async (values: FormValues) => {
    await update.mutateAsync({ id: variant.id, ...values });
    toast.success("Variant updated");
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.listingVariant.getOne.queryKey({ id: variant.id }),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.listing.getOne.queryKey({ id: variant.listingId }),
      }),
    ]);
  };

  useFormSaveBar(form, {
    isPending: update.isPending,
    onSave: form.handleSubmit(onSubmit),
    onDiscard: () => form.reset(defaults),
  });

  const disabled = update.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Pricing & inventory</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
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
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Available</FormLabel>
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
              <FormItem>
                <FormLabel>Sold</FormLabel>
                <FormControl>
                  <Input disabled readOnly value={variant.sold} />
                </FormControl>
              </FormItem>
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
