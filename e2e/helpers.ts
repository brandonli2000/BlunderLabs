import { readFileSync } from "node:fs";
import { test as base, expect, type Page } from "@playwright/test";

export { expect };

/** Recorded real API responses shared with the unit tests. */
export function fixture(name: string): string {
  return readFileSync(new URL(`../src/import/fixtures/${name}`, import.meta.url), "utf8");
}

export const SCHOLARS_MATE = `[Event "E2E"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`;

/** White to move can promote on e8 (position from a FEN tag). */
export const PROMOTION_GAME = `[Event "Promotion"]
[White "Pawn"]
[Black "King"]
[SetUp "1"]
[FEN "8/4P1k1/8/8/8/8/8/4K3 w - - 0 1"]
[Result "*"]

1. Kd2 Kf6 *`;

/** Fail the test if the app ever tries to reach a real chess site. */
export async function blockRealApis(page: Page): Promise<void> {
  await page.route(/https:\/\/(lichess\.org|api\.chess\.com)\//, (route) =>
    route.fulfill({ status: 599, body: `unexpected real API call: ${route.request().url()}` }),
  );
}

export async function importPgn(page: Page, pgn: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("tab", { name: "PGN" }).click();
  await page.getByLabel("PGN text").fill(pgn);
  await page.getByRole("button", { name: "Import PGN" }).click();
}

/**
 * Click a board square by name, accounting for orientation. Clicking via the
 * locator (not raw mouse coordinates) makes Playwright scroll the board into view first.
 */
export async function clickSquare(page: Page, square: string, orientation: "w" | "b" = "w"): Promise<void> {
  const board = page.locator("svg.board").first();
  const box = (await board.boundingBox())!;
  const file = "abcdefgh".indexOf(square[0]!);
  const rank = Number(square[1]) - 1;
  const col = orientation === "w" ? file : 7 - file;
  const row = orientation === "w" ? 7 - rank : rank;
  await board.click({ position: { x: ((col + 0.5) * box.width) / 8, y: ((row + 0.5) * box.height) / 8 } });
}

export async function analyzeCurrentGame(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Analyze game" }).click();
  await expect(page.getByText(/saved locally/)).toBeVisible({ timeout: 60_000 });
}

/**
 * `test` with an automatic check: any console error or uncaught exception in
 * the page fails the test (e.g. React key warnings, unhandled rejections).
 * Network failures we provoke on purpose are ignored.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error" && !/Failed to load resource|net::ERR_/.test(msg.text())) errors.push(msg.text());
      });
      page.on("pageerror", (err) => errors.push(err.message));
      await use(errors);
      expect(errors, "console errors during the test").toEqual([]);
    },
    { auto: true },
  ],
});
