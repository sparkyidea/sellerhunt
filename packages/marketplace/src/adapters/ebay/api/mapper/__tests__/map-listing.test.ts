import type { GetItemResponse } from "ebay-api/lib/types";
import { describe, expect, it } from "vitest";
import { mapListing } from "../map-listing";

function createMinimalItem(
  overrides: Partial<GetItemResponse["Item"]> = {}
): GetItemResponse["Item"] {
  return {
    ItemID: "123456789",
    Title: "Test Item",
    PrimaryCategory: { CategoryID: 12_345 },
    ConditionDisplayName: "New",
    ConditionID: 1000,
    ListingType: "FixedPriceItem",
    ListingDuration: "GTC",
    DispatchTimeMax: 1,
    Quantity: 10,
    SellingStatus: {
      ListingStatus: "Active",
      CurrentPrice: { value: 29.99 },
      QuantitySold: 2,
    },
    ListingDetails: {
      ViewItemURL: "https://www.ebay.com/itm/123456789",
      StartTime: "2026-01-01T00:00:00.000Z",
      EndTime: "2026-12-31T00:00:00.000Z",
    },
    ReturnPolicy: {
      ReturnsAcceptedOption: "ReturnsAccepted",
      ReturnsWithinOption: "Days_30",
      ShippingCostPaidBy: "Buyer",
    },
    ShippingDetails: {
      ShippingType: "Flat",
      ShippingServiceOptions: {
        ShippingService: "USPSPriority",
        ShippingServiceCost: 5.99,
      },
    },
    ...overrides,
  } as GetItemResponse["Item"];
}

describe("mapListing", () => {
  describe("description handling", () => {
    it("strips HTML tags from description to plain text", () => {
      const item = createMinimalItem({
        Description: "<h1>Great Product</h1><p>Fast shipping and quality!</p>",
      });
      const result = mapListing(item);

      expect(result.description).not.toContain("<h1>");
      expect(result.description).not.toContain("<p>");
      expect(result.description?.toLowerCase()).toContain("great product");
      expect(result.description).toContain("Fast shipping and quality!");
    });

    it("preserves raw HTML in descriptionHtml", () => {
      const html = "<h1>Great Product</h1><p>Fast shipping and quality!</p>";
      const item = createMinimalItem({ Description: html });
      const result = mapListing(item);

      expect(result.descriptionHtml).toBe(html);
    });

    it("handles empty description", () => {
      const item = createMinimalItem({ Description: "" });
      const result = mapListing(item);

      expect(result.description).toBe("");
      expect(result.descriptionHtml).toBeNull();
    });

    it("handles undefined description", () => {
      const item = createMinimalItem({ Description: undefined });
      const result = mapListing(item);

      expect(result.description).toBe("");
      expect(result.descriptionHtml).toBeNull();
    });

    it("converts HTML tables to readable text", () => {
      const item = createMinimalItem({
        Description:
          "<table><tr><td>Color</td><td>Red</td></tr><tr><td>Size</td><td>Large</td></tr></table>",
      });
      const result = mapListing(item);

      expect(result.description).toContain("Color");
      expect(result.description).toContain("Red");
      expect(result.description).toContain("Size");
      expect(result.description).toContain("Large");
      expect(result.description).not.toContain("<table>");
    });

    it("decodes HTML entities", () => {
      const item = createMinimalItem({
        Description: "<p>Tom &amp; Jerry &mdash; Best &lt;Friends&gt;</p>",
      });
      const result = mapListing(item);

      expect(result.description).toContain("Tom & Jerry");
      expect(result.description).toContain("<Friends>");
    });

    it("handles complex eBay listing HTML with styles and scripts", () => {
      const item = createMinimalItem({
        Description:
          '<style>.listing { color: red; }</style><div class="listing"><h2>Premium Widget</h2><script>alert("xss")</script><p>High quality</p></div>',
      });
      const result = mapListing(item);

      expect(result.description?.toLowerCase()).toContain("premium widget");
      expect(result.description).toContain("High quality");
      expect(result.description).not.toContain("<style>");
      expect(result.description).not.toContain("<script>");
      expect(result.description).not.toContain("alert");
      // Raw HTML preserved in descriptionHtml
      expect(result.descriptionHtml).toContain("<script>");
    });
  });

  describe("basic field mapping", () => {
    it("maps title and marketplace category reference", () => {
      const item = createMinimalItem({
        Title: "My eBay Item",
        PrimaryCategory: { CategoryID: "99999", CategoryName: "Test" },
      });
      const result = mapListing(item);

      expect(result.title).toBe("My eBay Item");
      expect(result.marketplaceCategoryReference).toBe("99999");
      expect(result).not.toHaveProperty("categoryId");
    });

    it("defaults marketplace category reference to '0' when missing", () => {
      const item = createMinimalItem({
        PrimaryCategory: undefined,
      });
      const result = mapListing(item);

      expect(result.marketplaceCategoryReference).toBe("0");
    });

    it("maps listing reference from ItemID", () => {
      const item = createMinimalItem({ ItemID: "987654321" });
      const result = mapListing(item);

      expect(result.reference).toBe("987654321");
    });

    it("creates single variant for non-variation listings", () => {
      const item = createMinimalItem();
      const result = mapListing(item);

      expect(result.listingVariants).toHaveLength(1);
      expect(result.variant).toBe(false);
    });
  });

  describe("sourceVersionAt", () => {
    it("uses the provided observation timestamp", () => {
      const observedAt = new Date("2026-08-02T15:00:00.000Z");
      const result = mapListing(createMinimalItem(), observedAt);

      expect(result.sourceVersionAt).toEqual(observedAt);
    });

    it("is null when no observation timestamp is provided", () => {
      const result = mapListing(createMinimalItem());

      expect(result.sourceVersionAt).toBeNull();
    });
  });
});
