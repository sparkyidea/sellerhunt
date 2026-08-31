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
import { useSuspenseQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { RouteBreadcrumb } from "@/components/layout/route-breadcrumb";
import { useTRPC } from "@/lib/utils/trpc/client";
import type { ProductData, ProductNeighbors } from "../../types";
import { ProductForm } from "./product-form";

function getProductActions(_product: ProductData): ActionItem[] {
  return [];
  // TODO: wire archive, duplicate, etc when handlers exist
}

export function ProductDetailView({ id }: { id: string }) {
  const trpc = useTRPC();
  const { data: product } = useSuspenseQuery(
    trpc.product.getOne.queryOptions({ id })
  );
  const { data: neighbors } = useSuspenseQuery(
    trpc.product.getNeighbors.queryOptions({ id })
  );

  return (
    <>
      <ProductPageHeader neighbors={neighbors} product={product} />
      <ProductPanelContent product={product} />
    </>
  );
}

export function ProductPreviewView({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const { data: product } = useSuspenseQuery(
    trpc.product.getOne.queryOptions({ id })
  );

  return (
    <>
      <ProductPreviewHeader onClose={onClose} product={product} />
      <ProductPanelContent product={product} />
    </>
  );
}

function ProductPageHeader({
  product,
  neighbors,
}: {
  product: ProductData;
  neighbors: ProductNeighbors;
}) {
  return (
    <PanelGroup>
      <PanelHeader>
        <RouteBreadcrumb currentLabel={product.title} />
        <ProductStatusTags product={product} />
      </PanelHeader>
      <PanelAction>
        <MoreActions items={getProductActions(product)} />
        <PanelNav
          next={
            neighbors.nextId ? (
              <Link href={`/products/${neighbors.nextId}` as Route} />
            ) : undefined
          }
          prev={
            neighbors.prevId ? (
              <Link href={`/products/${neighbors.prevId}` as Route} />
            ) : undefined
          }
        />
      </PanelAction>
    </PanelGroup>
  );
}

function ProductPreviewHeader({
  product,
  onClose,
}: {
  product: ProductData;
  onClose: () => void;
}) {
  return (
    <>
      <PanelToolbar>
        <PanelClose onClose={onClose} />
        <PanelExpand
          render={<Link href={`/products/${product.id}` as Route} />}
        />
        <PanelAction>
          <MoreActions
            hidePinned
            items={getProductActions(product)}
            variant="ghost"
          />
        </PanelAction>
      </PanelToolbar>
      <PanelGroup>
        <PanelHeader>
          <PanelTitle>{product.title}</PanelTitle>
          <ProductStatusTags product={product} />
        </PanelHeader>
      </PanelGroup>
    </>
  );
}

function ProductStatusTags({ product }: { product: ProductData }) {
  return (
    <PanelTags>
      <Badge variant={product.archived ? "gray" : "green"}>
        {product.archived ? "Archived" : "Active"}
      </Badge>
      {product.condition && (
        <Badge variant="secondary">{product.condition}</Badge>
      )}
    </PanelTags>
  );
}

function ProductPanelContent({ product }: { product: ProductData }) {
  return (
    <PanelContent>
      <ProductForm product={product} />
    </PanelContent>
  );
}
