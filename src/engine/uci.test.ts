import { describe, expect, it } from "vitest";
import { parseBestMove, parseInfo } from "./uci";

describe("parseInfo", () => {
  it("parses a typical multipv line", () => {
    const info = parseInfo(
      "info depth 18 seldepth 24 multipv 2 score cp -35 nodes 123456 nps 900000 hashfull 50 time 137 pv e7e5 g1f3 b8c6",
    );
    expect(info).toEqual({
      depth: 18,
      multipv: 2,
      score: { cp: -35 },
      bound: false,
      pv: ["e7e5", "g1f3", "b8c6"],
      nodes: 123456,
      timeMs: 137,
    });
  });

  it("parses mate scores and bounds", () => {
    expect(parseInfo("info depth 5 score mate -2 pv h5f7")?.score).toEqual({ mate: -2 });
    expect(parseInfo("info depth 9 score cp 20 lowerbound pv e2e4")?.bound).toBe(true);
  });

  it("accepts the terminal-position line with no PV", () => {
    expect(parseInfo("info depth 0 score mate 0")).toMatchObject({ depth: 0, score: { mate: 0 }, pv: [] });
  });

  it("ignores lines without a score", () => {
    expect(parseInfo("info string NNUE evaluation using nn-xyz.nnue")).toBeNull();
    expect(parseInfo("info depth 10 currmove e2e4 currmovenumber 1")).toBeNull();
    expect(parseInfo("bestmove e2e4")).toBeNull();
  });
});

describe("parseBestMove", () => {
  it("parses moves, ponder and (none)", () => {
    expect(parseBestMove("bestmove e2e4 ponder e7e5")).toEqual({ move: "e2e4" });
    expect(parseBestMove("bestmove e7e8q")).toEqual({ move: "e7e8q" });
    expect(parseBestMove("bestmove (none)")).toEqual({ move: null });
    expect(parseBestMove("info depth 1")).toBeNull();
  });
});
