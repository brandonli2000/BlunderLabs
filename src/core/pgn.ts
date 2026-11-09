import { Chess, DEFAULT_POSITION } from "chess.js";
import { parseClockComment } from "./clock";
import type { Color } from "./types";

/** One half-move of a game, with the positions on either side of it. */
export interface GameMove {
  /** 1-based half-move index within the game. */
  ply: number;
  color: Color;
  san: string;
  /** Long algebraic / UCI notation, e.g. "e2e4", "e7e8q". */
  uci: string;
  fenBefore: string;
  fenAfter: string;
  /** Remaining clock after this move from a [%clk] annotation, if present. */
  clockMs: number | null;
}

export interface ParsedGame {
  headers: Record<string, string>;
  startFen: string;
  moves: GameMove[];
}

export class PgnError extends Error {
  override name = "PgnError";
}

/**
 * Split a PGN file that may contain many games into one string per game.
 * A new game starts at a tag-pair line once the previous game has movetext.
 */
export function splitPgn(text: string): string[] {
  const games: string[] = [];
  let current: string[] = [];
  let hasMovetext = false;

  const flush = () => {
    const game = current.join("\n").trim();
    if (game) games.push(game);
    current = [];
    hasMovetext = false;
  };

  for (const rawLine of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("[") && hasMovetext) flush();
    if (line && !line.startsWith("[") && !line.startsWith("%")) hasMovetext = true;
    current.push(rawLine);
  }
  flush();
  return games;
}

/** Parse a single PGN game. Variations and comments are ignored for now. */
export function parseGame(pgn: string): ParsedGame {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch (err) {
    throw new PgnError(err instanceof Error ? err.message : String(err));
  }

  const headers = chess.getHeaders();
  const startFen = headers.FEN ?? DEFAULT_POSITION;
  // chess.js keys main-line comments by the FEN after the move. Full FENs
  // include the move counters, so repeated positions still get distinct keys.
  const comments = new Map(chess.getComments().map((c) => [c.fen, c.comment]));
  const moves = chess.history({ verbose: true }).map(
    (m, i): GameMove => ({
      ply: i + 1,
      color: m.color,
      san: m.san,
      uci: m.lan,
      fenBefore: m.before,
      fenAfter: m.after,
      clockMs: parseClockComment(comments.get(m.after)),
    }),
  );
  return { headers, startFen, moves };
}

/** Every position of the game in order: the start position, then after each move. */
export function gamePositions(game: ParsedGame): string[] {
  return [game.startFen, ...game.moves.map((m) => m.fenAfter)];
}
