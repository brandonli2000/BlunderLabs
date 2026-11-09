import { analyzeCurrentGame, blockRealApis, clickSquare, importPgn, PROMOTION_GAME, SCHOLARS_MATE, expect, test } from "./helpers";

test.beforeEach(async ({ page }) => blockRealApis(page));

test("imports a PGN, analyses it with Stockfish, and keeps everything after reload", async ({ page }) => {
  await importPgn(page, SCHOLARS_MATE);
  await expect(page).toHaveURL(/#\/game\/pgn%3A/); // a single imported game opens directly
  await expect(page.getByText("Alice – Bob")).toBeVisible();

  await analyzeCurrentGame(page);
  const nf6 = page.locator(".move-list").getByRole("button", { name: /Nf6/ });
  await expect(nf6).toContainText("??");

  // Keyboard navigation: End jumps to the final position, Home back to the start.
  await page.keyboard.press("End");
  await expect(page.locator(".ply-readout")).toHaveText("7/7");
  await page.keyboard.press("Home");
  await expect(page.locator(".ply-readout")).toHaveText("0/7");

  await nf6.click();
  await expect(page.locator(".readout-verdict")).toContainText("Blunder");

  await page.reload();
  await expect(page.getByText("Alice – Bob")).toBeVisible();
  await expect(page.getByText(/saved locally/)).toBeVisible(); // analysis restored, not recomputed
  await expect(page.locator(".move-list").getByRole("button", { name: /Nf6/ })).toContainText("??");
});

test("explores legal moves, including choosing an underpromotion, then returns to the game", async ({ page }) => {
  await importPgn(page, PROMOTION_GAME);
  await expect(page.locator(".ply-readout")).toHaveText("0/2");

  // An illegal target does nothing; the selection just moves.
  await clickSquare(page, "e7");
  await clickSquare(page, "e5");
  await expect(page.getByRole("region", { name: "Explored variation" })).toHaveCount(0);

  await clickSquare(page, "e7");
  await clickSquare(page, "e8");
  const picker = page.getByRole("dialog", { name: "Choose promotion piece" });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "Knight" }).click();

  const variation = page.getByRole("region", { name: "Explored variation" });
  await expect(variation).toContainText("1.e8=N+");
  await expect(page.getByText(/Live · depth \d+/)).toBeVisible(); // Stockfish lines for the explored position

  await page.keyboard.press("Escape");
  await expect(variation).toHaveCount(0);
  await expect(page.locator(".ply-readout")).toHaveText("0/2");

  // Playing the game's own move advances the main line instead of starting a variation.
  await clickSquare(page, "e1");
  await clickSquare(page, "d2");
  await expect(page.locator(".ply-readout")).toHaveText("1/2");
});

test("shows a helpful page for a game that isn't in the library", async ({ page }) => {
  await page.goto("/#/game/lichess%3AMISSING1");
  await expect(page.getByText(/isn't in your library/)).toBeVisible();
  await page.getByRole("link", { name: "Back to library" }).click();
  await expect(page).toHaveURL(/#\/$/);
});

test("plays moves typed on the keyboard, and explains illegal ones", async ({ page }) => {
  await importPgn(page, PROMOTION_GAME);
  const input = page.getByLabel(/type a move/);

  await input.fill("Qh5");
  await input.press("Enter");
  await expect(page.getByRole("alert")).toContainText("isn't a legal move here");

  await input.fill("Kd2"); // the game move: advances the main line
  await input.press("Enter");
  await expect(page.locator(".ply-readout")).toHaveText("1/2");

  await input.fill("Kg6"); // not the game move (1...Kf6): starts a variation
  await input.press("Enter");
  await expect(page.getByRole("region", { name: "Explored variation" })).toContainText("1…Kg6");
  await expect(input).toBeFocused(); // keyboard users stay in the input
});
