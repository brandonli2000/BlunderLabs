import type { MoveClass } from "../core/classify";
import type { Color } from "../core/types";
import type { PieceSymbol } from "chess.js";

/**
 * Everything a tactical detector may look at for one move: the positions
 * either side of it and the engine's evidence for both. Detectors are pure
 * functions of this context, so they run identically in the app, in tests and
 * in the offline benchmark.
 */
export interface MoveContext {
  gameId: string;
  ply: number;
  /** "12." or "12…" style prefix for explanations. */
  moveLabel: string;
  mover: Color;
  fenBefore: string;
  fenAfter: string;
  move: { san: string; uci: string };
  /** Engine's best move for the mover before the move (UCI), and its line. */
  bestBefore: string | null;
  lineBefore: string[];
  /** Engine's best reply for the opponent after the move (UCI), and its line. */
  bestAfter: string | null;
  lineAfter: string[];
  /** Mover's expected-score loss from the analysis (0–1), and its class. */
  loss: number;
  classification: MoveClass;
}

export type DetectorId = "hanging-piece" | "missed-capture";

/**
 * An observed tactical pattern with the evidence that triggered it. This is
 * a *pattern* (checkable from the position and engine line), not a claim
 * about why the player chose the move.
 */
export interface Detection {
  detector: DetectorId;
  /** Bumped whenever the detector's rules change, so benchmark results stay attributable. */
  version: number;
  /** Refinement within the pattern (see each detector). */
  subtype: string;
  square: string;
  piece: PieceSymbol;
  /** Material the pattern is worth by SEE (P1 N3 B3 R5 Q9). */
  materialGain: number;
  /** Machine-readable facts the decision used. */
  evidence: Record<string, string | number | boolean | null>;
  /** One factual sentence for people. */
  explanation: string;
}

export interface DetectorOptions {
  /** Minimum SEE material gain to count (2 = at least a minor piece net, or more). */
  minGain: number;
  /** Minimum expected-score loss of the move, as engine confirmation that it mattered. */
  minLoss: number;
}

export const DEFAULT_DETECTOR_OPTIONS: DetectorOptions = { minGain: 2, minLoss: 0.1 };

export const PIECE_NAME: Record<PieceSymbol, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
