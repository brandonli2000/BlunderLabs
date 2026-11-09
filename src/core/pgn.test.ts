import { describe, expect, it } from "vitest";
import { DEFAULT_POSITION } from "chess.js";
import { gamePositions, parseGame, PgnError, splitPgn } from "./pgn";
import { ANNOTATED, FROM_FEN, SCHOLARS_MATE, TWO_GAMES } from "../test/fixtures";

describe("splitPgn", () => {
  it("splits a multi-game file", () => {
    const games = splitPgn(TWO_GAMES);
    expect(games).toHaveLength(2);
    expect(games[0]).toContain("Qxf7#");
    expect(games[1]).toContain('[Event "Annotated"]');
  });

  it("handles CRLF, BOM and blank input", () => {
    expect(splitPgn("﻿" + TWO_GAMES.replace(/\n/g, "\r\n"))).toHaveLength(2);
    expect(splitPgn("   \n\n")).toEqual([]);
  });

  it("keeps headerless movetext as one game", () => {
    expect(splitPgn("1. e4 e5 2. Nf3 *")).toEqual(["1. e4 e5 2. Nf3 *"]);
  });
});

describe("parseGame", () => {
  it("extracts headers and moves with positions", () => {
    const game = parseGame(SCHOLARS_MATE);
    expect(game.headers.White).toBe("White");
    expect(game.startFen).toBe(DEFAULT_POSITION);
    expect(game.moves.map((m) => m.san)).toEqual(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"]);
    expect(game.moves[0]).toMatchObject({ ply: 1, color: "w", uci: "e2e4", fenBefore: DEFAULT_POSITION });
    expect(game.moves[1]!.fenBefore).toBe(game.moves[0]!.fenAfter);
  });

  it("ignores comments, NAGs and variations", () => {
    expect(parseGame(ANNOTATED).moves.map((m) => m.san)).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);
  });

  it("honours a FEN start position", () => {
    const game = parseGame(FROM_FEN);
    expect(game.startFen).toBe("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
    expect(game.moves.map((m) => m.uci)).toEqual(["e2e4", "e8d7"]);
  });

  it("rejects illegal moves with PgnError", () => {
    expect(() => parseGame("1. e4 e5 2. Ke3 *")).toThrow(PgnError);
  });

  it("lists every position", () => {
    const game = parseGame(SCHOLARS_MATE);
    const positions = gamePositions(game);
    expect(positions).toHaveLength(8);
    expect(positions.at(-1)).toBe(game.moves.at(-1)!.fenAfter);
  });
});
