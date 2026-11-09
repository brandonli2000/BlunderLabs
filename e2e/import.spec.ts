import type { Page } from "@playwright/test";
import { blockRealApis, fixture, expect, test } from "./helpers";

const LICHESS = /^https:\/\/lichess\.org\/api\/games\/user\/thibault\?/;

async function importFromLichess(page: Page, username: string) {
  await page.getByRole("tab", { name: "Lichess" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByRole("button", { name: "Import", exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await blockRealApis(page); // registered first, so specific routes below take priority
  await page.goto("/");
});

test("imports Lichess games from a recorded response, detects duplicates, and persists them", async ({ page }) => {
  await page.route(LICHESS, (route) =>
    route.fulfill({ status: 200, contentType: "application/x-chess-pgn", body: fixture("lichess-thibault-3.pgn") }),
  );
  await importFromLichess(page, "thibault");
  await expect(page.getByRole("status")).toContainText("3 new games");
  await expect(page.locator(".gl-row")).toHaveCount(3);

  await importFromLichess(page, "thibault");
  await expect(page.getByRole("status")).toContainText("0 new games · 3 already in library");
  await expect(page.locator(".gl-row")).toHaveCount(3);

  await page.reload();
  await expect(page.locator(".gl-row")).toHaveCount(3);
  await expect(page.locator(".panel-count").first()).toHaveText("3");
});

test("imports Chess.com games by walking monthly archives", async ({ page }) => {
  const archives = JSON.parse(fixture("chesscom-archives.json")) as { archives: string[] };
  await page.route("https://api.chess.com/pub/player/hikaru/games/archives", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(archives) }),
  );
  await page.route(archives.archives[1]!, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: fixture("chesscom-month.json") }),
  );
  await page.route(archives.archives[0]!, (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"games":[]}' }));

  await page.getByRole("tab", { name: "Chess.com" }).click();
  await page.getByLabel("Username").fill("Hikaru");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("3 new games");
  await expect(page.locator(".gl-row").first()).toContainText(/Hikaru/i);
  await expect(page.locator(".gl-row").first()).toContainText("Queens Gambit"); // opening name from ECOUrl
});

test("explains unknown accounts, rate limits, network failures and bad usernames", async ({ page }) => {
  let status = 404;
  await page.route(LICHESS, (route) => (status === 0 ? route.abort("failed") : route.fulfill({ status, body: "" })));

  await importFromLichess(page, "thibault");
  await expect(page.getByRole("alert")).toHaveText("No Lichess account named “thibault”.");

  status = 429;
  await importFromLichess(page, "thibault");
  await expect(page.getByRole("alert")).toContainText("rate-limiting");

  status = 0;
  await importFromLichess(page, "thibault");
  await expect(page.getByRole("alert")).toContainText("Couldn't reach Lichess");

  await importFromLichess(page, "bad name!");
  await expect(page.getByRole("alert")).toContainText("Usernames contain");
  await expect(page.locator(".gl-row")).toHaveCount(0);
});
