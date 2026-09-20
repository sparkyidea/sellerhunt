import type {
  ScanGetListingResult,
  ScanListing,
} from "@dashseller/marketplace-scan/types";
import { beforeEach, expect, it, vi } from "vitest";
import type { ScanConfig } from "../../../utils/scan-config";
import { scanOneListing } from "../scan-one-listing";
import { listing as fixture } from "./observation-fixtures";

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

vi.mock("../../../utils/db", () => ({ db: {} }));

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
const listing: ScanListing = fixture();
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
  mocks.upsertScanListing.mockResolvedValue({
    id: "stored-id",
    isNew: true,
  });
});

it("fetches the normalized id, persists a fitting listing and reports isNew", async () => {
  await expect(scanOneListing(params)).resolves.toEqual({
    listingId: "123456789012",
    sellerReference: "seller-1",
    scanListingId: "stored-id",
    isNew: true,
    title: "Camera",
    categoryPath: ["Cameras"],
    variantsDiscovered: 1,
  });
  expect(client.getListing).toHaveBeenCalledWith({ listingId: "123456789012" });
  expect(manager.markUsed).toHaveBeenCalledTimes(1);
  expect(mocks.upsertScanSeller).toHaveBeenCalledWith({
    marketplace: "ebay",
    reference: "seller-1",
  });
  expect(mocks.upsertScanListing).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      marketplace: "ebay",
      reference: "123456789012",
      sellerReference: "seller-1",
      title: "Camera",
      itemSold: 200,
    }),
    true
  );
});

it("passes below-threshold observations to the writer for existing listings", async () => {
  client.getListing.mockResolvedValue({
    listing: { ...listing, itemSold: 50 },
    raw: null,
  });
  await expect(scanOneListing(params)).resolves.toBeNull();
  expect(mocks.upsertScanSeller).not.toHaveBeenCalled();
  expect(mocks.upsertScanListing).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ itemSold: 50 }),
    false
  );
});

it("rejects invalid observations before persistence", async () => {
  client.getListing.mockResolvedValue({
    listing: { ...listing, title: "" },
    raw: null,
  });
  await expect(scanOneListing(params)).rejects.toThrow("Listing identity");
  expect(mocks.upsertScanListing).not.toHaveBeenCalled();
});

it("uses marketplace-specific metrics", async () => {
  client.getListing.mockResolvedValue({
    listing: {
      ...listing,
      marketplace: "shop",
      itemSold: null,
      soldLast30Days: 200,
    },
    raw: null,
  });
  await expect(
    scanOneListing({ ...params, marketplace: "shop" })
  ).resolves.toMatchObject({ isNew: true });
  expect(mocks.upsertScanListing).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ marketplace: "shop", soldLast30Days: 200 }),
    true
  );
});

it("rethrows fetch failures without touching the store or the persona", async () => {
  client.getListing.mockRejectedValue(new Error("detail requested"));
  await expect(scanOneListing(params)).rejects.toThrow("detail requested");
  expect(manager.markUsed).not.toHaveBeenCalled();
  expect(mocks.upsertScanSeller).not.toHaveBeenCalled();
  expect(mocks.upsertScanListing).not.toHaveBeenCalled();
});
