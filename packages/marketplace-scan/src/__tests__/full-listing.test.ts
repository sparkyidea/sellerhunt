import { afterEach, expect, it, vi } from "vitest";
import { getListing as getEbayListing } from "../adapters/ebay/api/get-listing";
import { getListing as getShopListing } from "../adapters/shop/api/get-listing";

afterEach(() => vi.unstubAllGlobals());

function shopVariant(id: string, quantity = 1) {
  return {
    id: `gid://shopify/ProductVariant/${id}`,
    title: "Default Title",
    selectedOptions: [{ name: "Title", value: "Default Title" }],
    price: { amount: "20.00", currencyCode: "USD" },
    quantityAvailable: quantity,
  };
}
function shopProduct(count: number | null) {
  return {
    data: {
      storefrontProduct: {
        id: "gid://shopify/Product/123",
        title: "Bottle",
        variantsCount: { count },
        selectedOrFirstAvailableVariant: shopVariant("1"),
      },
    },
  };
}
const shopOptions = {
  listingId: "123",
  authToken: "test",
  deviceId: "test",
  deviceIdHw: "test",
  deviceName: "test",
};

it("keeps a real Shop default ID and puts price/currency only on the unit", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(shopProduct(1)))
  );
  const { listing } = await getShopListing(shopOptions);
  expect(listing).not.toHaveProperty("price");
  expect(listing).not.toHaveProperty("hasVariations");
  expect(listing).not.toHaveProperty("goodTillCancelled");
  expect(listing.variants[0]).not.toHaveProperty("isSynthetic");
  expect(listing.variants[0]).not.toHaveProperty("itemSold");
  expect(listing.variants[0]).not.toHaveProperty("title");
  expect(listing.variants).toEqual([
    expect.objectContaining({
      reference: "1",
      price: 2000,
      currency: "USD",
      status: "in_stock",
    }),
  ]);
});

it("includes out-of-stock Shop variants in a complete enumeration", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(shopProduct(2)))
    .mockResolvedValueOnce(
      Response.json({
        data: {
          storefrontProductAdjacentVariants: {
            adjacentVariants: [
              { ...shopVariant("2"), availableForSale: false },
            ],
          },
        },
      })
    );
  vi.stubGlobal("fetch", fetch);
  const { listing } = await getShopListing(shopOptions);
  expect(listing.variants).toHaveLength(2);
  expect(listing.variants[1]?.status).toBe("out_of_stock");
});

it.each([
  null,
  0,
  3,
])("rejects unknown or incomplete Shop enumeration (%s)", async (count) => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json(shopProduct(count)))
      .mockImplementation(async () =>
        Response.json({
          data: { storefrontProductAdjacentVariants: { adjacentVariants: [] } },
        })
      )
  );
  await expect(getShopListing(shopOptions)).rejects.toThrow();
});

it("rejects a Shop GraphQL partial error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        ...shopProduct(1),
        errors: [{ message: "Incomplete response" }],
      })
    )
  );
  await expect(getShopListing(shopOptions)).rejects.toThrow("GraphQL");
});

function ebayRaw(
  multipleVariationsListed: boolean | null,
  itemVariations: unknown[] = []
) {
  return {
    modules: {
      VLS: {
        listing: {
          listingId: "123",
          title: { content: "Bottle" },
          multipleVariationsListed,
          itemVariations,
        },
      },
      BUY_BOX: {
        binModel: { price: { value: { value: 20, currency: "USD" } } },
      },
    },
  };
}
const ebayOptions = { listingId: "123", authToken: "test" };

it("deduplicates identical Shop overlaps but rejects conflicting units", async () => {
  for (const quantity of [1, 0]) {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(shopProduct(2)))
        .mockResolvedValueOnce(
          Response.json({
            data: {
              storefrontProductAdjacentVariants: {
                adjacentVariants: [
                  shopVariant("1", quantity),
                  shopVariant("2"),
                ],
              },
            },
          })
        )
    );
    if (quantity === 1) {
      expect((await getShopListing(shopOptions)).listing.variants).toHaveLength(
        2
      );
    } else {
      await expect(getShopListing(shopOptions)).rejects.toThrow("Conflicting");
    }
  }
});

it("fails when Shop adjacency hits its safety cap before the reported count", async () => {
  let nextId = 1;
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(shopProduct(6)))
    .mockImplementation(() => {
      nextId += 1;
      return Response.json({
        data: {
          storefrontProductAdjacentVariants: {
            adjacentVariants: [
              {
                ...shopVariant(String(nextId)),
                selectedOptions: [{ name: "Color", value: String(nextId) }],
              },
            ],
          },
        },
      });
    });
  vi.stubGlobal("fetch", fetch);
  await expect(getShopListing(shopOptions)).rejects.toThrow(
    "Incomplete Shop variants"
  );
  expect(fetch).toHaveBeenCalledTimes(5);
});

it("creates a synthetic default only for a confirmed simple eBay listing", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(ebayRaw(false)))
  );
  const { listing } = await getEbayListing(ebayOptions);
  expect(listing.variants[0]).not.toHaveProperty("isSynthetic");
  expect(listing.variants[0]).not.toHaveProperty("itemSold");
  expect(listing.variants[0]).not.toHaveProperty("title");
  expect(listing.variants).toEqual([
    expect.objectContaining({
      reference: "__default__",
      price: 2000,
      status: "in_stock",
    }),
  ]);
});

it.each([
  true,
  null,
])("rejects missing eBay variations when shape is %s", async (shape) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(ebayRaw(shape)))
  );
  await expect(getEbayListing(ebayOptions)).rejects.toThrow();
});

it("preserves native variant prices and rejects duplicate or malformed identities", async () => {
  const native = {
    variationId: 12,
    priceSettings: {
      computations: { price: { basePrice: { value: 25, currency: "USD" } } },
    },
    quantityAndAvailabilityByLogisticsPlans: [
      { quantityAndAvailability: { soldQuantity: 9 } },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(ebayRaw(true, [native])))
  );
  expect((await getEbayListing(ebayOptions)).listing.variants[0]).toMatchObject(
    { reference: "12", price: 2500 }
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(ebayRaw(true, [native, native])))
  );
  await expect(getEbayListing(ebayOptions)).rejects.toThrow("Duplicate");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(ebayRaw(true, [{}])))
  );
  await expect(getEbayListing(ebayOptions)).rejects.toThrow("identity");
});

it("derives eBay variation stock from the remaining quantity", async () => {
  const variation = (variationId: number, remainingQuantity?: number) => ({
    variationId,
    priceSettings: {
      computations: { price: { basePrice: { value: 25, currency: "USD" } } },
    },
    quantityAndAvailabilityByLogisticsPlans: [
      { quantityAndAvailability: { remainingQuantity } },
    ],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        ebayRaw(true, [variation(1, 3), variation(2, 0), variation(3)])
      )
    )
  );
  const { listing } = await getEbayListing(ebayOptions);
  expect(listing.variants.map((v) => [v.reference, v.status])).toEqual([
    ["1", "in_stock"],
    ["2", "out_of_stock"],
    ["3", "in_stock"],
  ]);
});

it("derives Shop stock from the purchasable flag", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json(shopProduct(3)))
      .mockResolvedValueOnce(
        Response.json({
          data: {
            storefrontProductAdjacentVariants: {
              adjacentVariants: [
                { ...shopVariant("2"), availableForSale: true },
                { ...shopVariant("3"), availableForSale: false },
              ],
            },
          },
        })
      )
  );
  const { listing } = await getShopListing(shopOptions);
  expect(
    Object.fromEntries(listing.variants.map((v) => [v.reference, v.status]))
  ).toEqual({ "1": "in_stock", "2": "in_stock", "3": "out_of_stock" });
});

it("marks the default unit of a sold-out simple eBay listing out of stock", async () => {
  const raw = ebayRaw(false);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        modules: {
          ...raw.modules,
          SEMANTIC_DATA_V2: { singleSkuOutOfStock: true },
        },
      })
    )
  );
  const { listing } = await getEbayListing(ebayOptions);
  expect(listing.variants).toEqual([
    expect.objectContaining({
      reference: "__default__",
      status: "out_of_stock",
    }),
  ]);
});
