import { beforeEach, expect, it, vi } from "vitest";
import type { ScanSessionResources } from "../scan-session";

const mocks = vi.hoisted(() => {
  let localValue: unknown;
  return {
    metadataDel: vi.fn(),
    metadataSet: vi.fn(),
    setMachineMetadata: vi.fn(),
    getLocal: vi.fn(() => localValue),
    setLocal: vi.fn((_key: unknown, value: unknown) => {
      localValue = value;
      return value;
    }),
    resetLocal: () => {
      localValue = undefined;
    },
  };
});

vi.mock("@trigger.dev/sdk", () => ({
  locals: {
    create: vi.fn(() => ({ id: "scan-session" })),
    get: mocks.getLocal,
    set: mocks.setLocal,
  },
  metadata: {
    del: mocks.metadataDel,
    set: mocks.metadataSet,
  },
}));
vi.mock("../machine-metadata", () => ({
  setMachineMetadata: mocks.setMachineMetadata,
}));
vi.mock("../mobile-profile-manager", () => ({
  MobileProfileTokenManager: {},
}));

import {
  createScanSession,
  resumeScanSession,
  ScanSession,
} from "../scan-session";

function resources(profileId: number): ScanSessionResources {
  return {
    client: {
      getListing: vi.fn(),
      getMarketplaceId: vi.fn(() => "ebay"),
      getSeller: vi.fn(),
      getSellerListings: vi.fn(),
      searchListings: vi.fn(),
    },
    manager: { profileId } as unknown as ScanSessionResources["manager"],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resetLocal();
});

it("uses the new worker profile and credential set after migration", async () => {
  const resourcesA = resources(1);
  const resourcesB = resources(2);
  const requests: {
    credentialSet: string;
    profileId: number;
    worker: string;
  }[] = [];
  vi.mocked(resourcesA.client.getMarketplaceId).mockImplementation(() => {
    requests.push({ worker: "worker-a", profileId: 1, credentialSet: "set-a" });
    return "ebay";
  });
  vi.mocked(resourcesB.client.getMarketplaceId).mockImplementation(() => {
    requests.push({ worker: "worker-b", profileId: 2, credentialSet: "set-b" });
    return "ebay";
  });
  const loader = vi
    .fn()
    .mockResolvedValueOnce(resourcesA)
    .mockResolvedValueOnce(resourcesB);
  const session = new ScanSession("ebay", loader);

  const beforeCheckpoint = await session.get();
  beforeCheckpoint.client.getMarketplaceId();
  session.invalidate();
  const afterResume = await session.get();
  afterResume.client.getMarketplaceId();

  expect(requests).toEqual([
    { worker: "worker-a", profileId: 1, credentialSet: "set-a" },
    { worker: "worker-b", profileId: 2, credentialSet: "set-b" },
  ]);
  expect(loader).toHaveBeenCalledTimes(2);
});

it("rebuilds the client even when the task resumes on the same worker", async () => {
  const loader = vi.fn(async () => resources(1));
  const session = new ScanSession("ebay", loader);

  const first = await session.get();
  session.invalidate();
  const second = await session.get();

  expect(second).not.toBe(first);
  expect(loader).toHaveBeenCalledTimes(2);
});

it("invalidates restored resources and clears stale metadata on resume", async () => {
  const session = createScanSession("ebay");
  const invalidate = vi.spyOn(session, "invalidate");
  mocks.setMachineMetadata.mockResolvedValue("worker-b");

  await resumeScanSession();

  expect(invalidate).toHaveBeenCalledOnce();
  expect(mocks.metadataDel).toHaveBeenCalledWith("profileId");
  expect(mocks.setMachineMetadata).toHaveBeenCalledOnce();
});

it("stops resume when the new worker identity cannot be discovered", async () => {
  const session = createScanSession("ebay");
  const invalidate = vi.spyOn(session, "invalidate");
  mocks.setMachineMetadata.mockResolvedValue(null);

  await expect(resumeScanSession()).rejects.toThrow(
    "cannot resolve box identity after resume"
  );
  expect(invalidate).toHaveBeenCalledOnce();
  expect(mocks.metadataDel).toHaveBeenCalledWith("profileId");
});
