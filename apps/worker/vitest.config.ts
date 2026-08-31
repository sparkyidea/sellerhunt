import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    // Integration suites need live Postgres/Redis and run serialized via
    // vitest.integration.config.ts — never as part of the unit run.
    exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
    testTimeout: 15_000,
  },
});
