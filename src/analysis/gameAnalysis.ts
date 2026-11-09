import { Chess } from "chess.js";
import { classifyMove, gameAccuracy, moveAccuracy, type MoveClass } from "../core/classify";
import { winProbabilityFor } from "../core/evaluation";
import { gamePositions, type GameMove, type ParsedGame } from "../core/pgn";
import type { Color, Score } from "../core/types";
import type { PvLine, SearchLimits, SearchResult } from "../engine/engine";

/** The subset of UciEngine that analysis needs; lets tests pass a fake. */
export interface PositionSearcher {
  search(fen: string, limits?: SearchLimits): Promise<SearchResult>;
  newGame(): Promise<void>;
}

export interface PositionEval {
  /** 0 = start position, n = after move n. */
  ply: number;
  fen: string;
  /** White POV. */
  score: Score;
  bestMove: string | null;
  bestLine: string[];
  depth: number;
}

export interface MoveVerdict {
  ply: number;
  color: Color;
  san: string;
  classification: MoveClass;
  /** Expected score for the mover before and after the move (0–1). */
  winBefore: number;
  winAfter: number;
  accuracy: number;
  /** Engine's preferred move in SAN, null if it equals the played move. */
  bestMoveSan: string | null;
  bestMoveUci: string | null;
}

/**
 * Optional second pass: re-search, at a greater depth, both positions around
 * every move whose first-pass expected-score loss is at least `minLoss`.
 */
export interface RefinePlan {
  depth: number;
  minLoss: number;
}

export interface GameAnalysis {
  positions: PositionEval[];
  moves: MoveVerdict[];
  accuracy: Record<Color, number | null>;
  /** First-pass search limits (applied to every position). */
  limits: SearchLimits;
  /** Second-pass plan, or null for a single uniform pass. */
  refine: RefinePlan | null;
  /** Number of positions re-searched by the refine pass. */
  refinedPositions: number;
  /** Wall-clock time spent analysing, in ms (for performance tracking). */
  durationMs: number;
}

export interface AnalyzeOptions {
  limits?: SearchLimits;
  refine?: RefinePlan | null;
  signal?: AbortSignal;
  /** Progress in searches done / searches planned so far (the refine pass adds to the total). */
  onProgress?: (done: number, total: number) => void;
}

export const DEFAULT_LIMITS: SearchLimits = { depth: 14 };

/**
 * The analysis plan used by both single-game and batch analysis. Changing it
 * changes classifications, so any change must be justified by the strategy
 * experiment (bench/strategy.bench.ts, ENGINEERING_LOG).
 */
export const DEFAULT_PLAN: { limits: SearchLimits; refine: RefinePlan | null } = { limits: DEFAULT_LIMITS, refine: null };

/** Identifies the engine build; part of every stored analysis key. */
export const ENGINE_ID = "stockfish-19-lite-single";

/**
 * Key for caching analyses: results are only reusable for the same engine
 * build and search settings.
 */
export function analysisEngineKey(limits: SearchLimits, refine: RefinePlan | null = null): string {
  const parts = [ENGINE_ID];
  if (limits.depth !== undefined) parts.push(`d${limits.depth}`);
  if (limits.movetimeMs !== undefined) parts.push(`t${limits.movetimeMs}`);
  if ((limits.multiPv ?? 1) !== 1) parts.push(`pv${limits.multiPv}`);
  if (refine) parts.push(`r${refine.depth}@${refine.minLoss}`);
  return parts.join("|");
}

/**
 * Evaluate every position of a game and grade each move by the change in
 * the mover's expected score. Searches use fixed depths so results are
 * reproducible for the same engine build.
 *
 * With `refine`, a move is graded on the deeper evaluations only when *both*
 * of its positions were re-searched, so a verdict never compares evaluations
 * from two different depths.
 */
export async function analyzeGame(
  engine: PositionSearcher,
  game: ParsedGame,
  { limits = DEFAULT_LIMITS, refine = null, signal, onProgress }: AnalyzeOptions = {},
): Promise<GameAnalysis> {
  const started = performance.now();
  const fens = gamePositions(game);
  await engine.newGame();

  let total = fens.length;
  let done = 0;
  const first: PositionEval[] = [];
  for (const [ply, fen] of fens.entries()) {
    signal?.throwIfAborted();
    first.push(toPositionEval(ply, await engine.search(fen, limits)));
    onProgress?.(++done, total);
  }

  const deep = new Map<number, PositionEval>();
  if (refine) {
    const targets = refineTargets(game.moves, first, refine.minLoss);
    total += targets.length;
    for (const ply of targets) {
      signal?.throwIfAborted();
      deep.set(ply, toPositionEval(ply, await engine.search(fens[ply]!, { ...limits, depth: refine.depth })));
      onProgress?.(++done, total);
    }
  }

  const moves = game.moves.map((move, i): MoveVerdict => {
    const useDeep = deep.has(i) && deep.has(i + 1);
    return gradeMove(move, useDeep ? deep.get(i)! : first[i]!, useDeep ? deep.get(i + 1)! : first[i + 1]!);
  });

  const accuracyOf = (color: Color) => gameAccuracy(moves.filter((m) => m.color === color).map((m) => m.accuracy));
  return {
    positions: first.map((p) => deep.get(p.ply) ?? p),
    moves,
    accuracy: { w: accuracyOf("w"), b: accuracyOf("b") },
    limits,
    refine,
    refinedPositions: deep.size,
    durationMs: performance.now() - started,
  };
}

/** Plies of the positions to re-search: both sides of every move losing ≥ minLoss on the first pass. */
export function refineTargets(moves: readonly GameMove[], evals: readonly PositionEval[], minLoss: number): number[] {
  const plies = new Set<number>();
  moves.forEach((move, i) => {
    const loss = winProbabilityFor(evals[i]!.score, move.color) - winProbabilityFor(evals[i + 1]!.score, move.color);
    if (loss >= minLoss) {
      plies.add(i);
      plies.add(i + 1);
    }
  });
  return [...plies].sort((a, b) => a - b);
}

function gradeMove(move: GameMove, before: PositionEval, after: PositionEval): MoveVerdict {
  const winBefore = winProbabilityFor(before.score, move.color);
  const winAfter = winProbabilityFor(after.score, move.color);
  const playedBest = before.bestMove === move.uci;
  return {
    ply: move.ply,
    color: move.color,
    san: move.san,
    classification: classifyMove(winBefore, winAfter, playedBest),
    winBefore,
    winAfter,
    accuracy: moveAccuracy(winBefore, winAfter),
    bestMoveSan: playedBest || !before.bestMove ? null : uciToSan(move.fenBefore, before.bestMove),
    bestMoveUci: playedBest ? null : before.bestMove,
  };
}

function toPositionEval(ply: number, result: SearchResult): PositionEval {
  const top: PvLine | undefined = result.lines[0];
  if (!top) throw new Error(`Engine returned no evaluation for ply ${ply} (${result.fen})`);
  return {
    ply,
    fen: result.fen,
    score: top.score,
    bestMove: result.bestMove,
    bestLine: top.pv,
    depth: top.depth,
  };
}

/** Convert a UCI move to SAN in the given position; returns the UCI string if illegal. */
export function uciToSan(fen: string, uci: string): string {
  try {
    const chess = new Chess(fen);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(promotion ? { promotion } : {}) }).san;
  } catch {
    return uci;
  }
}
