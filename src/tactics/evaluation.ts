import { wilsonInterval } from "../core/stats";
import { DETECTORS } from "./index";
import type { DatasetItem, Label, Split, TacticsDataset } from "./dataset";
import { DEFAULT_DETECTOR_OPTIONS, type Detection, type DetectorId, type DetectorOptions } from "./types";

export interface Disagreement {
  id: string;
  kind: "false-positive" | "false-negative";
  label: Label;
  explanation: string | null;
  move: string;
  fenBefore: string;
}

export interface DetectorReport {
  detector: DetectorId;
  /** Items in the split (the denominator for coverage). */
  total: number;
  /** Items with a yes/no label (unsure and unlabeled are excluded from metrics). */
  labeled: number;
  unsure: number;
  unlabeled: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number | null;
  recall: number | null;
  /** 95% Wilson interval for precision: the honest statement of what the sample supports. */
  precisionInterval: { low: number; high: number } | null;
  recallInterval: { low: number; high: number } | null;
  /** How many items the detector fired on (labeled or not). */
  fired: number;
  disagreements: Disagreement[];
}

/**
 * Score detectors against human labels on one split. "unsure" labels are
 * reported but excluded from precision and recall, so ambiguous positions
 * neither reward nor punish the detector.
 */
export type Basis = "final" | "initial";

export function evaluateDetectors(
  dataset: TacticsDataset,
  split: Split,
  options: DetectorOptions = DEFAULT_DETECTOR_OPTIONS,
  basis: Basis = "final",
): DetectorReport[] {
  const items = dataset.items.filter((i) => i.split === split);
  return (Object.keys(DETECTORS) as DetectorId[]).map((detector) => scoreDetector(detector, items, options, basis));
}

function scoreDetector(detector: DetectorId, items: DatasetItem[], options: DetectorOptions, basis: Basis): DetectorReport {
  const report: DetectorReport = {
    detector,
    total: items.length,
    labeled: 0,
    unsure: 0,
    unlabeled: 0,
    tp: 0,
    fp: 0,
    fn: 0,
    tn: 0,
    precision: null,
    recall: null,
    precisionInterval: null,
    recallInterval: null,
    fired: 0,
    disagreements: [],
  };
  for (const item of items) {
    const detection: Detection | null = DETECTORS[detector](item.context, options);
    if (detection) report.fired++;
    const final = item.labels[detector];
    // "initial" scores the first answer given before any suggestion was shown. Labels
    // without a review record predate the assistant (blind tool), so they are their own initial.
    const label = final === null || basis === "final" ? final : (item.review?.[detector]?.initial ?? final);
    if (label === null) {
      report.unlabeled++;
      continue;
    }
    if (label === "unsure") {
      report.unsure++;
      continue;
    }
    report.labeled++;
    const actual = label === "yes";
    if (detection && actual) report.tp++;
    else if (detection && !actual) report.fp++;
    else if (!detection && actual) report.fn++;
    else report.tn++;
    if (Boolean(detection) !== actual) {
      report.disagreements.push({
        id: item.id,
        kind: detection ? "false-positive" : "false-negative",
        label,
        explanation: detection?.explanation ?? null,
        move: `${item.context.moveLabel}${item.context.move.san}`,
        fenBefore: item.context.fenBefore,
      });
    }
  }
  const predicted = report.tp + report.fp;
  const actualPositives = report.tp + report.fn;
  report.precision = predicted ? report.tp / predicted : null;
  report.recall = actualPositives ? report.tp / actualPositives : null;
  report.precisionInterval = wilsonInterval(report.tp, predicted);
  report.recallInterval = wilsonInterval(report.tp, actualPositives);
  return report;
}

/**
 * What the reviewed firings support about the precision target, in words that
 * can't be mistaken for a pass: only a lower confidence bound at the target counts.
 */
export function precisionStatus(r: DetectorReport, target = 0.9): string {
  const reviewed = r.tp + r.fp;
  if (reviewed === 0 || r.precision === null || !r.precisionInterval) return `no reviewed firings yet (${r.fired} fired), so precision is unknown`;
  const t = `${Math.round(target * 100)}%`;
  const low = `${(100 * r.precisionInterval.low).toFixed(0)}%`;
  if (r.precisionInterval.low >= target) return `lower bound ≥ ${t} on ${reviewed} reviewed firings`;
  if (r.precision >= target) return `point estimate ≥ ${t}, but the lower bound is ${low} on ${reviewed} reviewed firings: not yet supported`;
  return `below ${t} (lower bound ${low}) on ${reviewed} reviewed firings`;
}

/** A Markdown report: metrics table plus every disagreement, with a Lichess analysis link per position. */
export function formatReport(reports: DetectorReport[], split: Split, datasetNote: string, basis: Basis = "final"): string {
  const pct = (x: number | null) => (x === null ? "—" : `${(100 * x).toFixed(1)}%`);
  const ci = (i: { low: number; high: number } | null) => (i ? `${pct(i.low)}–${pct(i.high)}` : "—");
  const lines = [
    `# Tactical detector evaluation (${split} split, ${basis === "final" ? "final labels" : "first blind judgments"})`,
    "",
    datasetNote,
    "",
    split === "holdout"
      ? "Holdout result: the only split whose numbers may support the 90% precision gate."
      : "Development split: these numbers guide detector work. Only a holdout result can support the 90% precision gate.",
    "",
    "Coverage and accuracy are different things: *Reviewed* says how much of the split a person has judged; precision and recall are computed only on those judgments (unsure and unlabeled are excluded).",
    "",
    "| Detector | Items | Reviewed (yes/no) | Unsure | Unlabeled | Fired | TP | FP | FN | TN | Precision (95% CI) | Recall (95% CI) |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...reports.map(
      (r) =>
        `| ${r.detector} | ${r.total} | ${r.labeled} (${pct(r.total ? r.labeled / r.total : null)}) | ${r.unsure} | ${r.unlabeled} | ${r.fired} | ${r.tp} | ${r.fp} | ${r.fn} | ${r.tn} | ${pct(r.precision)} (${ci(r.precisionInterval)}) | ${pct(r.recall)} (${ci(r.recallInterval)}) |`,
    ),
    "",
    ...reports.map((r) => `- ${r.detector} precision target: ${precisionStatus(r)}`),
    "",
  ];
  for (const r of reports) {
    lines.push(`## Disagreements: ${r.detector} (${r.disagreements.length})`, "");
    for (const d of r.disagreements) {
      const url = `https://lichess.org/analysis/${d.fenBefore.replace(/ /g, "_")}`;
      lines.push(`- **${d.kind}** \`${d.id}\` ${d.move}, labeled *${d.label}*. ${d.explanation ?? "(detector silent)"} [position](${url})`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
