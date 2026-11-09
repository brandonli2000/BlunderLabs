import { describe, expect, it } from "vitest";
import { playMove } from "../core/moves";
import { sideToMove } from "../core/types";
import { DATASET_FORMAT, DATASET_VERSION, DatasetError, itemsFromContexts, parseDataset, splitForGame, type TacticsDataset } from "./dataset";
import { evaluateDetectors, formatReport } from "./evaluation";
import type { MoveContext } from "./types";

// NOTE: labels in this file are test fixtures for checking the arithmetic of
// the evaluation, not human judgements and never reported as results.

function ctx(gameId: string, fenBefore: string, uci: string, bestAfter: string | null, loss = 0.3): MoveContext {
  const played = playMove(fenBefore, uci.slice(0, 2), uci.slice(2, 4))!;
  return {
    gameId,
    ply: 1,
    moveLabel: "1.",
    mover: sideToMove(fenBefore),
    fenBefore,
    fenAfter: played.fenAfter,
    move: { san: played.san, uci: played.uci },
    bestBefore: null,
    lineBefore: [],
    bestAfter,
    lineAfter: bestAfter ? [bestAfter] : [],
    loss,
    classification: "blunder",
  };
}

const HANGS = ctx("g-hangs", "4k3/8/8/3p4/8/8/3N4/4K3 w - - 0 1", "d2c4", "d5c4"); // detector fires
const QUIET = ctx("g-quiet", "4k3/8/8/3p4/8/8/3N4/4K3 w - - 0 1", "d2c4", "e8e7"); // detector silent

function dataset(items: TacticsDataset["items"]): TacticsDataset {
  return { format: DATASET_FORMAT, version: DATASET_VERSION, guidelinesVersion: "1.0", createdAt: "", source: "test", labeler: null, items };
}

describe("dataset building", () => {
  it("splits deterministically by game so no game straddles dev and holdout", () => {
    expect(splitForGame("lichess:0IdR4QNI")).toBe(splitForGame("lichess:0IdR4QNI"));
    const ids = Array.from({ length: 400 }, (_, i) => `game-${i}`);
    const holdout = ids.filter((id) => splitForGame(id) === "holdout").length / ids.length;
    expect(holdout).toBeGreaterThan(0.2);
    expect(holdout).toBeLessThan(0.4);
  });

  it("keeps only moves at or above the loss threshold, with empty labels", () => {
    const items = itemsFromContexts([HANGS, { ...QUIET, loss: 0.01 }], "sf|d14");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "g-hangs#1", labels: { "hanging-piece": null, "missed-capture": null }, engine: { engineKey: "sf|d14" } });
  });
});

describe("parseDataset", () => {
  it("round-trips a valid dataset", () => {
    const d = dataset(itemsFromContexts([HANGS], "k"));
    expect(parseDataset(JSON.stringify(d))).toEqual(d);
  });

  it("rejects malformed files with specific reasons", () => {
    const good = dataset(itemsFromContexts([HANGS], "k"));
    expect(() => parseDataset("{")).toThrow(DatasetError);
    expect(() => parseDataset(JSON.stringify({ ...good, format: "x" }))).toThrow(/Not a BlunderLab tactics dataset/);
    expect(() => parseDataset(JSON.stringify({ ...good, version: 2 }))).toThrow(/Unsupported dataset version/);
    expect(() => parseDataset(JSON.stringify({ ...good, items: [good.items[0], good.items[0]] }))).toThrow(/Duplicate/);
    const badLabel = { ...good.items[0]!, labels: { "hanging-piece": "maybe", "missed-capture": null } };
    expect(() => parseDataset(JSON.stringify({ ...good, items: [badLabel] }))).toThrow(/labels must be/);
  });
});

describe("evaluateDetectors", () => {
  it("computes the confusion matrix, excludes unsure/unlabeled, and lists disagreements", () => {
    const base = (c: MoveContext, id: string, hanging: "yes" | "no" | "unsure" | null) => ({
      id,
      split: "dev" as const,
      context: c,
      engine: { engineKey: "k" },
      labels: { "hanging-piece": hanging, "missed-capture": "no" as const },
      notes: "",
    });
    const d = dataset([
      base(HANGS, "a", "yes"), // TP
      base(HANGS, "b", "no"), // FP
      base(QUIET, "c", "yes"), // FN
      base(QUIET, "d", "no"), // TN
      base(QUIET, "e", "unsure"),
      base(HANGS, "f", null),
    ]);
    const [hanging] = evaluateDetectors(d, "dev");
    expect(hanging).toMatchObject({ detector: "hanging-piece", labeled: 4, unsure: 1, unlabeled: 1, tp: 1, fp: 1, fn: 1, tn: 1, fired: 3 });
    expect(hanging!.precision).toBe(0.5);
    expect(hanging!.recall).toBe(0.5);
    expect(hanging!.precisionInterval!.low).toBeLessThan(0.5);
    expect(hanging!.disagreements.map((x) => [x.id, x.kind])).toEqual([
      ["b", "false-positive"],
      ["c", "false-negative"],
    ]);
    expect(formatReport([hanging!], "dev", "test")).toContain("false-positive");
  });

  it("reports no metrics (not zeros) when nothing is labeled", () => {
    const d = dataset(itemsFromContexts([HANGS], "k").map((i) => ({ ...i, split: "dev" as const })));
    const [hanging] = evaluateDetectors(d, "dev");
    expect(hanging).toMatchObject({ labeled: 0, unlabeled: 1, precision: null, recall: null, precisionInterval: null, fired: 1 });
  });
});
