import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// https://vitejs.dev/config/
export default defineConfig({
  // Fast Refresh's preamble isn't set up under Vitest, which makes
  // @vitejs/plugin-react throw ("can't detect preamble") as soon as any
  // component using it is imported. Disable it for the test runner only;
  // dev/build are unaffected.
  plugins: [react({ fastRefresh: !process.env.VITEST })],
  base: "./",
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    exclude: ["**/node_modules/**", "**/e2e/**"]
  }
});
