import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the OpenBooks web client.
 *
 * Uses the system-installed Chrome (`channel: "chrome"`) instead of
 * Playwright's bundled browsers — do NOT run `playwright install` locally,
 * it downloads browser binaries. CI installs its own ephemeral Chromium via
 * `playwright install --with-deps chromium`.
 *
 * `globalSetup`/`globalTeardown` (./e2e/global-setup.ts) build and boot the
 * mock IRC/DCC servers + a real `openbooks server` instance pointed at them,
 * and `baseURL` points at that server.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  reporter: "list",
  use: {
    baseURL: "http://localhost:5229",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Locally, use the system-installed Google Chrome so we never
        // trigger Playwright's bundled-browser download. CI installs
        // Playwright's own Chromium (`playwright install --with-deps
        // chromium`) and runs without a channel override.
        ...(process.env.CI ? {} : { channel: "chrome" })
      }
    }
  ]
});
