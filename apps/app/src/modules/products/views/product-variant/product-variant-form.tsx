"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@sparkyidea/ui/components/form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useFormSaveBar } from "@/hooks/use-form-save-bar";
import { useTRPC } from "@/lib/utils/trpc/client";
import { ListingVariantInventorySection } from "../../components/listing-variant-inventory-section";
import { ProductVariantInfoSection } from "../../components/product-variant-info-section";
import { ProductVariantShippingSection } from "../../components/product-variant-shipping-section";
import { ProductVariantSpecificsSection } from "../../components/product-variant-specifics-section";
import type { ProductVariantData } from "../../types";
import {
  buildProductVariantUpdatePayload,
  getProductVariantFormDefaults,
  type ProductVariantFormValues,
  productVariantFormSchema,
} from "./product-variant-form-schema";

export function ProductVariantForm({
  variant,
}: {
  variant: ProductVariantData;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const defaults = useMemo(
    () => getProductVariantFormDefaults(variant),
    [variant]
  );

  const attributeKeys = useMemo(
    () => Object.keys(variant.attributes ?? {}),
    [variant]
  );

  const form = useForm<ProductVariantFormValues>({
    resolver: zodResolver(productVariantFormSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    form.reset(defaults);
  }, [form, defaults]);

  const updateVariant = useMutation(
    trpc.productVariant.update.mutationOptions({
      onError: (error) => toast.error(error.message),
    })
  );

  const isPending = updateVariant.isPending;

  const onSubmit = async (values: ProductVariantFormValues) => {
    await updateVariant.mutateAsync(
      buildProductVariantUpdatePayload(variant.id, values)
    );
    toast.success("Variant updated");
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.productVariant.getOne.queryKey({ id: variant.id }),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.product.getOne.queryKey({ id: variant.productId }),
      }),
    ]);
  };

  useFormSaveBar(form, {
    isPending,
    onSave: form.handleSubmit(onSubmit),
    onDiscard: () => form.reset(defaults),
  });

  const disabled = isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="@container">
          <div className="grid @3xl:grid-cols-7 grid-cols-1 gap-6">
            <div className="@3xl:col-span-5 flex min-w-0 flex-col gap-4">
              <ProductVariantInfoSection
                attributeKeys={attributeKeys}
                disabled={disabled}
              />
              <ListingVariantInventorySection variant={variant} />
              <ProductVariantShippingSection disabled={disabled} />
            </div>
            <div className="@3xl:col-span-2 flex min-w-0 flex-col gap-4">
              <ProductVariantSpecificsSection disabled={disabled} />
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
}
