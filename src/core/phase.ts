import { piecesFromFen } from "./fen";

export type GamePhase = "opening" | "middlegame" | "endgame";

/**
 * Game phase of a position, from material and development only.
 *
 * Adapted from Lichess' open-source "Divider" (lila, modules/game Divider),
 * simplified by dropping its piece-mixedness score:
 * - endgame: at most 6 minor/major pieces remain (both sides together)
 * - middlegame: at most 10 remain, or either side has fewer than 4 pieces
 *   left on its own back rank (it has developed)
 * - otherwise opening
 *
 * It's a heuristic for grouping mistakes, not a chess truth: it can call
 * an early queen trade an endgame.
 */
export function gamePhase(fen: string): GamePhase {
  const pieces = piecesFromFen(fen);
  const majorsAndMinors = pieces.filter((p) => p.type !== "p" && p.type !== "k").length;
  if (majorsAndMinors <= 6) return "endgame";
  if (majorsAndMinors <= 10) return "middlegame";
  const backRank = (color: "w" | "b") =>
    pieces.filter((p) => p.color === color && p.type !== "p" && p.square[1] === (color === "w" ? "1" : "8")).length;
  return backRank("w") < 4 || backRank("b") < 4 ? "middlegame" : "opening";
}
