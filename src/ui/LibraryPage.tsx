import { useEffect } from "react";
import { BatchPanel } from "./BatchPanel";
import { getBatchRunner, useBatch } from "./batchInstance";
import { GameList } from "./GameList";
import { ImportPanel } from "./ImportPanel";
import { formatBytes } from "./database";
import type { LibraryState } from "./useLibrary";

interface LibraryPageProps {
  library: LibraryState;
  onOpen: (id: string) => void;
}

export function LibraryPage({ library, onOpen }: LibraryPageProps) {
  const { games, analyzed, usageBytes, error, refresh, remove } = library;
  const batch = useBatch();

  // Show "SF" tags as batch analyses land, and keep the batch's remaining count in step with the library.
  useEffect(() => {
    if (batch.completed > 0) void refresh();
  }, [batch.completed, refresh]);
  useEffect(() => {
    void getBatchRunner().refresh();
  }, [games]);

  return (
    <div className="library">
      <div className="library-import">
        <ImportPanel
          onImported={(openId) => {
            void refresh();
            if (openId) onOpen(openId);
          }}
        />
        {games && <BatchPanel progress={batch} games={games} />}
        <p className="hint privacy-note">
          Your games and analyses are stored only in this browser (IndexedDB). Nothing is uploaded.
        </p>
      </div>
      <section className="panel library-games" aria-labelledby="library-heading">
        <div className="panel-head">
          <h2 id="library-heading" className="panel-title">
            Library {games && games.length > 0 && <span className="panel-count">{games.length}</span>}
          </h2>
          {usageBytes !== null && <span className="panel-aside">{formatBytes(usageBytes)} stored</span>}
        </div>
        {error && (
          <p className="import-error" role="alert">
            {error}
          </p>
        )}
        {games === null ? (
          <p className="hint">Loading library…</p>
        ) : (
          <GameList games={games} analyzed={analyzed} onOpen={onOpen} onDelete={(id) => void remove(id)} />
        )}
      </section>
    </div>
  );
}
