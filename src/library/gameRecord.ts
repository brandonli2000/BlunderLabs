import { parseGame, type ParsedGame } from "../core/pgn";

export type GameSource = "lichess" | "chesscom" | "pgn";

/**
 * A game in the user's library. Summary fields are denormalized from the PGN
 * so the library list renders without re-parsing every game.
 */
export interface GameRecord {
  /** Stable identity, see `gameIdentity`. */
  id: string;
  source: GameSource;
  pgn: string;
  white: string;
  black: string;
  whiteElo: number | null;
  blackElo: number | null;
  /** "1-0", "0-1", "1/2-1/2" or "*". */
  result: string;
  /** PGN date "YYYY.MM.DD" (may contain "??"), or null if absent. */
  date: string | null;
  timeControl: string | null;
  opening: string | null;
  plies: number;
  importedAt: number;
  /**
   * Account the game was imported for, e.g. "lichess:thibault". Lets later
   * cross-game analysis know which side is "the player". Null for PGN uploads.
   */
  importedFor: string | null;
}

/**
 * Stable game identity used for de-duplication:
 * - Lichess games → `lichess:<gameId>` (from the GameId or Site header)
 * - Chess.com games → `chesscom:<live|daily>:<id>` (from the Link or Site header)
 * - anything else → `pgn:<hash>` of the start position, players, date and moves
 * Identity comes from the PGN itself, so a game downloaded from Lichess as a
 * file de-duplicates against the same game imported by username.
 */
export async function gameIdentity(game: ParsedGame): Promise<{ id: string; source: GameSource }> {
  const h = game.headers;
  const lichess = h.GameId && /lichess\.org/.test(h.Site ?? "")
    ? h.GameId
    : (h.Site ?? "").match(/lichess\.org\/(?:game\/)?([A-Za-z0-9]{8})\b/)?.[1];
  if (lichess) return { id: `lichess:${lichess}`, source: "lichess" };

  const chesscom = `${h.Link ?? ""} ${h.Site ?? ""}`.match(/chess\.com\/game\/(live|daily)\/(\d+)/);
  if (chesscom) return { id: `chesscom:${chesscom[1]}:${chesscom[2]}`, source: "chesscom" };

  const fingerprint = [game.startFen, h.White ?? "", h.Black ?? "", h.Date ?? "", h.Result ?? "", ...game.moves.map((m) => m.san)].join("\n");
  return { id: `pgn:${(await sha256Hex(fingerprint)).slice(0, 24)}`, source: "pgn" };
}

/** Parse a PGN and build its library record. Throws PgnError for unreadable games. */
export async function toGameRecord(pgn: string, importedFor: string | null, now: number): Promise<GameRecord> {
  const game = parseGame(pgn);
  const { id, source } = await gameIdentity(game);
  const h = game.headers;
  return {
    id,
    source,
    pgn,
    white: h.White || "?",
    black: h.Black || "?",
    whiteElo: toRating(h.WhiteElo),
    blackElo: toRating(h.BlackElo),
    result: h.Result ?? "*",
    date: toDate(h.UTCDate ?? h.Date),
    timeControl: h.TimeControl && h.TimeControl !== "-" ? h.TimeControl : null,
    opening: h.Opening ?? h.ECO ?? null,
    plies: game.moves.length,
    importedAt: now,
    importedFor,
  };
}

/** chess.js fills a missing Date tag with "????.??.??"; treat any date without digits as absent. */
function toDate(value: string | undefined): string | null {
  return value && /\d/.test(value) ? value : null;
}

function toRating(value: string | undefined): number | null {
  const n = Number(value);
  return value && Number.isInteger(n) && n > 0 ? n : null;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
