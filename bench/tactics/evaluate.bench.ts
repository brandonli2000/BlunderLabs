/**
 * Score the tactical detectors against human labels.
 * Run: `npm run tactics:evaluate` (dev split) or `SPLIT=holdout npm run tactics:evaluate`.
 * Reads LABELS (default bench/tactics/labels/dataset-v1.labeled.json) and
 * writes bench/tactics/reports/<split>-<date>.md with metrics and every
 * disagreement (plus a second table on first blind judgments when the
 * assisted labeling tool was used). Use the dev split while developing; touch holdout only to
 * report a final number for a detector version.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { parseDataset, type Split } from "../../src/tactics/dataset";
import { evaluateDetectors, formatReport } from "../../src/tactics/evaluation";

it("evaluates detectors against labels", () => {
  const split = (process.env.SPLIT === "holdout" ? "holdout" : "dev") as Split;
  const path = process.env.LABELS ?? new URL("./labels/dataset-v1.labeled.json", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
  if (!existsSync(path)) {
    console.log(`No labeled dataset at ${path}. Label positions with /label.html first (see docs/tactics/labeling-guidelines.md).`);
    return;
  }
  const dataset = parseDataset(readFileSync(path, "utf8"));
  const reports = evaluateDetectors(dataset, split);
  const note = `Dataset: ${path} · labeler: ${dataset.labeler ?? "unknown"} · guidelines v${dataset.guidelinesVersion} · generated ${new Date().toISOString()}`;
  let md = formatReport(reports, split, note);
  // Judgments made with the assistant can anchor on its suggestion, so when review records
  // exist also score the first answers (given before any reveal) and compare.
  const assisted = dataset.items.some((i) => i.split === split && i.review && Object.keys(i.review).length > 0);
  if (assisted) md += "\n\n" + formatReport(evaluateDetectors(dataset, split, undefined, "initial"), split, note, "initial");
  mkdirSync(new URL("./reports/", import.meta.url), { recursive: true });
  const out = new URL(`./reports/${split}-${new Date().toISOString().slice(0, 10)}.md`, import.meta.url);
  writeFileSync(out, md);
  console.log(md.split("\n").slice(0, 8).join("\n"));
});
