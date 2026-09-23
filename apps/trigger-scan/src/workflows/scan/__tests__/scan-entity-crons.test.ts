import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  definitions: new Map<string, Record<string, unknown>>(),
  runEntityCron: vi.fn(),
}));
vi.mock("@trigger.dev/sdk", () => ({
  schedules: {
    task: (definition: { id: string }) => {
      mocks.definitions.set(definition.id, definition);
      return definition;
    },
  },
}));
vi.mock("../scan-sweep", () => ({ runEntityCron: mocks.runEntityCron }));

import "../scan-keyword-cron";
import "../scan-listing-cron";
import "../scan-seller-cron";

const ENTITIES = ["keyword", "seller", "listing"] as const;

it("registers one cron per entity without activating a schedule", () => {
  expect([...mocks.definitions.keys()].sort()).toEqual([
    "scan-keyword-cron",
    "scan-listing-cron",
    "scan-seller-cron",
  ]);
  for (const entity of ENTITIES) {
    expect(mocks.definitions.get(`scan-${entity}-cron`)).not.toHaveProperty(
      "cron"
    );
  }
});

it("gives every cron its own serialized queue", () => {
  const queues = ENTITIES.map(
    (entity) => mocks.definitions.get(`scan-${entity}-cron`)?.queue
  );
  expect(queues).toEqual([
    { name: "scan-cron-keyword", concurrencyLimit: 1 },
    { name: "scan-cron-seller", concurrencyLimit: 1 },
    { name: "scan-cron-listing", concurrencyLimit: 1 },
  ]);
});

it("delegates to the shared sweep with its own entity", async () => {
  for (const entity of ENTITIES) {
    mocks.runEntityCron.mockClear();
    const definition = mocks.definitions.get(`scan-${entity}-cron`) as {
      run: () => Promise<unknown>;
    };
    await definition.run();
    expect(mocks.runEntityCron).toHaveBeenCalledWith(entity);
  }
});
