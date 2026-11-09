import type { GameAnalysis } from "../analysis/gameAnalysis";
import type { ParsedGame } from "../core/pgn";
import type { MoveContext } from "./types";

/**
 * Detector contexts for every move of an analysed game. Returns [] when the
 * analysis doesn't line up with the game (stale or corrupted data), rather
 * than pairing evidence with the wrong moves.
 */
export function buildMoveContexts(gameId: string, game: ParsedGame, analysis: GameAnalysis): MoveContext[] {
  if (analysis.moves.length !== game.moves.length || analysis.positions.length !== game.moves.length + 1) return [];
  if (analysis.moves.some((v, i) => v.san !== game.moves[i]!.san)) return [];

  const firstNumber = Number(game.startFen.split(" ")[5]) || 1;
  const offset = game.moves[0]?.color === "b" ? 1 : 0;
  return game.moves.map((move, i): MoveContext => {
    const before = analysis.positions[i]!;
    const after = analysis.positions[i + 1]!;
    const verdict = analysis.moves[i]!;
    const number = firstNumber + Math.floor((i + offset) / 2);
    return {
      gameId,
      ply: move.ply,
      moveLabel: `${number}${move.color === "w" ? "." : "…"}`,
      mover: move.color,
      fenBefore: move.fenBefore,
      fenAfter: move.fenAfter,
      move: { san: move.san, uci: move.uci },
      bestBefore: before.bestMove,
      lineBefore: before.bestLine,
      bestAfter: after.bestMove,
      lineAfter: after.bestLine,
      loss: Math.max(0, verdict.winBefore - verdict.winAfter),
      classification: verdict.classification,
    };
  });
}
