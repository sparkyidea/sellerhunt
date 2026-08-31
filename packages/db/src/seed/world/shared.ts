import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/node-postgres";

export const CHUNK_SIZE = 500;

export type Db = ReturnType<typeof drizzle>;

export function makeDb(): Db {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  return drizzle(process.env.DATABASE_URL);
}

export async function downloadToFile(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

export function unzipTo(zipPath: string, destDir: string) {
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", destDir], {
    stdio: ["ignore", "ignore", "inherit"],
  });
}

export function emptyToNull(value: string | undefined): string | null {
  return value === undefined || value === "" ? null : value;
}

export function numberOrNull(value: string | undefined): number | null {
  if (value === undefined || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/** Key for city dedup: (countryId | stateCode | placeName). */
export function cityKey(
  countryId: string,
  stateCode: string | null,
  placeName: string
): string {
  return `${countryId}|${stateCode ?? ""}|${placeName}`;
}

/** Key for state lookup: (countryId | code). */
export function stateKey(countryId: string, code: string): string {
  return `${countryId}|${code}`;
}
