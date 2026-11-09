import { useState } from "react";
import type { BatchProgress } from "../analysis/batch";
import type { GameRecord } from "../library/gameRecord";
import { getBatchRunner } from "./batchInstance";

interface BatchPanelProps {
  progress: BatchProgress;
  games: GameRecord[];
}

export function BatchPanel({ progress, games }: BatchPanelProps) {
  const [showFailed, setShowFailed] = useState(false);
  const runner = getBatchRunner();
  const { status, completed, remaining, failed, current } = progress;
  const nameOf = (id: string) => {
    const g = games.find((x) => x.id === id);
    return g ? `${g.white} – ${g.black}${g.date ? ` (${g.date.replace(/\./g, "-")})` : ""}` : id;
  };

  if (games.length === 0) return null;
  const nothingToDo = status === "idle" && remaining === 0 && failed.length === 0;

  return (
    <section className="panel batch-panel" aria-labelledby="batch-heading">
      <div className="panel-head">
        <h2 id="batch-heading" className="panel-title">
          Batch analysis
        </h2>
        <BatchActions status={status} remaining={remaining} />
      </div>

      {nothingToDo && <p className="hint">Every game in the library has a saved analysis.</p>}
      {status === "idle" && remaining > 0 && (
        <p className="batch-line">
          <strong>{remaining}</strong> game{remaining === 1 ? "" : "s"} not analysed yet.
        </p>
      )}
      {status === "interrupted" && (
        <p className="batch-line">
          Batch analysis stopped when the page was closed. {remaining} game{remaining === 1 ? "" : "s"} left.
        </p>
      )}
      {status === "paused" && <p className="batch-line">Paused · {remaining} left.</p>}
      {status === "locked" && <p className="batch-line">Batch analysis is running in another BlunderLab tab.</p>}

      {status === "running" && (
        <>
          <div className="progress" role="progressbar" aria-valuenow={current?.done ?? 0} aria-valuemax={current?.total ?? 1}>
            <div className="progress-fill" style={{ width: `${current ? (100 * current.done) / current.total : 0}%` }} />
            <span className="progress-label">
              {current ? `${nameOf(current.id)} · ${current.done}/${current.total}` : "Preparing…"}
            </span>
          </div>
        </>
      )}

      {(status === "running" || completed > 0 || failed.length > 0) && (
        <p className="batch-counts">
          <span>{completed} done</span>
          <span>{remaining} remaining</span>
          <span className={failed.length ? "batch-failed" : undefined}>{failed.length} failed</span>
        </p>
      )}

      {failed.length > 0 && (
        <div className="batch-failures">
          <button className="btn btn-quiet" onClick={() => setShowFailed((s) => !s)}>
            {showFailed ? "Hide" : "Show"} failures
          </button>
          {status !== "running" && (
            <button className="btn" onClick={() => void runner.retryFailed()}>
              Retry failed
            </button>
          )}
          {showFailed && (
            <ul className="batch-failure-list">
              {failed.map((f) => (
                <li key={f.id}>
                  <a href={`#/game/${encodeURIComponent(f.id)}`}>{nameOf(f.id)}</a>: {f.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(status === "idle" || status === "running") && remaining > 0 && (
        <p className="hint">Runs in this tab while it's open, one game at a time. Each finished game is saved immediately.</p>
      )}
    </section>
  );
}

function BatchActions({ status, remaining }: { status: BatchProgress["status"]; remaining: number }) {
  const runner = getBatchRunner();
  switch (status) {
    case "running":
      return (
        <span className="batch-actions">
          <button className="btn" onClick={() => void runner.pause()}>
            Pause
          </button>
          <button className="btn btn-quiet" onClick={() => void runner.cancel()}>
            Cancel
          </button>
        </span>
      );
    case "paused":
    case "interrupted":
      return (
        <span className="batch-actions">
          <button className="btn btn-primary" onClick={() => void runner.start()} disabled={remaining === 0}>
            Resume
          </button>
          <button className="btn btn-quiet" onClick={() => void runner.cancel()}>
            Cancel
          </button>
        </span>
      );
    case "locked":
      return (
        <button className="btn" onClick={() => void runner.load()}>
          Check again
        </button>
      );
    case "idle":
      return remaining > 0 ? (
        <button className="btn btn-primary" onClick={() => void runner.start()}>
          Analyze {remaining} unanalysed
        </button>
      ) : null;
  }
}
