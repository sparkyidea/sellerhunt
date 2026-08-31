import { env } from "@dashseller/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import authRoutes from "./routes/auth";
import health from "./routes/health";
import trpcRoutes from "./routes/trpc";

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
app.route("/trpc", trpcRoutes);
app.route("/health", health);

export default app;
