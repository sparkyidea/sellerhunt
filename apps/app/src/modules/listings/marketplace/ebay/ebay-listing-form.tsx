"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@sparkyidea/ui/components/form";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useFormSaveBar } from "@/hooks/use-form-save-bar";
import { useTRPC } from "@/lib/utils/trpc/client";
import { ListingVariantsSection } from "@/modules/listings/components/listing-variants-section";
import type { ListingRecentSoldOrderLine } from "@/modules/listings/types";
import { LinkedProductSection } from "../../components/linked-product-section";
import { ListingInfoSection } from "../../components/listing-info-section";
import { ListingPricingSection } from "../../components/listing-pricing-section";
import { ListingReturnsSection } from "../../components/listing-returns-section";
import { ListingShippingSection } from "../../components/listing-shipping-section";
import { ListingSpecificsSection } from "../../components/listing-specifics-section";
import {
  RecentOrdersSection,
  RecentOrdersSectionSkeleton,
} from "../../components/recent-orders-section";
import {
  buildListingUpdatePayload,
  type EbayListingFormValues,
  ebayListingFormSchema,
  getEbayListingFormDefaults,
} from "./ebay-listing-form-schema";

const EBAY_SITE_ID = "EBAY_US";

export function EbayListingForm({ id }: { id: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: listing } = useSuspenseQuery(
    trpc.listing.getOne.queryOptions({ id })
  );

  const variantId = listing?.listingVariants[0]?.id;

  const listingVariantIds = useMemo(
    () => listing?.listingVariants.map((v) => v.id) ?? [],
    [listing]
  );

  const { data: recentSold } = useQuery(
    trpc.orderLine.getMany.queryOptions(
      {
        filter: [
          {
            property: "listingVariant.id",
            condition: "inArray",
            value: listingVariantIds,
          },
        ],
        sort: [{ property: "createdAt", direction: "desc" }],
        limit: 5,
      },
      { enabled: listingVariantIds.length > 0 }
    )
  );

  const recentSoldOrderLines = useMemo(
    () =>
      recentSold?.items.filter(
        (line): line is ListingRecentSoldOrderLine => line.order !== null
      ) ?? [],
    [recentSold]
  );

  const defaults = useMemo(
    () => (listing ? getEbayListingFormDefaults(listing) : undefined),
    [listing]
  );

  const form = useForm<EbayListingFormValues>({
    resolver: zodResolver(ebayListingFormSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (defaults) {
      form.reset(defaults);
    }
  }, [form, defaults]);

  const updateListing = useMutation(
    trpc.listing.update.mutationOptions({
      onError: (error) => toast.error(error.message),
    })
  );

  const updateVariant = useMutation(
    trpc.listingVariant.update.mutationOptions({
      onError: (error) => toast.error(error.message),
    })
  );

  const isPending = updateListing.isPending || updateVariant.isPending;

  const onSubmit = async (values: EbayListingFormValues) => {
    if (!listing) {
      return;
    }
    const tasks: Promise<unknown>[] = [
      updateListing.mutateAsync(
        buildListingUpdatePayload(listing.id, values, EBAY_SITE_ID)
      ),
    ];

    if (variantId) {
      tasks.push(
        updateVariant.mutateAsync({
          id: variantId,
          price: values.price,
          quantity: values.quantity,
        })
      );
    }

    await Promise.all(tasks);
    toast.success("Listing updated");
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.listing.getOne.queryKey({ id: listing.id }),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.listing.getMany.queryKey(),
      }),
      // listingVariant.getOne denormalizes listing fields via the 1:1 join,
      // so it goes stale when the listing is edited.
      queryClient.invalidateQueries({
        queryKey: trpc.listingVariant.getOne.queryKey(),
      }),
    ]);
  };

  useFormSaveBar(form, {
    isPending,
    onSave: form.handleSubmit(onSubmit),
    onDiscard: () => (defaults ? form.reset(defaults) : undefined),
  });

  if (!listing) {
    return null;
  }

  const disabled = isPending;

  return (
    <Form {...form}>
      <form className="@container" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid @3xl:grid-cols-7 grid-cols-1 gap-6">
          <div className="@3xl:col-span-5 flex min-w-0 flex-col gap-4">
            <ListingInfoSection
              disabled={disabled}
              marketplaceId={listing.channel?.marketplaceId ?? ""}
              siteId={EBAY_SITE_ID}
            />
            {listing.variant ? (
              <ListingVariantsSection listing={listing} />
            ) : (
              <ListingPricingSection disabled={disabled} />
            )}
            <ListingShippingSection disabled={disabled} />
            <ListingReturnsSection disabled={disabled} />
          </div>
          <div className="@3xl:col-span-2 flex min-w-0 flex-col gap-4">
            <LinkedProductSection listing={listing} />
            <ListingSpecificsSection disabled={disabled} />
            {recentSold ? (
              <RecentOrdersSection orderLines={recentSoldOrderLines} />
            ) : (
              <RecentOrdersSectionSkeleton />
            )}
          </div>
        </div>
      </form>
    </Form>
  );
}
