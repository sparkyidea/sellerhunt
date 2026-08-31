"use client";

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@sparkyidea/ui/components/form";
import { Input } from "@sparkyidea/ui/components/input";
import { RichTextEditor } from "@sparkyidea/ui/components/tiptap/rich-text-editor";
import { useQuery } from "@tanstack/react-query";
import { useFormContext } from "react-hook-form";
import { CategoryPicker } from "@/components/category-picker/category-picker";
import { useTRPC } from "@/lib/utils/trpc/client";
import { uploadImage } from "@/lib/utils/upload-image";
import type { ProductFormValues } from "../views/product/product-form-schema";
import { ProductFormMediaGrid } from "./product-form-media-grid";

function useProductCategoryChildren(parentId: string | null, enabled: boolean) {
  const trpc = useTRPC();
  return useQuery(
    trpc.category.getChildren.queryOptions({ parentId }, { enabled })
  );
}

function useProductCategoryOne(id: string, enabled: boolean) {
  const trpc = useTRPC();
  return useQuery(trpc.category.getOne.queryOptions({ id }, { enabled }));
}

export function ProductInfoSection({ disabled }: { disabled: boolean }) {
  const { control } = useFormContext<ProductFormValues>();

  return (
    <section className="flex flex-col gap-4">
      <FormField
        control={control}
        name="title"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Title</FormLabel>
            <FormControl>
              <Input disabled={disabled} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <RichTextEditor
                disabled={disabled}
                onChange={field.onChange}
                onUploadImage={uploadImage}
                placeholder="Describe the product..."
                value={field.value}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

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

      <FormField
        control={control}
        name="category"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Category</FormLabel>
            <FormControl>
              <CategoryPicker
                disabled={disabled}
                onChange={field.onChange}
                useChildren={useProductCategoryChildren}
                useOne={useProductCategoryOne}
                value={field.value}
              />
            </FormControl>
            <FormDescription>
              Determines tax rates and adds metafields to improve search,
              filters, and cross-channel sales.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </section>
  );
}
