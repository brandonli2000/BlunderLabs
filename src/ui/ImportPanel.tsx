import { useEffect, useRef, useState } from "react";
import { fetchChessComGames } from "../import/chesscom";
import { ImportError } from "../import/errors";
import { fetchLichessGames } from "../import/lichess";
import { splitPgn } from "../core/pgn";
import { importPgns, type ImportSummary } from "../library/importGames";
import { getDatabase } from "./database";
import { OPERA_GAME } from "./sampleGames";

type Tab = "lichess" | "chesscom" | "pgn";

const TABS: { id: Tab; label: string }[] = [
  { id: "lichess", label: "Lichess" },
  { id: "chesscom", label: "Chess.com" },
  { id: "pgn", label: "PGN" },
];

const COUNTS = [10, 25, 50, 100] as const;
const PREFS_KEY = "blunderlab.import";

type Status =
  | { kind: "idle" }
  | { kind: "fetching"; received: number; max: number }
  | { kind: "saving" }
  | { kind: "done"; summary: ImportSummary; ms: number }
  | { kind: "error"; message: string };

interface ImportPanelProps {
  /** Called after games were stored; `openId` is set when one game should open directly. */
  onImported: (openId: string | null) => void;
}

export function ImportPanel({ onImported }: ImportPanelProps) {
  const prefs = loadPrefs();
  const [tab, setTab] = useState<Tab>(prefs.tab);
  const [username, setUsername] = useState(prefs.usernames[prefs.tab === "pgn" ? "lichess" : prefs.tab] ?? "");
  const [count, setCount] = useState<number>(prefs.count);
  const [pgnText, setPgnText] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const busy = status.kind === "fetching" || status.kind === "saving";

  const switchTab = (next: Tab) => {
    if (busy) return;
    setTab(next);
    if (next !== "pgn") setUsername(loadPrefs().usernames[next] ?? "");
    setStatus({ kind: "idle" });
  };

  const store = async (pgns: string[], importedFor: string | null, started: number) => {
    setStatus({ kind: "saving" });
    const summary = await importPgns(await getDatabase(), pgns, importedFor);
    setStatus({ kind: "done", summary, ms: performance.now() - started });
    const single = summary.total === 1 ? (summary.added[0] ?? summary.duplicates[0] ?? null) : null;
    onImported(single);
  };

  const importFromSite = async (site: "lichess" | "chesscom") => {
    const controller = new AbortController();
    abortRef.current = controller;
    const started = performance.now();
    setStatus({ kind: "fetching", received: 0, max: count });
    savePrefs({ tab: site, count, usernames: { ...loadPrefs().usernames, [site]: username.trim() } });
    try {
      const fetchGames = site === "lichess" ? fetchLichessGames : fetchChessComGames;
      const pgns = await fetchGames(username, {
        max: count,
        signal: controller.signal,
        onProgress: (received) => setStatus({ kind: "fetching", received, max: count }),
      });
      await store(pgns, `${site}:${username.trim().toLowerCase()}`, started);
    } catch (err) {
      if (err instanceof ImportError && err.kind === "aborted") setStatus({ kind: "idle" });
      else setStatus({ kind: "error", message: errorMessage(err) });
    } finally {
      abortRef.current = null;
    }
  };

  const importPgnText = async (text: string) => {
    const pgns = splitPgn(text);
    if (pgns.length === 0) {
      setStatus({ kind: "error", message: "No games found in that PGN." });
      return;
    }
    try {
      await store(pgns, null, performance.now());
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    }
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setPgnText(text.length > 20_000 ? "" : text);
    await importPgnText(text);
  };

  return (
    <section className="panel import-panel" aria-labelledby="import-heading">
      <h2 id="import-heading" className="panel-title">
        Import games
      </h2>
      <div className="tabs" role="tablist" aria-label="Import source">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? " tab-active" : ""}`}
            onClick={() => switchTab(t.id)}
            disabled={busy && tab !== t.id}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== "pgn" ? (
        <form
          className="import-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void importFromSite(tab);
          }}
        >
          <label className="field">
            <span className="field-label">Username</span>
            <input
              className="text-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={tab === "lichess" ? "Lichess username" : "Chess.com username"}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              required
            />
          </label>
          <label className="field field-narrow">
            <span className="field-label">Recent games</span>
            <select className="text-input" value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={busy}>
              {COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="import-actions">
            {busy ? (
              <button type="button" className="btn" onClick={() => abortRef.current?.abort()} disabled={status.kind === "saving"}>
                Cancel
              </button>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={!username.trim()}>
                Import
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="import-form import-form-pgn">
          <textarea
            className="pgn-input"
            value={pgnText}
            onChange={(e) => setPgnText(e.target.value)}
            placeholder={'Paste one or more games in PGN\n\n[Event "…"]\n1. e4 e5 2. Nf3 …'}
            spellCheck={false}
            rows={6}
            disabled={busy}
          />
          <div className="import-actions">
            <button className="btn btn-primary" onClick={() => void importPgnText(pgnText)} disabled={busy || !pgnText.trim()}>
              Import PGN
            </button>
            <label className={`btn${busy ? " btn-disabled" : ""}`}>
              Open file
              <input
                type="file"
                accept=".pgn,application/x-chess-pgn,text/plain"
                hidden
                disabled={busy}
                onChange={(e) => {
                  void readFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <button className="btn btn-quiet" onClick={() => void importPgnText(OPERA_GAME)} disabled={busy}>
              Add sample game
            </button>
          </div>
        </div>
      )}

      <ImportStatus status={status} />
      {tab !== "pgn" && status.kind === "idle" && (
        <p className="hint">Public games only. Requests go straight from your browser to {tab === "lichess" ? "Lichess" : "Chess.com"}.</p>
      )}
    </section>
  );
}

function ImportStatus({ status }: { status: Status }) {
  switch (status.kind) {
    case "idle":
      return null;
    case "fetching":
      return (
        <div className="progress" role="progressbar" aria-valuenow={status.received} aria-valuemax={status.max}>
          <div className="progress-fill" style={{ width: `${(100 * Math.min(status.received, status.max)) / status.max}%` }} />
          <span className="progress-label">
            Downloading · {status.received}/{status.max} games
          </span>
        </div>
      );
    case "saving":
      return <p className="hint">Saving to your library…</p>;
    case "error":
      return (
        <p className="import-error" role="alert">
          {status.message}
        </p>
      );
    case "done": {
      const { added, duplicates, failed } = status.summary;
      return (
        <p className="import-result" role="status">
          <strong>{added.length}</strong> new game{added.length === 1 ? "" : "s"}
          {duplicates.length > 0 && <> · {duplicates.length} already in library</>}
          {failed.length > 0 && (
            <span className="import-warn">
              {" "}
              · {failed.length} unreadable (first: {failed[0]!.message})
            </span>
          )}
          <span className="import-time"> · {(status.ms / 1000).toFixed(1)} s</span>
        </p>
      );
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface Prefs {
  tab: Tab;
  count: number;
  usernames: Partial<Record<"lichess" | "chesscom", string>>;
}

/** Last-used source/username: a per-browser convenience only, so failures are ignored. */
function loadPrefs(): Prefs {
  const fallback: Prefs = { tab: "lichess", count: 25, usernames: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
    if (!raw) return fallback;
    return {
      tab: raw.tab === "chesscom" || raw.tab === "pgn" ? raw.tab : "lichess",
      count: COUNTS.includes(raw.count as (typeof COUNTS)[number]) ? raw.count! : 25,
      usernames: typeof raw.usernames === "object" && raw.usernames ? raw.usernames : {},
    };
  } catch {
    return fallback;
  }
}

function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable (private mode etc.): not worth surfacing.
  }
}
