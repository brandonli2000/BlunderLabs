import { detectHangingPiece } from "./hangingPiece";
import { detectMissedCapture } from "./missedCapture";
import { DEFAULT_DETECTOR_OPTIONS, type Detection, type DetectorId, type DetectorOptions, type MoveContext } from "./types";

export { buildMoveContexts } from "./context";
export * from "./types";

type Detector = (ctx: MoveContext, options: DetectorOptions) => Detection | null;

/**
 * Registered detectors. New patterns (forks, pins, overloaded defenders,
 * back-rank, discovered attacks…) are added here as further pure functions
 * of MoveContext, each with its own version and benchmark labels.
 */
export const DETECTORS: Record<DetectorId, Detector> = {
  "hanging-piece": detectHangingPiece,
  "missed-capture": detectMissedCapture,
};

/** Run every detector on one move. A move can show more than one pattern. */
export function detectPatterns(ctx: MoveContext, options: DetectorOptions = DEFAULT_DETECTOR_OPTIONS): Detection[] {
  return Object.values(DETECTORS)
    .map((detect) => detect(ctx, options))
    .filter((d): d is Detection => d !== null);
}
