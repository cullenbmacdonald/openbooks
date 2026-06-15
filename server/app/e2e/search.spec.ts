import { expect, test } from "@playwright/test";

// End-to-end happy path against the mock IRC/DCC servers (booted by
// e2e/global-setup.ts): load the app, search, download, verify the result
// shows up in History and the Library, and check the dark/light toggle
// persists.
//
// Selectors are role/text based (never Mantine class names) so this spec
// runs unchanged against both the pre-upgrade (master) app and the
// Mantine-9 app from later phases.
//
// The mock SearchBot always replies with its canned "The Great Gatsby"
// result set, regardless of the literal query text.

test("search, download, history, and color-scheme persistence", async ({
  page
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await page.goto("/");

  // App shell renders and connects to the mock IRC server.
  await expect(
    page.getByRole("heading", { name: /search a book to get started/i })
  ).toBeVisible();

  // --- Search ---
  const searchInput = page.getByPlaceholder("Search for a book.");
  await searchInput.fill("the great gatsby");
  await page.getByRole("button", { name: "Search" }).click();

  // Results table populates from the mock SearchBot response.
  const resultsTable = page.getByRole("table");
  await expect(resultsTable).toBeVisible({ timeout: 20_000 });
  await expect(
    resultsTable.getByText(/gatsby/i).first()
  ).toBeVisible();

  // --- History sidebar shows the query with a result count badge ---
  const historyEntry = page.getByRole("button", {
    name: /the great gatsby/i
  });
  await expect(historyEntry.first()).toBeVisible();
  await expect(historyEntry.first().getByText(/results/i)).toBeVisible();

  // --- Download ---
  const downloadButtons = page.getByRole("button", { name: "Download" });
  await expect(downloadButtons.first()).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await downloadButtons.first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename().toLowerCase()).toContain("gatsby");

  // --- Library sidebar shows the downloaded book ---
  await page.getByText("Previous Downloads").click();
  await expect(
    page.getByRole("button", { name: /gatsby/i }).first()
  ).toBeVisible({ timeout: 20_000 });

  // --- Dark / light mode toggle persists across reload ---
  // Mantine 9's localStorageColorSchemeManager() persists the resolved
  // scheme under the "mantine-color-scheme-value" localStorage key, and
  // MantineProvider reflects it on <html data-mantine-color-scheme="...">.
  const getStoredScheme = () =>
    page.evaluate(() => localStorage.getItem("mantine-color-scheme-value"));

  const getDomScheme = () =>
    page.evaluate(() =>
      document.documentElement.getAttribute("data-mantine-color-scheme")
    );

  const initialScheme = await getStoredScheme();

  const colorSchemeToggle = page.getByRole("button", {
    name: "Toggle color scheme"
  });
  await colorSchemeToggle.click();

  await expect.poll(getStoredScheme).not.toBe(initialScheme);
  const toggledScheme = await getStoredScheme();
  await expect.poll(getDomScheme).toBe(toggledScheme);

  await page.reload();

  await expect.poll(getStoredScheme).toBe(toggledScheme);
  await expect.poll(getDomScheme).toBe(toggledScheme);

  // No console.error or uncaught page errors over the whole flow.
  expect(consoleErrors, "no console.error or page errors").toEqual([]);
});
