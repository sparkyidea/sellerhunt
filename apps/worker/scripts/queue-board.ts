/**
 * Local-only Bull Board over the shared BullMQ Redis. Nothing here is
 * deployed — the dashboard is just a Redis client, so run it on your
 * machine against whichever Redis you can reach (local dev directly,
 * prod through an SSH tunnel). It can retry/delete jobs, which is
 * exactly why it stays off the worker's public HTTP surface.
 *
 *   bun scripts/queue-board.ts
 *   bun scripts/queue-board.ts --port 3050 --redis redis://localhost:63790
 *
 * Env: REDIS_QUEUE_URL from apps/worker/.env (dotenv), overridable by
 * the process environment or the --redis flag.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { createJobClient, QUEUES } from "@dashseller/job-client";
import { serve } from "bun";
import dotenv from "dotenv";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";

dotenv.config({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env"),
});

function flag(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value ?? fallback;
}

const redisUrl = flag(
  "redis",
  process.env.REDIS_QUEUE_URL ?? "redis://localhost:63790"
);
const port = Number(flag("port", "3050"));

const jobs = createJobClient(redisUrl);
const serverAdapter = new HonoAdapter(serveStatic);

createBullBoard({
  queues: Object.values(QUEUES).map(
    (name) => new BullMQAdapter(jobs.queue(name))
  ),
  serverAdapter,
});

const basePath = "/ui";
serverAdapter.setBasePath(basePath);

const app = new Hono();
app.route(basePath, serverAdapter.registerPlugin());
app.get("/", (c) => c.redirect(basePath));

serve({ port, fetch: app.fetch });

console.log(`Bull Board → http://localhost:${port}${basePath} (${redisUrl})`);
