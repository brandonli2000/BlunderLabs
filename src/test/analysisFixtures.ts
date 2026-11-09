import type { GameAnalysis, MoveVerdict } from "../analysis/gameAnalysis";
import type { MoveClass } from "../core/classify";
import { parseGame } from "../core/pgn";

/** Expected-score drop used for a class when a test doesn't give exact numbers. */
const TYPICAL_DROP: Record<MoveClass, number> = { best: 0, good: 0.01, inaccuracy: 0.06, mistake: 0.12, blunder: 0.3 };

/** What a test wants at one ply: a class (typical numbers) or exact numbers. */
export type VerdictSpec = MoveClass | { cls: MoveClass; winBefore: number; winAfter: number; bestMoveSan?: string | null };

/**
 * An analysis aligned with `pgn`: every ply is "good" unless `spec` says
 * otherwise, keyed by 1-based ply. Test data only; never evaluation data.
 */
export function analysisFor(pgn: string, spec: Record<number, VerdictSpec> = {}): GameAnalysis {
  const game = parseGame(pgn);
  const moves: MoveVerdict[] = game.moves.map((m) => {
    const s = spec[m.ply] ?? "good";
    const exact = typeof s === "string" ? null : s;
    const cls = exact ? exact.cls : (s as MoveClass);
    const winBefore = exact?.winBefore ?? 0.6;
    const winAfter = exact?.winAfter ?? winBefore - TYPICAL_DROP[cls];
    return {
      ply: m.ply,
      color: m.color,
      san: m.san,
      classification: cls,
      winBefore,
      winAfter,
      accuracy: 50,
      bestMoveSan: exact && "bestMoveSan" in exact ? (exact.bestMoveSan ?? null) : cls === "good" || cls === "best" ? null : "Nf3",
      bestMoveUci: null,
    };
  });
  return {
    positions: [game.startFen, ...game.moves.map((m) => m.fenAfter)].map((fen, ply) => ({ ply, fen, score: { cp: 0 }, bestMove: null, bestLine: [], depth: 14 })),
    moves,
    accuracy: { w: null, b: null },
    limits: { depth: 14 },
    refine: null,
    refinedPositions: 0,
    durationMs: 1,
  };
}
