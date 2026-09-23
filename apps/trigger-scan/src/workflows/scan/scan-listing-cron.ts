/** Saved-listing sweep (schedule managed in the dashboard). No waits or timestamps. */
import { schedules } from "@trigger.dev/sdk";
import { runEntityCron } from "./scan-sweep";

export const scanListingCron = schedules.task({
  id: "scan-listing-cron",
  machine: "micro",
  queue: { name: "scan-cron-listing", concurrencyLimit: 1 },
  retry: {
    maxAttempts: 2,
    outOfMemory: { machine: "small-1x" },
  },
  run: () => runEntityCron("listing"),
});
