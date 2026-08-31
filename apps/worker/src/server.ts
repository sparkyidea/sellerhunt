import type { JobClient } from "@dashseller/job-client";
import { QUEUES } from "@dashseller/job-client";
import type { SyncContext } from "@dashseller/sync";
import { serve } from "bun";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { collectStats, type WorkerCounters } from "./stats";
import {
  createWebhookPolicies,
  type WebhookMarketplace,
} from "./webhook/policy";
import { MAX_BODY_BYTES } from "./webhook/receive";
import { createWebhookRoutes } from "./webhook/routes";

export interface HttpServer {
  stop(): Promise<void>;
}

/**
 * The worker's public HTTP surface. Liveness (`/health`) answers as long
 * as the process runs; readiness (`/ready`) proves both dependencies: a
 * DB round-trip and a Redis ping through the producer connection.
 * `/stats` returns the operational snapshot the OPERATIONS.md alerts are
 * defined over. `/webhook/:marketplace` receives marketplace deliveries
 * directly — the API is not in the delivery path.
 */
export function startHttpServer(params: {
  config: {
    ebayVerificationToken: string;
    webhookBaseUrl: string;
  };
  counters: WorkerCounters;
  ctx: SyncContext;
  jobs: JobClient;
  port: number;
}): HttpServer {
  const { config, counters, ctx, jobs } = params;
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.get("/ready", async (c) => {
    try {
      await ctx.db.execute(sql`SELECT 1`);
      // A real Redis round-trip through the producer connection.
      await jobs.queue(QUEUES.syncControl).getWaitingCount();
      return c.json({ status: "ready" });
    } catch (error) {
      return c.json(
        {
          status: "unavailable",
          error: error instanceof Error ? error.message : String(error),
        },
        503
      );
    }
  });

  app.get("/stats", async (c) => {
    try {
      return c.json(await collectStats({ counters, ctx, jobs }));
    } catch (error) {
      return c.json(
        {
          status: "unavailable",
          error: error instanceof Error ? error.message : String(error),
        },
        503
      );
    }
  });

  const getAppCredentials = (marketplaceId: WebhookMarketplace) =>
    ctx.credentials.getAppCredentials(marketplaceId);
  app.route(
    "/webhook",
    createWebhookRoutes({
      db: ctx.db,
      jobs,
      getAppCredentials,
      policies: createWebhookPolicies({
        ebayVerificationToken: config.ebayVerificationToken,
        getAppCredentials,
      }),
      webhookBaseUrl: config.webhookBaseUrl,
    })
  );

  // Bun's default request-body cap is 128 MB; the handler-level size checks
  // buffer before they can reject, so the runtime bound is what actually
  // keeps a flood of oversized public requests out of memory. Bun answers
  // the excess with 413, matching the webhook policies' payloadTooLarge.
  const server = serve({
    port: params.port,
    fetch: app.fetch,
    maxRequestBodySize: MAX_BODY_BYTES,
  });

  return {
    stop: () => server.stop(true),
  };
}
