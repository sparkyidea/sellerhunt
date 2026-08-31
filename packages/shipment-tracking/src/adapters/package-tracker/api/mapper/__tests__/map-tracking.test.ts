import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { PackageTrackerTracking } from "../../../raw-types";
import { mapTracking } from "../map-tracking";

const US_STATE_CODE = /^[A-Z]{2}$/;

function loadFixture(name: string): PackageTrackerTracking {
  const url = new URL(`./fixtures/${name}.json`, import.meta.url);
  return JSON.parse(
    readFileSync(fileURLToPath(url), "utf8")
  ) as PackageTrackerTracking;
}

describe("mapTracking (package-tracker → Shippo shape)", () => {
  it("normalizes a delivered USPS shipment", () => {
    const tracking = loadFixture("delivered-usps");
    const result = mapTracking(tracking, "9402266365016206688141");

    expect(result.provider).toBe("package-tracker");
    expect(result.trackingNumber).toBe("9402266365016206688141");
    expect(result.status).toBe("delivered");
    expect(result.serviceLevelName).toBe("USPS Ground Advantage™");
    expect(result.serviceLevelToken).toBeNull();
    expect(result.metadata).toBeNull();
    expect(result.history.length).toBe(tracking.events.length);
    expect(result.history.at(-1)?.status).toBe("delivered");
    expect(result.history.at(-1)?.substatus).toBe("delivered");
  });

  it("normalizes a delivered UPS shipment with City, ST, Country locations", () => {
    const tracking = loadFixture("delivered-ups");
    const result = mapTracking(tracking, "1ZR642290323173161");

    expect(result.status).toBe("delivered");
    expect(result.history.at(-1)?.status).toBe("delivered");
    expect(result.history.at(-1)?.substatus).toBe("delivered");
    expect(result.history.at(-1)?.locationCity).toBe("NEW YORK");
    expect(result.history.at(-1)?.locationState).toBe("NY");
    expect(result.history.at(-1)?.locationCountry).toBe("US");
  });

  it("maps the 'pending' milestone with no events to status: unknown", () => {
    const tracking = loadFixture("pending");
    const result = mapTracking(tracking, "NOTAVALIDTRACKING12345");

    expect(result.status).toBe("unknown");
    expect(result.history).toEqual([]);
    expect(result.eta).toBeNull();
  });

  it("uses the upstream eventId verbatim as reference (stable across re-polls)", () => {
    const tracking = loadFixture("delivered-usps");
    const result = mapTracking(tracking, "X");

    for (const event of result.history) {
      expect(tracking.events.some((e) => e.eventId === event.reference)).toBe(
        true
      );
    }
    const refs = result.history.map((e) => e.reference);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("sorts history chronologically (earliest first)", () => {
    const tracking = loadFixture("delivered-usps");
    const result = mapTracking(tracking, "X");

    const times = result.history.map((e) => e.statusDate.getTime());
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
  });

  it("leaves structured location columns null for USPS facility events; raw `location` carries the facility string forward", () => {
    const tracking = loadFixture("delivered-usps");
    const result = mapTracking(tracking, "X");

    // Facility strings like "METRO NY DISTRIBUTION CENTER" can't be split
    // into city/state without guessing — the write-time resolver geocodes
    // the raw `location` value instead. statusDetails stays the carrier's
    // verbatim sentence; the facility name shows up as `location` in the
    // timeline UI, not appended to the description.
    const accepted = result.history.find(
      (e) => e.substatus === "package_accepted"
    );
    expect(accepted?.locationCity).toBeNull();
    expect(accepted?.locationState).toBeNull();
    expect(accepted?.location).toBe("METRO NY DISTRIBUTION CENTER");
    expect(accepted?.statusDetails).toBe(
      "Accepted at USPS Regional Origin Facility"
    );
  });

  it("passes the raw upstream location string through to the mapped event", () => {
    const tracking = loadFixture("delivered-usps");
    const result = mapTracking(tracking, "X");

    // Every event with a raw location upstream should round-trip it
    // verbatim; synth events (no upstream location) end up null.
    for (const event of result.history) {
      const upstream = tracking.events.find(
        (e) => e.eventId === event.reference
      );
      expect(event.location).toBe(upstream?.location ?? null);
    }
  });

  it("does not append a facility suffix when the event location is a clean City, ST ZIP", () => {
    const tracking = loadFixture("delivered-usps");
    const result = mapTracking(tracking, "X");

    const delivered = result.history.at(-1);
    expect(delivered?.statusDetails).toBe("Delivered, Front Door/Porch");
    expect(delivered?.locationCity).toBe("ELLWOOD CITY");
    expect(delivered?.locationState).toBe("PA");
    expect(delivered?.locationZip).toBe("16117");
  });

  it("refines per-event substatus from the free-text status sentence", () => {
    const tracking = loadFixture("delivered-usps");
    const result = mapTracking(tracking, "X");

    const outForDelivery = result.history.find(
      (e) => e.substatus === "out_for_delivery"
    );
    expect(outForDelivery?.status).toBe("transit");

    const arrived = result.history.find(
      (e) => e.substatus === "package_arrived"
    );
    expect(arrived?.status).toBe("transit");

    const departed = result.history.find(
      (e) => e.substatus === "package_departed"
    );
    expect(departed?.status).toBe("transit");

    const accepted = result.history.find(
      (e) => e.substatus === "package_accepted"
    );
    expect(accepted?.status).toBe("transit");
  });

  it("captures state codes on every event that has a city", () => {
    const tracking = loadFixture("delivered-ups");
    const result = mapTracking(tracking, "X");

    for (const event of result.history) {
      if (event.locationCity !== null) {
        expect(event.locationState).toMatch(US_STATE_CODE);
      }
    }
  });
});
