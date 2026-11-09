import { describe, expect, it } from "vitest";
import type { MoveClass } from "../core/classify";
import { parseGame, splitPgn } from "../core/pgn";
import { analysisFor } from "../test/analysisFixtures";
import { fixture } from "../test/fakeFetch";
import { toGameRecord } from "./gameRecord";
import { extractMoveFacts } from "./moveFacts";
import { extractMistakes, filterMistakes, ownerColor, sortMistakes, type MistakeEntry, type MistakeFilter } from "./mistakes";

// Real Lichess game: thibault (White) vs SergeyB123, 300+3, 46 plies.
const PGN = splitPgn(fixture("lichess-thibault-3.pgn"))[0]!;

const analysisWith = (classes: Record<number, MoveClass>) => analysisFor(PGN, classes);

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

describe("extractMistakes is a projection of extractMoveFacts", () => {
  it("lists exactly the flagged facts, in the same order and with the same numbers", async () => {
    const record = await toGameRecord(PGN, "lichess:thibault", 0);
    const analysis = analysisWith({ 2: "best", 7: "inaccuracy", 16: "mistake", 19: "blunder", 22: "good", 41: "inaccuracy" });
    const flaggedFacts = extractMoveFacts(record, analysis).filter((f) => ["inaccuracy", "mistake", "blunder"].includes(f.classification));
    const entries = extractMistakes(record, analysis);
    expect(entries.map((e) => [e.gameId, e.ply, e.classification, e.loss, e.byOwner, e.clockMs, e.phase])).toEqual(
      flaggedFacts.map((f) => [f.gameId, f.ply, f.classification, f.loss, f.byOwner, f.clockMs, f.phase]),
    );
    expect(entries.length).toBe(4);
  });

  it("applies the same validity rules as the facts: a corrupted verdict hides the whole game", async () => {
    const record = await toGameRecord(PGN, null, 0);
    const analysis = analysisWith({ 19: "blunder" });
    expect(extractMistakes(record, analysis)).toHaveLength(1);
    const bad = { ...analysis, moves: analysis.moves.map((m, i) => (i === 3 ? { ...m, winBefore: NaN } : m)) };
    expect(extractMistakes(record, bad)).toEqual([]);
    const wrongPly = { ...analysis, moves: analysis.moves.map((m, i) => (i === 3 ? { ...m, ply: 40 } : m)) };
    expect(extractMistakes(record, wrongPly)).toEqual([]);
  });

  it("does not credit anyone's moves when both sides match the imported name", async () => {
    const mirror = PGN.replace('[Black "SergeyB123"]', '[Black "thibault"]');
    const entries = extractMistakes(await toGameRecord(mirror, "lichess:thibault", 0), analysisFor(mirror, { 19: "blunder", 16: "mistake" }));
    expect(entries.map((e) => e.byOwner)).toEqual([null, null]);
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
