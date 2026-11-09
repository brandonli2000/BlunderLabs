import { splitPgn } from "../core/pgn";
import { fetchOrThrow, ImportError, isAbort, validateUsername, type FetchGamesOptions } from "./errors";

const SITE = "Lichess";
/** Standard-chess speeds only; variants and "from position" are excluded. */
const PERF_TYPES = "ultraBullet,bullet,blitz,rapid,classical,correspondence";

export function lichessGamesUrl(username: string, max: number): string {
  const params = new URLSearchParams({ max: String(max), clocks: "true", opening: "true", perfType: PERF_TYPES });
  return `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params}`;
}

/**
 * Fetch a user's most recent games as PGN strings, newest first.
 * The export endpoint streams, so progress is reported as games arrive.
 * API: https://lichess.org/api#tag/Games/operation/apiGamesUser
 */
export async function fetchLichessGames(
  rawUsername: string,
  { max, signal, onProgress, fetchFn = fetch }: FetchGamesOptions,
): Promise<string[]> {
  const username = validateUsername(rawUsername);
  const init: RequestInit = { headers: { Accept: "application/x-chess-pgn" }, ...(signal ? { signal } : {}) };
  const response = await fetchOrThrow(fetchFn, lichessGamesUrl(username, max), init, SITE);

  if (response.status === 404) throw new ImportError("not-found", `No Lichess account named “${username}”.`);
  if (!response.ok) throw new ImportError("bad-response", `Lichess returned an error (HTTP ${response.status}).`);

  let text: string;
  try {
    // Lichess streams ~20 games/s, so progress here is meaningful for large imports.
    let counted = 0;
    let scanned = 0;
    text = await readStream(response, (soFar) => {
      // Rescan a few chars of overlap so a tag split across chunks is still found.
      const from = Math.max(0, scanned - 8);
      counted += countGames(soFar.slice(from)) - countGames(soFar.slice(from, scanned));
      scanned = soFar.length;
      onProgress?.(counted);
    });
  } catch (err) {
    if (isAbort(err, signal)) throw new ImportError("aborted", "Import cancelled.");
    throw new ImportError("network", "The connection to Lichess dropped during the download. Try again.");
  }

  const games = splitPgn(text);
  onProgress?.(games.length);
  if (games.length === 0) throw new ImportError("no-games", `“${username}” has no standard games on Lichess yet.`);
  return games;
}

async function readStream(response: Response, onChunk: (textSoFar: string) => void): Promise<string> {
  if (!response.body) return response.text();
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text;
    text += value;
    onChunk(text);
  }
}

function countGames(text: string): number {
  return text.match(/^\[Event /gm)?.length ?? 0;
}
