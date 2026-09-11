import type {
  ScanGetListingResult,
  ScanListing,
} from "@dashseller/marketplace-scan/types";
import { beforeEach, expect, it, vi } from "vitest";
import type { ScanConfig } from "../../../utils/scan-config";
import { scanOneListing } from "../scan-one-listing";

const mocks = vi.hoisted(() => ({
  upsertScanListing: vi.fn(),
  upsertScanSeller: vi.fn(),
}));
vi.mock("@trigger.dev/sdk", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../upsert-scan-listing", () => ({
  upsertScanListing: mocks.upsertScanListing,
}));
vi.mock("../upsert-scan-seller", () => ({
  upsertScanSeller: mocks.upsertScanSeller,
}));

const config: ScanConfig = {
  marketplace: "ebay",
  enabled: true,
  keywordBatchSize: 20,
  sellerBatchSize: 20,
  listingBatchSize: 50,
  listingScanBatchSize: 50,
  listingScanDelayMinMs: 0,
  listingScanDelayMaxMs: 0,
  keywordLlmEnabled: true,
  maxSearchPages: 10,
  minItemSold: 100,
  minPriceCents: 1000,
  maxPriceCents: null,
  minSoldLast24h: null,
};
const listing: ScanListing = {
  categoryPath: ["Cameras"],
  condition: "New",
  currency: "USD",
  description: null,
  endedAt: null,
  goodTillCancelled: true,
  imageUrls: null,
  itemSold: 200,
  marketplace: "ebay",
  marketplaceCategoryReference: "31388",
  price: 2000,
  reference: "123456789012",
  sellerReference: "seller-1",
  soldLast24h: null,
  soldLast30Days: null,
  startedAt: null,
  title: "Camera",
  url: null,
  variant: false,
  variants: [],
};
const client = { getListing: vi.fn<() => Promise<ScanGetListingResult>>() };
const manager = { markUsed: vi.fn() };
const params = {
  client,
  manager,
  config,
  marketplace: "ebay",
  listingId: "https://www.ebay.com/itm/123456789012",
};

beforeEach(() => {
  vi.clearAllMocks();
  client.getListing.mockResolvedValue({ listing, raw: null });
  mocks.upsertScanSeller.mockResolvedValue({ id: "seller-row" });
  mocks.upsertScanListing.mockResolvedValue({ id: "stored-id", isNew: true });
});

it("fetches the normalized id, persists a fitting listing and reports isNew", async () => {
  await expect(scanOneListing(params)).resolves.toEqual({
    listingId: "123456789012",
    fit: true,
    sellerReference: "seller-1",
    scanListingId: "stored-id",
    isNew: true,
    title: "Camera",
    categoryPath: ["Cameras"],
    variantsDiscovered: 0,
  });
  expect(client.getListing).toHaveBeenCalledWith({ listingId: "123456789012" });
  expect(manager.markUsed).toHaveBeenCalledTimes(1);
  expect(mocks.upsertScanSeller).toHaveBeenCalledWith({
    marketplace: "ebay",
    reference: "seller-1",
  });
  expect(mocks.upsertScanListing).toHaveBeenCalledWith(
    expect.objectContaining({
      marketplace: "ebay",
      reference: "123456789012",
      sellerReference: "seller-1",
      title: "Camera",
      price: 2000,
      itemSold: 200,
    })
  );
});

it("persists a below-threshold listing without promoting its seller", async () => {
  client.getListing.mockResolvedValue({
    listing: { ...listing, itemSold: 50 },
    raw: null,
  });
  await expect(scanOneListing(params)).resolves.toEqual({
    listingId: "123456789012",
    fit: false,
    scanListingId: "stored-id",
    sellerReference: "seller-1",
  });
  expect(manager.markUsed).toHaveBeenCalledTimes(1);
  expect(mocks.upsertScanSeller).not.toHaveBeenCalled();
  expect(mocks.upsertScanListing).toHaveBeenCalledWith(
    expect.objectContaining({ qualified: false })
  );
});

it("rejects a listing with no title without persisting", async () => {
  client.getListing.mockResolvedValue({
    listing: { ...listing, title: "" },
    raw: null,
  });
  await expect(scanOneListing(params)).resolves.toEqual({
    listingId: "123456789012",
    fit: false,
    sellerReference: "seller-1",
  });
  expect(mocks.upsertScanListing).not.toHaveBeenCalled();
});

it("uses marketplace-specific metrics", async () => {
  client.getListing.mockResolvedValue({
    listing: { ...listing, itemSold: null, soldLast30Days: 200 },
    raw: null,
  });
  await expect(
    scanOneListing({ ...params, marketplace: "shop" })
  ).resolves.toMatchObject({ fit: true, isNew: true });
  expect(mocks.upsertScanListing).toHaveBeenCalledWith(
    expect.objectContaining({ marketplace: "shop", soldLast30Days: 200 })
  );
});

it("rethrows fetch failures without touching the store or the persona", async () => {
  client.getListing.mockRejectedValue(new Error("detail requested"));
  await expect(scanOneListing(params)).rejects.toThrow("detail requested");
  expect(manager.markUsed).not.toHaveBeenCalled();
  expect(mocks.upsertScanSeller).not.toHaveBeenCalled();
  expect(mocks.upsertScanListing).not.toHaveBeenCalled();
});
