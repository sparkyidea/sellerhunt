"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@sparkyidea/ui/components/form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useFormSaveBar } from "@/hooks/use-form-save-bar";
import { useTRPC } from "@/lib/utils/trpc/client";
import { LinkedListingsSection } from "../../components/linked-listings-section";
import { ListingVariantInventorySection } from "../../components/listing-variant-inventory-section";
import { ListingVariantsInventorySection } from "../../components/listing-variants-inventory-section";
import { ProductInfoSection } from "../../components/product-info-section";
import { ProductSpecificsSection } from "../../components/product-specifics-section";
import { ProductVariantShippingSection } from "../../components/product-variant-shipping-section";
import type { ProductData } from "../../types";
import {
  buildProductUpdatePayload,
  buildVariantUpdatePayload,
  getProductFormDefaults,
  type ProductFormValues,
  productFormSchema,
} from "./product-form-schema";

export function ProductForm({ product }: { product: ProductData }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const isVariants = product.variant ?? false;
  const defaultVariant = isVariants ? undefined : product.productVariants[0];

  const defaults = useMemo(
    () => getProductFormDefaults(product, defaultVariant),
    [product, defaultVariant]
  );

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    form.reset(defaults);
  }, [form, defaults]);

  const updateProduct = useMutation(
    trpc.product.update.mutationOptions({
      onError: (error) => toast.error(error.message),
    })
  );

  const updateVariant = useMutation(
    trpc.productVariant.update.mutationOptions({
      onError: (error) => toast.error(error.message),
    })
  );

  const isPending = updateProduct.isPending || updateVariant.isPending;

  const onSubmit = async (values: ProductFormValues) => {
    const tasks: Promise<unknown>[] = [
      updateProduct.mutateAsync(buildProductUpdatePayload(product.id, values)),
    ];
    if (defaultVariant) {
      tasks.push(
        updateVariant.mutateAsync(
          buildVariantUpdatePayload(defaultVariant.id, values)
        )
      );
    }
    await Promise.all(tasks);
    toast.success("Product updated");
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.product.getOne.queryKey({ id: product.id }),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.product.getMany.queryKey(),
      }),
      // productVariant.getOne and getMany denormalize product fields via the
      // 1:1 join, so they go stale when the product is edited.
      queryClient.invalidateQueries({
        queryKey: trpc.productVariant.getOne.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.productVariant.getMany.queryKey(),
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
              <ProductInfoSection disabled={disabled} />
              {isVariants ? (
                <ListingVariantsInventorySection product={product} />
              ) : (
                defaultVariant && (
                  <>
                    <ListingVariantInventorySection variant={defaultVariant} />
                    <ProductVariantShippingSection disabled={disabled} />
                  </>
                )
              )}
            </div>
            <div className="@3xl:col-span-2 flex min-w-0 flex-col gap-4">
              <ProductSpecificsSection
                disabled={disabled}
                showVariantFields={!isVariants && Boolean(defaultVariant)}
              />
              <LinkedListingsSection product={product} />
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
}
