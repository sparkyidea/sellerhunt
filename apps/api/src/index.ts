import { env } from "@dashseller/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { jobs } from "./lib/jobs";
import authRoutes from "./routes/auth";
import health from "./routes/health";
import oauthRoutes from "./routes/oauth";
import trpcRoutes from "./routes/trpc";
import uploadRoutes from "./routes/uploads";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.APP_URL,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Mount route modules
app.route("/api/auth", authRoutes);
app.route("/api/uploads", uploadRoutes);
app.route("/trpc", trpcRoutes);
app.route("/health", health);
app.route("/oauth", oauthRoutes);
// Marketplace webhooks are NOT here: they deliver straight to apps/worker
// (`${WEBHOOK_BASE_URL}/webhook/...`) — the API only registers them.

// The shared producer must flush/close before the process dies so
// in-flight enqueues aren't severed mid-command.
const closeProducer = () => {
  jobs.close().finally(() => process.exit(0));
};
process.on("SIGTERM", closeProducer);
process.on("SIGINT", closeProducer);

export default app;
