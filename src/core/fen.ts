import type { Color } from "./types";

export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

export interface PlacedPiece {
  /** Algebraic square, e.g. "e4". */
  square: string;
  color: Color;
  type: PieceType;
}

const FILES = "abcdefgh";

/** Read the piece placement field of a FEN. Throws on malformed placement. */
export function piecesFromFen(fen: string): PlacedPiece[] {
  const placement = fen.trim().split(/\s+/)[0] ?? "";
  const ranks = placement.split("/");
  if (ranks.length !== 8) throw new Error(`Invalid FEN placement: ${placement}`);

  const pieces: PlacedPiece[] = [];
  ranks.forEach((row, i) => {
    const rank = 8 - i;
    let file = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const type = ch.toLowerCase();
      if (!"pnbrqk".includes(type) || file > 7) throw new Error(`Invalid FEN placement: ${placement}`);
      pieces.push({ square: `${FILES[file]}${rank}`, color: ch === type ? "b" : "w", type: type as PieceType });
      file++;
    }
    if (file !== 8) throw new Error(`Invalid FEN placement: ${placement}`);
  });
  return pieces;
}

/** Zero-based file (a=0) and rank (1=0) of an algebraic square. */
export function squareCoords(square: string): { file: number; rank: number } {
  return { file: FILES.indexOf(square[0] ?? ""), rank: Number(square[1]) - 1 };
}
