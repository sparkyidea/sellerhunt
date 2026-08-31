import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.integration.test.ts"],
    // Suites share one database and one Redis — never run files in parallel.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
