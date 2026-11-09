import type { Page } from "@playwright/test";
import { blockRealApis, fixture, importPgn, expect, test } from "./helpers";

// Three real Lichess games (47, 24 and 47 positions): long enough to pause mid-run.
const THREE_GAMES = fixture("lichess-thibault-3.pgn");

const panel = (page: Page) => page.getByRole("region", { name: "Batch analysis" });

test.beforeEach(async ({ page }) => {
  await blockRealApis(page);
  await importPgn(page, THREE_GAMES);
  await expect(page.locator(".gl-row")).toHaveCount(3);
});

test("analyses all games, pauses, survives a reload, and resumes to completion", async ({ page }) => {
  await panel(page).getByRole("button", { name: "Analyze 3 unanalysed" }).click();
  await expect(panel(page).getByRole("progressbar")).toBeVisible();

  await panel(page).getByRole("button", { name: "Pause" }).click();
  await expect(panel(page)).toContainText("Paused");
  const pausedText = await panel(page).innerText();

  await page.reload();
  await expect(panel(page)).toContainText("Paused"); // pause state is persisted, not lost
  expect(pausedText).toMatch(/left/);

  await panel(page).getByRole("button", { name: "Resume" }).click();
  await expect(panel(page)).toContainText("Every game in the library has a saved analysis", { timeout: 80_000 });
  await expect(page.locator(".gl-tag-analyzed")).toHaveCount(3);
});

test("reports a job interrupted by closing the page and resumes only on request", async ({ page }) => {
  await panel(page).getByRole("button", { name: "Analyze 3 unanalysed" }).click();
  await expect(panel(page).getByRole("progressbar")).toBeVisible();

  await page.reload(); // simulates closing the tab mid-analysis
  await expect(panel(page)).toContainText("stopped when the page was closed");
  await expect(panel(page).getByRole("progressbar")).toHaveCount(0); // nothing runs by itself

  await panel(page).getByRole("button", { name: "Resume" }).click();
  await expect(panel(page)).toContainText("Every game in the library has a saved analysis", { timeout: 80_000 });
});

test("cancel stops the job and keeps finished analyses", async ({ page }) => {
  await panel(page).getByRole("button", { name: "Analyze 3 unanalysed" }).click();
  await expect(panel(page)).toContainText(/1 done/, { timeout: 60_000 });
  await panel(page).getByRole("button", { name: "Cancel" }).click();

  await expect(panel(page).getByRole("button", { name: /Analyze \d unanalysed/ })).toBeVisible();
  const analysed = await page.locator(".gl-tag-analyzed").count();
  expect(analysed).toBeGreaterThanOrEqual(1);
  expect(analysed).toBeLessThan(3);
});
