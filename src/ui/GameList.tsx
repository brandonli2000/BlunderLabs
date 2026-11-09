import { useMemo, useState } from "react";
import type { GameRecord } from "../library/gameRecord";

interface GameListProps {
  games: GameRecord[];
  analyzed: Set<string>;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

const SOURCE_TAG: Record<GameRecord["source"], string> = { lichess: "LI", chesscom: "CC", pgn: "PGN" };

export function GameList({ games, analyzed, onOpen, onDelete }: GameListProps) {
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return games;
    return games.filter((g) => `${g.white} ${g.black} ${g.opening ?? ""} ${g.date ?? ""}`.toLowerCase().includes(q));
  }, [games, query]);

  if (games.length === 0) {
    return <p className="hint">No games yet. Import from Lichess, Chess.com or a PGN file to start.</p>;
  }

  return (
    <>
      <input
        className="text-input game-filter"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by player, opening or date"
        aria-label="Filter games"
      />
      <ul className="game-list">
        {visible.map((g) => (
          <li key={g.id} className="gl-row">
            <button className="gl-open" onClick={() => onOpen(g.id)}>
              <span className={`gl-result gl-result-${resultClass(g.result)}`}>{g.result === "1/2-1/2" ? "½–½" : g.result}</span>
              <span className="gl-players">
                <span className="gl-player">
                  {g.white}
                  {g.whiteElo !== null && <span className="gl-elo">{g.whiteElo}</span>}
                </span>
                <span className="gl-player">
                  {g.black}
                  {g.blackElo !== null && <span className="gl-elo">{g.blackElo}</span>}
                </span>
              </span>
              <span className="gl-meta">
                <span>{formatDate(g.date)}</span>
                <span>
                  {g.timeControl ?? "—"} · {Math.ceil(g.plies / 2)} mv
                </span>
              </span>
              <span className="gl-opening">{g.opening ?? ""}</span>
              <span className="gl-tags">
                <span className="gl-tag">{SOURCE_TAG[g.source]}</span>
                {analyzed.has(g.id) && (
                  <span className="gl-tag gl-tag-analyzed" title="Analysis saved">
                    SF
                  </span>
                )}
              </span>
            </button>
            {confirming === g.id ? (
              <span className="gl-confirm">
                <button className="btn btn-danger" onClick={() => onDelete(g.id)}>
                  Delete
                </button>
                <button className="btn btn-quiet" onClick={() => setConfirming(null)}>
                  Keep
                </button>
              </span>
            ) : (
              <button className="gl-delete" onClick={() => setConfirming(g.id)} aria-label={`Delete ${g.white} vs ${g.black}`}>
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {visible.length === 0 && <p className="hint">No games match “{query}”.</p>}
    </>
  );
}

function resultClass(result: string): string {
  if (result === "1-0") return "w";
  if (result === "0-1") return "b";
  if (result === "1/2-1/2") return "d";
  return "u";
}

function formatDate(date: string | null): string {
  if (!date) return "—";
  return date.replace(/\./g, "-").replace(/-\?\?/g, "");
}
