import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["bench/**/*.bench.ts"],
    testTimeout: 4 * 60 * 60 * 1000,
  },
});
