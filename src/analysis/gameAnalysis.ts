import { Chess } from "chess.js";
import { classifyMove, gameAccuracy, moveAccuracy, type MoveClass } from "../core/classify";
import { winProbabilityFor } from "../core/evaluation";
import { gamePositions, type ParsedGame } from "../core/pgn";
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

export interface GameAnalysis {
  positions: PositionEval[];
  moves: MoveVerdict[];
  accuracy: Record<Color, number | null>;
  limits: SearchLimits;
  /** Wall-clock time spent analysing, in ms (for performance tracking). */
  durationMs: number;
}

export interface AnalyzeOptions {
  limits?: SearchLimits;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

export const DEFAULT_LIMITS: SearchLimits = { depth: 14 };

/** Identifies the engine build; part of every stored analysis key. */
export const ENGINE_ID = "stockfish-19-lite-single";

/**
 * Key for caching analyses: results are only reusable for the same engine
 * build and search settings.
 */
export function analysisEngineKey(limits: SearchLimits): string {
  const parts = [ENGINE_ID];
  if (limits.depth !== undefined) parts.push(`d${limits.depth}`);
  if (limits.movetimeMs !== undefined) parts.push(`t${limits.movetimeMs}`);
  if ((limits.multiPv ?? 1) !== 1) parts.push(`pv${limits.multiPv}`);
  return parts.join("|");
}

/**
 * Evaluate every position of a game and grade each move by the change in
 * the mover's expected score. Positions are searched independently at a
 * fixed depth so results are reproducible for the same engine build.
 */
export async function analyzeGame(
  engine: PositionSearcher,
  game: ParsedGame,
  { limits = DEFAULT_LIMITS, signal, onProgress }: AnalyzeOptions = {},
): Promise<GameAnalysis> {
  const started = performance.now();
  const fens = gamePositions(game);
  const positions: PositionEval[] = [];
  await engine.newGame();

  for (const [ply, fen] of fens.entries()) {
    signal?.throwIfAborted();
    const result = await engine.search(fen, limits);
    positions.push(toPositionEval(ply, result));
    onProgress?.(ply + 1, fens.length);
  }

  const moves = game.moves.map((move, i): MoveVerdict => {
    const before = positions[i]!;
    const after = positions[i + 1]!;
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
  });

  const accuracyOf = (color: Color) => gameAccuracy(moves.filter((m) => m.color === color).map((m) => m.accuracy));
  return {
    positions,
    moves,
    accuracy: { w: accuracyOf("w"), b: accuracyOf("b") },
    limits,
    durationMs: performance.now() - started,
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
