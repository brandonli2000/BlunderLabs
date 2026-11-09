import type { GameAnalysis, MoveVerdict } from "../analysis/gameAnalysis";
import { formatScore } from "../core/evaluation";
import type { PlayedMove, PromotionPiece } from "../core/moves";
import { pvToSan } from "../core/moves";
import type { ParsedGame } from "../core/pgn";
import { numberedSans } from "../core/notation";
import type { Color } from "../core/types";
import { CLASS_GLYPH, CLASS_LABEL, isFlagged } from "./annotations";
import type { LiveLines } from "./useLiveLines";
import { LIVE_LIMITS } from "./useLiveLines";

export function PlayerStrip({ game, color, analysis }: { game: ParsedGame; color: Color; analysis: GameAnalysis | null }) {
  const name = game.headers[color === "w" ? "White" : "Black"] ?? (color === "w" ? "White" : "Black");
  const elo = game.headers[color === "w" ? "WhiteElo" : "BlackElo"];
  const accuracy = analysis?.accuracy[color];
  const counts = analysis
    ? (["inaccuracy", "mistake", "blunder"] as const).map(
        (c) => analysis.moves.filter((m) => m.color === color && m.classification === c).length,
      )
    : null;
  return (
    <div className="player-strip">
      <span className={`player-dot player-dot-${color}`} aria-hidden />
      <span className="player-name">{name}</span>
      {elo && elo !== "?" && <span className="player-elo">{elo}</span>}
      {accuracy != null && <span className="player-acc">{accuracy.toFixed(1)}%</span>}
      {counts && (
        <span className="player-counts" title="Inaccuracies / mistakes / blunders">
          <span className="ml-inaccuracy">{counts[0]}?!</span> <span className="ml-mistake">{counts[1]}?</span>{" "}
          <span className="ml-blunder">{counts[2]}??</span>
        </span>
      )}
    </div>
  );
}

export function PositionReadout({ scoreText, depth, verdict }: { scoreText: string; depth: number | null; verdict: MoveVerdict | null }) {
  return (
    <div className="readout">
      <div className="readout-eval">
        <span className="readout-score">{scoreText}</span>
        {depth !== null && <span className="readout-depth">depth {depth}</span>}
      </div>
      {verdict && (
        <p className={`readout-verdict verdict-${verdict.classification}`}>
          <strong>
            {verdict.san}
            {CLASS_GLYPH[verdict.classification] ?? ""}
          </strong>{" "}
          {CLASS_LABEL[verdict.classification]}
          {isFlagged(verdict.classification) && (
            <>
              {" · "}
              {pct(verdict.winBefore)} → {pct(verdict.winAfter)} expected
              {verdict.bestMoveSan && (
                <>
                  {" · "}better was <strong>{verdict.bestMoveSan}</strong>
                </>
              )}
            </>
          )}
        </p>
      )}
    </div>
  );
}

/** Streaming multi-line engine output for an explored position. */
export function LiveLinesPanel({ live }: { live: LiveLines | null }) {
  if (!live || live.lines.length === 0) {
    return <p className="hint">Stockfish is thinking…</p>;
  }
  const depth = Math.min(...live.lines.map((l) => l.depth));
  return (
    <div className="live-lines">
      <p className="live-head">
        <span>Live · depth {depth}</span>
        <span>{live.final ? `done (max ${LIVE_LIMITS.depth})` : "searching"}</span>
      </p>
      <ol className="live-list">
        {live.lines.map((line) => (
          <li key={line.multipv} className="live-line">
            <span className="live-score">{formatScore(line.score)}</span>
            <span className="live-pv">{formatLine(live.fen, pvToSan(live.fen, line.pv, 10))}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export interface Variation {
  /** Main-line ply the variation branches from. */
  branchPly: number;
  moves: PlayedMove[];
  /** 0 = at the branch point; n = after the n-th variation move. */
  cursor: number;
}

export function VariationStrip({
  variation,
  onCursor,
  onExit,
}: {
  variation: Variation;
  onCursor: (cursor: number) => void;
  onExit: () => void;
}) {
  const startFen = variation.moves[0]!.fenBefore;
  const labels = numberedSans(startFen, variation.moves.map((m) => m.san));
  return (
    <div className="variation" role="region" aria-label="Explored variation">
      <div className="variation-head">
        <span className="panel-title">Exploring</span>
        <button className="btn" onClick={onExit}>
          Back to game <kbd>Esc</kbd>
        </button>
      </div>
      <p className="variation-moves">
        {labels.map((label, i) => (
          <button
            key={i}
            className={`ml-move${variation.cursor === i + 1 ? " ml-active" : ""}`}
            onClick={() => onCursor(i + 1)}
          >
            {label}
          </button>
        ))}
      </p>
    </div>
  );
}

const PROMOTION_PIECES: { piece: PromotionPiece; glyph: string; name: string }[] = [
  { piece: "q", glyph: "♛", name: "Queen" },
  { piece: "r", glyph: "♜", name: "Rook" },
  { piece: "b", glyph: "♝", name: "Bishop" },
  { piece: "n", glyph: "♞", name: "Knight" },
];

export function PromotionPicker({ color, onPick, onCancel }: { color: Color; onPick: (p: PromotionPiece) => void; onCancel: () => void }) {
  return (
    <div className="promotion" role="dialog" aria-label="Choose promotion piece">
      {PROMOTION_PIECES.map(({ piece, glyph, name }) => (
        <button key={piece} className={`promotion-btn piece-${color}`} onClick={() => onPick(piece)} aria-label={name}>
          {glyph + "︎"}
        </button>
      ))}
      <button className="btn btn-quiet" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

function formatLine(fen: string, sans: string[]): string {
  return numberedSans(fen, sans).join(" ");
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}
