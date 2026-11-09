import { useCallback, useEffect, useMemo, useState } from "react";
import { computeGameClock, formatClock, parseTimeControl, type GameClock } from "../core/clock";
import { formatScore } from "../core/evaluation";
import { isPromotion, legalDestinations, pieceColorAt, playMove, type PromotionPiece } from "../core/moves";
import { parseGame, type ParsedGame } from "../core/pgn";
import { sideToMove, type Color } from "../core/types";
import type { GameRecord } from "../library/gameRecord";
import { getGame } from "../storage/library";
import { CLASS_GLYPH, isFlagged } from "./annotations";
import { Board, type BoardArrow } from "./Board";
import { getDatabase } from "./database";
import { EvalGraph } from "./EvalGraph";
import { MoveList } from "./MoveList";
import { LiveLinesPanel, PlayerStrip, PositionReadout, PromotionPicker, VariationStrip, type Variation } from "./ReviewParts";
import { useGameAnalysis } from "./useGameAnalysis";
import { useLiveLines } from "./useLiveLines";

type Loaded =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; message: string }
  | { status: "ready"; record: GameRecord; game: ParsedGame };

interface ReviewPageProps {
  gameId: string;
  onAnalysisSaved: () => void;
}

export function ReviewPage({ gameId, onAnalysisSaved }: ReviewPageProps) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const record = await getGame(await getDatabase(), gameId);
        if (cancelled) return;
        setLoaded(record ? { status: "ready", record, game: parseGame(record.pgn) } : { status: "missing" });
      } catch (err) {
        if (!cancelled) setLoaded({ status: "error", message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  if (loaded.status === "loading") return <p className="hint">Loading game…</p>;
  if (loaded.status !== "ready") {
    return (
      <div className="panel page-message">
        <p>{loaded.status === "missing" ? "This game isn't in your library (it may have been deleted)." : loaded.message}</p>
        <a className="btn" href="#/">
          Back to library
        </a>
      </div>
    );
  }
  return <Review record={loaded.record} game={loaded.game} onAnalysisSaved={onAnalysisSaved} />;
}

function Review({ record, game, onAnalysisSaved }: { record: GameRecord; game: ParsedGame; onAnalysisSaved: () => void }) {
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<Color>(() => defaultOrientation(record));
  const [variation, setVariation] = useState<Variation | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const { state, run, stop } = useGameAnalysis(record.id, game, onAnalysisSaved);
  const clock = useMemo(() => computeGameClock(game.moves, parseTimeControl(game.headers.TimeControl)), [game]);

  const lastPly = game.moves.length;
  const exploring = variation !== null && variation.cursor > 0;
  const mainFen = ply === 0 ? game.startFen : game.moves[ply - 1]!.fenAfter;
  const varMove = exploring ? variation.moves[variation.cursor - 1]! : null;
  const fen = varMove ? varMove.fenAfter : mainFen;
  const lastMoveUci = varMove ? varMove.uci : ply > 0 ? game.moves[ply - 1]!.uci : null;

  const live = useLiveLines(exploring ? fen : null);
  const analysis = state.status === "done" ? state.analysis : null;
  const verdict = !exploring && analysis && ply > 0 ? analysis.moves[ply - 1]! : null;
  const position = !exploring ? (analysis?.positions[ply] ?? null) : null;

  const clearInteraction = () => {
    setSelected(null);
    setPromotion(null);
  };

  const seek = useCallback(
    (p: number) => {
      setVariation(null);
      setSelected(null);
      setPromotion(null);
      setPly(Math.max(0, Math.min(lastPly, p)));
    },
    [lastPly],
  );

  const step = useCallback(
    (delta: 1 | -1) => {
      clearInteraction();
      if (!variation) return seek(ply + delta);
      const cursor = variation.cursor + delta;
      if (cursor < 1) setVariation(null); // back to the branch point on the main line
      else if (cursor <= variation.moves.length) setVariation({ ...variation, cursor });
    },
    [variation, ply, seek],
  );

  const makeMove = (from: string, to: string, piece?: PromotionPiece) => {
    clearInteraction();
    const played = playMove(fen, from, to, piece);
    if (!played) return;
    if (!exploring) {
      if (game.moves[ply]?.uci === played.uci) return seek(ply + 1); // the game move: just advance
      setVariation({ branchPly: ply, moves: [played], cursor: 1 });
      return;
    }
    const kept = variation.moves.slice(0, variation.cursor);
    setVariation({ ...variation, moves: [...kept, played], cursor: variation.cursor + 1 });
  };

  const targets = useMemo(() => (selected ? legalDestinations(fen, selected) : []), [fen, selected]);

  const onSquareClick = (square: string) => {
    if (promotion) return;
    if (selected && targets.includes(square)) {
      if (isPromotion(fen, selected, square)) setPromotion({ from: selected, to: square });
      else makeMove(selected, square);
      return;
    }
    setSelected(pieceColorAt(fen, square) === sideToMove(fen) && square !== selected ? square : null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["TEXTAREA", "INPUT", "SELECT"].includes(target.tagName)) return;
      const actions: Record<string, () => void> = {
        ArrowLeft: () => step(-1),
        ArrowRight: () => step(1),
        Home: () => seek(0),
        End: () => seek(lastPly),
        Escape: () => (variation ? seek(variation.branchPly) : clearInteraction()),
        f: () => setOrientation((o) => (o === "w" ? "b" : "w")),
      };
      const action = actions[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, seek, lastPly, variation]);

  const arrows = useMemo<BoardArrow[]>(() => {
    const best = exploring ? live?.lines[0]?.pv[0] : position?.bestMove;
    return best ? [{ from: best.slice(0, 2), to: best.slice(2, 4), tone: "best" }] : [];
  }, [exploring, live, position]);

  const playedMove = !exploring && ply > 0 ? game.moves[ply - 1]! : null;

  return (
    <div className="review">
      <div className="review-board">
        <PlayerStrip
          game={game}
          color={orientation === "w" ? "b" : "w"}
          analysis={analysis}
          clockText={clockAt(clock, game, orientation === "w" ? "b" : "w", exploring ? variation.branchPly : ply)}
        />
        <div className="board-wrap">
          <Board
            fen={fen}
            orientation={orientation}
            lastMove={lastMoveUci ? { from: lastMoveUci.slice(0, 2), to: lastMoveUci.slice(2, 4) } : null}
            arrows={arrows}
            selected={selected}
            targets={targets}
            onSquareClick={onSquareClick}
            marker={
              verdict && playedMove && isFlagged(verdict.classification)
                ? { square: playedMove.uci.slice(2, 4), tone: verdict.classification, label: CLASS_GLYPH[verdict.classification]! }
                : null
            }
          />
          {promotion && (
            <PromotionPicker
              color={sideToMove(fen)}
              onPick={(piece) => makeMove(promotion.from, promotion.to, piece)}
              onCancel={clearInteraction}
            />
          )}
        </div>
        <PlayerStrip game={game} color={orientation} analysis={analysis} clockText={clockAt(clock, game, orientation, exploring ? variation.branchPly : ply)} />
        <nav className="nav-controls" aria-label="Move navigation">
          <button className="btn" onClick={() => seek(0)} aria-label="First move">
            ⏮
          </button>
          <button className="btn" onClick={() => step(-1)} aria-label="Previous move">
            ◀
          </button>
          <span className="ply-readout">{exploring ? `var ${variation.cursor}` : `${ply}/${lastPly}`}</span>
          <button className="btn" onClick={() => step(1)} aria-label="Next move">
            ▶
          </button>
          <button className="btn" onClick={() => seek(lastPly)} aria-label="Last move">
            ⏭
          </button>
          <button className="btn btn-quiet" onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))} aria-label="Flip board">
            Flip
          </button>
        </nav>
        <p className="hint board-hint">Click a piece, then a square, to explore your own moves.</p>
      </div>

      <aside className="review-side">
        <section className="panel game-head">
          <a href="#/" className="back-link">
            ← Library
          </a>
          <p className="game-title">
            {record.white} – {record.black} <span className="game-result">{record.result}</span>
          </p>
          <p className="game-sub">{[record.date?.replace(/\./g, "-"), record.timeControl, record.opening].filter(Boolean).join(" · ")}</p>
        </section>

        {variation && variation.moves.length > 0 && (
          <section className="panel">
            <VariationStrip
              variation={variation}
              onCursor={(cursor) => setVariation({ ...variation, cursor })}
              onExit={() => seek(variation.branchPly)}
            />
            {exploring && <LiveLinesPanel live={live} />}
          </section>
        )}

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Analysis</h2>
            {state.status === "running" ? (
              <button className="btn" onClick={stop}>
                Cancel
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => void run()}>
                {analysis ? "Re-analyze" : "Analyze game"}
              </button>
            )}
          </div>
          {state.status === "running" && (
            <div className="progress" role="progressbar" aria-valuenow={state.done} aria-valuemax={state.total}>
              <div className="progress-fill" style={{ width: `${(100 * state.done) / state.total}%` }} />
              <span className="progress-label">
                Stockfish · position {state.done}/{state.total}
              </span>
            </div>
          )}
          {state.status === "error" && (
            <p className="import-error" role="alert">
              Analysis failed: {state.message}
            </p>
          )}
          {state.status === "done" && state.saveError && (
            <p className="import-error" role="alert">
              Analysis finished but couldn't be saved: {state.saveError}
            </p>
          )}
          {analysis && (
            <>
              <EvalGraph analysis={analysis} ply={ply} onSeek={seek} />
              {!exploring && (
                <PositionReadout scoreText={position ? formatScore(position.score) : "—"} depth={position?.depth ?? null} verdict={verdict} />
              )}
              <p className="analysis-meta">
                depth {analysis.limits.depth} · {(analysis.durationMs / 1000).toFixed(1)} s · saved locally
              </p>
            </>
          )}
          {state.status === "idle" && !analysis && <p className="hint">Runs Stockfish locally in your browser. Nothing is uploaded.</p>}
        </section>

        <section className="panel panel-moves">
          <h2 className="panel-title">Moves</h2>
          <MoveList
            startFen={game.startFen}
            moves={game.moves}
            verdicts={analysis?.moves ?? null}
            clock={clock}
            ply={exploring ? -1 : ply}
            onSeek={seek}
          />
        </section>
      </aside>
    </div>
  );
}

/**
 * Remaining time for `color` at main-line `ply`: the clock after that side's
 * latest move so far, or the starting time before they've moved.
 */
function clockAt(clock: GameClock | null, game: ParsedGame, color: Color, ply: number): string | null {
  if (!clock) return null;
  for (let i = ply - 1; i >= 0; i--) {
    if (game.moves[i]!.color !== color) continue;
    const remaining = clock.moves[i]!.remainingMs;
    return remaining === null ? null : formatClock(remaining, clock.resolutionMs);
  }
  return clock.timeControl?.kind === "live" ? formatClock(clock.timeControl.initialMs, clock.resolutionMs) : null;
}

/** Show the board from the imported player's side when we know who they are. */
function defaultOrientation(record: GameRecord): Color {
  const username = record.importedFor?.split(":")[1];
  return username && record.black.toLowerCase() === username ? "b" : "w";
}
