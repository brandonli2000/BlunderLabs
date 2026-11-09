import { uciToSan } from "../analysis/gameAnalysis";
import { bestCaptureOn, nullMoveFen, pieceOn, seeCapture } from "../core/see";
import { DEFAULT_DETECTOR_OPTIONS, PIECE_NAME, type Detection, type DetectorOptions, type MoveContext } from "./types";

export const MISSED_CAPTURE_VERSION = 1;

/**
 * "Missed favourable capture": before the move, the player could have won
 * material with a capture, and that capture was also the engine's choice.
 *
 * Two independent kinds of evidence are required, which is what separates a
 * *tactical opportunity* from a merely available capture:
 * - static: SEE says the capture wins at least `minGain` (material count);
 * - dynamic: the engine's best move WAS that capture, and the move played
 *   lost at least `minLoss` expected score. A capture that looks free by SEE
 *   but walks into a mate or loses a piece elsewhere isn't the engine's
 *   choice, so it's not reported.
 *
 * Subtypes:
 * - "still-available": after the move, the same capture would still win
 *   material if it were the player's turn (the opponent may now fix it);
 * - "gone": it no longer does.
 */
export function detectMissedCapture(ctx: MoveContext, options: DetectorOptions = DEFAULT_DETECTOR_OPTIONS): Detection | null {
  const best = ctx.bestBefore;
  if (!best || best === ctx.move.uci || ctx.loss < options.minLoss) return null;
  const from = best.slice(0, 2);
  const square = best.slice(2, 4);
  const target = pieceOn(ctx.fenBefore, square);
  const isEnPassant = !target && pieceOn(ctx.fenBefore, from)?.type === "p" && from[0] !== square[0];
  if ((!target || target.color === ctx.mover) && !isEnPassant) return null;

  const promotion = best.length > 4 ? (best[4] as "q" | "r" | "b" | "n") : undefined;
  const gain = seeCapture(ctx.fenBefore, { from, to: square, ...(promotion ? { promotion } : {}) });
  if (gain === null || gain < options.minGain) return null;

  // Capturing the same piece with a different piece still takes the opportunity.
  if (ctx.move.uci.slice(2, 4) === square) {
    const playedGain = seeCapture(ctx.fenBefore, { from: ctx.move.uci.slice(0, 2), to: square });
    if (playedGain !== null && playedGain >= options.minGain) return null;
  }

  // Is the material still there to take? Pass the opponent's turn (null move) and look again.
  const passed = nullMoveFen(ctx.fenAfter);
  const stillGain = passed ? (bestCaptureOn(passed, square)?.gain ?? 0) : null;
  const subtype = stillGain !== null && stillGain >= options.minGain ? "still-available" : "gone";

  const bestSan = uciToSan(ctx.fenBefore, best);
  const pieceType = target?.type ?? "p";
  return {
    detector: "missed-capture",
    version: MISSED_CAPTURE_VERSION,
    subtype,
    square,
    piece: pieceType,
    materialGain: gain,
    evidence: { engineBest: bestSan, seeGain: gain, stillAvailableGain: stillGain, loss: Math.round(ctx.loss * 1000) / 1000 },
    explanation: `Before ${ctx.moveLabel}${ctx.move.san}, ${bestSan} would have won the ${PIECE_NAME[pieceType]} on ${square} (nets ${gain} by exchange count), and it was the engine's choice.`,
  };
}
