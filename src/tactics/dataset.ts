/**
 * Versioned, hand-labelable dataset of real mistakes for evaluating tactical
 * detectors.
 *
 * Each item is self-contained (positions and the engine evidence detectors
 * need), so detectors can be re-run on it later without the engine, and a
 * labeled file stays meaningful after detector rules change. Labels come only
 * from people; generated files have every label null.
 */
import type { DetectorId, MoveContext } from "./types";

export const DATASET_FORMAT = "blunderlab-tactics-dataset";
export const DATASET_VERSION = 1;
/** Version of docs/tactics/labeling-guidelines.md the labels follow. */
export const GUIDELINES_VERSION = "1.0";

export type Label = "yes" | "no" | "unsure";
export type Split = "dev" | "holdout";

/**
 * How one human judgment came about, kept beside (never instead of) the label.
 * `initial` is the first answer given before any suggestion was shown and is
 * never changed; `labels` holds the current answer. They differ only if the
 * human revised after seeing the suggestion.
 */
export interface ReviewRecord {
  initial: Label;
  /** What the assistant showed after the first answer; null = nothing (silent detector or holdout). */
  suggestionShown: "yes" | null;
  /** Version of the detector that produced it, so the record stays attributable. */
  detectorVersion: number | null;
}

export interface DatasetItem {
  /** `${gameId}#${ply}`, unique within a dataset. */
  id: string;
  split: Split;
  context: MoveContext;
  engine: { engineKey: string };
  /** Human labels per detector question; null = not labeled yet. */
  labels: Record<DetectorId, Label | null>;
  /** Present only for questions a human answered with the assisted tool. */
  review?: Partial<Record<DetectorId, ReviewRecord>>;
  notes: string;
}

export interface TacticsDataset {
  format: typeof DATASET_FORMAT;
  version: number;
  guidelinesVersion: string;
  createdAt: string;
  /** Where the positions came from (fixture names, usernames, dates). */
  source: string;
  /** Who labeled it (free text); null for an unlabeled file. */
  labeler: string | null;
  items: DatasetItem[];
}

/** Share of games (not moves) held out, so no game contributes to both splits. */
export const HOLDOUT_PERCENT = 30;

/**
 * Deterministic split by game: hashing the game id (FNV-1a) means every move
 * of a game lands in the same split, which prevents leakage between dev and
 * holdout (moves of one game are highly correlated).
 */
export function splitForGame(gameId: string): Split {
  let hash = 0x811c9dc5;
  for (let i = 0; i < gameId.length; i++) {
    hash ^= gameId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100 < HOLDOUT_PERCENT ? "holdout" : "dev";
}

/**
 * Dataset items for one game: every move whose loss is at least `minLoss`
 * (default 0.05 = inaccuracy or worse). Both pattern and non-pattern
 * mistakes are kept, so the set contains genuine positives and negatives.
 */
export function itemsFromContexts(contexts: readonly MoveContext[], engineKey: string, minLoss = 0.05): DatasetItem[] {
  return contexts
    .filter((c) => c.loss >= minLoss)
    .map((context) => ({
      id: `${context.gameId}#${context.ply}`,
      split: splitForGame(context.gameId),
      context,
      engine: { engineKey },
      labels: { "hanging-piece": null, "missed-capture": null },
      notes: "",
    }));
}

export class DatasetError extends Error {
  override name = "DatasetError";
}

const LABELS = new Set<unknown>(["yes", "no", "unsure", null]);

/** Parse and check a dataset file; throws DatasetError with a specific reason. */
export function parseDataset(text: string): TacticsDataset {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new DatasetError("Not valid JSON.");
  }
  const d = raw as Partial<TacticsDataset> | null;
  if (!d || d.format !== DATASET_FORMAT) throw new DatasetError("Not a BlunderLab tactics dataset.");
  if (d.version !== DATASET_VERSION) throw new DatasetError(`Unsupported dataset version ${String(d.version)} (expected ${DATASET_VERSION}).`);
  if (!Array.isArray(d.items)) throw new DatasetError("Missing items.");
  const ids = new Set<string>();
  d.items.forEach((item, i) => {
    const it = item as Partial<DatasetItem> | null;
    const c = it?.context as Partial<MoveContext> | undefined;
    if (!it || typeof it.id !== "string" || (it.split !== "dev" && it.split !== "holdout")) throw new DatasetError(`Item #${i + 1}: bad id or split.`);
    if (ids.has(it.id)) throw new DatasetError(`Duplicate item id ${it.id}.`);
    ids.add(it.id);
    if (!c || typeof c.fenBefore !== "string" || typeof c.fenAfter !== "string" || typeof c.move?.uci !== "string" || typeof c.loss !== "number") {
      throw new DatasetError(`Item ${it.id}: incomplete context.`);
    }
    if (!it.labels || !LABELS.has(it.labels["hanging-piece"]) || !LABELS.has(it.labels["missed-capture"])) {
      throw new DatasetError(`Item ${it.id}: labels must be "yes", "no", "unsure" or null.`);
    }
    for (const [detector, r] of Object.entries(it.review ?? {})) {
      const ok = r && r.initial !== null && LABELS.has(r.initial) && (r.suggestionShown === null || r.suggestionShown === "yes");
      if (!ok || it.labels[detector as DetectorId] === null) throw new DatasetError(`Item ${it.id}: bad review record for ${detector}.`);
    }
  });
  return d as TacticsDataset;
}
