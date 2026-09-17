import { describe, expect, it } from "bun:test";
import {
  BEARER_EXPIRING_MINUTES,
  bearerStateOf,
  splitBearerStateFilter,
} from "../bearer-state";

const NOW = new Date("2026-09-11T14:00:00.000Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

describe("bearerStateOf", () => {
  it("reports no bearer when the token is absent", () => {
    expect(
      bearerStateOf(
        { accessToken: null, accessTokenExpiresAt: minutes(60) },
        NOW
      )
    ).toBe("none");
  });

  it("reports valid outside the expiring window", () => {
    expect(
      bearerStateOf(
        { accessToken: "jwe", accessTokenExpiresAt: minutes(42) },
        NOW
      )
    ).toBe("valid");
  });

  it("reports expiring inside the window, boundary included", () => {
    expect(
      bearerStateOf(
        {
          accessToken: "jwe",
          accessTokenExpiresAt: minutes(BEARER_EXPIRING_MINUTES),
        },
        NOW
      )
    ).toBe("expiring");
    expect(
      bearerStateOf(
        { accessToken: "jwe", accessTokenExpiresAt: minutes(1) },
        NOW
      )
    ).toBe("expiring");
  });

  it("reports expired at and after the expiry instant", () => {
    expect(
      bearerStateOf({ accessToken: "jwe", accessTokenExpiresAt: NOW }, NOW)
    ).toBe("expired");
    expect(
      bearerStateOf(
        { accessToken: "jwe", accessTokenExpiresAt: minutes(-26) },
        NOW
      )
    ).toBe("expired");
  });

  it("treats a cached bearer with unknown expiry as expiring", () => {
    expect(
      bearerStateOf({ accessToken: "jwe", accessTokenExpiresAt: null }, NOW)
    ).toBe("expiring");
  });
});

describe("splitBearerStateFilter", () => {
  it("passes a column-only filter through untouched", () => {
    const filter = [
      { property: "app", condition: "eq" as const, value: "ebay" },
    ];
    expect(splitBearerStateFilter(filter)).toEqual({
      rest: filter,
      states: null,
    });
  });

  it("extracts an eq rule and leaves the column rules behind", () => {
    const { rest, states } = splitBearerStateFilter([
      { property: "app", condition: "eq", value: "ebay" },
      { property: "bearerState", condition: "eq", value: "expired" },
    ]);
    expect(states).toEqual(["expired"]);
    expect(rest).toEqual([{ property: "app", condition: "eq", value: "ebay" }]);
  });

  it("extracts inArray as a state set", () => {
    const { rest, states } = splitBearerStateFilter([
      {
        property: "bearerState",
        condition: "inArray",
        value: ["expiring", "expired"],
      },
    ]);
    expect(states).toEqual(["expiring", "expired"]);
    expect(rest).toBeNull();
  });

  it("inverts negative conditions", () => {
    expect(
      splitBearerStateFilter([
        { property: "bearerState", condition: "ne", value: "none" },
      ]).states
    ).toEqual(["valid", "expiring", "expired"]);
    expect(
      splitBearerStateFilter([
        {
          property: "bearerState",
          condition: "notInArray",
          value: ["valid", "expiring"],
        },
      ]).states
    ).toEqual(["expired", "none"]);
  });

  it("intersects repeated rules, as AND-ing them would", () => {
    expect(
      splitBearerStateFilter([
        {
          property: "bearerState",
          condition: "inArray",
          value: ["valid", "expiring"],
        },
        { property: "bearerState", condition: "ne", value: "valid" },
      ]).states
    ).toEqual(["expiring"]);
  });

  it("matches nothing for an unreadable rule instead of widening", () => {
    expect(
      splitBearerStateFilter([
        { property: "bearerState", condition: "eq", value: "bogus" },
      ]).states
    ).toEqual([]);
    expect(
      splitBearerStateFilter([
        { property: "bearerState", condition: "iLike", value: "valid" },
      ]).states
    ).toEqual([]);
  });

  it("leaves a nested rule in the tree for buildWhere to reject", () => {
    const filter = [
      {
        and: [
          { property: "bearerState", condition: "eq" as const, value: "none" },
        ],
      },
    ];
    expect(splitBearerStateFilter(filter)).toEqual({
      rest: filter,
      states: null,
    });
  });
});
