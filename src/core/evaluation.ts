import { opposite, type Color, type Score } from "./types";

/**
 * Logistic fit of centipawns to expected score, fitted by Lichess on rated
 * games (DECISIONS.md D-005). Kept identical so numbers are comparable.
 */
const CP_LOGISTIC_K = 0.00368208;

/** Centipawn scores beyond this are treated as decided. */
const CP_CLAMP = 1000;

/** A score as UCI reports it: from the side to move's point of view. */
export type UciScore = { cp: number } | { mate: number };

/** Convert a side-to-move score into White's point of view. */
export function toWhitePov(score: UciScore, toMove: Color): Score {
  if ("mate" in score) {
    // "mate 0" = side to move is already checkmated; positive = side to move mates.
    const winner = score.mate > 0 ? toMove : opposite(toMove);
    return { mateIn: Math.abs(score.mate), winner };
  }
  return { cp: toMove === "w" ? score.cp : 0 - score.cp || 0 }; // "|| 0" avoids -0
}

/** Expected score for White in [0, 1]. */
export function whiteWinProbability(score: Score): number {
  if ("mateIn" in score) return score.winner === "w" ? 1 : 0;
  const cp = Math.max(-CP_CLAMP, Math.min(CP_CLAMP, score.cp));
  return 1 / (1 + Math.exp(-CP_LOGISTIC_K * cp));
}

/** Expected score for `color` in [0, 1]. */
export function winProbabilityFor(score: Score, color: Color): number {
  const white = whiteWinProbability(score);
  return color === "w" ? white : 1 - white;
}

/** Human-readable score: "+1.35", "−0.40", "M3", "−M2", "1-0", "0-1". */
export function formatScore(score: Score): string {
  if ("mateIn" in score) {
    if (score.mateIn === 0) return score.winner === "w" ? "1-0" : "0-1";
    return `${score.winner === "b" ? "−" : ""}M${score.mateIn}`;
  }
  if (score.cp === 0) return "0.00";
  return `${score.cp > 0 ? "+" : "−"}${(Math.abs(score.cp) / 100).toFixed(2)}`;
}
