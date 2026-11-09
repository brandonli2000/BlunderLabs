import { fetchOrThrow, ImportError, validateUsername, type FetchFn, type FetchGamesOptions } from "./errors";

const SITE = "Chess.com";
const API_ROOT = "https://api.chess.com/pub/player/";
/** Upper bound on monthly archives scanned per import, to bound request count. */
export const MAX_ARCHIVES_SCANNED = 24;

interface ChessComGame {
  pgn?: string;
  rules?: string;
  end_time?: number;
}

/**
 * Fetch a user's most recent standard games as PGN strings, newest first.
 * Chess.com serves games in monthly archives; we walk them newest → oldest,
 * one request at a time (the API asks clients not to parallelize).
 * API: https://www.chess.com/news/view/published-data-api
 */
export async function fetchChessComGames(
  rawUsername: string,
  { max, signal, onProgress, fetchFn = fetch }: FetchGamesOptions,
): Promise<string[]> {
  const username = validateUsername(rawUsername).toLowerCase();
  const init: RequestInit = signal ? { signal } : {};

  const archivesUrl = `${API_ROOT}${encodeURIComponent(username)}/games/archives`;
  const index = await getJson(fetchFn, archivesUrl, init, username);
  const archives = parseArchiveList(index);

  const games: string[] = [];
  for (const url of archives.slice(-MAX_ARCHIVES_SCANNED).reverse()) {
    if (games.length >= max) break;
    const month = await getJson(fetchFn, url, init, username);
    for (const pgn of standardGamesNewestFirst(month)) {
      if (games.length >= max) break;
      games.push(pgn);
    }
    onProgress?.(games.length);
  }

  if (games.length === 0) {
    throw new ImportError("no-games", `“${username}” has no recent standard games on Chess.com.`);
  }
  return games;
}

async function getJson(fetchFn: FetchFn, url: string, init: RequestInit, username: string): Promise<unknown> {
  const response = await fetchOrThrow(fetchFn, url, init, SITE);
  if (response.status === 404) throw new ImportError("not-found", `No Chess.com account named “${username}”.`);
  if (response.status === 410) throw new ImportError("not-found", `The Chess.com account “${username}” is closed.`);
  if (!response.ok) throw new ImportError("bad-response", `Chess.com returned an error (HTTP ${response.status}).`);
  try {
    return await response.json();
  } catch {
    throw new ImportError("bad-response", "Chess.com sent a response we couldn't read.");
  }
}

/** Archive URLs, oldest first. Only same-API URLs are accepted. */
export function parseArchiveList(body: unknown): string[] {
  const archives = (body as { archives?: unknown } | null)?.archives;
  if (!Array.isArray(archives)) throw new ImportError("bad-response", "Chess.com sent an unexpected archive list.");
  return archives.filter((u): u is string => typeof u === "string" && u.startsWith(API_ROOT));
}

/** PGNs of standard-rules games in a monthly archive, newest first. */
export function standardGamesNewestFirst(body: unknown): string[] {
  const games = (body as { games?: unknown } | null)?.games;
  if (!Array.isArray(games)) throw new ImportError("bad-response", "Chess.com sent an unexpected game archive.");
  return (games as ChessComGame[])
    .filter((g) => g.rules === "chess" && typeof g.pgn === "string" && g.pgn.length > 0)
    .sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0))
    .map((g) => g.pgn!);
}
