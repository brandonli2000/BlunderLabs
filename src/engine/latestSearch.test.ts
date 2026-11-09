import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UciEngine, type SearchLimits } from "./engine";
import { LatestSearch } from "./latestSearch";
import { createNodeTransport } from "./nodeTransport";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const MATE_IN_ONE = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1";

describe("LatestSearch (real Stockfish)", () => {
  let engine: UciEngine;
  const searched: string[] = [];
  beforeAll(async () => {
    engine = new UciEngine(createNodeTransport());
    await engine.init();
    // Record which positions actually reach the engine.
    const search = engine.search.bind(engine);
    engine.search = (fen, limits, onInfo) => {
      searched.push(fen);
      return search(fen, limits, onInfo);
    };
  });
  afterAll(() => engine.terminate());

  it("searches only the newest position and drops superseded updates", async () => {
    const live = new LatestSearch(engine);
    const updatesFor = new Set<string>();
    const deep: SearchLimits = { depth: 30 }; // would take far too long if not stopped

    const finalLines = await new Promise<number>((resolve) => {
      const onUpdate = (fen: string, lines: unknown[], final: boolean) => {
        updatesFor.add(fen);
        if (final && fen === MATE_IN_ONE) resolve(lines.length);
      };
      live.request(START, deep, onUpdate);
      live.request(AFTER_E4, deep, onUpdate); // superseded before it starts
      live.request(MATE_IN_ONE, { depth: 8, multiPv: 2 }, onUpdate);
    });

    expect(searched).toEqual([START, MATE_IN_ONE]); // AFTER_E4 never searched; START stopped
    expect([...updatesFor]).toEqual([MATE_IN_ONE]);
    expect(finalLines).toBe(2);
  });

  it("cancel stops delivery", async () => {
    const live = new LatestSearch(engine);
    let updates = 0;
    live.request(START, { depth: 30 }, () => updates++);
    live.cancel();
    // A quick follow-up search proves the engine was freed.
    const result = await engine.search(MATE_IN_ONE, { depth: 6 });
    expect(result.bestMove).toBe("a1a8");
    expect(updates).toBe(0);
  });
});
