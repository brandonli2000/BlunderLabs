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
export function evaluateDetectors(
  dataset: TacticsDataset,
  split: Split,
  options: DetectorOptions = DEFAULT_DETECTOR_OPTIONS,
): DetectorReport[] {
  const items = dataset.items.filter((i) => i.split === split);
  return (Object.keys(DETECTORS) as DetectorId[]).map((detector) => scoreDetector(detector, items, options));
}

function scoreDetector(detector: DetectorId, items: DatasetItem[], options: DetectorOptions): DetectorReport {
  const report: DetectorReport = {
    detector,
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
    const label = item.labels[detector];
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

/** A Markdown report: metrics table plus every disagreement, with a Lichess analysis link per position. */
export function formatReport(reports: DetectorReport[], split: Split, datasetNote: string): string {
  const pct = (x: number | null) => (x === null ? "—" : `${(100 * x).toFixed(1)}%`);
  const ci = (i: { low: number; high: number } | null) => (i ? `${pct(i.low)}–${pct(i.high)}` : "—");
  const lines = [
    `# Tactical detector evaluation (${split} split)`,
    "",
    datasetNote,
    "",
    "| Detector | Labeled | Unsure | Unlabeled | Fired | TP | FP | FN | TN | Precision (95% CI) | Recall (95% CI) |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...reports.map(
      (r) =>
        `| ${r.detector} | ${r.labeled} | ${r.unsure} | ${r.unlabeled} | ${r.fired} | ${r.tp} | ${r.fp} | ${r.fn} | ${r.tn} | ${pct(r.precision)} (${ci(r.precisionInterval)}) | ${pct(r.recall)} (${ci(r.recallInterval)}) |`,
    ),
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
