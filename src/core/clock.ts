/**
 * Clock data from PGN `[%clk h:mm:ss(.s)]` annotations (Lichess and
 * Chess.com both emit them) plus the `TimeControl` header.
 *
 * These are facts about the clock, nothing more: how much time remained and
 * how long a move took. They must not be read as a player's mental state.
 */
import type { Color } from "./types";

export type TimeControl =
  | { kind: "live"; initialMs: number; incrementMs: number }
  /** Correspondence ("1/259200" = one move per 3 days): per-move clocks aren't think time. */
  | { kind: "daily"; secondsPerMove: number }
  | { kind: "untimed" };

/** Parse a PGN TimeControl tag: "300+3", "180", "1/259200", "-". Null if absent or unreadable. */
export function parseTimeControl(tag: string | undefined): TimeControl | null {
  const value = tag?.trim();
  if (!value || value === "?") return null;
  if (value === "-") return { kind: "untimed" };
  const daily = value.match(/^1\/(\d+)$/);
  if (daily) return { kind: "daily", secondsPerMove: Number(daily[1]) };
  const live = value.match(/^(\d+)(?:\+(\d+(?:\.\d+)?))?$/);
  if (live) return { kind: "live", initialMs: Number(live[1]) * 1000, incrementMs: Math.round(Number(live[2] ?? 0) * 1000) };
  return null;
}

const CLK = /\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/;

/** Remaining time in ms from a move comment, or null if it has no clock. */
export function parseClockComment(comment: string | undefined): number | null {
  const m = comment?.match(CLK);
  if (!m) return null;
  const [h, min, s] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (min > 59 || s >= 60) return null;
  return Math.round((h * 3600 + min * 60 + s) * 1000);
}

/**
 * - `measured`: difference of two recorded clocks with a known increment.
 * - `estimated`: increment unknown (no TimeControl header), so 0 is assumed.
 */
export type SpentSource = "measured" | "estimated";

/** Why a move has no time spent value. */
export type SpentGap = "first-move" | "missing-clock" | "inconsistent" | "correspondence";

export interface MoveTime {
  /** Clock after the move (includes any increment), if recorded. */
  remainingMs: number | null;
  spentMs: number | null;
  spentSource: SpentSource | null;
  gap: SpentGap | null;
}

export interface GameClock {
  timeControl: TimeControl | null;
  /** 100 if any clock has tenths, else 1000 (whole seconds). Bounds the error of spentMs. */
  resolutionMs: number;
  moves: MoveTime[];
}

/**
 * Time spent per move from consecutive clocks of the same side:
 *   spent = previous own clock − this clock + increment
 * because the recorded clock is taken after the increment is added.
 *
 * A side's first move has no measurement: neither site runs the clock until
 * the first moves are made, so its clock shows the starting time. A negative
 * result larger than the clock resolution (e.g. the opponent granted extra
 * time) is reported as inconsistent rather than guessed. Small negatives
 * from rounding are clamped to 0.
 *
 * Returns null when the game has no clock annotations at all.
 */
export function computeGameClock(moves: readonly { color: Color; clockMs: number | null }[], timeControl: TimeControl | null): GameClock | null {
  if (!moves.some((m) => m.clockMs !== null)) return null;
  const resolutionMs = moves.some((m) => m.clockMs !== null && m.clockMs % 1000 !== 0) ? 100 : 1000;
  const last: Record<Color, { seen: boolean; clockMs: number | null }> = {
    w: { seen: false, clockMs: null },
    b: { seen: false, clockMs: null },
  };

  const times = moves.map((move): MoveTime => {
    const prev = last[move.color];
    const firstMove = !prev.seen;
    last[move.color] = { seen: true, clockMs: move.clockMs };
    const base = { remainingMs: move.clockMs, spentMs: null, spentSource: null };

    if (timeControl?.kind === "daily") return { ...base, gap: "correspondence" };
    if (firstMove) return { ...base, gap: "first-move" };
    if (move.clockMs === null || prev.clockMs === null) return { ...base, gap: "missing-clock" };

    const known = timeControl?.kind === "live";
    const increment = known ? timeControl.incrementMs : 0;
    const spent = prev.clockMs - move.clockMs + increment;
    if (spent < -resolutionMs) return { ...base, gap: "inconsistent" };
    return { ...base, spentMs: Math.max(0, spent), spentSource: known ? "measured" : "estimated", gap: null };
  });

  return { timeControl, resolutionMs, moves: times };
}

/** "4:59", "1:02:03", or "0:08.4" under 20 s when tenths are available. */
export function formatClock(ms: number, resolutionMs: number): string {
  const tenths = resolutionMs < 1000 && ms < 20_000;
  const totalSeconds = tenths ? Math.floor(ms / 100) / 10 : Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const sec = tenths ? s.toFixed(1).padStart(4, "0") : String(Math.floor(s)).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Compact spent time: "0.4s", "12s", "1m05s". Estimated values get a "~" prefix. */
export function formatSpent(ms: number, resolutionMs: number, source: SpentSource): string {
  const prefix = source === "estimated" ? "~" : "";
  if (ms < 10_000 && resolutionMs < 1000) return `${prefix}${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${prefix}${s}s`;
  return `${prefix}${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}
