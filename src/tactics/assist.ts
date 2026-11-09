/**
 * Assisted labeling: pure logic behind /label.html's "reveal after you answer" flow.
 *
 * Trust model (why the benchmark stays honest):
 * - A suggestion is computed on demand from the item's stored engine evidence
 *   and is never written to `labels`. Only a person's click creates a label.
 * - The person's first answer for a question is stored as `initial` and never
 *   changes, so results can be scored on blind judgments as well as final ones.
 * - Suggestions exist for the dev split only; the holdout stays fully blind.
 * - The detector can say "yes" or stay silent. It never suggests "no": a silent
 *   detector is not evidence that the pattern is absent (that is what recall measures).
 */
import { pvToSan } from "../core/moves";
import { DETECTORS } from "./index";
import type { DatasetItem, Label, ReviewRecord, TacticsDataset } from "./dataset";
import { DEFAULT_DETECTOR_OPTIONS, type DetectorId, type DetectorOptions } from "./types";

export const DETECTOR_IDS: readonly DetectorId[] = ["hanging-piece", "missed-capture"];

export interface Suggestion {
  detector: DetectorId;
  label: "yes";
  version: number;
  subtype: string;
  square: string;
  explanation: string;
  /** The engine variation that supports it, replayable from `fen`. */
  line: { fen: string; san: string[] };
}

export function suggestionFor(item: DatasetItem, detector: DetectorId, options: DetectorOptions = DEFAULT_DETECTOR_OPTIONS): Suggestion | null {
  if (item.split !== "dev") return null;
  const found = DETECTORS[detector](item.context, options);
  if (!found) return null;
  const c = item.context;
  // A hanging piece is won by the opponent's reply (played after the move); a missed
  // capture is the mover's own better move (played instead of it).
  const line =
    detector === "hanging-piece" ? { fen: c.fenAfter, san: pvToSan(c.fenAfter, c.lineAfter, 6) } : { fen: c.fenBefore, san: pvToSan(c.fenBefore, c.lineBefore, 6) };
  return { detector, label: "yes", version: found.version, subtype: found.subtype, square: found.square, explanation: found.explanation, line };
}

export type Labels = Record<string, Partial<Record<DetectorId, Label>>>;
export type Reviews = Record<string, Partial<Record<DetectorId, ReviewRecord>>>;
export interface ReviewState {
  labels: Labels;
  reviews: Reviews;
}

/**
 * Apply one human answer. The first answer for a question fixes `initial`
 * (a label loaded from a file counts as an earlier blind answer, because the
 * tool that produced it never showed detector output); later answers revise
 * only the label.
 */
export function judge(state: ReviewState, id: string, detector: DetectorId, value: Label, suggestion: Suggestion | null): ReviewState {
  const previous = state.labels[id]?.[detector];
  const existing = state.reviews[id]?.[detector];
  const record: ReviewRecord = existing ?? { initial: previous ?? value, suggestionShown: suggestion ? "yes" : null, detectorVersion: suggestion?.version ?? null };
  return {
    labels: { ...state.labels, [id]: { ...state.labels[id], [detector]: value } },
    reviews: { ...state.reviews, [id]: { ...state.reviews[id], [detector]: record } },
  };
}

/** The dataset with the human's labels and review records applied; everything else untouched. */
export function applyLabels(dataset: TacticsDataset, state: ReviewState): TacticsDataset {
  return {
    ...dataset,
    items: dataset.items.map((item): DatasetItem => {
      const labels = { "hanging-piece": state.labels[item.id]?.["hanging-piece"] ?? null, "missed-capture": state.labels[item.id]?.["missed-capture"] ?? null };
      const review: Partial<Record<DetectorId, ReviewRecord>> = {};
      for (const d of DETECTOR_IDS) {
        const r = labels[d] === null ? undefined : (state.reviews[item.id]?.[d] ?? item.review?.[d]);
        if (r) review[d] = r;
      }
      const { review: _old, ...rest } = item;
      return Object.keys(review).length ? { ...rest, labels, review } : { ...rest, labels };
    }),
  };
}

/** Labels already in a file, as the tool's starting state. */
export function stateFromDataset(dataset: TacticsDataset): ReviewState {
  const state: ReviewState = { labels: {}, reviews: {} };
  for (const item of dataset.items) {
    for (const d of DETECTOR_IDS) {
      const label = item.labels[d];
      if (label === null) continue;
      state.labels[item.id] = { ...state.labels[item.id], [d]: label };
      const r = item.review?.[d];
      if (r) state.reviews[item.id] = { ...state.reviews[item.id], [d]: r };
    }
  }
  return state;
}

/**
 * Combine a file's labels with this browser's saved work. Saved work wins (it is
 * newer when you keep labeling after an export), but every label it changes is
 * counted so the tool can tell you instead of replacing anything silently.
 */
export function mergeSavedLabels(file: ReviewState, saved: ReviewState): { state: ReviewState; conflicts: number } {
  let conflicts = 0;
  const labels: Labels = { ...file.labels };
  for (const [id, answers] of Object.entries(saved.labels)) {
    for (const d of DETECTOR_IDS) {
      const value = answers[d];
      if (!value) continue;
      const before = file.labels[id]?.[d];
      if (before && before !== value) conflicts++;
      labels[id] = { ...labels[id], [d]: value };
    }
  }
  const reviews: Reviews = { ...file.reviews };
  for (const [id, records] of Object.entries(saved.reviews)) reviews[id] = { ...reviews[id], ...records };
  return { state: { labels, reviews }, conflicts };
}

export interface CoverageRow {
  detector: DetectorId;
  total: number;
  yes: number;
  no: number;
  unsure: number;
  unlabeled: number;
  /** Questions where a suggestion was shown after the human's first answer. */
  suggestionsSeen: number;
  /** Of those, how many ended with the human's label equal to the suggestion. */
  agreedWithSuggestion: number;
  /** Questions where the label changed after the reveal (initial !== final). */
  revisedAfterReveal: number;
}

/** Progress and assistance counts. This is coverage of the benchmark, never accuracy of the detector. */
export function reviewCoverage(items: readonly DatasetItem[]): CoverageRow[] {
  return DETECTOR_IDS.map((detector) => {
    const row: CoverageRow = { detector, total: items.length, yes: 0, no: 0, unsure: 0, unlabeled: 0, suggestionsSeen: 0, agreedWithSuggestion: 0, revisedAfterReveal: 0 };
    for (const item of items) {
      const label = item.labels[detector];
      if (label === null) {
        row.unlabeled++;
        continue;
      }
      row[label]++;
      const r = item.review?.[detector];
      if (r?.suggestionShown) {
        row.suggestionsSeen++;
        if (label === r.suggestionShown) row.agreedWithSuggestion++;
      }
      if (r && r.initial !== label) row.revisedAfterReveal++;
    }
    return row;
  });
}
