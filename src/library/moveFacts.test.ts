import { describe, expect, it } from "vitest";
import { gamePhase } from "../core/phase";
import { parseGame, splitPgn } from "../core/pgn";
import { analysisFor } from "../test/analysisFixtures";
import { fixture } from "../test/fakeFetch";
import { toGameRecord } from "./gameRecord";
import { extractMoveFacts, ownerColor } from "./moveFacts";

// Real Lichess game: thibault (White) vs SergeyB123, 300+3, 46 plies, every move has a clock.
const PGN = splitPgn(fixture("lichess-thibault-3.pgn"))[0]!;
const PLIES = parseGame(PGN).moves.length;

const withoutHeader = (pgn: string, tag: string) => pgn.replace(new RegExp(`\\[${tag} [^\\n]*\\n`), "");
const withHeader = (pgn: string, tag: string, value: string) => pgn.replace(new RegExp(`\\[${tag} "[^"]*"\\]`), `[${tag} "${value}"]`);
const withoutClocks = (pgn: string) => pgn.replace(/\s*\{\s*\[%clk[^}]*\}/g, "");
/** Black's clock annotations only are removed: White keeps a full clock history. */
const withoutBlackClocks = (pgn: string) => pgn.replace(/(\d+\.\.\. \S+) \{ \[%clk [^\]]*\] \}/g, "$1");

const record = (pgn: string, importedFor: string | null) => toGameRecord(pgn, importedFor, 0);

describe("extractMoveFacts: one fact per analysed move", () => {
  it("covers every move of both sides, in order, not only the flagged ones", async () => {
    const rec = await record(PGN, "lichess:thibault");
    const facts = extractMoveFacts(rec, analysisFor(PGN, { 19: "mistake", 41: "blunder" }));
    expect(facts).toHaveLength(PLIES);
    expect(facts.map((f) => f.ply)).toEqual(Array.from({ length: PLIES }, (_, i) => i + 1));
    expect(facts.filter((f) => f.color === "w")).toHaveLength(PLIES / 2);
    expect(new Set(facts.map((f) => f.classification))).toEqual(new Set(["good", "mistake", "blunder"]));
    expect(facts.every((f) => f.gameId === "lichess:0IdR4QNI")).toBe(true);
  });

  it("carries the game's context onto each fact", async () => {
    const rec = await record(PGN, "lichess:thibault");
    const game = parseGame(PGN);
    const h4 = extractMoveFacts(rec, analysisFor(PGN, { 19: "mistake" }))[18]!;
    expect(h4).toMatchObject({
      ply: 19,
      moveNumber: 10,
      color: "w",
      san: "h4",
      player: "thibault",
      opponent: "SergeyB123",
      playerKey: "lichess:thibault",
      byOwner: true,
      classification: "mistake",
      bestSan: "Nf3",
      date: rec.date,
      timeControl: "300+3",
      opening: "King's Gambit Accepted: Traditional Variation",
    });
    expect(h4.fenBefore).toBe(game.moves[18]!.fenBefore);
    expect(h4.phase).toBe(gamePhase(h4.fenBefore));
  });

  it("does not mutate its inputs and is deterministic", async () => {
    const rec = await record(PGN, "lichess:thibault");
    const analysis = analysisFor(PGN, { 19: "mistake" });
    const before = JSON.stringify([rec, analysis]);
    const first = extractMoveFacts(rec, analysis);
    expect(JSON.stringify([rec, analysis])).toBe(before);
    expect(extractMoveFacts(rec, analysis)).toEqual(first);
  });

  it("builds only the facts an include predicate asks for", async () => {
    const rec = await record(PGN, null);
    const facts = extractMoveFacts(rec, analysisFor(PGN, { 19: "mistake", 41: "blunder" }), (v) => v.classification === "blunder");
    expect(facts.map((f) => f.ply)).toEqual([41]);
  });
});

describe("extractMoveFacts: whose moves are they?", () => {
  it("attributes only the imported account's moves to its player key", async () => {
    const facts = extractMoveFacts(await record(PGN, "lichess:thibault"), analysisFor(PGN));
    expect(facts.filter((f) => f.playerKey === "lichess:thibault").every((f) => f.color === "w")).toBe(true);
    expect(facts.filter((f) => f.playerKey !== null)).toHaveLength(PLIES / 2);
    expect(facts.filter((f) => f.color === "b").every((f) => f.byOwner === false && f.playerKey === null)).toBe(true);
  });

  it("flips sides when the same game was imported for the other player", async () => {
    const facts = extractMoveFacts(await record(PGN, "lichess:sergeyb123"), analysisFor(PGN));
    expect(facts.filter((f) => f.color === "b").every((f) => f.byOwner === true && f.playerKey === "lichess:sergeyb123")).toBe(true);
    expect(facts.filter((f) => f.color === "w").every((f) => f.byOwner === false && f.playerKey === null)).toBe(true);
  });

  it("keeps two players' libraries separate when facts from several games are pooled", async () => {
    const asWhite = extractMoveFacts(await record(PGN, "lichess:thibault"), analysisFor(PGN, { 19: "blunder" }));
    const asBlack = extractMoveFacts(await record(PGN, "lichess:sergeyb123"), analysisFor(PGN, { 16: "blunder" }));
    const byKey = new Map<string, number[]>();
    for (const f of [...asWhite, ...asBlack]) if (f.playerKey) byKey.set(f.playerKey, [...(byKey.get(f.playerKey) ?? []), f.ply]);
    expect([...byKey.keys()].sort()).toEqual(["lichess:sergeyb123", "lichess:thibault"]);
    expect(byKey.get("lichess:thibault")!.every((p) => p % 2 === 1)).toBe(true);
    expect(byKey.get("lichess:sergeyb123")!.every((p) => p % 2 === 0)).toBe(true);
  });

  it("matches names case-insensitively", async () => {
    expect(ownerColor(await record(PGN, "lichess:THIBAULT"))).toBe("w");
    expect(ownerColor(await record(PGN.replace('[White "thibault"]', '[White "ThIbAuLt"]'), "lichess:thibault"))).toBe("w");
  });

  it("treats missing, malformed or absent accounts as unknown, never as the opponent", async () => {
    for (const importedFor of [null, "", "thibault", "lichess:", ":thibault", "lichess:someone-else", "lichess:thibaul"]) {
      const facts = extractMoveFacts(await record(PGN, importedFor), analysisFor(PGN));
      expect(facts.every((f) => f.byOwner === null && f.playerKey === null), `importedFor=${String(importedFor)}`).toBe(true);
    }
  });

  it("refuses to guess when both sides carry the account's name", async () => {
    const mirror = PGN.replace('[Black "SergeyB123"]', '[Black "Thibault"]');
    const rec = await record(mirror, "lichess:thibault");
    expect(ownerColor(rec)).toBeNull();
    expect(extractMoveFacts(rec, analysisFor(mirror)).every((f) => f.byOwner === null && f.playerKey === null)).toBe(true);
  });

  it("gives PGN uploads no player key", async () => {
    const upload = PGN.replace(/\[GameId[^\n]*\n/, "").replace(/lichess\.org/g, "example.org");
    const facts = extractMoveFacts(await record(upload, null), analysisFor(upload));
    expect(facts).toHaveLength(PLIES);
    expect(facts.every((f) => f.playerKey === null && f.byOwner === null)).toBe(true);
  });
});

describe("extractMoveFacts: clock facts", () => {
  it("reports remaining time, time spent and the starting time with their provenance", async () => {
    const facts = extractMoveFacts(await record(PGN, "lichess:thibault"), analysisFor(PGN));
    expect(facts[0]).toMatchObject({ clockMs: 300_000, spentMs: null, spentSource: null, spentGap: "first-move", clockFraction: 1 });
    expect(facts[2]).toMatchObject({ clockMs: 302_000, spentMs: 1_000, spentSource: "measured", spentGap: null });
    expect(facts[18]).toMatchObject({ clockMs: 256_000, spentMs: 26_000, spentSource: "measured", initialMs: 300_000, clockResolutionMs: 1000 });
    expect(facts[18]!.clockFraction).toBeCloseTo(256 / 300, 10);
  });

  it("does not clamp the clock fraction: an increment can lift it above 1", async () => {
    const f = extractMoveFacts(await record(PGN, null), analysisFor(PGN))[4]!; // 3.Nf3 {5:04} on 300+3
    expect(f.clockMs).toBe(304_000);
    expect(f.clockFraction).toBeCloseTo(304 / 300, 10);
  });

  it("classifies the game's speed from its TimeControl", async () => {
    const cases: [string, string][] = [["300+3", "blitz"], ["60+0", "bullet"], ["600+0", "rapid"], ["1800+0", "classical"], ["1/86400", "correspondence"]];
    for (const [tc, expected] of cases) {
      const pgn = withHeader(PGN, "TimeControl", tc);
      const facts = extractMoveFacts(await record(pgn, null), analysisFor(pgn));
      expect(new Set(facts.map((f) => f.timeClass)), tc).toEqual(new Set([expected]));
    }
  });

  it("returns null clock fields, not zeros, when the game has no clock annotations", async () => {
    const pgn = withoutClocks(PGN);
    const facts = extractMoveFacts(await record(pgn, "lichess:thibault"), analysisFor(pgn));
    expect(facts).toHaveLength(PLIES);
    for (const f of facts) {
      expect(f).toMatchObject({ clockMs: null, spentMs: null, spentSource: null, spentGap: null, clockFraction: null, timeClass: "blitz", initialMs: 300_000 });
    }
  });

  it("marks individual moves that lack a clock while keeping the other side's data", async () => {
    const pgn = withoutBlackClocks(PGN);
    const facts = extractMoveFacts(await record(pgn, "lichess:thibault"), analysisFor(pgn));
    const black = facts.filter((f) => f.color === "b");
    expect(black.every((f) => f.clockMs === null && f.clockFraction === null && f.spentMs === null)).toBe(true);
    expect(black[0]!.spentGap).toBe("first-move");
    expect(black.slice(1).every((f) => f.spentGap === "missing-clock")).toBe(true);
    const white = facts.filter((f) => f.color === "w");
    expect(white.every((f) => f.clockMs !== null)).toBe(true);
    expect(white[1]).toMatchObject({ spentSource: "measured", spentGap: null });
  });

  it("has no starting time or fraction for correspondence games, and does not call per-move clocks think time", async () => {
    const pgn = withHeader(PGN, "TimeControl", "1/86400");
    const facts = extractMoveFacts(await record(pgn, null), analysisFor(pgn));
    expect(facts.every((f) => f.initialMs === null && f.clockFraction === null && f.spentMs === null && f.spentGap === "correspondence")).toBe(true);
    expect(facts[3]!.clockMs).not.toBeNull();
  });

  it("estimates spent time with a label when the TimeControl is missing, and has no time class", async () => {
    const pgn = withoutHeader(PGN, "TimeControl");
    const facts = extractMoveFacts(await record(pgn, null), analysisFor(pgn));
    expect(facts.every((f) => f.timeClass === "unknown" && f.initialMs === null && f.clockFraction === null)).toBe(true);
    // 10.h4: 4:39 → 4:16 is 23 s if the increment is assumed to be 0 (26 s with the real +3).
    expect(facts[18]).toMatchObject({ spentMs: 23_000, spentSource: "estimated", spentGap: null });
    // A clock that went up (the +3 increment) looks impossible without a known increment: flagged, not guessed.
    expect(facts[2]).toMatchObject({ spentMs: null, spentGap: "inconsistent" });
  });

  it("gives a zero starting time a time class but no fraction (no division by zero)", async () => {
    const pgn = withHeader(PGN, "TimeControl", "0+2");
    const facts = extractMoveFacts(await record(pgn, null), analysisFor(pgn));
    expect(facts.every((f) => f.timeClass === "bullet" && f.initialMs === 0 && f.clockFraction === null)).toBe(true);
  });

  it("reports a 100 ms clock resolution when any clock has tenths", async () => {
    const pgn = PGN.replace("[%clk 0:04:16]", "[%clk 0:04:16.4]");
    const facts = extractMoveFacts(await record(pgn, null), analysisFor(pgn));
    expect(facts.every((f) => f.clockResolutionMs === 100)).toBe(true);
    expect(facts[18]!.clockMs).toBe(256_400);
  });
});

describe("extractMoveFacts: phases and incomplete games", () => {
  it("assigns each move the phase of the position it was played from", async () => {
    const facts = extractMoveFacts(await record(PGN, null), analysisFor(PGN));
    expect(facts.every((f) => f.phase === gamePhase(f.fenBefore))).toBe(true);
    expect(facts[0]!.phase).toBe("opening");
  });

  it("works for an unfinished game that starts in an endgame from a FEN", async () => {
    const pgn = `[Event "Promotion"]\n[White "Pawn"]\n[Black "King"]\n[SetUp "1"]\n[FEN "8/4P1k1/8/8/8/8/8/4K3 w - - 0 1"]\n[Result "*"]\n\n1. Kd2 Kf6 *`;
    const facts = extractMoveFacts(await record(pgn, null), analysisFor(pgn, { 1: "good", 2: "blunder" }));
    expect(facts.map((f) => [f.ply, f.moveNumber, f.phase, f.timeClass])).toEqual([
      [1, 1, "endgame", "unknown"],
      [2, 1, "endgame", "unknown"],
    ]);
  });

  it("numbers moves from the FEN counters when Black moves first", async () => {
    const pgn = `[Event "FEN"]\n[White "Alice"]\n[Black "Bob"]\n[SetUp "1"]\n[FEN "r3k2r/pppq1ppp/2n1bn2/3pp3/3PP3/2N1BN2/PPPQ1PPP/R3K2R b KQkq - 5 8"]\n[TimeControl "180+0"]\n[Result "*"]\n\n8... O-O-O { [%clk 0:02:50] } 9. O-O-O { [%clk 0:02:51] } *`;
    const facts = extractMoveFacts(await record(pgn, null), analysisFor(pgn));
    expect(facts.map((f) => [f.ply, f.color, f.moveNumber, f.clockFraction === null ? null : Math.round(f.clockFraction * 100)])).toEqual([
      [1, "b", 8, 94],
      [2, "w", 9, 95],
    ]);
  });

  it("returns nothing for a game with no moves", async () => {
    const pgn = `[Event "Empty"]\n[White "A"]\n[Black "B"]\n[Result "*"]\n\n*`;
    expect(extractMoveFacts(await record(pgn, null), analysisFor(pgn))).toEqual([]);
  });
});

describe("extractMoveFacts: analysis validity (all or nothing)", () => {
  it("rejects an analysis that is shorter, longer or for different moves", async () => {
    const rec = await record(PGN, "lichess:thibault");
    const a = analysisFor(PGN);
    expect(extractMoveFacts(rec, { ...a, moves: a.moves.slice(0, 20) })).toEqual([]);
    expect(extractMoveFacts(rec, { ...a, moves: [...a.moves, a.moves[0]!] })).toEqual([]);
    expect(extractMoveFacts(rec, { ...a, moves: a.moves.map((m, i) => (i === 5 ? { ...m, san: "Qh5" } : m)) })).toEqual([]);
  });

  it("rejects verdicts that disagree with the game about ply or colour", async () => {
    const rec = await record(PGN, null);
    const a = analysisFor(PGN);
    expect(extractMoveFacts(rec, { ...a, moves: a.moves.map((m, i) => (i === 4 ? { ...m, ply: 99 } : m)) })).toEqual([]);
    expect(extractMoveFacts(rec, { ...a, moves: a.moves.map((m, i) => (i === 4 ? { ...m, color: "b" as const } : m)) })).toEqual([]);
  });

  it("rejects corrupted expected-score values instead of reporting NaN or impossible losses", async () => {
    const rec = await record(PGN, null);
    const a = analysisFor(PGN);
    const corrupt = (patch: object) => ({ ...a, moves: a.moves.map((m, i) => (i === 10 ? { ...m, ...patch } : m)) });
    for (const patch of [{ winBefore: NaN }, { winAfter: Infinity }, { winBefore: 1.2 }, { winAfter: -0.1 }, { winAfter: undefined }]) {
      expect(extractMoveFacts(rec, corrupt(patch)), JSON.stringify(patch)).toEqual([]);
    }
  });

  it("accepts expected scores exactly at 0 and 1", async () => {
    const analysis = analysisFor(PGN, { 3: { cls: "blunder", winBefore: 1, winAfter: 0 } });
    const f = extractMoveFacts(await record(PGN, null), analysis)[2]!;
    expect(f).toMatchObject({ winBefore: 1, winAfter: 0, loss: 1 });
  });
});

describe("extractMoveFacts: classification edge cases", () => {
  it("never reports a negative loss when the move improved the expected score", async () => {
    const analysis = analysisFor(PGN, { 5: { cls: "good", winBefore: 0.4, winAfter: 0.55 } });
    const f = extractMoveFacts(await record(PGN, null), analysis)[4]!;
    expect(f).toMatchObject({ classification: "good", winBefore: 0.4, winAfter: 0.55, loss: 0 });
  });

  it("keeps the stored verdict instead of re-deriving it from the loss", async () => {
    const analysis = analysisFor(PGN, {
      7: { cls: "best", winBefore: 0.9, winAfter: 0.85 }, // engine's top move can still cost score if the position is already lost/won
      9: { cls: "blunder", winBefore: 0.5, winAfter: 0.49 }, // refined analyses may label by a deeper search
      11: { cls: "inaccuracy", winBefore: 0.55, winAfter: 0.5 },
    });
    const facts = extractMoveFacts(await record(PGN, null), analysis);
    expect(facts[6]).toMatchObject({ classification: "best" });
    expect(facts[6]!.loss).toBeCloseTo(0.05, 10);
    expect(facts[8]).toMatchObject({ classification: "blunder" });
    expect(facts[8]!.loss).toBeCloseTo(0.01, 10);
    expect(facts[10]!.loss).toBeCloseTo(0.05, 10);
  });

  it("keeps a missing best-move suggestion as null", async () => {
    const analysis = analysisFor(PGN, { 3: { cls: "mistake", winBefore: 0.6, winAfter: 0.45, bestMoveSan: null } });
    expect(extractMoveFacts(await record(PGN, null), analysis)[2]!.bestSan).toBeNull();
  });
});
