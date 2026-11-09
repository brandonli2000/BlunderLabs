import type { GameAnalysis, MoveVerdict } from "../analysis/gameAnalysis";
import type { MoveClass } from "../core/classify";
import { computeGameClock, parseTimeControl, timeClassOf, type SpentGap, type SpentSource, type TimeClass } from "../core/clock";
import { parseGame, type ParsedGame } from "../core/pgn";
import { gamePhase, type GamePhase } from "../core/phase";
import type { Color } from "../core/types";
import type { GameRecord } from "./gameRecord";

/**
 * Everything observable about one analysed move, flagged or not (design 0001
 * §4). Rates need denominators ("3 blunders out of how many moves?"), so the
 * profile is built from facts about *all* moves; the mistake catalogue is a
 * projection of the flagged ones.
 *
 * These are observations only. They say what happened and in what context,
 * never why. Clock fields are facts about the clock, not about the player.
 */
export interface MoveFact {
  gameId: string;
  /** 1-based half-move index. */
  ply: number;
  moveNumber: number;
  color: Color;
  /** Display names from the game, for the mover and the other side. */
  player: string;
  opponent: string;
  /**
   * Key of the account this game was imported for ("lichess:thibault"), set
   * only on that account's own moves. Null for the opponent's moves and for
   * games whose owner is unknown. Profiles group by this, never by display name.
   */
  playerKey: string | null;
  /** Whether the mover is the imported account; null when that can't be established. */
  byOwner: boolean | null;
  fenBefore: string;
  san: string;
  bestSan: string | null;
  /** The stored verdict, as the user saw it: not re-derived from `loss`. */
  classification: MoveClass;
  winBefore: number;
  winAfter: number;
  /** winBefore − winAfter clamped to 0–1: a move that gained score has loss 0. */
  loss: number;
  /** Phase of the position the move was played from. */
  phase: GamePhase;
  timeClass: TimeClass;
  /** Remaining clock after the move (includes any increment); null if not recorded. */
  clockMs: number | null;
  /** Time spent on the move, with provenance; null when it can't be measured (see `spentGap`). */
  spentMs: number | null;
  spentSource: SpentSource | null;
  /**
   * Why `spentMs` is null although the game has clocks. Null both when the
   * time was measured and when the game has no clock data at all (then
   * `clockMs` is null too).
   */
  spentGap: SpentGap | null;
  /** 100 or 1000: precision of clockMs/spentMs in this game. */
  clockResolutionMs: number;
  /** Starting time for live games. */
  initialMs: number | null;
  /**
   * clockMs / initialMs for live games with a positive starting time. Not
   * clamped: with an increment the clock can exceed the starting time.
   */
  clockFraction: number | null;
  date: string | null;
  timeControl: string | null;
  opening: string | null;
}

/**
 * The account a record was imported for: its key ("lichess:thibault") and bare
 * username, both lower-cased. Null for PGN uploads and for malformed values.
 */
function importedAccount(record: GameRecord): { key: string; username: string } | null {
  const key = record.importedFor?.trim().toLowerCase();
  if (!key) return null;
  const colon = key.indexOf(":");
  const username = colon > 0 ? key.slice(colon + 1) : "";
  return username ? { key, username } : null;
}

/**
 * The colour of the imported account, if it can be established. A name match
 * on neither side or on both sides (a mirror match, or two people sharing a
 * name) is "unknown": guessing would credit the opponent's moves to the player.
 */
export function ownerColor(record: GameRecord): Color | null {
  const account = importedAccount(record);
  if (!account) return null;
  const isWhite = record.white.trim().toLowerCase() === account.username;
  const isBlack = record.black.trim().toLowerCase() === account.username;
  if (isWhite === isBlack) return null;
  return isWhite ? "w" : "b";
}

const validWinProbability = (x: unknown): boolean => typeof x === "number" && x >= 0 && x <= 1; // false for NaN, ±Infinity, undefined

/**
 * Whether a stored analysis belongs to this game and is sane. All or nothing:
 * verdicts that are stale, partial or corrupted can't be trusted to describe
 * these moves, and a silently partial profile would skew every rate.
 */
function analysisMatchesGame(game: ParsedGame, analysis: GameAnalysis): boolean {
  if (analysis.moves.length !== game.moves.length) return false;
  return analysis.moves.every((v, i) => {
    const move = game.moves[i]!;
    return v.san === move.san && v.ply === move.ply && v.color === move.color && validWinProbability(v.winBefore) && validWinProbability(v.winAfter);
  });
}

/**
 * Facts for the analysed moves of one game, both sides, in ply order.
 * Returns [] if the analysis doesn't match the game (see `analysisMatchesGame`).
 *
 * `include` restricts which verdicts get a fact built, so callers that need
 * only a few moves (the mistake catalogue) don't pay for the rest.
 */
export function extractMoveFacts(record: GameRecord, analysis: GameAnalysis, include?: (verdict: MoveVerdict) => boolean): MoveFact[] {
  const game = parseGame(record.pgn);
  if (!analysisMatchesGame(game, analysis)) return [];

  const timeControl = parseTimeControl(game.headers.TimeControl);
  const timeClass = timeClassOf(timeControl);
  const clock = computeGameClock(game.moves, timeControl);
  const initialMs = timeControl?.kind === "live" ? timeControl.initialMs : null;
  const owner = ownerColor(record);
  const ownerKey = owner === null ? null : importedAccount(record)!.key;
  const firstMoveNumber = Number(game.startFen.split(" ")[5]) || 1;
  const blackStarts = game.moves[0]?.color === "b";

  const facts: MoveFact[] = [];
  analysis.moves.forEach((verdict, i) => {
    if (include && !include(verdict)) return;
    const move = game.moves[i]!;
    const time = clock?.moves[i];
    const clockMs = time?.remainingMs ?? null;
    const byOwner = owner === null ? null : owner === move.color;
    facts.push({
      gameId: record.id,
      ply: move.ply,
      moveNumber: firstMoveNumber + Math.floor((i + (blackStarts ? 1 : 0)) / 2),
      color: move.color,
      player: move.color === "w" ? record.white : record.black,
      opponent: move.color === "w" ? record.black : record.white,
      playerKey: byOwner ? ownerKey : null,
      byOwner,
      fenBefore: move.fenBefore,
      san: move.san,
      bestSan: verdict.bestMoveSan,
      classification: verdict.classification,
      winBefore: verdict.winBefore,
      winAfter: verdict.winAfter,
      loss: Math.max(0, verdict.winBefore - verdict.winAfter),
      phase: gamePhase(move.fenBefore),
      timeClass,
      clockMs,
      spentMs: time?.spentMs ?? null,
      spentSource: time?.spentSource ?? null,
      spentGap: time?.gap ?? null,
      clockResolutionMs: clock?.resolutionMs ?? 1000,
      initialMs,
      clockFraction: clockMs !== null && initialMs !== null && initialMs > 0 ? clockMs / initialMs : null,
      date: record.date,
      timeControl: record.timeControl,
      opening: record.opening,
    });
  });
  return facts;
}
