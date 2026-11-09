import type { GameAnalysis } from "../analysis/gameAnalysis";
import { computeGameClock, parseTimeControl, type SpentSource } from "../core/clock";
import type { MoveClass } from "../core/classify";
import { parseGame } from "../core/pgn";
import { gamePhase, type GamePhase } from "../core/phase";
import type { Color } from "../core/types";
import type { GameRecord } from "./gameRecord";

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

const FLAGGED = new Set<MoveClass>(["inaccuracy", "mistake", "blunder"]);

/** The colour of the account the game was imported for, if it played in this game. */
export function ownerColor(record: GameRecord): Color | null {
  const username = record.importedFor?.split(":")[1];
  if (!username) return null;
  if (record.white.toLowerCase() === username) return "w";
  if (record.black.toLowerCase() === username) return "b";
  return null;
}

/**
 * Flagged moves of one analysed game. Returns [] if the analysis doesn't
 * match the game (e.g. stored data is stale or corrupted) rather than
 * attaching verdicts to the wrong moves.
 */
export function extractMistakes(record: GameRecord, analysis: GameAnalysis): MistakeEntry[] {
  const game = parseGame(record.pgn);
  if (analysis.moves.length !== game.moves.length) return [];
  if (analysis.moves.some((v, i) => v.san !== game.moves[i]!.san)) return [];

  const timeControl = parseTimeControl(game.headers.TimeControl);
  const clock = computeGameClock(game.moves, timeControl);
  const owner = ownerColor(record);
  const firstMoveNumber = Number(game.startFen.split(" ")[5]) || 1;
  const blackStarts = game.moves[0]?.color === "b";

  const entries: MistakeEntry[] = [];
  analysis.moves.forEach((verdict, i) => {
    if (!FLAGGED.has(verdict.classification)) return;
    const move = game.moves[i]!;
    const time = clock?.moves[i];
    entries.push({
      gameId: record.id,
      ply: move.ply,
      moveNumber: firstMoveNumber + Math.floor((i + (blackStarts ? 1 : 0)) / 2),
      color: move.color,
      player: move.color === "w" ? record.white : record.black,
      opponent: move.color === "w" ? record.black : record.white,
      byOwner: owner === null ? null : owner === move.color,
      fenBefore: move.fenBefore,
      san: move.san,
      bestSan: verdict.bestMoveSan,
      classification: verdict.classification as MistakeEntry["classification"],
      winBefore: verdict.winBefore,
      winAfter: verdict.winAfter,
      loss: Math.max(0, verdict.winBefore - verdict.winAfter),
      phase: gamePhase(move.fenBefore),
      clockMs: time?.remainingMs ?? null,
      spentMs: time?.spentMs ?? null,
      spentSource: time?.spentSource ?? null,
      clockResolutionMs: clock?.resolutionMs ?? 1000,
      initialMs: timeControl?.kind === "live" ? timeControl.initialMs : null,
      date: record.date,
      timeControl: record.timeControl,
      opening: record.opening,
    });
  });
  return entries;
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
