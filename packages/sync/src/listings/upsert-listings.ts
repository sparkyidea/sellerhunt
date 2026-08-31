import {
  channel,
  listing,
  listingVariant,
  marketplaceCategory,
  product,
  productVariant,
  stock,
  stockTransaction,
  warehouse,
} from "@dashseller/db/schema";
import type { Listing } from "@dashseller/marketplace/types";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { SyncContext } from "../context";

export interface UpsertListingsResult {
  errors: Array<{ reference: string; error: string }>;
  newListings: number;
  newProducts: number;
  /** Snapshots rejected by the source-version stale guard. */
  staleRejected: number;
  totalProcessed: number;
  updatedListings: number;
}

interface UpsertedListing {
  id: string;
  productId: string | null;
  reference: string | null;
}

interface MarketplaceCategoryLookup {
  categoryId: string | null;
  id: string;
}

async function resolveMarketplaceCategories(
  ctx: SyncContext,
  listingsData: Listing[],
  marketplaceId: string
): Promise<Map<string, MarketplaceCategoryLookup>> {
  const uniqueRefs = [
    ...new Set(
      listingsData
        .map((l) => l.marketplaceCategoryReference)
        .filter((r): r is string => Boolean(r))
    ),
  ];

  const map = new Map<string, MarketplaceCategoryLookup>();
  if (uniqueRefs.length === 0) {
    return map;
  }

  const rows = await ctx.db
    .select({
      id: marketplaceCategory.id,
      reference: marketplaceCategory.reference,
      categoryId: marketplaceCategory.categoryId,
    })
    .from(marketplaceCategory)
    .where(
      and(
        eq(marketplaceCategory.marketplaceId, marketplaceId),
        inArray(marketplaceCategory.reference, uniqueRefs)
      )
    );

  for (const row of rows) {
    map.set(row.reference, { id: row.id, categoryId: row.categoryId });
  }
  return map;
}

async function createProductsForNewListings(
  ctx: SyncContext,
  newListings: UpsertedListing[],
  upsertedListings: UpsertedListing[],
  listingsData: Listing[],
  organizationId: string,
  categoryMap: Map<string, MarketplaceCategoryLookup>,
  errors: Array<{ reference: string; error: string }>
): Promise<number> {
  if (newListings.length === 0) {
    return 0;
  }

  // Invariant: every product must have at least one variant.
  // Skip listings without variants and log them as errors instead of creating
  // orphan products that can never have stock.
  const eligibleListings = newListings.filter((upsertedListing) => {
    const originalData = listingsData.find(
      (d) => d.reference === upsertedListing.reference
    );
    if (!originalData || originalData.listingVariants.length === 0) {
      errors.push({
        reference: upsertedListing.reference || "unknown",
        error: "Listing has no variants; product not created",
      });
      return false;
    }
    return true;
  });

  if (eligibleListings.length === 0) {
    return 0;
  }

  try {
    const productsToInsert = eligibleListings.map((upsertedListing) => {
      const originalData = listingsData.find(
        (l) => l.reference === upsertedListing.reference
      );

      if (!originalData) {
        throw new Error(
          `Original data not found for reference: ${upsertedListing.reference}`
        );
      }

      return {
        organizationId,
        categoryId:
          categoryMap.get(originalData.marketplaceCategoryReference)
            ?.categoryId ?? null,
        title: originalData.title,
        description: originalData.description,
        brand: originalData.brand,
        manufacturer: originalData.manufacturer,
        condition: originalData.condition,
        conditionNote: originalData.conditionNote,
        imageUrls: originalData.imageUrls,
        variant: originalData.variant,
      };
    });

    const createdProducts = await ctx.db
      .insert(product)
      .values(productsToInsert)
      .returning({ id: product.id });

    const listingToProductMap = new Map<string, string>();
    for (let i = 0; i < eligibleListings.length; i++) {
      const listingId = eligibleListings[i]?.id;
      const productId = createdProducts[i]?.id;
      if (listingId && productId) {
        listingToProductMap.set(listingId, productId);
      }
    }

    await ctx.db.transaction(async (tx) => {
      for (const [listingId, productId] of listingToProductMap.entries()) {
        await tx
          .update(listing)
          .set({ productId })
          .where(eq(listing.id, listingId));
      }
    });

    for (const [listingId, productId] of listingToProductMap.entries()) {
      const upsertedListing = upsertedListings.find((l) => l.id === listingId);
      if (upsertedListing) {
        upsertedListing.productId = productId;
      }
    }

    return createdProducts.length;
  } catch (error) {
    for (const upsertedListing of eligibleListings) {
      errors.push({
        reference: upsertedListing.reference || "unknown",
        error:
          error instanceof Error ? error.message : "Product creation failed",
      });
    }
    return 0;
  }
}

// Rule: LST-002 / SYN-005 — this runs before any orders pull for the
// channel, which is what lets order lines resolve `listing_variant_id`.
async function initializeStock(
  ctx: SyncContext,
  variantRefToProductVariantId: Map<string, string>,
  listingsData: Listing[],
  listingMap: Map<string, UpsertedListing>,
  organizationId: string,
  observedAt: Date,
  observedAtUpper: Date
): Promise<void> {
  if (variantRefToProductVariantId.size === 0) {
    return;
  }

  // Find organization's default warehouse (first by createdAt)
  const [defaultWarehouse] = await ctx.db
    .select({ id: warehouse.id })
    .from(warehouse)
    .where(eq(warehouse.organizationId, organizationId))
    .orderBy(warehouse.createdAt)
    .limit(1);

  // Rule: INV-005 — an org with no warehouse seeds no stock, and every
  // line for it then lands `no-stock`. A real precondition of connect that
  // fails quietly, so verify a warehouse exists before any relink or wipe.
  if (!defaultWarehouse) {
    return;
  }

  const stockValues: Array<{
    organizationId: string;
    warehouseId: string;
    productVariantId: string;
    quantity: number;
    seedBasis: string;
    seedObservedAt: Date;
    seedObservedUpperAt: Date;
  }> = [];

  for (const [key, productVariantId] of variantRefToProductVariantId) {
    // Split on the FIRST colon only — variant references may themselves
    // contain colons (raw SKUs, eBay variation values like "Scale-1:64").
    const separator = key.indexOf(":");
    const listingId = key.slice(0, separator);
    const variantRef = key.slice(separator + 1);
    if (!(listingId && variantRef)) {
      continue;
    }

    let quantity = 0;
    let seedObservedAt = observedAt;
    let seedObservedUpperAt = observedAtUpper;
    for (const [ref, upserted] of listingMap) {
      if (upserted.id === listingId) {
        const listingData = listingsData.find((l) => l.reference === ref);
        const variantData = listingData?.listingVariants.find(
          (v) => v.reference === variantRef
        );
        quantity = variantData?.quantity ?? 0;
        // The listing's own provider observation clock (eBay: GetItem
        // response Timestamp) is directly comparable to the same
        // provider's order clocks — no cross-clock skew, and it is exact
        // (lower bound == upper bound). The app-clock fallback brackets
        // the fetch instead. Rule: INV-003.
        seedObservedAt = listingData?.observedAt ?? observedAt;
        seedObservedUpperAt = listingData?.observedAt ?? observedAtUpper;
        break;
      }
    }

    stockValues.push({
      organizationId,
      warehouseId: defaultWarehouse.id,
      productVariantId,
      quantity,
      seedBasis: "listing_available",
      seedObservedAt,
      seedObservedUpperAt,
    });
  }

  if (stockValues.length === 0) {
    return;
  }

  // Transactional (unlike the legacy writer): a crash can't leave stock
  // rows without their "receive" ledger entries. ON CONFLICT DO NOTHING on
  // (productVariantId, warehouseId): existing quantities are never
  // overwritten, and only actually-inserted rows (present in RETURNING)
  // get a "receive" ledger entry.
  await ctx.db.transaction(async (tx) => {
    const createdStocks = await tx
      .insert(stock)
      .values(stockValues)
      .onConflictDoNothing({
        target: [stock.productVariantId, stock.warehouseId],
      })
      .returning({ id: stock.id, quantity: stock.quantity });

    if (createdStocks.length > 0) {
      await tx.insert(stockTransaction).values(
        createdStocks.map((s) => ({
          organizationId,
          stockId: s.id,
          type: "receive" as const,
          quantity: s.quantity,
          note: "Initial stock from listing sync",
        }))
      );
    }
  });
}

async function buildProductVariants(
  ctx: SyncContext,
  newListings: UpsertedListing[],
  listingsData: Listing[],
  listingMap: Map<string, UpsertedListing>,
  organizationId: string
): Promise<Map<string, string>> {
  const newListingIds = newListings.map((l) => l.id);

  const productVariantsToInsert: Array<{
    organizationId: string;
    productId: string;
    sku: string | null | undefined;
    model: string | null | undefined;
    upc: string | null | undefined;
    ean: string | null | undefined;
    isbn: string | null | undefined;
    gtin: string | null | undefined;
    attributes: Record<string, string> | null | undefined;
    price: number;
    length: number;
    width: number;
    height: number;
    weight: number;
    imageUrls: string[] | null | undefined;
    _listingId?: string;
    _variantReference?: string;
  }> = [];

  for (const listingData of listingsData) {
    if (!listingData.reference) {
      continue;
    }

    const upsertedListing = listingMap.get(listingData.reference);
    if (!upsertedListing?.productId) {
      continue;
    }

    const isNewListing = newListingIds.includes(upsertedListing.id);
    if (!isNewListing) {
      continue;
    }

    for (const variant of listingData.listingVariants) {
      if (!variant.reference) {
        continue;
      }

      productVariantsToInsert.push({
        organizationId,
        productId: upsertedListing.productId,
        sku: variant.sku,
        model: variant.model,
        upc: variant.upc,
        ean: variant.ean,
        isbn: variant.isbn,
        gtin: variant.gtin,
        attributes: variant.attributes,
        price: variant.price,
        length: variant.length,
        width: variant.width,
        height: variant.height,
        weight: variant.weight,
        imageUrls: variant.imageUrls,
        _listingId: upsertedListing.id,
        _variantReference: variant.reference,
      });
    }
  }

  const createdProductVariants =
    productVariantsToInsert.length > 0
      ? await ctx.db
          .insert(productVariant)
          .values(
            productVariantsToInsert.map(
              ({ _listingId, _variantReference, ...v }) => v
            )
          )
          .returning({ id: productVariant.id })
      : [];

  const variantRefToProductVariantId = new Map<string, string>();
  for (let i = 0; i < productVariantsToInsert.length; i++) {
    const varData = productVariantsToInsert[i];
    const pvId = createdProductVariants[i]?.id;
    if (varData?._listingId && varData?._variantReference && pvId) {
      const key = `${varData._listingId}:${varData._variantReference}`;
      variantRefToProductVariantId.set(key, pvId);
    }
  }

  return variantRefToProductVariantId;
}

async function upsertListingVariants(
  ctx: SyncContext,
  listingsData: Listing[],
  listingMap: Map<string, UpsertedListing>,
  variantRefToProductVariantId: Map<string, string>,
  organizationId: string,
  errors: Array<{ reference: string; error: string }>
): Promise<void> {
  const listingVariantValues: Array<{
    organizationId: string;
    listingId: string;
    productVariantId: string | null;
    reference: string;
    sku: string | null | undefined;
    model: string | null | undefined;
    upc: string | null | undefined;
    ean: string | null | undefined;
    isbn: string | null | undefined;
    gtin: string | null | undefined;
    attributes: Record<string, string> | null | undefined;
    price: number;
    quantity: number;
    sold: number;
    length: number;
    width: number;
    height: number;
    weight: number;
    imageUrls: string[] | null | undefined;
  }> = [];

  for (const listingData of listingsData) {
    if (!listingData.reference) {
      continue;
    }

    const upsertedListing = listingMap.get(listingData.reference);
    if (!upsertedListing) {
      continue;
    }

    for (const variant of listingData.listingVariants) {
      if (!variant.reference) {
        continue;
      }

      const pvKey = `${upsertedListing.id}:${variant.reference}`;
      const productVariantId = variantRefToProductVariantId.get(pvKey) || null;

      listingVariantValues.push({
        organizationId,
        listingId: upsertedListing.id,
        productVariantId,
        reference: variant.reference,
        sku: variant.sku,
        model: variant.model,
        upc: variant.upc,
        ean: variant.ean,
        isbn: variant.isbn,
        gtin: variant.gtin,
        attributes: variant.attributes,
        price: variant.price,
        quantity: variant.quantity,
        sold: variant.sold,
        length: variant.length,
        width: variant.width,
        height: variant.height,
        weight: variant.weight,
        imageUrls: variant.imageUrls,
      });
    }
  }

  if (listingVariantValues.length === 0) {
    return;
  }

  try {
    await ctx.db
      .insert(listingVariant)
      .values(listingVariantValues)
      .onConflictDoUpdate({
        target: [listingVariant.listingId, listingVariant.reference],
        set: {
          sku: sql`EXCLUDED.sku`,
          model: sql`EXCLUDED.model`,
          upc: sql`EXCLUDED.upc`,
          ean: sql`EXCLUDED.ean`,
          isbn: sql`EXCLUDED.isbn`,
          gtin: sql`EXCLUDED.gtin`,
          attributes: sql`EXCLUDED.attributes`,
          price: sql`EXCLUDED.price`,
          quantity: sql`EXCLUDED.quantity`,
          sold: sql`EXCLUDED.sold`,
          length: sql`EXCLUDED.length`,
          width: sql`EXCLUDED.width`,
          height: sql`EXCLUDED.height`,
          weight: sql`EXCLUDED.weight`,
          imageUrls: sql`EXCLUDED.image_urls`,

          // CRITICAL: Preserve existing productVariantId if EXCLUDED is NULL
          productVariantId: sql`COALESCE(EXCLUDED.product_variant_id, listing_variant.product_variant_id)`,

          updatedAt: sql`NOW()`,
        },
      });
  } catch (error) {
    for (const variantValue of listingVariantValues) {
      errors.push({
        reference: variantValue.reference,
        error:
          error instanceof Error
            ? error.message
            : "Listing variant upsert failed",
      });
    }
  }
}

function buildListingValues(
  organizationId: string,
  channelId: string,
  listingsData: Listing[],
  categoryMap: Map<string, MarketplaceCategoryLookup>,
  now: Date
) {
  return listingsData
    .filter((l) => l.reference)
    .map((l) => ({
      organizationId,
      channelId,
      productId: null as string | null,
      marketplaceCategoryId:
        categoryMap.get(l.marketplaceCategoryReference)?.id ?? null,
      reference: l.reference as string,
      title: l.title,
      subTitle: l.subTitle,
      description: l.description,
      descriptionHtml: l.descriptionHtml,
      type: l.type,
      url: l.url,
      brand: l.brand,
      manufacturer: l.manufacturer,
      condition: l.condition,
      conditionNote: l.conditionNote,
      imageUrls: l.imageUrls,
      watchCount: l.watchCount,
      viewCount: l.viewCount,
      duration: l.duration,
      status: l.status,
      variant: l.variant,
      offer: l.offer,
      offerAcceptPrice: l.offerAcceptPrice,
      offerDeclinePrice: l.offerDeclinePrice,
      domesticReturn: l.domesticReturn,
      domesticReturnWindow: l.domesticReturnWindow,
      domesticReturnPaidBy: l.domesticReturnPaidBy,
      internationalReturn: l.internationalReturn,
      internationalReturnWindow: l.internationalReturnWindow,
      internationalReturnPaidBy: l.internationalReturnPaidBy,
      restockingFee: l.restockingFee,
      localPickup: l.localPickup,
      handlingTime: l.handlingTime,
      handlingFee: l.handlingFee,
      domesticShipping: l.domesticShipping,
      domesticShippingType: l.domesticShippingType,
      domesticShippingBaseFee: l.domesticShippingBaseFee,
      domesticShippingAdditionalFee: l.domesticShippingAdditionalFee,
      internationalShipping: l.internationalShipping,
      internationalShippingType: l.internationalShippingType,
      internationalShippingBaseFee: l.internationalShippingBaseFee,
      internationalShippingAdditionalFee: l.internationalShippingAdditionalFee,
      startedAt: l.startedAt,
      endedAt: l.endedAt,
      sourceVersionAt: l.sourceVersionAt,
      // Local Postgres clock, per the version-clock rules — never the app
      // clock. Stamped on every successful observation.
      lastObservedAt: sql`now()`,
      syncedAt: now,
      syncStatus: "synced" as const,
      syncError: null,
    }));
}

function upsertListingRows(
  ctx: SyncContext,
  listingValues: ReturnType<typeof buildListingValues>
) {
  return ctx.db
    .insert(listing)
    .values(listingValues)
    .onConflictDoUpdate({
      target: [listing.organizationId, listing.channelId, listing.reference],
      set: {
        marketplaceCategoryId: sql`EXCLUDED.marketplace_category_id`,
        title: sql`EXCLUDED.title`,
        subTitle: sql`EXCLUDED.sub_title`,
        description: sql`EXCLUDED.description`,
        descriptionHtml: sql`EXCLUDED.description_html`,
        type: sql`EXCLUDED.type`,
        url: sql`EXCLUDED.url`,
        brand: sql`EXCLUDED.brand`,
        manufacturer: sql`EXCLUDED.manufacturer`,
        condition: sql`EXCLUDED.condition`,
        conditionNote: sql`EXCLUDED.condition_note`,
        imageUrls: sql`EXCLUDED.image_urls`,
        watchCount: sql`EXCLUDED.watch_count`,
        viewCount: sql`EXCLUDED.view_count`,
        duration: sql`EXCLUDED.duration`,
        status: sql`EXCLUDED.status`,
        variant: sql`EXCLUDED.variant`,
        offer: sql`EXCLUDED.offer`,
        offerAcceptPrice: sql`EXCLUDED.offer_accept_price`,
        offerDeclinePrice: sql`EXCLUDED.offer_decline_price`,
        domesticReturn: sql`EXCLUDED.domestic_return`,
        domesticReturnWindow: sql`EXCLUDED.domestic_return_window`,
        domesticReturnPaidBy: sql`EXCLUDED.domestic_return_paid_by`,
        internationalReturn: sql`EXCLUDED.international_return`,
        internationalReturnWindow: sql`EXCLUDED.international_return_window`,
        internationalReturnPaidBy: sql`EXCLUDED.international_return_paid_by`,
        restockingFee: sql`EXCLUDED.restocking_fee`,
        localPickup: sql`EXCLUDED.local_pickup`,
        handlingTime: sql`EXCLUDED.handling_time`,
        handlingFee: sql`EXCLUDED.handling_fee`,
        domesticShipping: sql`EXCLUDED.domestic_shipping`,
        domesticShippingType: sql`EXCLUDED.domestic_shipping_type`,
        domesticShippingBaseFee: sql`EXCLUDED.domestic_shipping_base_fee`,
        domesticShippingAdditionalFee: sql`EXCLUDED.domestic_shipping_additional_fee`,
        internationalShipping: sql`EXCLUDED.international_shipping`,
        internationalShippingType: sql`EXCLUDED.international_shipping_type`,
        internationalShippingBaseFee: sql`EXCLUDED.international_shipping_base_fee`,
        internationalShippingAdditionalFee: sql`EXCLUDED.international_shipping_additional_fee`,
        startedAt: sql`EXCLUDED.started_at`,
        endedAt: sql`EXCLUDED.ended_at`,
        sourceVersionAt: sql`EXCLUDED.source_version_at`,
        lastObservedAt: sql`now()`,
        syncedAt: sql`EXCLUDED.synced_at`,
        syncStatus: sql`EXCLUDED.sync_status`,
        syncError: sql`EXCLUDED.sync_error`,

        // A fresh observation of a live listing un-archives it: either the
        // archive was a missed-delete false positive, or the item was
        // restored remotely. The stale guard below is what stops an OLDER
        // update from doing this.
        archived: sql`false`,
        archivedAt: sql`NULL`,

        // CRITICAL: Preserve existing productId (don't orphan products)
        productId: sql`listing.product_id`,

        updatedAt: sql`NOW()`,
      },
      // Stale guard: a snapshot older than the stored provider clock (or
      // tombstone version) is rejected; rejected rows drop out of RETURNING
      // so product/variant child writes skip them. A version-less snapshot
      // never beats a versioned row — an older update cannot un-archive.
      setWhere: sql`listing.source_version_at IS NULL OR listing.source_version_at <= EXCLUDED.source_version_at`,
    })
    .returning({
      id: listing.id,
      reference: listing.reference,
      productId: listing.productId,
    });
}

/**
 * Upsert listings using PostgreSQL ON CONFLICT, stale-guarded on
 * `source_version_at` and stamping `last_observed_at` with the DATABASE
 * clock on every successful observation.
 *
 * Two-phase approach (~6 queries per batch):
 * 1. UPSERT all listings — stale-rejected rows drop out of RETURNING
 * 2. Split new (productId NULL) vs existing
 * 3. Bulk INSERT products for new listings
 * 4. UPDATE listings with new productIds
 * 5. Bulk INSERT product variants + initial stock (transactional)
 * 6. UPSERT all listing variants
 */
export async function upsertListings(
  ctx: SyncContext,
  input: {
    channelId: string;
    listings: Listing[];
    /**
     * FALLBACK seed cutoff LOWER bound: app clock captured right before
     * the page fetch. Each listing's own provider observation clock
     * (`listing.observedAt`) takes precedence; this covers adapters that
     * don't supply one. Becomes `stock.seed_observed_at` for newly seeded
     * rows — the baseline-rule pivot for orders placed before the
     * observation.
     */
    observedAt: Date;
    /**
     * FALLBACK seed cutoff UPPER bound: app clock captured right after
     * the page fetch. Becomes `stock.seed_observed_upper_at` — the pivot
     * for restore classification, so in-window restores classify pre-seed
     * (undersell, never oversell).
     */
    observedAtUpper: Date;
  }
): Promise<UpsertListingsResult> {
  const {
    channelId,
    listings: listingsData,
    observedAt,
    observedAtUpper,
  } = input;
  if (listingsData.length === 0) {
    return {
      totalProcessed: 0,
      newListings: 0,
      updatedListings: 0,
      newProducts: 0,
      staleRejected: 0,
      errors: [],
    };
  }

  const errors: Array<{ reference: string; error: string }> = [];
  const now = ctx.clock.now();

  const [channelData] = await ctx.db
    .select({
      organizationId: channel.organizationId,
      marketplaceId: channel.marketplaceId,
    })
    .from(channel)
    .where(eq(channel.id, channelId))
    .limit(1);

  if (!channelData?.organizationId) {
    throw new Error(`Channel not found or has no organizationId: ${channelId}`);
  }

  const { organizationId, marketplaceId } = channelData;

  const categoryMap = await resolveMarketplaceCategories(
    ctx,
    listingsData,
    marketplaceId
  );

  const listingValues = buildListingValues(
    organizationId,
    channelId,
    listingsData,
    categoryMap,
    now
  );

  let upsertedListings: UpsertedListing[] = [];
  try {
    upsertedListings = await upsertListingRows(ctx, listingValues);
  } catch (error) {
    for (const listingData of listingsData) {
      errors.push({
        reference: listingData.reference || "unknown",
        error: error instanceof Error ? error.message : "Listing upsert failed",
      });
    }
    return {
      totalProcessed: 0,
      newListings: 0,
      updatedListings: 0,
      newProducts: 0,
      staleRejected: 0,
      errors,
    };
  }

  const staleRejected = listingValues.length - upsertedListings.length;
  if (staleRejected > 0) {
    ctx.logger.info("Stale listing snapshots rejected", {
      channelId,
      staleRejected,
    });
  }

  const newListings = upsertedListings.filter((l) => l.productId === null);
  const existingListings = upsertedListings.filter((l) => l.productId !== null);

  const listingMap = new Map(
    upsertedListings
      .filter(
        (l): l is { id: string; reference: string; productId: string | null } =>
          l.reference !== null
      )
      .map((l) => [l.reference, l])
  );

  const newProductsCount = await createProductsForNewListings(
    ctx,
    newListings,
    upsertedListings,
    listingsData,
    organizationId,
    categoryMap,
    errors
  );

  const variantRefToProductVariantId = await buildProductVariants(
    ctx,
    newListings,
    listingsData,
    listingMap,
    organizationId
  );

  await initializeStock(
    ctx,
    variantRefToProductVariantId,
    listingsData,
    listingMap,
    organizationId,
    observedAt,
    observedAtUpper
  );

  await upsertListingVariants(
    ctx,
    listingsData,
    listingMap,
    variantRefToProductVariantId,
    organizationId,
    errors
  );

  return {
    totalProcessed: listingsData.length - errors.length,
    newListings: newListings.length,
    updatedListings: existingListings.length,
    newProducts: newProductsCount,
    staleRejected,
    errors,
  };
}
