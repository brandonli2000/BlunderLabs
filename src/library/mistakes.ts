import type { GameAnalysis } from "../analysis/gameAnalysis";
import type { MoveClass } from "../core/classify";
import type { SpentSource } from "../core/clock";
import type { GamePhase } from "../core/phase";
import type { Color } from "../core/types";
import type { GameRecord } from "./gameRecord";
import { extractMoveFacts, type MoveFact } from "./moveFacts";

export { ownerColor } from "./moveFacts";

/**
 * One flagged move from an analysed game. It records *what* happened and
 * in what context. It says nothing about *why*: cause classification is
 * future work (ROADMAP Phase 3).
 */
export interface MistakeEntry {
  gameId: string;
  ply: number;
  moveNumber: number;
  color: Color;
  player: string;
  opponent: string;
  /** Whether the mover is the account the game was imported for; null if unknown (PGN upload). */
  byOwner: boolean | null;
  fenBefore: string;
  san: string;
  bestSan: string | null;
  classification: Extract<MoveClass, "inaccuracy" | "mistake" | "blunder">;
  winBefore: number;
  winAfter: number;
  /** winBefore − winAfter, 0–1. */
  loss: number;
  phase: GamePhase;
  clockMs: number | null;
  spentMs: number | null;
  spentSource: SpentSource | null;
  /** 100 or 1000: precision of clockMs/spentMs in this game. */
  clockResolutionMs: number;
  /** Starting time for live games, to put clockMs in proportion. */
  initialMs: number | null;
  date: string | null;
  timeControl: string | null;
  opening: string | null;
}

type Flagged = MistakeEntry["classification"];

const FLAGGED = new Set<MoveClass>(["inaccuracy", "mistake", "blunder"]);

const isFlagged = (c: MoveClass): c is Flagged => FLAGGED.has(c);

/** The catalogue's view of a move fact: same data, only the fields the catalogue shows. */
function toMistakeEntry(f: MoveFact, classification: Flagged): MistakeEntry {
  return {
    gameId: f.gameId,
    ply: f.ply,
    moveNumber: f.moveNumber,
    color: f.color,
    player: f.player,
    opponent: f.opponent,
    byOwner: f.byOwner,
    fenBefore: f.fenBefore,
    san: f.san,
    bestSan: f.bestSan,
    classification,
    winBefore: f.winBefore,
    winAfter: f.winAfter,
    loss: f.loss,
    phase: f.phase,
    clockMs: f.clockMs,
    spentMs: f.spentMs,
    spentSource: f.spentSource,
    clockResolutionMs: f.clockResolutionMs,
    initialMs: f.initialMs,
    date: f.date,
    timeControl: f.timeControl,
    opening: f.opening,
  };
}

/**
 * Flagged moves of one analysed game: the inaccuracies, mistakes and blunders
 * among its move facts, so the catalogue and the player profile can't disagree
 * about what happened. Returns [] when the analysis doesn't match the game
 * (see `extractMoveFacts`).
 */
export function extractMistakes(record: GameRecord, analysis: GameAnalysis): MistakeEntry[] {
  // Facts are built only for flagged verdicts: most moves aren't, and the
  // catalogue holds every flagged move of a whole library in memory.
  return extractMoveFacts(record, analysis, (v) => isFlagged(v.classification)).flatMap((f) => (isFlagged(f.classification) ? [toMistakeEntry(f, f.classification)] : []));
}

export interface MistakeFilter {
  classes: ReadonlySet<MistakeEntry["classification"]>;
  phases: ReadonlySet<GamePhase>;
  /** "owner": only moves by the imported account; "opponents": only by its opponents. */
  side: "all" | "owner" | "opponents";
  /** Case-insensitive match on player, opponent or opening. */
  query: string;
}

export type MistakeSort = "loss" | "date" | "clock";

export function filterMistakes(entries: readonly MistakeEntry[], filter: MistakeFilter): MistakeEntry[] {
  const q = filter.query.trim().toLowerCase();
  return entries.filter(
    (e) =>
      filter.classes.has(e.classification) &&
      filter.phases.has(e.phase) &&
      (filter.side === "all" || (filter.side === "owner" ? e.byOwner === true : e.byOwner === false)) &&
      (!q || `${e.player} ${e.opponent} ${e.opening ?? ""}`.toLowerCase().includes(q)),
  );
}

/** Sort a copy: biggest loss first, newest game first, or least clock remaining first (unknown clocks last). */
export function sortMistakes(entries: readonly MistakeEntry[], by: MistakeSort): MistakeEntry[] {
  const copy = [...entries];
  const tieBreak = (a: MistakeEntry, b: MistakeEntry) => b.loss - a.loss || a.gameId.localeCompare(b.gameId) || a.ply - b.ply;
  if (by === "loss") return copy.sort(tieBreak);
  if (by === "date") return copy.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.gameId.localeCompare(b.gameId) || a.ply - b.ply);
  return copy.sort((a, b) => (a.clockMs ?? Infinity) - (b.clockMs ?? Infinity) || tieBreak(a, b));
}
