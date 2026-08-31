"use client";

import { Badge } from "@sparkyidea/ui/components/badge";
import {
  type ActionItem,
  MoreActions,
  PanelAction,
  PanelClose,
  PanelContent,
  PanelExpand,
  PanelGroup,
  PanelHeader,
  PanelNav,
  PanelTags,
  PanelTitle,
  PanelToolbar,
} from "@sparkyidea/ui/components/panel";
import { Icons } from "@sparkyidea/ui/icons";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { RouteBreadcrumb } from "@/components/layout/route-breadcrumb";
import { useTRPC } from "@/lib/utils/trpc/client";
import type { ProductVariantData, ProductVariantNeighbors } from "../../types";
import { ProductVariantForm } from "./product-variant-form";
import { ProductVariantPanelContentSkeleton } from "./product-variant-panel-skeleton";

function getVariantAttributeLabel(variant: ProductVariantData): string {
  return variant.attributes
    ? Object.values(variant.attributes).join(", ") || "Default"
    : "Default";
}

function getProductVariantActions(variant: ProductVariantData): ActionItem[] {
  return [
    {
      icon: <Icons.product />,
      label: "View parent product",
      pinned: true,
      render: <Link href={`/products/${variant.productId}` as Route} />,
    },
  ];
}

export function ProductVariantDetailView({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const { data: variant } = useSuspenseQuery(
    trpc.productVariant.getOne.queryOptions({ id })
  );
  const { data: neighbors } = useSuspenseQuery(
    trpc.productVariant.getNeighbors.queryOptions({ id })
  );

  // Non-variant products don't have a real variant detail page — the
  // variant IS the product. Redirect to the product page where edits
  // actually happen. Only fires in route mode; preview pane shows the
  // variant form as-is.
  const shouldRedirect = !variant.product.variant;
  useEffect(() => {
    if (shouldRedirect) {
      router.replace(`/products/${variant.productId}` as Route);
    }
  }, [shouldRedirect, variant.productId, router]);

  if (shouldRedirect) {
    return <ProductVariantPanelContentSkeleton />;
  }

  return (
    <>
      <ProductVariantPageHeader neighbors={neighbors} variant={variant} />
      <ProductVariantPanelContent variant={variant} />
    </>
  );
}

export function ProductVariantPreviewView({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const { data: variant } = useSuspenseQuery(
    trpc.productVariant.getOne.queryOptions({ id })
  );

  return (
    <>
      <ProductVariantPreviewHeader onClose={onClose} variant={variant} />
      <ProductVariantPanelContent variant={variant} />
    </>
  );
}

function ProductVariantPageHeader({
  variant,
  neighbors,
}: {
  variant: ProductVariantData;
  neighbors: ProductVariantNeighbors;
}) {
  const product = variant.product;
  return (
    <PanelGroup>
      <PanelHeader>
        <RouteBreadcrumb
          currentLabel={getVariantAttributeLabel(variant)}
          parentLabel={product.title}
        />
        <ProductVariantStatusTags variant={variant} />
      </PanelHeader>
      <PanelAction>
        <MoreActions items={getProductVariantActions(variant)} />
        <PanelNav
          next={
            neighbors.nextId ? (
              <Link
                href={
                  `/products/${variant.productId}/variants/${neighbors.nextId}` as Route
                }
              />
            ) : undefined
          }
          prev={
            neighbors.prevId ? (
              <Link
                href={
                  `/products/${variant.productId}/variants/${neighbors.prevId}` as Route
                }
              />
            ) : undefined
          }
        />
      </PanelAction>
    </PanelGroup>
  );
}

function ProductVariantPreviewHeader({
  variant,
  onClose,
}: {
  variant: ProductVariantData;
  onClose: () => void;
}) {
  return (
    <>
      <PanelToolbar>
        <PanelClose onClose={onClose} />
        <PanelExpand
          render={
            <Link
              href={
                `/products/${variant.productId}/variants/${variant.id}` as Route
              }
            />
          }
        />
        <PanelAction>
          <MoreActions
            hidePinned
            items={getProductVariantActions(variant)}
            variant="ghost"
          />
        </PanelAction>
      </PanelToolbar>
      <PanelGroup>
        <PanelHeader>
          <PanelTitle>{getVariantAttributeLabel(variant)}</PanelTitle>
          <ProductVariantStatusTags variant={variant} />
        </PanelHeader>
      </PanelGroup>
    </>
  );
}

function ProductVariantStatusTags({
  variant,
}: {
  variant: ProductVariantData;
}) {
  const product = variant.product;
  return (
    <PanelTags>
      <Badge variant={product.archived ? "gray" : "green"}>
        {product.archived ? "Archived" : "Active"}
      </Badge>
      {variant.sku && <Badge variant="secondary">SKU: {variant.sku}</Badge>}
      {product.condition && (
        <Badge variant="secondary">{product.condition}</Badge>
      )}
    </PanelTags>
  );
}

function ProductVariantPanelContent({
  variant,
}: {
  variant: ProductVariantData;
}) {
  return (
    <PanelContent>
      <ProductVariantForm variant={variant} />
    </PanelContent>
  );
}
