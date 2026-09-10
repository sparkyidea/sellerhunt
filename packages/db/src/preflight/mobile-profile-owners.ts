/** Read-only prerequisite for the active-owner unique index. Never chooses a survivor. */
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { createDbClient } from "../client";

dotenv.config({
  path: fileURLToPath(new URL("../../../../apps/api/.env", import.meta.url)),
  quiet: true,
});
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for ownership preflight");
}
const { db, close } = createDbClient(connectionString);
try {
  const conflicts = await db.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    return await tx.execute<{
      app: string;
      label: string;
      owners: string[];
    }>(sql`
      select app, label, array_agg(id order by id) as owners
      from mobile_profile
      where status = 'active' and label is not null
      group by app, label having count(*) > 1
      order by app, label
    `);
  });
  if (conflicts.rows.length > 0) {
    console.error(
      "Conflicting active persona owners; resolve explicitly before applying the index:",
      conflicts.rows
    );
    process.exitCode = 1;
  } else {
    console.log("Ownership preflight passed: no duplicate active owners.");
  }
} finally {
  await close();
}
