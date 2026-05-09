import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["worker/test/**/*.test.ts", "pipeline/test/**/*.test.ts"],
    environment: "node",
    globals: false,
    reporters: "default",
  },
});
