import { describe, expect, it } from "vitest";
import type { GameAnalysis, MoveVerdict } from "../analysis/gameAnalysis";
import type { MoveClass } from "../core/classify";
import { parseGame, splitPgn } from "../core/pgn";
import { fixture } from "../test/fakeFetch";
import { toGameRecord } from "./gameRecord";
import { extractMistakes, filterMistakes, ownerColor, sortMistakes, type MistakeEntry, type MistakeFilter } from "./mistakes";

// Real Lichess game: thibault (White) vs SergeyB123, 300+3, 46 plies.
const PGN = splitPgn(fixture("lichess-thibault-3.pgn"))[0]!;

/** An analysis aligned with the game where chosen plies get chosen classes. */
function analysisWith(classes: Record<number, MoveClass>): GameAnalysis {
  const game = parseGame(PGN);
  const moves: MoveVerdict[] = game.moves.map((m) => {
    const cls = classes[m.ply] ?? "good";
    const drop = { best: 0, good: 0.01, inaccuracy: 0.06, mistake: 0.12, blunder: 0.3 }[cls];
    return {
      ply: m.ply,
      color: m.color,
      san: m.san,
      classification: cls,
      winBefore: 0.6,
      winAfter: 0.6 - drop,
      accuracy: 50,
      bestMoveSan: cls === "good" ? null : "Nf3",
      bestMoveUci: null,
    };
  });
  return {
    positions: [game.startFen, ...game.moves.map((m) => m.fenAfter)].map((fen, ply) => ({ ply, fen, score: { cp: 0 }, bestMove: null, bestLine: [], depth: 14 })),
    moves,
    accuracy: { w: null, b: null },
    limits: { depth: 14 },
    refine: null,
    refinedPositions: 0,
    durationMs: 1,
  };
}

describe("extractMistakes", () => {
  it("extracts flagged moves with position, players, phase and clock context", async () => {
    const record = await toGameRecord(PGN, "lichess:thibault", 0);
    expect(ownerColor(record)).toBe("w");
    // ply 16 = 8...dxe5 (Black), ply 19 = 10.h4 (White), ply 41 = 21.Nc5 (White).
    const entries = extractMistakes(record, analysisWith({ 16: "inaccuracy", 19: "mistake", 41: "blunder", 3: "best" }));

    expect(entries.map((e) => e.ply)).toEqual([16, 19, 41]);
    const h4 = entries[1]!;
    expect(h4).toMatchObject({
      gameId: "lichess:0IdR4QNI",
      moveNumber: 10,
      color: "w",
      san: "h4",
      bestSan: "Nf3",
      player: "thibault",
      opponent: "SergeyB123",
      byOwner: true,
      classification: "mistake",
      clockMs: 256_000, // 10. h4 {[%clk 0:04:16]}
      spentMs: 26_000, // 4:39 → 4:16 with +3 increment
      spentSource: "measured",
      initialMs: 300_000,
      timeControl: "300+3",
    });
    expect(h4.loss).toBeCloseTo(0.12, 10);
    expect(h4.fenBefore).toBe(parseGame(PGN).moves[18]!.fenBefore);
    expect(entries[0]).toMatchObject({ color: "b", byOwner: false, moveNumber: 8 });
    expect(["opening", "middlegame", "endgame"]).toContain(h4.phase);
  });

  it("returns nothing when the stored analysis does not match the game", async () => {
    const record = await toGameRecord(PGN, null, 0);
    const analysis = analysisWith({ 19: "blunder" });
    expect(extractMistakes(record, { ...analysis, moves: analysis.moves.slice(1) })).toEqual([]);
    const renamed = analysis.moves.map((m, i) => (i === 5 ? { ...m, san: "Qh5" } : m));
    expect(extractMistakes(record, { ...analysis, moves: renamed })).toEqual([]);
  });

  it("marks ownership unknown for PGN uploads", async () => {
    const record = await toGameRecord(PGN.replace(/\[GameId[^\n]*\n/, "").replace(/lichess\.org/g, "example.org"), null, 0);
    expect(extractMistakes(record, analysisWith({ 19: "blunder" }))[0]!.byOwner).toBeNull();
  });
});

describe("filter and sort", () => {
  const entry = (patch: Partial<MistakeEntry>): MistakeEntry => ({
    gameId: "g",
    ply: 1,
    moveNumber: 1,
    color: "w",
    player: "alice",
    opponent: "bob",
    byOwner: true,
    fenBefore: "",
    san: "e4",
    bestSan: null,
    classification: "mistake",
    winBefore: 0.5,
    winAfter: 0.4,
    loss: 0.1,
    phase: "middlegame",
    clockMs: null,
    spentMs: null,
    spentSource: null,
    clockResolutionMs: 1000,
    initialMs: null,
    date: null,
    timeControl: null,
    opening: null,
    ...patch,
  });
  const all: MistakeFilter = {
    classes: new Set(["inaccuracy", "mistake", "blunder"]),
    phases: new Set(["opening", "middlegame", "endgame"]),
    side: "all",
    query: "",
  };

  it("filters by class, phase, side and text", () => {
    const list = [
      entry({ ply: 1, classification: "blunder", phase: "endgame" }),
      entry({ ply: 2, classification: "inaccuracy", byOwner: false, player: "bob", opponent: "alice" }),
      entry({ ply: 3, opening: "Sicilian Defense" }),
    ];
    expect(filterMistakes(list, { ...all, classes: new Set(["blunder"]) }).map((e) => e.ply)).toEqual([1]);
    expect(filterMistakes(list, { ...all, phases: new Set(["middlegame"]) }).map((e) => e.ply)).toEqual([2, 3]);
    expect(filterMistakes(list, { ...all, side: "opponents" }).map((e) => e.ply)).toEqual([2]);
    expect(filterMistakes(list, { ...all, query: "sicil" }).map((e) => e.ply)).toEqual([3]);
  });

  it("sorts by loss, date, or least clock (unknown last) without mutating input", () => {
    const list = [
      entry({ ply: 1, loss: 0.1, date: "2026.01.01", clockMs: 50_000 }),
      entry({ ply: 2, loss: 0.3, date: "2026.03.01", clockMs: null }),
      entry({ ply: 3, loss: 0.2, date: "2026.02.01", clockMs: 5_000 }),
    ];
    expect(sortMistakes(list, "loss").map((e) => e.ply)).toEqual([2, 3, 1]);
    expect(sortMistakes(list, "date").map((e) => e.ply)).toEqual([2, 3, 1]);
    expect(sortMistakes(list, "clock").map((e) => e.ply)).toEqual([3, 1, 2]);
    expect(list.map((e) => e.ply)).toEqual([1, 2, 3]);
  });
});
