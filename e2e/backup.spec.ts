import { readFileSync } from "node:fs";
import { blockRealApis, fixture, importPgn, SCHOLARS_MATE, expect, test } from "./helpers";

test("backs up the library and restores it into an empty browser profile", async ({ page, browser }, testInfo) => {
  await blockRealApis(page);
  await importPgn(page, fixture("lichess-thibault-3.pgn"));
  await expect(page.locator(".gl-row")).toHaveCount(3);

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download backup" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^blunderlab-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = testInfo.outputPath("backup.json");
  await download.saveAs(file);
  const backup = JSON.parse(readFileSync(file, "utf8")) as { format: string; version: number; games: unknown[] };
  expect(backup).toMatchObject({ format: "blunderlab-backup", version: 1 });
  expect(backup.games).toHaveLength(3);

  // A fresh context has its own, empty IndexedDB, like another browser or a wiped profile.
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await blockRealApis(other);
  await importPgn(other, SCHOLARS_MATE); // the target library already has a game of its own
  await other.goto("/");
  await expect(other.locator(".gl-row")).toHaveCount(1);

  await other.getByText("Restore from backup…").locator("input").setInputFiles(file);
  const preview = other.getByRole("region", { name: "Restore preview" });
  await expect(preview).toContainText("would add 3 games");
  await expect(preview).toContainText("Nothing in your library is deleted or overwritten.");
  await preview.getByRole("button", { name: "Restore" }).click();
  await expect(other.getByRole("status")).toContainText("Restored 3 games");
  await expect(other.locator(".gl-row")).toHaveCount(4); // merged, own game kept

  // Restoring the same file again adds nothing.
  await other.getByText("Restore from backup…").locator("input").setInputFiles(file);
  await expect(other.getByRole("button", { name: "Nothing new to restore" })).toBeDisabled();
  await fresh.close();
});

test("rejects an invalid backup file and leaves the library untouched", async ({ page }, testInfo) => {
  await blockRealApis(page);
  await importPgn(page, SCHOLARS_MATE);
  await page.goto("/");
  await expect(page.locator(".gl-row")).toHaveCount(1);

  const bad = testInfo.outputPath("bad.json");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(bad, JSON.stringify({ format: "blunderlab-backup", version: 99, games: [], analyses: [] }));
  await page.getByText("Restore from backup…").locator("input").setInputFiles(bad);
  await expect(page.getByRole("alert")).toContainText("newer version of BlunderLab");

  writeFileSync(bad, "this is not json");
  await page.getByText("Restore from backup…").locator("input").setInputFiles(bad);
  await expect(page.getByRole("alert")).toContainText("isn't valid JSON");
  await expect(page.locator(".gl-row")).toHaveCount(1);
});
