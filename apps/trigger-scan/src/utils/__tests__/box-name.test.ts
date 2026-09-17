import { beforeEach, expect, it, vi } from "vitest";
import { getBoxName } from "../box-name";

beforeEach(() => {
  vi.unstubAllGlobals();
});

it("discovers the worker again for every identity request", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response("worker-a"))
    .mockResolvedValueOnce(new Response("worker-b"));
  vi.stubGlobal("fetch", fetchMock);

  await expect(getBoxName()).resolves.toBe("worker-a");
  await expect(getBoxName()).resolves.toBe("worker-b");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("returns null instead of reusing an earlier identity after discovery fails", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response("worker-a"))
    .mockRejectedValueOnce(new Error("sidecar unavailable"));
  vi.stubGlobal("fetch", fetchMock);

  await expect(getBoxName()).resolves.toBe("worker-a");
  await expect(getBoxName()).resolves.toBeNull();
});
