/** Saved-keyword sweep (schedule managed in the dashboard). No waits or timestamps. */
import { schedules } from "@trigger.dev/sdk";
import { runEntityCron } from "./scan-sweep";

export const scanKeywordCron = schedules.task({
  id: "scan-keyword-cron",
  machine: "micro",
  queue: { name: "scan-cron-keyword", concurrencyLimit: 1 },
  retry: {
    maxAttempts: 2,
    outOfMemory: { machine: "small-1x" },
  },
  run: () => runEntityCron("keyword"),
});
