import type { UciScore } from "../core/evaluation";

/** The parts of a UCI `info` line BlunderLab uses. */
export interface UciInfo {
  depth: number;
  multipv: number;
  /** Side-to-move POV, as reported. */
  score: UciScore;
  /** True when the score is only a lower/upper bound (aspiration window fail). */
  bound: boolean;
  pv: string[];
  nodes?: number;
  timeMs?: number;
}

const INT_FIELDS = new Set(["depth", "seldepth", "multipv", "nodes", "nps", "time", "hashfull", "tbhits", "currmovenumber"]);

/**
 * Parse an `info` line. Returns null for lines without depth and score
 * (e.g. `info string ...`, `info currmove ...`), which analysis ignores.
 * The PV may be empty: in a mated/stalemated position Stockfish reports
 * `info depth 0 score mate 0` with no moves.
 */
export function parseInfo(line: string): UciInfo | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== "info") return null;

  const ints: Record<string, number> = {};
  let score: UciScore | undefined;
  let bound = false;
  let pv: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const key = tokens[i]!;
    if (key === "string") return null;
    if (key === "pv") {
      pv = tokens.slice(i + 1);
      break;
    }
    if (key === "score") {
      const kind = tokens[i + 1];
      const value = Number(tokens[i + 2]);
      if (!Number.isFinite(value)) return null;
      if (kind === "cp") score = { cp: value };
      else if (kind === "mate") score = { mate: value };
      else return null;
      i += 2;
      const next = tokens[i + 1];
      if (next === "lowerbound" || next === "upperbound") {
        bound = true;
        i++;
      }
      continue;
    }
    if (INT_FIELDS.has(key)) {
      const value = Number(tokens[i + 1]);
      if (Number.isFinite(value)) ints[key] = value;
      i++;
    }
  }

  if (!score || ints.depth === undefined) return null;
  const info: UciInfo = { depth: ints.depth, multipv: ints.multipv ?? 1, score, bound, pv };
  if (ints.nodes !== undefined) info.nodes = ints.nodes;
  if (ints.time !== undefined) info.timeMs = ints.time;
  return info;
}

/** Parse `bestmove e2e4 [ponder e7e5]`. `move` is null for `(none)` (no legal moves). */
export function parseBestMove(line: string): { move: string | null } | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== "bestmove" || tokens[1] === undefined) return null;
  return { move: tokens[1] === "(none)" ? null : tokens[1] };
}
