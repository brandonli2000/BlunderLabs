import { Chess, type Square } from "chess.js";

export interface PlayedMove {
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
}

export type PromotionPiece = "q" | "r" | "b" | "n";

/**
 * Distinct squares the piece on `from` can legally move to (empty if none or
 * not side to move). A promoting pawn has four moves to one square, listed once.
 */
export function legalDestinations(fen: string, from: string): string[] {
  try {
    return [...new Set(new Chess(fen).moves({ square: from as Square, verbose: true }).map((m) => m.to))];
  } catch {
    return [];
  }
}

/** Whether moving from → to is a legal pawn promotion (so a piece must be chosen). */
export function isPromotion(fen: string, from: string, to: string): boolean {
  try {
    return new Chess(fen).moves({ square: from as Square, verbose: true }).some((m) => m.to === to && m.isPromotion());
  } catch {
    return false;
  }
}

/** Play a move if legal; returns null for illegal moves (never throws). */
export function playMove(fen: string, from: string, to: string, promotion?: PromotionPiece): PlayedMove | null {
  try {
    const chess = new Chess(fen);
    const move = chess.move({ from, to, ...(promotion ? { promotion } : {}) });
    return { san: move.san, uci: move.lan, fenBefore: move.before, fenAfter: move.after };
  } catch {
    return null;
  }
}

/**
 * Convert an engine principal variation (UCI moves) to SAN, stopping at the
 * first illegal move or after `maxPlies`.
 */
export function pvToSan(fen: string, pv: readonly string[], maxPlies = pv.length): string[] {
  const chess = new Chess(fen);
  const sans: string[] = [];
  for (const uci of pv.slice(0, maxPlies)) {
    try {
      const promotion = uci.length > 4 ? uci[4] : undefined;
      sans.push(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(promotion ? { promotion } : {}) }).san);
    } catch {
      break;
    }
  }
  return sans;
}

/** Colour of the piece on a square, or null if empty. */
export function pieceColorAt(fen: string, square: string): "w" | "b" | null {
  try {
    return new Chess(fen).get(square as Square)?.color ?? null;
  } catch {
    return null;
  }
}

/**
 * Play a move typed in SAN ("Nf3", "exd5", "e8=N", "O-O"), tolerating
 * missing check marks and annotation glyphs. Returns null if illegal or
 * ambiguous.
 */
export function playSan(fen: string, input: string): PlayedMove | null {
  const san = input.trim().replace(/[!?]+$/, "").replace(/0/g, "O");
  if (!san) return null;
  try {
    const chess = new Chess(fen);
    const move = chess.move(san, { strict: false });
    return { san: move.san, uci: move.lan, fenBefore: move.before, fenAfter: move.after };
  } catch {
    return null;
  }
}
