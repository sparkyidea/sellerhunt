import type { JobClient } from "@dashseller/job-client";
import type { SyncContext } from "@dashseller/sync";
import { registerControlProcessors } from "../control/dispatchers";
import type { Registry } from "../registry";
import {
  type ChannelsProcessorConfig,
  registerChannelProcessors,
} from "./channels";
import { registerListingProcessors } from "./listings";
import { registerOrderProcessors } from "./orders";
import type { ChannelApiClientFactory } from "./shared";
import { registerShipmentProcessors } from "./shipments";

export type WorkerProcessorConfig = ChannelsProcessorConfig;

/** All processor registrations across the five queues. */
export function registerProcessors(params: {
  apiClientFactory?: ChannelApiClientFactory;
  config: WorkerProcessorConfig;
  ctx: SyncContext;
  jobs: JobClient;
  registry: Registry;
}): void {
  registerOrderProcessors(params);
  registerListingProcessors(params);
  registerShipmentProcessors(params);
  registerChannelProcessors(params);
  registerControlProcessors(params);
}
