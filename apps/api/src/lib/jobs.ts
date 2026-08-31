import { env } from "@dashseller/env/server";
import { createJobClient } from "@dashseller/job-client";

/**
 * The ONE producer for this API process, created at boot and shared by the
 * webhook receiver and the tRPC context. Fail-fast by construction: with
 * Redis down an enqueue rejects immediately instead of buffering — callers
 * answer the marketplace/user honestly. Closed on shutdown in index.ts.
 */
export const jobs = createJobClient(env.REDIS_QUEUE_URL);
