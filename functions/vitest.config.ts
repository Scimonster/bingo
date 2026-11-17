import { defineConfig } from "vitest/config";

// Integration tests: run against the Firestore/Auth/Storage emulators (see root `test:emulators`).
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
