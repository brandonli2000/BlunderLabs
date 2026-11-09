import { describe, expect, it } from "vitest";
import { fakeFetch, fixture } from "../test/fakeFetch";
import { fetchChessComGames, MAX_ARCHIVES_SCANNED, parseArchiveList, standardGamesNewestFirst } from "./chesscom";
import { ImportError } from "./errors";

// Real responses recorded from api.chess.com on 2026-11-08 (trimmed to 2 archives / 3 games).
const ARCHIVES = fixture("chesscom-archives.json");
const MONTH = fixture("chesscom-month.json");
const ARCHIVES_URL = "https://api.chess.com/pub/player/hikaru/games/archives";
const MONTH_URLS = (JSON.parse(ARCHIVES) as { archives: string[] }).archives;
const json = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "application/json" } });

async function errorKind(promise: Promise<unknown>) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ImportError);
  return (err as ImportError).kind;
}

describe("fetchChessComGames", () => {
  it("walks archives newest-first and stops once enough games are collected", async () => {
    const fetchFn = fakeFetch({ [ARCHIVES_URL]: json(ARCHIVES), [MONTH_URLS[1]!]: json(MONTH), [MONTH_URLS[0]!]: json(MONTH) });
    const progress: number[] = [];
    const games = await fetchChessComGames("Hikaru", { max: 2, fetchFn, onProgress: (n) => progress.push(n) });

    expect(games).toHaveLength(2);
    expect(fetchFn.calls).toEqual([ARCHIVES_URL, MONTH_URLS[1]]); // lower-cased, newest month only
    expect(progress).toEqual([2]);
    // Newest game (largest end_time) first.
    const month = JSON.parse(MONTH) as { games: { end_time: number; pgn: string }[] };
    const newest = month.games.reduce((a, b) => (b.end_time > a.end_time ? b : a));
    expect(games[0]).toBe(newest.pgn);
  });

  it("continues into older archives when the newest month is not enough", async () => {
    const fetchFn = fakeFetch({ [ARCHIVES_URL]: json(ARCHIVES), [MONTH_URLS[1]!]: json(MONTH), [MONTH_URLS[0]!]: json(MONTH) });
    const games = await fetchChessComGames("hikaru", { max: 5, fetchFn });
    expect(games).toHaveLength(5);
    expect(fetchFn.calls).toEqual([ARCHIVES_URL, MONTH_URLS[1], MONTH_URLS[0]]);
  });

  it("maps 404, 410, 429, bad JSON and network failures", async () => {
    const at = (r: Response) => fakeFetch({ [ARCHIVES_URL]: r });
    expect(await errorKind(fetchChessComGames("hikaru", { max: 5, fetchFn: at(json('{"code":0}', 404)) }))).toBe("not-found");
    expect(await errorKind(fetchChessComGames("hikaru", { max: 5, fetchFn: at(json("{}", 410)) }))).toBe("not-found");
    expect(await errorKind(fetchChessComGames("hikaru", { max: 5, fetchFn: at(json("", 429)) }))).toBe("rate-limited");
    expect(await errorKind(fetchChessComGames("hikaru", { max: 5, fetchFn: at(json("<html>")) }))).toBe("bad-response");
    const offline = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await errorKind(fetchChessComGames("hikaru", { max: 5, fetchFn: offline }))).toBe("network");
  });

  it("reports accounts without archives as no-games", async () => {
    const fetchFn = fakeFetch({ [ARCHIVES_URL]: json('{"archives":[]}') });
    expect(await errorKind(fetchChessComGames("hikaru", { max: 5, fetchFn }))).toBe("no-games");
  });

  it("caps the number of archive requests", async () => {
    const many = Array.from({ length: 40 }, (_, i) => `https://api.chess.com/pub/player/hikaru/games/2020/${i}`);
    const fetchFn = fakeFetch({
      [ARCHIVES_URL]: json(JSON.stringify({ archives: many })),
      "https://api.chess.com/pub/player/hikaru/games/2020/*": () => json('{"games":[]}'),
    });
    expect(await errorKind(fetchChessComGames("hikaru", { max: 5, fetchFn }))).toBe("no-games");
    expect(fetchFn.calls).toHaveLength(1 + MAX_ARCHIVES_SCANNED);
  });
});

describe("archive parsing", () => {
  it("ignores archive URLs outside the public API", () => {
    expect(
      parseArchiveList({ archives: ["https://api.chess.com/pub/player/a/games/2026/01", "https://evil.example/x", 5] }),
    ).toEqual(["https://api.chess.com/pub/player/a/games/2026/01"]);
    expect(() => parseArchiveList({})).toThrow(ImportError);
  });

  it("keeps only standard-rules games", () => {
    const month = JSON.parse(MONTH) as { games: { rules: string }[] };
    month.games[0]!.rules = "chess960"; // variant must be skipped
    expect(standardGamesNewestFirst(month)).toHaveLength(month.games.length - 1);
  });
});
