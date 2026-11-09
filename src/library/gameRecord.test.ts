import { describe, expect, it } from "vitest";
import { parseGame, splitPgn } from "../core/pgn";
import { fixture } from "../test/fakeFetch";
import { SCHOLARS_MATE } from "../test/fixtures";
import { gameIdentity, toGameRecord } from "./gameRecord";

const lichessGames = splitPgn(fixture("lichess-thibault-3.pgn"));
const chesscomGames = (JSON.parse(fixture("chesscom-month.json")) as { games: { pgn: string }[] }).games.map((g) => g.pgn);

describe("gameIdentity", () => {
  it("uses the Lichess game id", async () => {
    expect(await gameIdentity(parseGame(lichessGames[0]!))).toEqual({ id: "lichess:0IdR4QNI", source: "lichess" });
  });

  it("uses the Chess.com link", async () => {
    const { id, source } = await gameIdentity(parseGame(chesscomGames[2]!));
    expect(source).toBe("chesscom");
    expect(id).toBe("chesscom:live:186809963000");
  });

  it("recognises a Lichess game exported as a file without GameId", async () => {
    const stripped = lichessGames[0]!.replace(/\[GameId "[^"]+"\]\n/, "");
    expect((await gameIdentity(parseGame(stripped))).id).toBe("lichess:0IdR4QNI");
  });

  it("hashes plain PGNs by content, ignoring comments and formatting", async () => {
    const a = await gameIdentity(parseGame(SCHOLARS_MATE));
    const reformatted = SCHOLARS_MATE.replace("2. Bc4", "2.Bc4 {a comment}").replace(/\n\n/, "\n\n\n");
    const b = await gameIdentity(parseGame(reformatted));
    expect(a.source).toBe("pgn");
    expect(a.id).toMatch(/^pgn:[0-9a-f]{24}$/);
    expect(b.id).toBe(a.id);
    const different = await gameIdentity(parseGame(SCHOLARS_MATE.replace('[White "White"]', '[White "Someone else"]')));
    expect(different.id).not.toBe(a.id);
  });
});

describe("toGameRecord", () => {
  it("extracts summary fields", async () => {
    const record = await toGameRecord(lichessGames[0]!, "lichess:thibault", 1000);
    expect(record).toMatchObject({
      id: "lichess:0IdR4QNI",
      white: "thibault",
      black: "SergeyB123",
      whiteElo: 1750,
      blackElo: 1838,
      result: "0-1",
      date: "2026.11.07",
      timeControl: "300+3",
      opening: "King's Gambit Accepted: Traditional Variation",
      plies: 46,
      importedAt: 1000,
      importedFor: "lichess:thibault",
    });
  });

  it("tolerates missing headers", async () => {
    const record = await toGameRecord("1. e4 e5 *", null, 0);
    expect(record).toMatchObject({ white: "?", black: "?", whiteElo: null, date: null, timeControl: null, plies: 2 });
  });
});
