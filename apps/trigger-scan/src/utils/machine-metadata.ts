/**
 * Stamp the executing worker's identity onto run metadata so the dashboard
 * shows WHICH self-hosted machine ran each task. (We self-host: the worker
 * pulls tasks from the pool, so "which box ran this" is operationally useful.)
 *
 *   - `hostname`: OS hostname of the container/process — always available.
 *   - `boxName`:  worker box label from the boxinfo sidecar (e.g.
 *                 "w-00001-orc-..."), the fleet-meaningful machine id, when
 *                 the sidecar is reachable.
 *
 * Never throws: `getBoxName` returns null if the sidecar is unreachable;
 * `hostname` is set regardless. The old `boxName` is deleted first so a resumed
 * run can never display the previous worker after failed discovery.
 */
import { hostname } from "node:os";
import { metadata } from "@trigger.dev/sdk";
import { getBoxName } from "./box-name";

export async function setMachineMetadata(): Promise<string | null> {
  metadata.set("hostname", hostname());
  metadata.del("boxName");
  const boxName = await getBoxName();
  if (boxName) {
    metadata.set("boxName", boxName);
  }
  return boxName;
}
