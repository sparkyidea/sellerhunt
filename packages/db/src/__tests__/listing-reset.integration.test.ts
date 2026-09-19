import { readdir, readFile } from "node:fs/promises";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { TEST_DATABASE_URL } from "../testing";

it("resets only listing data when upgrading a populated old schema", async () => {
  // Create and drop only this test-owned database, never the configured app DB.
  const name = `listing_reset_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: TEST_DATABASE_URL });
  const target = new URL(TEST_DATABASE_URL);
  target.pathname = `/${name}`;
  const pool = new Pool({ connectionString: target.toString() });
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    const folder = new URL("../migrations/", import.meta.url);
    const files = (await readdir(folder))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of files.filter((file) => file < "0006")) {
      await pool.query(await readFile(new URL(file, folder), "utf8"));
    }
    await pool.query(`
      INSERT INTO scan_seller (id, marketplace, reference) VALUES ('seller', 'ebay', 'seller');
      INSERT INTO scan_keyword (id, marketplace, keyword, source) VALUES ('keyword', 'ebay', 'camera', 'test');
      INSERT INTO scan_config (marketplace) VALUES ('ebay');
      INSERT INTO mobile_profile (app, credentials) VALUES ('ebay', 'opaque-test-credential');
      INSERT INTO "user" (id, name, email) VALUES ('user', 'Test', 'test@example.invalid');
      INSERT INTO "session" (id, token, user_id, expires_at, updated_at) VALUES ('session', 'test', 'user', now(), now());
      INSERT INTO scan_listing (id, marketplace, reference, title, seller_id, keyword_id, price)
        VALUES ('listing', 'ebay', 'listing', 'Camera', 'seller', 'keyword', 123);
      INSERT INTO scan_listing_variant (id, listing_id, reference, price) VALUES ('variant', 'listing', 'variant', 123);
      INSERT INTO scan_listing_snapshot (id, listing_id, price) VALUES ('snapshot', 'listing', 123);
    `);
    const preserved = [
      "scan_seller",
      "scan_keyword",
      "scan_config",
      "mobile_profile",
      "user",
      "session",
    ];
    const before = await Promise.all(
      preserved.map(
        async (table) => (await pool.query(`SELECT * FROM "${table}"`)).rows
      )
    );
    for (const file of files.filter((file) => file >= "0006")) {
      await pool.query(await readFile(new URL(file, folder), "utf8"));
    }
    for (const table of [
      "scan_listing",
      "scan_listing_variant",
      "scan_listing_variant_snapshot",
    ]) {
      expect((await pool.query(`SELECT * FROM "${table}"`)).rows).toEqual([]);
    }
    expect(
      (
        await pool.query(
          "SELECT to_regclass('public.scan_listing_snapshot') AS old"
        )
      ).rows[0].old
    ).toBeNull();
    for (const [index, table] of preserved.entries()) {
      expect((await pool.query(`SELECT * FROM "${table}"`)).rows).toEqual(
        before[index]
      );
    }
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.end();
  }
});
