import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.integration.test.ts"],
    // No integration suites ship today; the migrateTestDb harness in
    // testing.ts stays ready for migration/round-trip tests against the
    // service DB. Don't fail the run just because none exist yet.
    passWithNoTests: true,
    // Suites share one database — never run files in parallel.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
