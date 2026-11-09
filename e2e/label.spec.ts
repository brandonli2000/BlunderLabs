import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { parseDataset, type TacticsDataset } from "../src/tactics/dataset";
import { expect, test } from "./helpers";

/**
 * /label.html is a dev-only tool, but its output feeds the detector evaluation, so
 * a silent bug (a label saved on the wrong item, a key that fires while typing)
 * would corrupt the evidence. These tests drive it in a real browser.
 *
 * The dataset is a small slice of the real *unlabeled* file, served by route
 * interception. Labels set here live only in the test browser's localStorage and
 * in a temporary download; nothing is written to the repository.
 */
const REAL = parseDataset(readFileSync(new URL("../bench/tactics/dataset-v1.json", import.meta.url), "utf8"));

function slice(devCount: number, holdoutCount: number): TacticsDataset {
  const items = [
    ...REAL.items.filter((i) => i.split === "dev").slice(0, devCount),
    ...REAL.items.filter((i) => i.split === "holdout").slice(0, holdoutCount),
  ];
  // Fresh createdAt per slice so localStorage keys never collide between tests.
  return { ...REAL, createdAt: `e2e-${devCount}-${holdoutCount}`, items };
}

async function openLabeler(page: Page, dataset: TacticsDataset = slice(4, 2)): Promise<void> {
  await page.route("**/bench/tactics/dataset-v1.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(dataset) }));
  await page.goto("/label.html");
  await expect(page.locator(".mt-mono")).toBeVisible();
}

const progress = (page: Page) => page.locator(".mt-mono");
const panel = (page: Page, title: string) => page.locator("section.panel", { hasText: title });
const pressed = (page: Page, title: string, label: string) => panel(page, title).getByRole("button", { name: new RegExp(`^${label}`) });

test("loads the dataset on the dev split with nothing labeled", async ({ page }) => {
  await openLabeler(page);
  await expect(progress(page)).toHaveText("1/4 · 0 fully labeled");
  await expect(page.getByLabel("Split")).toHaveValue("dev");
  // Blind by design: no detector output and no engine lines until asked.
  await expect(page.getByText("Engine before:")).toHaveCount(0);
});

test("labels with the keyboard, keeps labels per item, and counts fully labeled items", async ({ page }) => {
  await openLabeler(page);
  await page.keyboard.press("1"); // hanging: yes
  await page.keyboard.press("5"); // missed capture: no
  await expect(pressed(page, "Left hanging", "yes")).toHaveClass(/btn-primary/);
  await expect(pressed(page, "Missed capture", "no")).toHaveClass(/btn-primary/);
  await expect(progress(page)).toHaveText("1/4 · 1 fully labeled");

  await page.keyboard.press("ArrowRight");
  await expect(progress(page)).toHaveText("2/4 · 1 fully labeled");
  await expect(pressed(page, "Left hanging", "yes")).not.toHaveClass(/btn-primary/);
  await page.keyboard.press("3"); // hanging: unsure, on item 2 only

  await page.keyboard.press("ArrowLeft");
  await expect(pressed(page, "Left hanging", "yes")).toHaveClass(/btn-primary/);
  await expect(pressed(page, "Left hanging", "unsure")).not.toHaveClass(/btn-primary/);

  // Relabeling replaces the earlier answer for that question only.
  await page.keyboard.press("2");
  await expect(pressed(page, "Left hanging", "no")).toHaveClass(/btn-primary/);
  await expect(pressed(page, "Left hanging", "yes")).not.toHaveClass(/btn-primary/);
  await expect(pressed(page, "Missed capture", "no")).toHaveClass(/btn-primary/);
});

test("n jumps to the next unlabeled item and navigation is clamped at both ends", async ({ page }) => {
  await openLabeler(page);
  await page.keyboard.press("ArrowLeft");
  await expect(progress(page)).toHaveText("1/4 · 0 fully labeled");
  await page.keyboard.press("2");
  await page.keyboard.press("5");
  await page.keyboard.press("ArrowRight"); // item 2
  await page.keyboard.press("n"); // item 3 is the next unlabeled after 2
  await expect(progress(page)).toHaveText("3/4 · 1 fully labeled");
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await expect(progress(page)).toHaveText("4/4 · 1 fully labeled");
});

test("the engine hint and after-position are hidden again after moving to another item", async ({ page }) => {
  await openLabeler(page);
  await page.keyboard.press("e");
  await expect(page.getByText("Engine before:")).toBeVisible();
  await page.keyboard.press("a");
  await expect(page.getByText("Position after the move.")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Engine before:")).toHaveCount(0);
  await expect(page.getByText(/Position before the move/)).toBeVisible();
});

test("switching split resets the view and does not leak the engine hint", async ({ page }) => {
  await openLabeler(page);
  await page.keyboard.press("e");
  await expect(page.getByText("Engine before:")).toBeVisible();
  await page.getByLabel("Split").selectOption("holdout");
  await expect(progress(page)).toHaveText("1/2 · 0 fully labeled");
  await expect(page.getByText("Engine before:")).toHaveCount(0);
  // Focus must not stay trapped in the <select>: labeling keys work straight away.
  await page.keyboard.press("1");
  await page.keyboard.press("4");
  await expect(progress(page)).toHaveText("1/2 · 1 fully labeled");
});

test("keys typed into form fields never label or navigate", async ({ page }) => {
  await openLabeler(page);
  await page.getByPlaceholder("Your name (labeler)").fill("ann 1 2 3 4 5 6 a e n");
  await expect(progress(page)).toHaveText("1/4 · 0 fully labeled");
  await expect(page.getByText("Engine before:")).toHaveCount(0);

  // A focused <select> uses letters for type-ahead; they must not also drive the tool.
  await page.getByLabel("Split").focus();
  await page.keyboard.press("a");
  await page.keyboard.press("e");
  await page.keyboard.press("n");
  await expect(progress(page)).toHaveText("1/4 · 0 fully labeled");
  await expect(page.getByText("Engine before:")).toHaveCount(0);
  await expect(page.getByText(/Position before the move/)).toBeVisible();
});

test("Enter in the name field returns to keyboard labeling", async ({ page }) => {
  await openLabeler(page);
  await page.getByPlaceholder("Your name (labeler)").fill("ann");
  await page.keyboard.press("Enter");
  await page.keyboard.press("1");
  await page.keyboard.press("4");
  await expect(progress(page)).toHaveText("1/4 · 1 fully labeled");
  await expect(page.getByPlaceholder("Your name (labeler)")).toHaveValue("ann");
});

test("browser shortcuts with modifier keys are not hijacked", async ({ page }) => {
  await openLabeler(page);
  await page.keyboard.press("ArrowRight"); // item 2, so a stray navigation would show
  // Synthetic events: deterministic, unlike how browsers report modifier chords.
  const press = (key: string, modifier: string) =>
    page.evaluate(([k, m]) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k!, [m!]: true })), [key, modifier]);
  for (const key of ["a", "e", "n", "1", "4", "ArrowLeft", "ArrowRight"]) {
    for (const modifier of ["ctrlKey", "metaKey", "altKey"]) await press(key, modifier);
  }
  await expect(progress(page)).toHaveText("2/4 · 0 fully labeled");
  await expect(page.getByText("Engine before:")).toHaveCount(0);
  await expect(page.getByText(/Position before the move/)).toBeVisible();
});

test("labels survive a reload", async ({ page }) => {
  await openLabeler(page);
  await page.keyboard.press("1");
  await page.keyboard.press("6");
  await expect(progress(page)).toHaveText("1/4 · 1 fully labeled");
  await page.reload();
  await expect(progress(page)).toHaveText("1/4 · 1 fully labeled");
  await expect(pressed(page, "Left hanging", "yes")).toHaveClass(/btn-primary/);
  await expect(pressed(page, "Missed capture", "unsure")).toHaveClass(/btn-primary/);
});

test("exports a valid dataset with exactly the labels given and null elsewhere", async ({ page }) => {
  const dataset = slice(4, 2);
  await openLabeler(page, dataset);
  await page.getByPlaceholder("Your name (labeler)").fill("e2e-tester");
  await page.keyboard.press("Enter");
  await page.keyboard.press("1");
  await page.keyboard.press("5");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("3"); // only the hanging question on item 2

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export labels" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("dataset-v1.labeled.json");
  const exported = parseDataset(readFileSync((await file.path())!, "utf8"));

  expect(exported.labeler).toBe("e2e-tester");
  expect(exported.items.map((i) => i.id)).toEqual(dataset.items.map((i) => i.id));
  const [a, b, ...rest] = exported.items;
  expect(a!.labels).toEqual({ "hanging-piece": "yes", "missed-capture": "no" });
  expect(b!.labels).toEqual({ "hanging-piece": "unsure", "missed-capture": null });
  expect(rest.every((i) => i.labels["hanging-piece"] === null && i.labels["missed-capture"] === null)).toBe(true);
  // Everything except labels and labeler is passed through untouched.
  expect(exported.items.map((i) => i.context)).toEqual(dataset.items.map((i) => i.context));
});

test("an exported file can be reopened and its labels are the starting point", async ({ page }) => {
  const dataset = slice(3, 1);
  const labeled: TacticsDataset = {
    ...dataset,
    createdAt: "e2e-reopen",
    labeler: "someone",
    items: dataset.items.map((it, i) => (i === 0 ? { ...it, labels: { "hanging-piece": "no", "missed-capture": "yes" } } : it)),
  };
  await openLabeler(page, dataset);
  await page.locator("input[type=file]").setInputFiles({
    name: "labeled.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(labeled)),
  });
  await expect(progress(page)).toHaveText("1/3 · 1 fully labeled");
  await expect(pressed(page, "Left hanging", "no")).toHaveClass(/btn-primary/);
  await expect(pressed(page, "Missed capture", "yes")).toHaveClass(/btn-primary/);
});

test("shows a readable error for a file that is not a dataset", async ({ page }) => {
  await page.route("**/bench/tactics/dataset-v1.json", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/label.html");
  await expect(page.getByText(/No bench\/tactics\/dataset-v1.json yet/)).toBeVisible();

  await page.getByText("Open dataset…").locator("input").setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from('{"hello":1}') });
  await expect(page.getByText("Not a BlunderLab tactics dataset.")).toBeVisible();

  await page.getByText("Open dataset…").locator("input").setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from("not json") });
  await expect(page.getByText("Not valid JSON.")).toBeVisible();
});

test("an empty split says so and the user can switch back", async ({ page }) => {
  await openLabeler(page, slice(2, 0));
  await page.getByLabel("Split").selectOption("holdout");
  await expect(page.getByText("No items in the holdout split.")).toBeVisible();
  await page.getByLabel("Split").selectOption("dev");
  await expect(progress(page)).toHaveText("1/2 · 0 fully labeled");
});

test("the real dataset file loads unmodified, and every shipped label is still null", async ({ page }) => {
  const devCount = REAL.items.filter((i) => i.split === "dev").length;
  // Guard against ever committing fabricated labels into the generated file.
  expect(REAL.labeler).toBeNull();
  expect(REAL.items.every((i) => i.labels["hanging-piece"] === null && i.labels["missed-capture"] === null)).toBe(true);
  await page.goto("/label.html");
  await expect(progress(page)).toHaveText(`1/${devCount} · 0 fully labeled`);
});
