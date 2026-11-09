import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeGame, uciToSan, type PositionSearcher } from "./gameAnalysis";
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
