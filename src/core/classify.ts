/**
 * Move quality from expected-score loss. This is the *symptom* layer: it
 * says how much a move cost, not why. Cause classification (the product's
 * differentiator) builds on top of this — see ROADMAP.md Phase 3.
 */

export type MoveClass = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

/**
 * Thresholds on expected-score loss (0–1 scale) for the moving side.
 * Equivalent to Lichess' 0.1 / 0.2 / 0.3 "winning chances" thresholds on a
 * −1…1 scale (DECISIONS.md D-005).
 */
export const LOSS_THRESHOLDS = {
  inaccuracy: 0.05,
  mistake: 0.1,
  blunder: 0.15,
} as const;

/**
 * @param winBefore expected score for the mover before the move (0–1)
 * @param winAfter expected score for the mover after the move (0–1)
 * @param playedBest whether the move matched the engine's top choice
 */
export function classifyMove(winBefore: number, winAfter: number, playedBest: boolean): MoveClass {
  if (playedBest) return "best";
  // Epsilon so a loss sitting exactly on a threshold isn't lost to float error.
  const loss = Math.max(0, winBefore - winAfter) + 1e-9;
  if (loss >= LOSS_THRESHOLDS.blunder) return "blunder";
  if (loss >= LOSS_THRESHOLDS.mistake) return "mistake";
  if (loss >= LOSS_THRESHOLDS.inaccuracy) return "inaccuracy";
  return "good";
}

/**
 * Per-move accuracy (0–100) from expected-score loss, using Lichess' fitted
 * curve on a percentage-point loss.
 */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const lossPct = Math.max(0, winBefore - winAfter) * 100;
  const raw = 103.1668 * Math.exp(-0.04354 * lossPct) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Game accuracy as the harmonic mean of move accuracies. Harmonic mean
 * punishes single disasters more than an arithmetic mean, which matches how
 * a blunder decides a game. Returns null for no moves.
 */
export function gameAccuracy(accuracies: readonly number[]): number | null {
  if (accuracies.length === 0) return null;
  // Floor each at 1 so a 0% move doesn't make the mean 0 or divide by zero.
  const sumInv = accuracies.reduce((s, a) => s + 1 / Math.max(1, a), 0);
  return accuracies.length / sumInv;
}
