import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UciEngine } from "./engine";
import { createNodeTransport } from "./nodeTransport";

// Integration tests against the real Stockfish WASM build used in the browser.
describe("UciEngine (real Stockfish)", () => {
  let engine: UciEngine;
  beforeAll(async () => {
    engine = new UciEngine(createNodeTransport());
    await engine.init();
  });
  afterAll(() => engine.terminate());

  it("finds mate in one and reports it from White's POV", async () => {
    // White: Kg1, Ra1; Black: Kg8, pawns f7 g7 h7: back-rank mate with Ra8#.
    const result = await engine.search("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", { depth: 8 });
    expect(result.bestMove).toBe("a1a8");
    expect(result.lines[0]!.score).toEqual({ mateIn: 1, winner: "w" });
  });

  it("normalizes scores when Black is to move", async () => {
    const result = await engine.search("r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1", { depth: 8 });
    expect(result.bestMove).toBe("a8a1");
    expect(result.lines[0]!.score).toEqual({ mateIn: 1, winner: "b" });
  });

  it("handles checkmate and stalemate positions", async () => {
    const mated = await engine.search("R5k1/5ppp/8/8/8/8/8/6K1 b - - 1 1", { depth: 5 });
    expect(mated.bestMove).toBeNull();
    expect(mated.lines[0]!.score).toEqual({ mateIn: 0, winner: "w" });

    const stalemate = await engine.search("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", { depth: 5 });
    expect(stalemate.bestMove).toBeNull();
    expect(stalemate.lines[0]!.score).toEqual({ cp: 0 });
  });

  it("returns ordered MultiPV lines and serializes concurrent searches", async () => {
    const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const [multi, single] = await Promise.all([
      engine.search(start, { depth: 8, multiPv: 3 }),
      engine.search(start, { depth: 6 }),
    ]);
    expect(multi.lines.map((l) => l.multipv)).toEqual([1, 2, 3]);
    expect(new Set(multi.lines.map((l) => l.pv[0])).size).toBe(3);
    expect(single.lines).toHaveLength(1);
  });
});

describe("UciEngine failure handling", () => {
  /** A transport that answers the handshake, then lets the test crash it. */
  function crashable() {
    let lineHandler: (line: string) => void = () => {};
    let errorHandler: (message: string) => void = () => {};
    const transport = {
      send(command: string) {
        if (command === "uci") queueMicrotask(() => lineHandler("uciok"));
        if (command === "isready") queueMicrotask(() => lineHandler("readyok"));
        // "go" never answers: the search hangs until the crash.
      },
      onLine: (h: (line: string) => void) => (lineHandler = h),
      onError: (h: (message: string) => void) => (errorHandler = h),
      terminate() {},
    };
    return { transport, crash: (msg: string) => errorHandler(msg) };
  }

  it("rejects the in-flight search and later requests when the worker crashes", async () => {
    const { transport, crash } = crashable();
    const engine = new UciEngine(transport);
    const pending = engine.search("8/8/8/8/8/8/8/K6k w - - 0 1", { depth: 5 });
    await new Promise((r) => setTimeout(r, 10));
    crash("RuntimeError: memory access out of bounds");

    await expect(pending).rejects.toThrow(/Engine crashed: RuntimeError/);
    expect(engine.isDead).toBe(true);
    await expect(engine.search("8/8/8/8/8/8/8/K6k w - - 0 1")).rejects.toThrow(/terminated/);
    await expect(engine.newGame()).rejects.toThrow(/terminated/);
  });

  it("rejects a pending handshake on crash instead of hanging", async () => {
    let errorHandler: (message: string) => void = () => {};
    const engine = new UciEngine({ send() {}, onLine() {}, onError: (h) => (errorHandler = h), terminate() {} });
    const ready = engine.init();
    errorHandler("failed to load wasm");
    await expect(ready).rejects.toThrow(/failed to load wasm/);
  });
});
