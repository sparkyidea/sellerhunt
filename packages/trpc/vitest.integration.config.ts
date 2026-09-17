import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.integration.test.ts"],
    // Points @dashseller/db at the service DB before any router import.
    setupFiles: ["./src/testing/setup-integration.ts"],
    // Suites share one database — never run files in parallel.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
