"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@sparkyidea/ui/components/card";
import { useOpenPreview } from "@/hooks/use-open-preview";
import type { ListingVariantData } from "@/modules/listings/types";

export function ListingVariantProductSection({
  variant,
}: {
  variant: ListingVariantData;
}) {
  const openPreview = useOpenPreview();
  const productVariant = variant.productVariant;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked product variant</CardTitle>
      </CardHeader>
      <CardContent>
        {productVariant ? (
          <button
            className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-muted"
            onClick={() => openPreview.product(productVariant.productId)}
            type="button"
          >
            <div className="size-12 shrink-0 overflow-hidden rounded-md bg-muted">
              {productVariant.imageUrls?.[0] ? (
                // biome-ignore lint/performance/noImgElement: simple thumbnail
                <img
                  alt={
                    productVariant.attributes
                      ? Object.values(productVariant.attributes).join(", ")
                      : "Variant"
                  }
                  className="h-full w-full object-cover"
                  height={48}
                  src={productVariant.imageUrls[0]}
                  width={48}
                />
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="line-clamp-2 font-medium text-sm">
                {productVariant.attributes
                  ? Object.values(productVariant.attributes).join(", ") ||
                    "Default"
                  : "Default"}
              </span>
            </div>
          </button>
        ) : (
          <p className="text-muted-foreground text-sm">
            Not linked to a product variant.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
