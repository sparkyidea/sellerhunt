import { describe, expect, it } from "vitest";
import { identifyEbayEvent } from "../identify";

/**
 * Captured verbatim from real production deliveries (2026-08-01/02). eBay
 * publishes no field contract for these topics, so these fixtures ARE the
 * contract.
 */
const REAL_ORDER_CONFIRMATION = {
  user: { userId: "y9qonyvfrqq", username: "mcd-toy" },
  order: {
    orderId: "11-14972-20806",
    orderLineItems: [
      {
        quantity: 1,
        listingId: "406447250843",
        orderLineItemId: "10083872001911",
      },
    ],
  },
};

const REAL_FEEDBACK_LEFT = {
  feedbackDetail: {
    feedbackId: "2923223469019",
    commentType: "POSITIVE",
    feedbackState: "ENTERED",
    providerUserDetail: {
      role: "SELLER",
      userId: "mcd-toy",
      feedbackScore: 3377,
    },
    feedbackEnteredDate: "2026-08-02T17:47:14.000Z",
    orderLineItemSummary: {
      listingId: "406974155377",
      orderLineItemId: "406974155377-10083749660019",
    },
  },
  receiverUserDetail: { role: "BUYER", userId: "manateeslikepie" },
};

describe("identifyEbayEvent", () => {
  it("attributes ORDER_CONFIRMATION via the opaque user id", () => {
    const id = identifyEbayEvent("ORDER_CONFIRMATION", REAL_ORDER_CONFIRMATION);

    // `y9qonyvfrqq` is channel.reference; `mcd-toy` is channel.displayName.
    expect(id.channelRefs).toContain("y9qonyvfrqq");
    expect(id.channelNames).toContain("mcd-toy");
    expect(id.resourceId).toBe("11-14972-20806");
  });

  it("attributes FEEDBACK_LEFT via the SELLER party, not position", () => {
    const id = identifyEbayEvent("FEEDBACK_LEFT", REAL_FEEDBACK_LEFT);

    // Here eBay's `userId` is the USERNAME, not the opaque id — the same
    // field name means different things per topic, so the value is offered as
    // both a reference and a name candidate.
    expect(id.channelNames).toContain("mcd-toy");
    expect(id.channelRefs).toContain("mcd-toy");
    // The buyer must never be treated as the channel.
    expect(id.channelNames).not.toContain("manateeslikepie");
    expect(id.channelRefs).not.toContain("manateeslikepie");
    expect(id.resourceId).toBe("2923223469019");
  });

  it("picks the SELLER when the roles are swapped (FEEDBACK_RECEIVED)", () => {
    const id = identifyEbayEvent("FEEDBACK_RECEIVED", {
      feedbackDetail: {
        feedbackId: "999",
        providerUserDetail: { role: "BUYER", userId: "some-buyer" },
        receiverUserDetail: { role: "SELLER", userId: "mcd-toy" },
      },
    });

    expect(id.channelNames).toEqual(["mcd-toy"]);
    expect(id.resourceId).toBe("999");
  });

  it("falls back to line-item ids when no feedbackId is present", () => {
    const id = identifyEbayEvent("FEEDBACK_STAR_RATING", {
      feedbackDetail: {
        providerUserDetail: { role: "SELLER", userId: "mcd-toy" },
        orderLineItemSummary: {
          orderLineItemId: "line-1",
          listingId: "listing-1",
        },
      },
    });

    expect(id.resourceId).toBe("line-1");
  });

  // Both topics disable the channel and delete its subscription rows, and eBay
  // sends account deletions for users who never authorized us — so the mutable
  // username must never be offered as a match key.
  it("attributes MARKETPLACE_ACCOUNT_DELETION by opaque id only, never username", () => {
    const id = identifyEbayEvent("MARKETPLACE_ACCOUNT_DELETION", {
      userId: "y9qonyvfrqq",
      username: "mcd-toy",
      eiasToken: "tok",
    });

    expect(id.channelRefs).toEqual(["y9qonyvfrqq"]);
    expect(id.channelNames).toEqual([]);
    expect(id.resourceId).toBe("y9qonyvfrqq");
  });

  it("attributes AUTHORIZATION_REVOCATION by opaque id only, never username", () => {
    const id = identifyEbayEvent("AUTHORIZATION_REVOCATION", {
      userId: "y9qonyvfrqq",
      username: "mcd-toy",
    });

    expect(id.channelRefs).toEqual(["y9qonyvfrqq"]);
    expect(id.channelNames).toEqual([]);
  });

  it("leaves AUTHORIZATION_REVOCATION unattributed if the shape differs", () => {
    const id = identifyEbayEvent("AUTHORIZATION_REVOCATION", {
      user: { userId: "y9qonyvfrqq" },
    });

    expect(id.channelRefs).toEqual([]);
    expect(id.channelNames).toEqual([]);
  });

  // Shapes below captured from real testSubscription deliveries, 2026-08-05.
  it("attributes ITEM_MARKED_SHIPPED through the nested wrapper", () => {
    const id = identifyEbayEvent("ITEM_MARKED_SHIPPED", {
      itemMarkedShipped: {
        itemId: "395913613059",
        orderId: "12-12455-13825",
        username: "seller123",
        publicUserId: "abc123",
        trackingNumber: "9361289688041608536524",
      },
    });

    expect(id.channelRefs).toEqual(["abc123"]);
    expect(id.channelNames).toEqual(["seller123"]);
    expect(id.resourceId).toBe("12-12455-13825");
  });

  it("attributes BUYER_QUESTION to the recipient only", () => {
    const id = identifyEbayEvent("BUYER_QUESTION", {
      messageId: "5498561796019",
      senderUserName: "pwz796",
      recipientUserName: "skyhome-de",
    });

    expect(id.channelNames).toEqual(["skyhome-de"]);
    expect(id.resourceId).toBe("5498561796019");
  });

  it("offers both parties for NEW_MESSAGE, which runs both directions", () => {
    const id = identifyEbayEvent("NEW_MESSAGE", {
      messageId: "5498561796019",
      senderUserName: "pwz796",
      recipientUserName: "skyhome-de",
    });

    expect(id.channelNames).toEqual(["skyhome-de", "pwz796"]);
  });

  // Real deliveries lowercase the `n`; the portal's test notifications above
  // capitalise it. Both spellings have to resolve.
  it("reads the lowercase `username` spelling real deliveries use", () => {
    const id = identifyEbayEvent("NEW_MESSAGE", {
      messageId: "5498561796019",
      senderUsername: "pwz796",
      recipientUsername: "skyhome-de",
    });

    expect(id.channelNames).toEqual(["skyhome-de", "pwz796"]);
  });

  // Captured verbatim from a real delivery, 2026-08-06. eBay's own
  // announcements name no seller, so they stay unattributed by design.
  it("leaves FROM_EBAY platform announcements unattributed", () => {
    const id = identifyEbayEvent("NEW_MESSAGE", {
      subject: "Jing, your August Seller News is here",
      messageId: "211136481844",
      conversationId: "211136481844",
      senderUsername: "eBay",
      conversationType: "FROM_EBAY",
    });

    expect(id.channelNames).toEqual(["eBay"]);
    expect(id.channelRefs).toEqual([]);
    expect(id.resourceId).toBe("211136481844");
  });

  it("returns empty candidates for a topic with no identifier", () => {
    const id = identifyEbayEvent("SELLER_STANDARDS_PROFILE_METRICS", {
      anything: true,
    });

    expect(id.channelRefs).toEqual([]);
    expect(id.channelNames).toEqual([]);
    expect(id.resourceId).toBeNull();
  });

  it("does not throw on a malformed payload", () => {
    expect(() => identifyEbayEvent("FEEDBACK_LEFT", {})).not.toThrow();
    expect(identifyEbayEvent("FEEDBACK_LEFT", {}).resourceId).toBeNull();
  });
});
