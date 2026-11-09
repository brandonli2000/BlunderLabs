import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeGame, type GameAnalysis } from "../analysis/gameAnalysis";
import { formatScore } from "../core/evaluation";
import { parseGame, PgnError, splitPgn, type ParsedGame } from "../core/pgn";
import type { Color } from "../core/types";
import { CLASS_GLYPH, CLASS_LABEL, isFlagged } from "./annotations";
import { Board, type BoardArrow } from "./Board";
import { getEngine } from "./engineInstance";
import { EvalGraph } from "./EvalGraph";
import { ImportPanel } from "./ImportPanel";
import { MoveList } from "./MoveList";

type AnalysisState =
  | { status: "idle" }
  | { status: "running"; done: number; total: number }
  | { status: "done"; analysis: GameAnalysis }
  | { status: "error"; message: string };

export function ReviewPage() {
  const [games, setGames] = useState<string[]>([]);
  const [gameIndex, setGameIndex] = useState(0);
  const [game, setGame] = useState<ParsedGame | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<Color>("w");
  const [state, setState] = useState<AnalysisState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const cancelAnalysis = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    getEngine().stop();
  }, []);

  const loadGame = useCallback(
    (pgn: string) => {
      cancelAnalysis();
      try {
        const parsed = parseGame(pgn);
        if (parsed.moves.length === 0) throw new PgnError("The game has no moves.");
        setGame(parsed);
        setImportError(null);
        setPly(0);
        setState({ status: "idle" });
      } catch (err) {
        setImportError(err instanceof PgnError ? `Could not read this game: ${err.message}` : String(err));
      }
    },
    [cancelAnalysis],
  );

  const importText = useCallback(
    (text: string) => {
      const split = splitPgn(text);
      if (split.length === 0) {
        setImportError("No games found in the input.");
        return;
      }
      setGames(split);
      setGameIndex(0);
      loadGame(split[0]!);
    },
    [loadGame],
  );

  const runAnalysis = useCallback(async () => {
    if (!game) return;
    cancelAnalysis();
    const controller = new AbortController();
    abortRef.current = controller;
    const total = game.moves.length + 1;
    setState({ status: "running", done: 0, total });
    try {
      const analysis = await analyzeGame(getEngine(), game, {
        signal: controller.signal,
        onProgress: (done) => setState({ status: "running", done, total }),
      });
      if (!controller.signal.aborted) setState({ status: "done", analysis });
    } catch (err) {
      if (controller.signal.aborted) return;
      setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, [game, cancelAnalysis]);

  useEffect(() => cancelAnalysis, [cancelAnalysis]);

  const lastPly = game?.moves.length ?? 0;
  const seek = useCallback((p: number) => setPly(Math.max(0, Math.min(lastPly, p))), [lastPly]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      const actions: Record<string, () => void> = {
        ArrowLeft: () => seek(ply - 1),
        ArrowRight: () => seek(ply + 1),
        Home: () => seek(0),
        End: () => seek(lastPly),
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
  }, [ply, lastPly, seek]);

  const analysis = state.status === "done" ? state.analysis : null;
  const fen = game ? (ply === 0 ? game.startFen : game.moves[ply - 1]!.fenAfter) : null;
  const playedMove = game && ply > 0 ? game.moves[ply - 1]! : null;
  const verdict = analysis && ply > 0 ? analysis.moves[ply - 1]! : null;
  const position = analysis?.positions[ply] ?? null;

  const arrows = useMemo<BoardArrow[]>(() => {
    if (!position?.bestMove) return [];
    return [{ from: position.bestMove.slice(0, 2), to: position.bestMove.slice(2, 4), tone: "best" }];
  }, [position]);

  return (
    <div className="review">
      <div className="review-board">
        {game && fen ? (
          <>
            <PlayerStrip game={game} color={orientation === "w" ? "b" : "w"} analysis={analysis} />
            <Board
              fen={fen}
              orientation={orientation}
              lastMove={playedMove ? { from: playedMove.uci.slice(0, 2), to: playedMove.uci.slice(2, 4) } : null}
              arrows={arrows}
              marker={
                verdict && playedMove && isFlagged(verdict.classification)
                  ? {
                      square: playedMove.uci.slice(2, 4),
                      tone: verdict.classification,
                      label: CLASS_GLYPH[verdict.classification]!,
                    }
                  : null
              }
            />
            <PlayerStrip game={game} color={orientation} analysis={analysis} />
            <nav className="nav-controls" aria-label="Move navigation">
              <button className="btn" onClick={() => seek(0)} aria-label="First move">
                ⏮
              </button>
              <button className="btn" onClick={() => seek(ply - 1)} aria-label="Previous move">
                ◀
              </button>
              <span className="ply-readout">
                {ply}/{lastPly}
              </span>
              <button className="btn" onClick={() => seek(ply + 1)} aria-label="Next move">
                ▶
              </button>
              <button className="btn" onClick={() => seek(lastPly)} aria-label="Last move">
                ⏭
              </button>
              <button
                className="btn btn-quiet"
                onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}
                aria-label="Flip board"
              >
                Flip
              </button>
            </nav>
          </>
        ) : (
          <EmptyBoard />
        )}
      </div>

      <aside className="review-side">
        <ImportPanel onImport={importText} error={importError} />

        {games.length > 1 && (
          <section className="panel">
            <h2 className="panel-title">Games in file ({games.length})</h2>
            <select
              className="game-select"
              value={gameIndex}
              onChange={(e) => {
                const i = Number(e.target.value);
                setGameIndex(i);
                loadGame(games[i]!);
              }}
            >
              {games.map((g, i) => (
                <option key={i} value={i}>
                  {i + 1}. {gameTitle(g)}
                </option>
              ))}
            </select>
          </section>
        )}

        {game && (
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Analysis</h2>
              {state.status === "running" ? (
                <button
                  className="btn"
                  onClick={() => {
                    cancelAnalysis();
                    setState({ status: "idle" });
                  }}
                >
                  Cancel
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => void runAnalysis()}>
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
            {analysis && (
              <>
                <EvalGraph analysis={analysis} ply={ply} onSeek={seek} />
                <PositionReadout
                  scoreText={position ? formatScore(position.score) : "—"}
                  depth={position?.depth ?? null}
                  verdict={verdict}
                />
              </>
            )}
            {state.status === "idle" && !analysis && (
              <p className="hint">
                Runs Stockfish locally in your browser. Nothing is uploaded.
              </p>
            )}
          </section>
        )}

        {game && (
          <section className="panel panel-moves">
            <h2 className="panel-title">Moves</h2>
            <MoveList startFen={game.startFen} moves={game.moves} verdicts={analysis?.moves ?? null} ply={ply} onSeek={seek} />
          </section>
        )}
      </aside>
    </div>
  );
}

function PositionReadout({
  scoreText,
  depth,
  verdict,
}: {
  scoreText: string;
  depth: number | null;
  verdict: GameAnalysis["moves"][number] | null;
}) {
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
              {formatPct(verdict.winBefore)} → {formatPct(verdict.winAfter)} expected
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

function PlayerStrip({ game, color, analysis }: { game: ParsedGame; color: Color; analysis: GameAnalysis | null }) {
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
      {elo && <span className="player-elo">{elo}</span>}
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

function EmptyBoard() {
  return (
    <div className="empty-board">
      <Board fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" orientation="w" />
      <p className="hint">Import a game to begin the review.</p>
    </div>
  );
}

function formatPct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/** "White – Black (Date)" from raw PGN headers, without a full parse. */
function gameTitle(pgn: string): string {
  const tag = (name: string) => pgn.match(new RegExp(`\\[${name} "([^"]*)"\\]`))?.[1];
  const date = tag("Date");
  return `${tag("White") ?? "?"} – ${tag("Black") ?? "?"}${date ? ` (${date})` : ""}`;
}

