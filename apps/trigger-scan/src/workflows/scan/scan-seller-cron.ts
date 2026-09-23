/** Saved-seller sweep (schedule managed in the dashboard). No waits or timestamps. */
import { schedules } from "@trigger.dev/sdk";
import { runEntityCron } from "./scan-sweep";

export const scanSellerCron = schedules.task({
  id: "scan-seller-cron",
  machine: "micro",
  queue: { name: "scan-cron-seller", concurrencyLimit: 1 },
  retry: {
    maxAttempts: 2,
    outOfMemory: { machine: "small-1x" },
  },
  run: () => runEntityCron("seller"),
});
