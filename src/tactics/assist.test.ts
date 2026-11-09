import { describe, expect, it } from "vitest";
import { playMove } from "../core/moves";
import { sideToMove } from "../core/types";
import { applyLabels, judge, mergeSavedLabels, reviewCoverage, suggestionFor, type ReviewState } from "./assist";
import { DATASET_FORMAT, DATASET_VERSION, parseDataset, type DatasetItem, type TacticsDataset } from "./dataset";
import { evaluateDetectors, formatReport, precisionStatus } from "./evaluation";
import type { MoveContext } from "./types";

// Positions here are constructed test data, never evaluation data. Labels are
// fixtures for checking bookkeeping, not human judgements.

function ctx(fenBefore: string, uci: string, engine: { bestBefore?: string; bestAfter?: string; loss?: number }): MoveContext {
  const played = playMove(fenBefore, uci.slice(0, 2), uci.slice(2, 4))!;
  return {
    gameId: "t",
    ply: 1,
    moveLabel: "1.",
    mover: sideToMove(fenBefore),
    fenBefore,
    fenAfter: played.fenAfter,
    move: { san: played.san, uci: played.uci },
    bestBefore: engine.bestBefore ?? null,
    lineBefore: engine.bestBefore ? [engine.bestBefore] : [],
    bestAfter: engine.bestAfter ?? null,
    lineAfter: engine.bestAfter ? [engine.bestAfter] : [],
    loss: engine.loss ?? 0.3,
    classification: "blunder",
  };
}

const HANGS = ctx("4k3/8/8/3p4/8/8/3N4/4K3 w - - 0 1", "d2c4", { bestAfter: "d5c4" });
const MISSES = ctx("4k3/8/2n5/8/8/8/8/2R1K3 w - - 0 1", "e1e2", { bestBefore: "c1c6" });
const QUIET = ctx("4k3/8/8/3p4/8/8/3N4/4K3 w - - 0 1", "d2c4", { bestAfter: "e8e7" });

function item(id: string, context: MoveContext, split: "dev" | "holdout" = "dev", extra: Partial<DatasetItem> = {}): DatasetItem {
  return { id, split, context, engine: { engineKey: "k" }, labels: { "hanging-piece": null, "missed-capture": null }, notes: "", ...extra };
}
function dataset(items: DatasetItem[]): TacticsDataset {
  return { format: DATASET_FORMAT, version: DATASET_VERSION, guidelinesVersion: "1.0", createdAt: "x", source: "test", labeler: null, items };
}
const EMPTY: ReviewState = { labels: {}, reviews: {} };

describe("suggestionFor", () => {
  it("suggests 'yes' with the detector's explanation and the supporting engine line (hanging piece)", () => {
    const s = suggestionFor(item("a", HANGS), "hanging-piece")!;
    expect(s).toMatchObject({ detector: "hanging-piece", label: "yes", version: 1, subtype: "created", square: "c4" });
    expect(s.explanation).toContain("dxc4");
    // The line is replayed from the position AFTER the move, where the reply is played.
    expect(s.line).toEqual({ fen: HANGS.fenAfter, san: ["dxc4"] });
  });

  it("uses the line from the position before the move for a missed capture", () => {
    const s = suggestionFor(item("a", MISSES), "missed-capture")!;
    expect(s).toMatchObject({ detector: "missed-capture", label: "yes", square: "c6" });
    expect(s.line).toEqual({ fen: MISSES.fenBefore, san: ["Rxc6"] });
  });

  it("offers nothing when the detector is silent: there is no 'suggest no'", () => {
    expect(suggestionFor(item("a", QUIET), "hanging-piece")).toBeNull();
    expect(suggestionFor(item("a", QUIET), "missed-capture")).toBeNull();
  });

  it("never produces a suggestion for the holdout split, even where the detector fires", () => {
    expect(suggestionFor(item("a", HANGS, "holdout"), "hanging-piece")).toBeNull();
    expect(suggestionFor(item("b", MISSES, "holdout"), "missed-capture")).toBeNull();
  });
});

describe("judge: the human's first answer is recorded, a suggestion never becomes a label", () => {
  const sug = suggestionFor(item("a", HANGS), "hanging-piece");

  it("records the first judgment as the initial one, with what was revealed afterwards", () => {
    const r = judge(EMPTY, "a", "hanging-piece", "no", sug);
    expect(r.labels).toEqual({ a: { "hanging-piece": "no" } });
    expect(r.reviews).toEqual({ a: { "hanging-piece": { initial: "no", suggestionShown: "yes", detectorVersion: 1 } } });
  });

  it("keeps the initial judgment when the label is revised, and changes only that question", () => {
    const first = judge(EMPTY, "a", "hanging-piece", "no", sug);
    const other = judge(first, "a", "missed-capture", "yes", null);
    const revised = judge(other, "a", "hanging-piece", "yes", sug);
    expect(revised.labels.a).toEqual({ "hanging-piece": "yes", "missed-capture": "yes" });
    expect(revised.reviews.a?.["hanging-piece"]?.initial).toBe("no");
    expect(revised.reviews.a?.["missed-capture"]?.initial).toBe("yes");
  });

  it("records no suggestion when none was available, and does not mutate its input", () => {
    const frozen: ReviewState = Object.freeze({ labels: Object.freeze({}), reviews: Object.freeze({}) });
    const r = judge(frozen, "b", "missed-capture", "unsure", null);
    expect(r.reviews.b?.["missed-capture"]).toEqual({ initial: "unsure", suggestionShown: null, detectorVersion: null });
    expect(frozen.labels).toEqual({});
  });

  it("treats a label loaded from a file (no review record) as the blind initial judgment when it is revised", () => {
    const loaded: ReviewState = { labels: { a: { "hanging-piece": "no" } }, reviews: {} };
    const r = judge(loaded, "a", "hanging-piece", "yes", sug);
    expect(r.labels.a?.["hanging-piece"]).toBe("yes");
    expect(r.reviews.a?.["hanging-piece"]?.initial).toBe("no");
  });
});

describe("applyLabels (export)", () => {
  it("writes only human labels, null elsewhere, review records only where a label exists, and does not touch contexts", () => {
    const d = dataset([item("a", HANGS), item("b", MISSES), item("c", QUIET, "holdout")]);
    const state = judge(judge(EMPTY, "a", "hanging-piece", "yes", suggestionFor(d.items[0]!, "hanging-piece")), "b", "missed-capture", "unsure", null);
    const out = applyLabels(d, state);
    expect(out.items.map((i) => i.labels)).toEqual([
      { "hanging-piece": "yes", "missed-capture": null },
      { "hanging-piece": null, "missed-capture": "unsure" },
      { "hanging-piece": null, "missed-capture": null },
    ]);
    // A detector firing on an item the human never judged leaves no trace in the file.
    expect(out.items[2]!.review).toBeUndefined();
    expect(out.items[0]!.review).toEqual({ "hanging-piece": { initial: "yes", suggestionShown: "yes", detectorVersion: 1 } });
    expect(out.items.map((i) => i.context)).toEqual(d.items.map((i) => i.context));
    expect(parseDataset(JSON.stringify(out))).toEqual(out);
  });

  it("round-trips an unreviewed dataset byte-for-byte in meaning: old files stay valid", () => {
    const d = dataset([item("a", HANGS)]);
    expect(applyLabels(d, EMPTY).items[0]).toEqual(d.items[0]);
    expect("review" in applyLabels(d, EMPTY).items[0]!).toBe(false);
  });
});

describe("mergeSavedLabels", () => {
  it("keeps browser-saved work over the file but reports every label that differs, so nothing is replaced silently", () => {
    const file: ReviewState = { labels: { a: { "hanging-piece": "yes", "missed-capture": "no" } }, reviews: {} };
    const saved: ReviewState = { labels: { a: { "hanging-piece": "no" }, b: { "missed-capture": "yes" } }, reviews: {} };
    const { state, conflicts } = mergeSavedLabels(file, saved);
    expect(state.labels).toEqual({ a: { "hanging-piece": "no", "missed-capture": "no" }, b: { "missed-capture": "yes" } });
    expect(conflicts).toBe(1);
  });
});

describe("reviewCoverage keeps reviewed coverage separate from accuracy", () => {
  it("counts yes/no/unsure/unlabeled and how the human related to the suggestion", () => {
    const mk = (id: string, label: "yes" | "no" | "unsure" | null, review?: DatasetItem["review"]) =>
      item(id, HANGS, "dev", { labels: { "hanging-piece": label, "missed-capture": null }, ...(review ? { review } : {}) });
    const shown = (initial: "yes" | "no" | "unsure") => ({ "hanging-piece": { initial, suggestionShown: "yes" as const, detectorVersion: 1 } });
    const rows = reviewCoverage([
      mk("a", "yes", shown("yes")), // agreed from the start
      mk("b", "yes", shown("no")), // revised towards the suggestion after seeing it
      mk("c", "no", shown("no")), // disagreed and stayed
      mk("d", "unsure", shown("unsure")),
      mk("e", null),
      mk("f", "no"), // labeled without a review record
    ]);
    expect(rows.find((r) => r.detector === "hanging-piece")).toEqual({
      detector: "hanging-piece",
      total: 6,
      yes: 2,
      no: 2,
      unsure: 1,
      unlabeled: 1,
      suggestionsSeen: 4,
      agreedWithSuggestion: 2,
      revisedAfterReveal: 1,
    });
  });
});

describe("evaluation uses human labels only", () => {
  const withReview = (id: string, c: MoveContext, label: "yes" | "no" | null, initial?: "yes" | "no") =>
    item(id, c, "dev", {
      labels: { "hanging-piece": label, "missed-capture": null },
      ...(initial ? { review: { "hanging-piece": { initial, suggestionShown: "yes" as const, detectorVersion: 1 } } } : {}),
    });

  it("an item the detector fires on but nobody labeled is unlabeled, not a true positive", () => {
    const [h] = evaluateDetectors(dataset([withReview("a", HANGS, null)]), "dev");
    expect(h).toMatchObject({ fired: 1, labeled: 0, tp: 0, fp: 0, unlabeled: 1, total: 1, precision: null });
  });

  it("can score the blind first judgments instead of the final labels", () => {
    const d = dataset([withReview("a", HANGS, "yes", "no"), withReview("b", HANGS, "yes", "yes")]);
    const [final] = evaluateDetectors(d, "dev");
    const [initial] = evaluateDetectors(d, "dev", undefined, "initial");
    expect(final).toMatchObject({ tp: 2, fp: 0 });
    expect(initial).toMatchObject({ tp: 1, fp: 1 });
  });

  it("never claims the 90% target without reviewed firings, and reports the lower bound otherwise", () => {
    const none = evaluateDetectors(dataset([withReview("a", HANGS, null)]), "dev")[0]!;
    expect(precisionStatus(none)).toMatch(/no reviewed firings/i);

    const nineOfTen = dataset(Array.from({ length: 10 }, (_, i) => withReview(`i${i}`, HANGS, i === 0 ? "no" : "yes")));
    expect(precisionStatus(evaluateDetectors(nineOfTen, "dev")[0]!)).toMatch(/lower bound .* not yet supported/i);

    const many = dataset(Array.from({ length: 60 }, (_, i) => withReview(`i${i}`, HANGS, "yes")));
    expect(precisionStatus(evaluateDetectors(many, "dev")[0]!)).toMatch(/lower bound ≥ 90%/);

    const low = dataset(Array.from({ length: 10 }, (_, i) => withReview(`i${i}`, HANGS, i < 6 ? "yes" : "no")));
    expect(precisionStatus(evaluateDetectors(low, "dev")[0]!)).toMatch(/below/i);
  });

  it("the report separates coverage from precision and says only the holdout can support the gate", () => {
    const md = formatReport(evaluateDetectors(dataset([withReview("a", HANGS, "yes")]), "dev"), "dev", "note");
    expect(md).toContain("Reviewed (yes/no)");
    expect(md).toMatch(/holdout/i);
  });
});
