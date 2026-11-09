/**
 * Static Exchange Evaluation (SEE) over *legal* moves.
 *
 * SEE answers: "if the side to move starts capturing on square s, and both
 * sides keep recapturing on s with their least valuable piece, stopping
 * whenever continuing would lose material, what is the net material
 * result?" It's the standard building block for deciding whether a piece is
 * hanging or a capture wins material.
 *
 * Classic engine SEE works on attack bitboards and approximates legality.
 * Here every step is generated with chess.js legal moves, which gives these
 * for free:
 * - x-rays: a rook behind a rook (or a queen behind a bishop) joins in once
 *   the front piece has captured, because the line is genuinely open then;
 * - absolute pins: a piece pinned to its king can't recapture off the pin line;
 * - the king: it only captures onto an undefended square;
 * - promotions: a pawn capturing onto the last rank promotes (to a queen),
 *   and the promotion gain is counted.
 * It costs a few legal-move generations per step, which is fine for analysing a
 * handful of squares per move (benchmarked in ENGINEERING_LOG).
 *
 * Limitations (by design; SEE is *static*):
 * - Only captures on the one square are considered. Checks, mate threats,
 *   zwischenzugs, desperado moves, discovered attacks elsewhere and
 *   counter-threats are ignored.
 * - Relative pins (a piece "pinned" to a queen) don't restrict recaptures.
 * - Piece values are fixed (P 1, N 3, B 3, R 5, Q 9) regardless of position.
 * - Recaptures always use the least valuable legal capturer. With promotions or
 *   pins that isn't always optimal, but it is the standard SEE convention.
 * That's why detectors built on SEE also require agreement with the engine's line.
 */
import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

export interface CaptureMove {
  from: string;
  to: string;
  promotion?: PieceSymbol;
}

function loadChess(fen: string): Chess | null {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

/** Legal captures landing on `square`. En passant can only ever be the first capture, never a recapture. */
function capturesOn(chess: Chess, square: string, includeEnPassant = false): Move[] {
  return chess
    .moves({ verbose: true })
    .filter((m) => m.to === square && m.captured !== undefined && (includeEnPassant || !m.isEnPassant()));
}

/** The least valuable capturer; among promotions, prefer the queen. */
function leastValuable(captures: Move[]): Move {
  return captures.reduce((best, m) => {
    const vb = PIECE_VALUE[best.piece];
    const vm = PIECE_VALUE[m.piece];
    if (vm !== vb) return vm < vb ? m : best;
    return (m.promotion === "q" ? 1 : 0) > (best.promotion === "q" ? 1 : 0) ? m : best;
  });
}

/** Material gained by the mover with one capture: captured piece plus any promotion gain. */
function immediateGain(move: Move): number {
  const captured = move.captured ? PIECE_VALUE[move.captured] : 0;
  const promotion = move.promotion ? PIECE_VALUE[move.promotion] - PIECE_VALUE.p : 0;
  return captured + promotion;
}

/**
 * SEE of one specific capture: the mover's net material after the best
 * continuation of the exchange on that square (both sides may stop at any
 * point). Returns null if the move is illegal or not a capture.
 *
 * Example: Rxd5 where d5 holds a pawn defended by a pawn → 1 − 5 = −4.
 */
export function seeCapture(fen: string, capture: CaptureMove): number | null {
  const chess = loadChess(fen);
  if (!chess) return null;
  const first = tryMove(chess, capture);
  if (!first) return null;
  if (!first.captured) return null;

  const square = first.to;
  // gains[d]: speculative score for the side making capture d, assuming the opponent recaptures.
  const gains = [immediateGain(first)];
  let onSquare = PIECE_VALUE[first.promotion ?? first.piece];
  for (let guard = 0; guard < 32; guard++) {
    const options = capturesOn(chess, square);
    if (options.length === 0) break;
    const next = chess.move(leastValuable(options));
    gains.push(onSquare + (next.promotion ? PIECE_VALUE[next.promotion] - PIECE_VALUE.p : 0) - gains[gains.length - 1]!);
    onSquare = PIECE_VALUE[next.promotion ?? next.piece];
  }
  // Fold backwards: each side chooses between stopping and continuing.
  for (let d = gains.length - 1; d > 0; d--) gains[d - 1] = -Math.max(-gains[d - 1]!, gains[d]!);
  return gains[0]! + 0; // "+ 0" turns a folded -0 into 0
}

export interface BestCapture {
  move: CaptureMove;
  san: string;
  gain: number;
}

/**
 * The side to move's best capture on `square` by SEE, or null if there is no
 * legal capture there. Any piece may start the exchange (not only the least valuable).
 */
export function bestCaptureOn(fen: string, square: string): BestCapture | null {
  const chess = loadChess(fen);
  if (!chess) return null;
  let best: BestCapture | null = null;
  for (const m of capturesOn(chess, square, true)) {
    if (m.promotion && m.promotion !== "q") continue;
    const move: CaptureMove = { from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) };
    const gain = seeCapture(fen, move);
    if (gain !== null && (!best || gain > best.gain)) best = { move, san: m.san, gain };
  }
  return best;
}

/** Play a capture; a pawn reaching the last rank promotes to a queen unless told otherwise. */
function tryMove(chess: Chess, capture: CaptureMove): Move | null {
  const attempts = capture.promotion ? [capture.promotion] : [undefined, "q" as const];
  for (const promotion of attempts) {
    try {
      return chess.move({ from: capture.from, to: capture.to, ...(promotion ? { promotion } : {}) });
    } catch {
      // try the next form
    }
  }
  return null;
}

/**
 * The same position with the other side to move (a "null move"), used to ask
 * "could the opponent win this piece right now?". Returns null when the side
 * to move is in check: passing the move would leave its king capturable,
 * which isn't a legal chess position.
 */
export function nullMoveFen(fen: string): string | null {
  const chess = loadChess(fen);
  if (!chess || chess.isCheck()) return null;
  const parts = fen.trim().split(/\s+/);
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-"; // en passant rights belong to the side that just lost the move
  return loadChess(parts.join(" ")) ? parts.join(" ") : null;
}

/** The piece on a square, if any. */
export function pieceOn(fen: string, square: string): { color: "w" | "b"; type: PieceSymbol } | null {
  return loadChess(fen)?.get(square as Square) ?? null;
}
