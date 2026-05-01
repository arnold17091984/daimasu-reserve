import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Shim Next's `server-only` guard so domain/security modules can be
      // imported in unit tests. The guard is a build-time check, not runtime.
      "server-only": path.resolve(__dirname, "./tests/__shims__/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
  },
});
