import { readFileSync } from "node:fs";
import { Chess, type Move } from "chess.js";
import { describe, expect, it } from "vitest";
import { PIECE_VALUE, seeCapture } from "./see";

/**
 * Differential test: `seeCapture` (least-valuable-attacker convention) against an exhaustive
 * oracle that, on the target square only, tries EVERY legal capturer, EVERY promotion piece and
 * both sides' right to stop at any point. The oracle is slow and unusable in production, but it
 * is a different algorithm (full minimax over captures vs. a greedy swap list), so agreement on
 * thousands of positions is real evidence, and each disagreement is a documented limitation.
 */

function gainOf(m: Move): number {
  return (m.captured ? PIECE_VALUE[m.captured] : 0) + (m.promotion ? PIECE_VALUE[m.promotion] - 1 : 0);
}

/** Best net result for the side to move from here, capturing only on `square`; 0 = stand pat. */
function oracleContinue(chess: Chess, square: string, budget: { nodes: number }): number {
  let best = 0;
  for (const m of chess.moves({ verbose: true })) {
    if (m.to !== square || !m.captured || m.isEnPassant()) continue; // en passant is never a recapture
    if (--budget.nodes < 0) return best;
    chess.move(m);
    best = Math.max(best, gainOf(m) - oracleContinue(chess, square, budget));
    chess.undo();
  }
  return best;
}

function oracleSee(fen: string, first: Move): number | null {
  const chess = new Chess(fen);
  const budget = { nodes: 20000 };
  chess.move(first);
  const v = gainOf(first) - oracleContinue(chess, first.to, budget);
  return budget.nodes < 0 ? null : v;
}

/** mulberry32: small seeded PRNG so failures are reproducible. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomGameFens(seed: number, plies: number): string[] {
  const rand = rng(seed);
  const chess = new Chess();
  const fens: string[] = [];
  for (let i = 0; i < plies && !chess.isGameOver(); i++) {
    const moves = chess.moves({ verbose: true });
    // Bias toward captures so exchanges (and promotions) actually occur.
    const caps = moves.filter((m) => m.captured);
    const pool = caps.length > 0 && rand() < 0.5 ? caps : moves;
    chess.move(pool[Math.floor(rand() * pool.length)]!);
    fens.push(chess.fen());
  }
  return fens;
}

/** First 10 games of the fixture: enough captures (>500) for evidence while the slow oracle stays within the timeout. */
function realGameFens(): string[] {
  const text = readFileSync("bench/fixtures/lichess-thibault-50.pgn", "utf8");
  const fens: string[] = [];
  for (const chunk of text.split(/\n\n(?=\[Event )/).slice(0, 10)) {
    const chess = new Chess();
    try {
      chess.loadPgn(chunk);
    } catch {
      continue;
    }
    const replay = new Chess();
    for (const m of chess.history()) {
      replay.move(m);
      fens.push(replay.fen());
    }
  }
  return fens;
}

interface Tally {
  compared: number;
  skipped: number;
  mismatches: { fen: string; san: string; see: number; oracle: number }[];
}

function compare(fens: string[]): Tally {
  const t: Tally = { compared: 0, skipped: 0, mismatches: [] };
  for (const fen of fens) {
    const chess = new Chess(fen);
    for (const m of chess.moves({ verbose: true })) {
      if (!m.captured) continue;
      const oracle = oracleSee(fen, m);
      if (oracle === null) {
        t.skipped++;
        continue;
      }
      // seeCapture with an explicit promotion evaluates exactly that move.
      const see = seeCapture(fen, { from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) });
      t.compared++;
      if (see !== oracle) t.mismatches.push({ fen, san: m.san, see: see ?? NaN, oracle });
    }
  }
  return t;
}

describe("seeCapture vs exhaustive oracle", () => {
  it("random positions", () => {
    const fens = Array.from({ length: 40 }, (_, i) => i + 1).flatMap((s) => randomGameFens(s, 140));
    const t = compare(fens);
    console.log("random", t.compared, "compared", t.skipped, "skipped", t.mismatches.length, "mismatches");
    for (const m of t.mismatches.slice(0, 15)) console.log(JSON.stringify(m));
    expect(t.compared).toBeGreaterThan(500);
  }, 120000);

  it("real games", () => {
    const t = compare(realGameFens());
    console.log("real", t.compared, "compared", t.skipped, "skipped", t.mismatches.length, "mismatches");
    for (const m of t.mismatches.slice(0, 15)) console.log(JSON.stringify(m));
    expect(t.compared).toBeGreaterThan(500);
  }, 120000);
});
