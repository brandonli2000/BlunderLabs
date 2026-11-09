import { analyzeCurrentGame, blockRealApis, importPgn, SCHOLARS_MATE, expect, test } from "./helpers";

test.beforeEach(async ({ page }) => blockRealApis(page));

test("has a useful empty state before anything is analysed", async ({ page }) => {
  await page.goto("/#/mistakes");
  await expect(page.getByText(/No analysed games yet/)).toBeVisible();
});

test("collects mistakes across games and opens the exact position in review", async ({ page }) => {
  await importPgn(page, SCHOLARS_MATE);
  await analyzeCurrentGame(page);

  await page.getByRole("link", { name: "Mistakes" }).click();
  await expect(page).toHaveURL(/#\/mistakes$/);
  const row = page.getByRole("link", { name: "3…Nf6??" });
  await expect(row).toBeVisible();

  // Filtering out blunders hides it; turning them back on restores it.
  await page.getByText("?? Blunder").click();
  await expect(row).toHaveCount(0);
  await page.getByText("?? Blunder").click();
  await expect(row).toBeVisible();

  await row.click();
  await expect(page).toHaveURL(/#\/game\/pgn%3A[0-9a-f]+\/6$/);
  await expect(page.locator(".ply-readout")).toHaveText("6/7");
  await expect(page.locator(".readout-verdict")).toContainText("Blunder");

  await page.goBack();
  await expect(page.getByRole("link", { name: "3…Nf6??" })).toBeVisible();
});
