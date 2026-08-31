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
  FormMessage,
} from "@sparkyidea/ui/components/form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useFormSaveBar } from "@/hooks/use-form-save-bar";
import { useTRPC } from "@/lib/utils/trpc/client";
import type { ListingVariantData } from "@/modules/listings/types";
import { ProductFormMediaGrid } from "@/modules/products/components/product-form-media-grid";

const formSchema = z.object({
  imageUrls: z.array(z.url()).max(30),
});

type FormValues = z.infer<typeof formSchema>;

export function ListingVariantMediaSection({
  variant,
}: {
  variant: ListingVariantData;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const defaults = useMemo<FormValues>(
    () => ({ imageUrls: variant.imageUrls ?? [] }),
    [variant.imageUrls]
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaults,
  });

  const { mutate, isPending } = useMutation(
    trpc.listingVariant.update.mutationOptions({
      onSuccess: async () => {
        toast.success("Media updated");
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.listingVariant.getOne.queryKey({ id: variant.id }),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.listing.getOne.queryKey({ id: variant.listingId }),
          }),
        ]);
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const onSubmit = (values: FormValues) => {
    mutate({ id: variant.id, imageUrls: values.imageUrls });
  };

  useFormSaveBar(form, {
    isPending,
    onSave: form.handleSubmit(onSubmit),
    onDiscard: () => form.reset(defaults),
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Media</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="imageUrls"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <ProductFormMediaGrid
                      disabled={isPending}
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
      </form>
    </Form>
  );
}
