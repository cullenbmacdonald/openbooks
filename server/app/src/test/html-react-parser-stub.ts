// Stub for `html-react-parser`, used only under Vitest.
//
// `@mantine/emotion`'s `ssr.mjs` imports `html-react-parser` (transitively
// pulling in `html-dom-parser`) purely to support Next.js SSR helpers
// (`ServerStyles`, `createGetInitialProps`, `getSSRStyles`) that this app
// never uses — we don't render Mantine on the server.
//
// Under Vitest's `environment: "jsdom"`, `html-dom-parser` resolves to its
// browser/client build (via the package's "browser" export condition),
// which calls `document.implementation.createHTMLDocument()` and
// `document.createElement('template')` at *module import time*. That throws
// `InvalidCharacterError` with this project's jsdom version, which fails
// every test file that (transitively) imports `@mantine/emotion`.
//
// This stub is aliased in `vite.config.ts` (test-only) so importing
// `@mantine/emotion` doesn't pull in this unused, incompatible dependency.
// The real `html-react-parser` package is still used (via `ssr.mjs`) in the
// actual app build, where this alias does not apply.
export default function htmlReactParserStub(): null {
  return null;
}
