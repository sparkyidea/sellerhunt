import { env } from "@dashseller/env/db";
import { createDbClient } from "./client";

export const { db } = createDbClient(env.DATABASE_URL);
export type { Database } from "./client";
