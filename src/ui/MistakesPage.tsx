import { useEffect, useMemo, useState } from "react";
import { formatClock, formatSpent } from "../core/clock";
import type { GamePhase } from "../core/phase";
import type { GameRecord } from "../library/gameRecord";
import { extractMistakes, filterMistakes, sortMistakes, type MistakeEntry, type MistakeFilter, type MistakeSort } from "../library/mistakes";
import { latestAnalysesByGame } from "../storage/library";
import { CLASS_GLYPH, CLASS_LABEL } from "./annotations";
import { Board } from "./Board";
import { getDatabase } from "./database";
import { routeHash } from "./route";

type Loaded = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; entries: MistakeEntry[]; analyzedGames: number; ms: number };

const CLASSES = ["blunder", "mistake", "inaccuracy"] as const;
const PHASES: GamePhase[] = ["opening", "middlegame", "endgame"];
const PAGE = 100;

/**
 * Every flagged move across analysed games, in one filterable list. It
 * shows *where* errors cluster; it doesn't claim to know why they happen.
 */
export function MistakesPage({ games }: { games: GameRecord[] | null }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [filter, setFilter] = useState<MistakeFilter>({
    classes: new Set(["blunder", "mistake"]),
    phases: new Set(PHASES),
    side: "owner",
    query: "",
  });
  const [sort, setSort] = useState<MistakeSort>("loss");
  const [limit, setLimit] = useState(PAGE);
  const [preview, setPreview] = useState<MistakeEntry | null>(null);

  useEffect(() => {
    if (!games) return;
    let cancelled = false;
    void (async () => {
      try {
        const started = performance.now();
        const analyses = await latestAnalysesByGame(await getDatabase());
        const entries: MistakeEntry[] = [];
        for (const record of games) {
          const stored = analyses.get(record.id);
          if (stored) entries.push(...extractMistakes(record, stored.analysis));
        }
        if (!cancelled) setLoaded({ status: "ready", entries, analyzedGames: analyses.size, ms: performance.now() - started });
      } catch (err) {
        if (!cancelled) setLoaded({ status: "error", message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [games]);

  const entries = loaded.status === "ready" ? loaded.entries : [];
  const hasOwner = entries.some((e) => e.byOwner !== null);
  const effectiveFilter = hasOwner ? filter : { ...filter, side: "all" as const };
  const visible = useMemo(() => sortMistakes(filterMistakes(entries, effectiveFilter), sort), [entries, effectiveFilter, sort]);

  const toggle = <T,>(set: ReadonlySet<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  if (loaded.status === "loading") return <p className="hint">Collecting mistakes…</p>;
  if (loaded.status === "error") return <p className="import-error">{loaded.message}</p>;
  if (loaded.analyzedGames === 0) {
    return (
      <div className="panel page-message">
        <p>No analysed games yet. Analyse games from the library (one at a time or in a batch) and their mistakes will collect here.</p>
        <a className="btn" href="#/">
          Go to library
        </a>
      </div>
    );
  }

  return (
    <div className="mistakes">
      <section className="panel mistakes-filters" aria-label="Filters">
        <div className="filter-group">
          <span className="field-label">Severity</span>
          {CLASSES.map((c) => (
            <label key={c} className={`chip chip-${c}${filter.classes.has(c) ? " chip-on" : ""}`}>
              <input type="checkbox" checked={filter.classes.has(c)} onChange={() => setFilter({ ...filter, classes: toggle(filter.classes, c) })} />
              {CLASS_GLYPH[c]} {CLASS_LABEL[c]}
            </label>
          ))}
        </div>
        <div className="filter-group">
          <span className="field-label">Phase</span>
          {PHASES.map((p) => (
            <label key={p} className={`chip${filter.phases.has(p) ? " chip-on" : ""}`}>
              <input type="checkbox" checked={filter.phases.has(p)} onChange={() => setFilter({ ...filter, phases: toggle(filter.phases, p) })} />
              {p}
            </label>
          ))}
        </div>
        {hasOwner && (
          <label className="filter-group">
            <span className="field-label">Moves by</span>
            <select className="text-input" value={filter.side} onChange={(e) => setFilter({ ...filter, side: e.target.value as MistakeFilter["side"] })}>
              <option value="owner">Imported player</option>
              <option value="opponents">Opponents</option>
              <option value="all">Everyone</option>
            </select>
          </label>
        )}
        <label className="filter-group">
          <span className="field-label">Sort</span>
          <select className="text-input" value={sort} onChange={(e) => setSort(e.target.value as MistakeSort)}>
            <option value="loss">Biggest drop first</option>
            <option value="date">Newest game first</option>
            <option value="clock">Least clock first</option>
          </select>
        </label>
        <input
          className="text-input filter-query"
          type="search"
          placeholder="Player or opening"
          value={filter.query}
          onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          aria-label="Filter by player or opening"
        />
      </section>

      <div className="mistakes-body">
        <section className="panel" aria-labelledby="mistakes-heading">
          <div className="panel-head">
            <h2 id="mistakes-heading" className="panel-title">
              Mistakes <span className="panel-count">{visible.length}</span>
            </h2>
            <span className="panel-aside">
              from {loaded.analyzedGames} analysed game{loaded.analyzedGames === 1 ? "" : "s"} · built in {Math.round(loaded.ms)} ms
            </span>
          </div>
          <table className="mistake-table">
            <thead>
              <tr>
                <th>Move</th>
                <th>Better</th>
                <th>Expected score</th>
                <th>Phase</th>
                <th>Clock</th>
                <th>Game</th>
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, limit).map((e) => (
                <tr
                  key={`${e.gameId}:${e.ply}`}
                  className={preview === e ? "mt-selected" : undefined}
                  onMouseEnter={() => setPreview(e)}
                  onFocus={() => setPreview(e)}
                >
                  <td>
                    <a className={`mt-move ml-${e.classification}`} href={routeHash({ view: "game", id: e.gameId, ply: e.ply })}>
                      {e.moveNumber}
                      {e.color === "w" ? "." : "…"}
                      {e.san}
                      {CLASS_GLYPH[e.classification]}
                    </a>
                  </td>
                  <td className="mt-mono">{e.bestSan ?? "—"}</td>
                  <td className="mt-mono">
                    {pct(e.winBefore)} → {pct(e.winAfter)}
                  </td>
                  <td>{e.phase}</td>
                  <td className="mt-mono">
                    {e.clockMs !== null ? formatClock(e.clockMs, e.clockResolutionMs) : "—"}
                    {e.spentMs !== null && e.spentSource && <span className="mt-spent"> ({formatSpent(e.spentMs, e.clockResolutionMs, e.spentSource)})</span>}
                  </td>
                  <td className="mt-game">
                    {e.player} vs {e.opponent}
                    <span className="mt-sub">{[e.date?.replace(/\./g, "-"), e.timeControl].filter(Boolean).join(" · ")}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length > limit && (
            <button className="btn" onClick={() => setLimit(limit + PAGE)}>
              Show {Math.min(PAGE, visible.length - limit)} more
            </button>
          )}
          {visible.length === 0 && <p className="hint">No mistakes match these filters.</p>}
        </section>

        <aside className="mistake-preview">
          {preview ? (
            <>
              <Board fen={preview.fenBefore} orientation={preview.color} />
              <p className="hint">
                {preview.color === "w" ? "White" : "Black"} to move. Played <strong>{preview.san}</strong>
                {preview.bestSan && (
                  <>
                    , engine preferred <strong>{preview.bestSan}</strong>
                  </>
                )}
                . Open the move to review it in context.
              </p>
            </>
          ) : (
            <p className="hint">Hover a row to preview the position before the move.</p>
          )}
        </aside>
      </div>
      <p className="hint">
        This list records where moves lost expected score, not why. Clock times are what the game clock showed, not a measure of
        how a player felt.
      </p>
    </div>
  );
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}
