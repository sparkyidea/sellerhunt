"use client";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@sparkyidea/ui/components/form";
import { Input } from "@sparkyidea/ui/components/input";
import { RichTextEditor } from "@sparkyidea/ui/components/tiptap/rich-text-editor";
import { useQuery } from "@tanstack/react-query";
import { useFormContext } from "react-hook-form";
import type {
  UseCategoryChildren,
  UseCategoryOne,
} from "@/components/category-picker/category-picker";
import { CategoryPicker } from "@/components/category-picker/category-picker";
import { useTRPC } from "@/lib/utils/trpc/client";
import { uploadImage } from "@/lib/utils/upload-image";
import { ProductFormMediaGrid } from "@/modules/products/components/product-form-media-grid";
import type { EbayListingFormValues } from "../marketplace/ebay/ebay-listing-form-schema";

export function ListingInfoSection({
  disabled,
  marketplaceId,
  siteId,
}: {
  disabled: boolean;
  marketplaceId: string;
  siteId: string | null;
}) {
  const { control } = useFormContext<EbayListingFormValues>();

  const useChildren: UseCategoryChildren = (parentReference, enabled) => {
    const trpc = useTRPC();
    return useQuery(
      trpc.marketplaceCategory.getChildren.queryOptions(
        { marketplaceId, siteId, parentReference },
        { enabled }
      )
    );
  };

  const useOne: UseCategoryOne = (reference, enabled) => {
    const trpc = useTRPC();
    return useQuery(
      trpc.marketplaceCategory.getOne.queryOptions(
        { marketplaceId, siteId, reference },
        { enabled }
      )
    );
  };

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
        name="subTitle"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Subtitle</FormLabel>
            <FormControl>
              <Input disabled={disabled} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="descriptionHtml"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <RichTextEditor
                disabled={disabled}
                onChange={field.onChange}
                onUploadImage={uploadImage}
                placeholder="Describe the listing..."
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

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name="category"
          render={({ field }) => (
            <FormItem className="col-span-2">
              <FormLabel>Category</FormLabel>
              <FormControl>
                <CategoryPicker
                  disabled={disabled}
                  onChange={field.onChange}
                  useChildren={useChildren}
                  useOne={useOne}
                  value={field.value}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="condition"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Condition</FormLabel>
              <FormControl>
                <Input disabled={disabled} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="conditionNote"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Condition note</FormLabel>
              <FormControl>
                <Input disabled={disabled} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="duration"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Duration</FormLabel>
              <FormControl>
                <Input disabled={disabled} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </section>
  );
}
