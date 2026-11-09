import { bestCaptureOn, nullMoveFen, PIECE_VALUE, pieceOn, seeCapture } from "../core/see";
import { uciToSan } from "../analysis/gameAnalysis";
import { DEFAULT_DETECTOR_OPTIONS, PIECE_NAME, type Detection, type DetectorOptions, type MoveContext } from "./types";

export const HANGING_PIECE_VERSION = 1;

/**
 * "Left material en prise": after the player's move, the opponent can win
 * material by capturing one of the player's pieces.
 *
 * Fires only when ALL hold (v1):
 * 1. The engine's best reply after the move is a capture on square s of one
 *    of the mover's pieces (not the king).
 * 2. By SEE that capture wins at least `minGain`.
 * 3. The move cost at least `minLoss` expected score (engine confirmation that
 *    the material actually matters, e.g. it isn't a sacrifice that works).
 * 4. If the move itself captured on s (the player started the exchange), the
 *    whole exchange must still lose at least `minGain` for the player.
 *
 * Subtypes (evidence for later diagnosis, not causes):
 * - "created": the piece wasn't losable before the move (the move put it en
 *   prise, or removed/blocked its defence);
 * - "unaddressed": it was already losable before the move, which didn't fix it;
 * - "losing-exchange": the move started an exchange on s that loses material;
 * - "unknown-before": the "before" state can't be tested (the player was in
 *   check, so there is no legal null move).
 */
export function detectHangingPiece(ctx: MoveContext, options: DetectorOptions = DEFAULT_DETECTOR_OPTIONS): Detection | null {
  const reply = ctx.bestAfter;
  if (!reply || ctx.loss < options.minLoss) return null;
  const from = reply.slice(0, 2);
  const square = reply.slice(2, 4);
  const victim = pieceOn(ctx.fenAfter, square);
  if (!victim || victim.color !== ctx.mover || victim.type === "k") return null;

  const promotion = reply.length > 4 ? (reply[4] as "q" | "r" | "b" | "n") : undefined;
  const gain = seeCapture(ctx.fenAfter, { from, to: square, ...(promotion ? { promotion } : {}) });
  if (gain === null || gain < options.minGain) return null;

  const movedTo = ctx.move.uci.slice(2, 4);
  const movedFrom = ctx.move.uci.slice(0, 2);
  const capturedByMove = movedTo === square ? pieceOn(ctx.fenBefore, square) : null;

  let subtype: string;
  let exposureBefore: number | null = null;
  if (capturedByMove && capturedByMove.color !== ctx.mover) {
    // The player initiated an exchange on s: net = what they took − what the opponent wins back.
    const net = PIECE_VALUE[capturedByMove.type] - gain;
    if (net > -options.minGain) return null; // a fair or winning trade, not material left en prise
    subtype = "losing-exchange";
  } else {
    // Could the opponent already have won the piece before the move? Ask with a null move.
    const passed = nullMoveFen(ctx.fenBefore);
    const originSquare = movedTo === square ? movedFrom : square;
    if (passed === null) {
      subtype = "unknown-before";
    } else {
      const before = pieceOn(passed, originSquare);
      exposureBefore = before && before.color === ctx.mover ? (bestCaptureOn(passed, originSquare)?.gain ?? 0) : 0;
      subtype = exposureBefore >= options.minGain ? "unaddressed" : "created";
    }
  }

  const replySan = uciToSan(ctx.fenAfter, reply);
  const name = PIECE_NAME[victim.type];
  const explanation =
    subtype === "losing-exchange"
      ? `${ctx.moveLabel}${ctx.move.san} starts an exchange on ${square} that loses material: after ${replySan} the opponent comes out ${gain - PIECE_VALUE[capturedByMove!.type]} ahead.`
      : subtype === "unaddressed"
        ? `The ${name} on ${square} could already be won before ${ctx.moveLabel}${ctx.move.san}, and still could after it: ${replySan} wins ${gain}.`
        : `After ${ctx.moveLabel}${ctx.move.san}, the ${name} on ${square} can be won: ${replySan} nets ${gain} by exchange count.`;

  return {
    detector: "hanging-piece",
    version: HANGING_PIECE_VERSION,
    subtype,
    square,
    piece: victim.type,
    materialGain: gain,
    evidence: { engineReply: replySan, seeGain: gain, exposureBefore, loss: round(ctx.loss) },
    explanation,
  };
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}
