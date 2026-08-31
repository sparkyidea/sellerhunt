import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    // The package ships a `test` script but has no suites yet; keep
    // `turbo run test` green until the first test lands.
    passWithNoTests: true,
  },
});
