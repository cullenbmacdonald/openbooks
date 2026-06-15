import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  // Fast Refresh's preamble isn't set up under Vitest, which makes
  // @vitejs/plugin-react throw ("can't detect preamble") as soon as any
  // component using it is imported. Disable it for the test runner only;
  // dev/build are unaffected.
  plugins: [react({ fastRefresh: !process.env.VITEST })],
  base: "./",
  resolve: {
    alias: process.env.VITEST
      ? {
          // @mantine/emotion's ssr.mjs pulls in html-react-parser ->
          // html-dom-parser purely for Next.js SSR helpers (ServerStyles,
          // createGetInitialProps, getSSRStyles) that this app never uses.
          // Under environment: "jsdom", html-dom-parser resolves to its
          // browser/client build, which calls
          // document.implementation.createHTMLDocument() and
          // document.createElement('template') at *import time* and throws
          // InvalidCharacterError with this project's jsdom version. Stub
          // the module out for tests so importing @mantine/emotion doesn't
          // pull in this unused, incompatible SSR-only dependency.
          "html-react-parser": path.resolve(
            __dirname,
            "./src/test/html-react-parser-stub.ts"
          )
        }
      : undefined
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    exclude: ["**/node_modules/**", "**/e2e/**"],
    // Force @mantine/emotion (and its transitive html-react-parser /
    // html-dom-parser deps) through Vite's transform pipeline rather than
    // Vitest's default Node `require` for externalized deps, so the
    // `html-react-parser` alias above actually applies. See the alias
    // comment for why this is necessary.
    server: {
      deps: {
        inline: ["@mantine/emotion", "html-react-parser", "html-dom-parser"]
      }
    }
  }
});
