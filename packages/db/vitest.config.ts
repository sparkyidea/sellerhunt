import { defineConfig } from "vitest/config";

// Schema contract suites: pure drizzle table introspection, no database.
// Integration suites run separately via vitest.integration.config.ts.
export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
  },
});
