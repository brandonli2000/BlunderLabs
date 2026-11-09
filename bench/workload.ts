/**
 * Shared benchmark workload, run by both bench/node.bench.ts (Node) and
 * bench/browser.ts (Chrome, via /bench.html in dev). Uses only recorded
 * real games from src/import/fixtures so runs are reproducible.
 */
import lichessPgn from "../src/import/fixtures/lichess-thibault-3.pgn?raw";
import chesscomMonth from "../src/import/fixtures/chesscom-month.json?raw";
import { analyzeGame, ENGINE_ID } from "../src/analysis/gameAnalysis";
import { parseGame, splitPgn } from "../src/core/pgn";
import type { UciEngine } from "../src/engine/engine";
import { toGameRecord } from "../src/library/gameRecord";

export const BENCH_DEPTH = 14; // same as DEFAULT_LIMITS used by the app
const INIT_RUNS = 5;
const PARSE_REPEATS = 100;

export function benchmarkGames(): { label: string; pgn: string }[] {
  const lichess = splitPgn(lichessPgn).map((pgn, i) => ({ label: `lichess-${i + 1}`, pgn }));
  const chesscom = (JSON.parse(chesscomMonth) as { games: { pgn: string }[] }).games.map((g, i) => ({
    label: `chesscom-${i + 1}`,
    pgn: g.pgn,
  }));
  return [...lichess, ...chesscom];
}

export interface BenchReport {
  engine: string;
  depth: number;
  init: { runsMs: number[]; medianMs: number };
  analysis: { label: string; plies: number; positions: number; ms: number; positionsPerSec: number; storedBytes: number }[];
  analysisTotal: { positions: number; ms: number; positionsPerSec: number };
  parse: { games: number; ms: number; usPerGame: number };
}

export async function runBenchmarks(createEngine: () => UciEngine, log: (msg: string) => void = () => {}): Promise<BenchReport> {
  // 1. Engine start-up: create a fresh engine (worker + wasm instantiate) and wait for readyok.
  const runsMs: number[] = [];
  let engine: UciEngine | null = null;
  for (let i = 0; i < INIT_RUNS; i++) {
    engine?.terminate();
    engine = createEngine();
    const t0 = performance.now();
    await engine.init();
    runsMs.push(performance.now() - t0);
    log(`init run ${i + 1}: ${runsMs.at(-1)!.toFixed(0)} ms`);
  }

  // 2. Full-game analysis at the app's default depth, one game at a time.
  const analysis: BenchReport["analysis"] = [];
  for (const { label, pgn } of benchmarkGames()) {
    const game = parseGame(pgn);
    const result = await analyzeGame(engine!, game, { limits: { depth: BENCH_DEPTH } });
    const positions = result.positions.length;
    analysis.push({
      label,
      plies: game.moves.length,
      positions,
      ms: result.durationMs,
      positionsPerSec: positions / (result.durationMs / 1000),
      // JSON size approximates the structured-clone size stored in IndexedDB.
      storedBytes: new TextEncoder().encode(JSON.stringify(result)).length,
    });
    log(`${label}: ${positions} positions in ${(result.durationMs / 1000).toFixed(2)} s`);
  }
  engine!.terminate();

  // 3. Import pipeline CPU cost: PGN parse + identity hash + record building.
  const pgns = benchmarkGames().map((g) => g.pgn);
  const t0 = performance.now();
  for (let r = 0; r < PARSE_REPEATS; r++) {
    for (const pgn of pgns) await toGameRecord(pgn, null, 0);
  }
  const parseMs = performance.now() - t0;
  const parsedGames = PARSE_REPEATS * pgns.length;

  const totalPositions = analysis.reduce((s, a) => s + a.positions, 0);
  const totalMs = analysis.reduce((s, a) => s + a.ms, 0);
  return {
    engine: ENGINE_ID,
    depth: BENCH_DEPTH,
    init: { runsMs, medianMs: median(runsMs) },
    analysis,
    analysisTotal: { positions: totalPositions, ms: totalMs, positionsPerSec: totalPositions / (totalMs / 1000) },
    parse: { games: parsedGames, ms: parseMs, usPerGame: (parseMs * 1000) / parsedGames },
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function formatReport(report: BenchReport): string {
  const lines = [
    `engine ${report.engine}, depth ${report.depth}`,
    `init: median ${report.init.medianMs.toFixed(0)} ms (runs: ${report.init.runsMs.map((m) => m.toFixed(0)).join(", ")})`,
    ...report.analysis.map(
      (a) =>
        `${a.label.padEnd(11)} ${String(a.positions).padStart(4)} pos  ${(a.ms / 1000).toFixed(2).padStart(6)} s  ${a.positionsPerSec.toFixed(1).padStart(6)} pos/s  ${(a.storedBytes / 1024).toFixed(1)} KB`,
    ),
    `analysis total: ${report.analysisTotal.positions} positions, ${(report.analysisTotal.ms / 1000).toFixed(1)} s, ${report.analysisTotal.positionsPerSec.toFixed(1)} pos/s`,
    `import parse: ${report.parse.games} games, ${report.parse.usPerGame.toFixed(0)} µs/game`,
  ];
  return lines.join("\n");
}
