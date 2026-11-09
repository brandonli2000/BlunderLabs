export type Color = "w" | "b";

/**
 * A normalized evaluation, always from White's point of view.
 *
 * - `{ cp }`: centipawns, positive favours White.
 * - `{ mateIn, winner }`: forced mate in `mateIn` moves for `winner`;
 *   `mateIn: 0` means the position is already checkmate.
 *
 * Raw UCI scores (side-to-move POV, signed mate counts) live in
 * `engine/uci.ts` as `UciScore` and are converted with `toWhitePov`.
 */
export type Score = { cp: number } | { mateIn: number; winner: Color };

export function sideToMove(fen: string): Color {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

export function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}
