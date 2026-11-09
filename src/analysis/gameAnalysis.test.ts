import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analysisEngineKey, analyzeGame, refineTargets, uciToSan, type PositionSearcher } from "./gameAnalysis";
import { parseGame } from "../core/pgn";
import { UciEngine } from "../engine/engine";
import { createNodeTransport } from "../engine/nodeTransport";
import { SCHOLARS_MATE } from "../test/fixtures";

describe("uciToSan", () => {
  it("converts legal moves and falls back for illegal ones", () => {
    const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(uciToSan(start, "g1f3")).toBe("Nf3");
    expect(uciToSan(start, "e2e5")).toBe("e2e5");
  });
});

describe("analyzeGame with a fake engine", () => {
  it("supports cancellation", async () => {
    const controller = new AbortController();
    const fake: PositionSearcher = {
      newGame: async () => {},
      search: async (fen) => {
        controller.abort();
        return { fen, bestMove: null, lines: [{ multipv: 1, depth: 1, score: { cp: 0 }, pv: [] }] };
      },
    };
    await expect(analyzeGame(fake, parseGame(SCHOLARS_MATE), { signal: controller.signal })).rejects.toThrow();
  });
});

describe("analyzeGame (real Stockfish)", () => {
  let engine: UciEngine;
  beforeAll(() => {
    engine = new UciEngine(createNodeTransport());
  });
  afterAll(() => engine.terminate());

  it("flags 3...Nf6?? as a blunder and finds the mate", async () => {
    const game = parseGame(SCHOLARS_MATE);
    const progress: number[] = [];
    const analysis = await analyzeGame(engine, game, {
      limits: { depth: 10 },
      onProgress: (done) => progress.push(done),
    });

    expect(analysis.positions).toHaveLength(game.moves.length + 1);
    expect(progress.at(-1)).toBe(game.moves.length + 1);

    const nf6 = analysis.moves[5]!;
    expect(nf6.san).toBe("Nf6");
    expect(nf6.classification).toBe("blunder");
    expect(nf6.bestMoveSan).not.toBeNull();
    expect(nf6.winAfter).toBe(0);

    const qxf7 = analysis.moves[6]!;
    expect(qxf7.classification).toBe("best");
    expect(analysis.positions.at(-1)!.score).toEqual({ mateIn: 0, winner: "w" });

    expect(analysis.accuracy.w!).toBeGreaterThan(analysis.accuracy.b!);
  });
});

describe("refine pass (scripted engine)", () => {
  // 4 moves → 5 positions; scores are White-POV centipawns. At depth 10, move 3
  // (White, position 2 → 3) drops +50 → −400: a blunder candidate.
  const SHALLOW = [20, 30, 50, -400, -380];
  const DEEP = [25, 35, 60, -30, -20]; // deeper search says move 3 was fine
  const game = parseGame("1. e4 e5 2. Nf3 Nc6 *");
  const fens = [game.startFen, ...game.moves.map((m) => m.fenAfter)];

  const scripted = (): PositionSearcher & { searches: { ply: number; depth: number }[] } => {
    const searches: { ply: number; depth: number }[] = [];
    return {
      searches,
      newGame: async () => {},
      search: async (fen, limits) => {
        const ply = fens.indexOf(fen);
        const depth = limits?.depth ?? 0;
        searches.push({ ply, depth });
        const cp = (depth >= 14 ? DEEP : SHALLOW)[ply]!;
        return { fen, bestMove: "a2a3", lines: [{ multipv: 1, depth, score: { cp }, pv: ["a2a3"] }] };
      },
    };
  };

  it("re-searches both sides of suspicious moves only, and grades them on deep evals", async () => {
    const engine = scripted();
    const analysis = await analyzeGame(engine, game, { limits: { depth: 10 }, refine: { depth: 14, minLoss: 0.03 } });

    expect(engine.searches.filter((s) => s.depth === 14).map((s) => s.ply)).toEqual([2, 3]);
    expect(analysis.refinedPositions).toBe(2);
    expect(analysis.moves[2]!.classification).not.toBe("blunder"); // deep evals overturned it
    expect(analysis.positions[3]!.depth).toBe(14);
  });

  it("never mixes depths within one verdict", async () => {
    const analysis = await analyzeGame(scripted(), game, { limits: { depth: 10 }, refine: { depth: 14, minLoss: 0.03 } });
    // Move 4 (Black, position 3 → 4): position 3 was re-searched but 4 wasn't, so the move
    // must be graded on the shallow pair (−400 → −380), not deep −30 → shallow −380.
    const m4 = analysis.moves[3]!;
    expect(m4.winBefore).toBeCloseTo(1 / (1 + Math.exp(-0.00368208 * 400)), 6); // shallow −400, Black POV
    expect(m4.winAfter).toBeCloseTo(1 / (1 + Math.exp(-0.00368208 * 380)), 6); // shallow −380, Black POV
  });

  it("is a single pass without a refine plan, and keys caches by plan", async () => {
    const engine = scripted();
    const analysis = await analyzeGame(engine, game, { limits: { depth: 10 } });
    expect(engine.searches).toHaveLength(5);
    expect(analysis.refine).toBeNull();
    expect(analysisEngineKey({ depth: 10 }, { depth: 14, minLoss: 0.03 })).toBe("stockfish-19-lite-single|d10|r14@0.03");
    expect(analysisEngineKey({ depth: 14 })).toBe("stockfish-19-lite-single|d14");
  });

  it("selects refine targets from first-pass losses", () => {
    const evals = SHALLOW.map((cp, ply) => ({ ply, fen: fens[ply]!, score: { cp }, bestMove: null, bestLine: [], depth: 10 }));
    expect(refineTargets(game.moves, evals, 0.03)).toEqual([2, 3]);
    expect(refineTargets(game.moves, evals, 0.9)).toEqual([]);
  });
});
