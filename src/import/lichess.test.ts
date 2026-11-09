import { describe, expect, it } from "vitest";
import { chunkedResponse, fakeFetch, fixture } from "../test/fakeFetch";
import { ImportError } from "./errors";
import { fetchLichessGames, lichessGamesUrl } from "./lichess";

// Real response recorded from GET /api/games/user/thibault?max=3 on 2026-11-08.
const PGN = fixture("lichess-thibault-3.pgn");
const URL_PREFIX = "https://lichess.org/api/games/user/thibault?*";

async function expectImportError(promise: Promise<unknown>, kind: ImportError["kind"]) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ImportError);
  expect((err as ImportError).kind).toBe(kind);
}

describe("lichessGamesUrl", () => {
  it("requests clocks, openings and standard speeds only", () => {
    const url = new URL(lichessGamesUrl("thibault", 25));
    expect(url.pathname).toBe("/api/games/user/thibault");
    expect(url.searchParams.get("max")).toBe("25");
    expect(url.searchParams.get("clocks")).toBe("true");
    expect(url.searchParams.get("perfType")).not.toContain("chess960");
  });
});

describe("fetchLichessGames", () => {
  it("returns every game from a streamed response and reports progress", async () => {
    const progress: number[] = [];
    const fetchFn = fakeFetch({ [URL_PREFIX]: () => chunkedResponse(PGN, 97, { status: 200 }) });
    const games = await fetchLichessGames("thibault", { max: 3, fetchFn, onProgress: (n) => progress.push(n) });

    expect(games).toHaveLength(3);
    expect(games[0]).toContain('[GameId "0IdR4QNI"]');
    expect(progress.at(-1)).toBe(3);
    // Progress is monotonic even though "[Event" tags straddle chunk boundaries.
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });

  it("sends the PGN Accept header", async () => {
    let accept: string | null = null;
    const fetchFn = async (_url: string, init?: RequestInit) => {
      accept = new Headers(init?.headers).get("Accept");
      return new Response(PGN);
    };
    await fetchLichessGames("thibault", { max: 3, fetchFn });
    expect(accept).toBe("application/x-chess-pgn");
  });

  it("rejects malformed usernames before making a request", async () => {
    const fetchFn = fakeFetch({});
    await expectImportError(fetchLichessGames("bad name/../x", { max: 5, fetchFn }), "invalid-username");
    expect(fetchFn.calls).toHaveLength(0);
  });

  it("maps HTTP and network failures to typed errors", async () => {
    const respond = (status: number) => fakeFetch({ [URL_PREFIX]: new Response("", { status }) });
    await expectImportError(fetchLichessGames("thibault", { max: 3, fetchFn: respond(404) }), "not-found");
    await expectImportError(fetchLichessGames("thibault", { max: 3, fetchFn: respond(429) }), "rate-limited");
    await expectImportError(fetchLichessGames("thibault", { max: 3, fetchFn: respond(500) }), "bad-response");
    const offline = async () => {
      throw new TypeError("Failed to fetch");
    };
    await expectImportError(fetchLichessGames("thibault", { max: 3, fetchFn: offline }), "network");
  });

  it("reports an empty account as no-games", async () => {
    const fetchFn = fakeFetch({ [URL_PREFIX]: new Response("") });
    await expectImportError(fetchLichessGames("thibault", { max: 3, fetchFn }), "no-games");
  });

  it("reports cancellation as aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchFn = fakeFetch({ [URL_PREFIX]: new Response(PGN) });
    await expectImportError(fetchLichessGames("thibault", { max: 3, fetchFn, signal: controller.signal }), "aborted");
  });

  it("reports a stream that dies mid-download as a network error", async () => {
    const broken = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(PGN.slice(0, 200)));
        controller.error(new TypeError("network reset"));
      },
    });
    const fetchFn = fakeFetch({ [URL_PREFIX]: () => new Response(broken) });
    await expectImportError(fetchLichessGames("thibault", { max: 3, fetchFn }), "network");
  });
});
