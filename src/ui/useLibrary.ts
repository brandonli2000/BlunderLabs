import { useCallback, useEffect, useState } from "react";
import type { GameRecord } from "../library/gameRecord";
import { analyzedGameIds, deleteGame, listGames } from "../storage/library";
import { getDatabase, storageEstimate } from "./database";

export interface LibraryState {
  games: GameRecord[] | null;
  analyzed: Set<string>;
  usageBytes: number | null;
  error: string | null;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useLibrary(): LibraryState {
  const [games, setGames] = useState<GameRecord[] | null>(null);
  const [analyzed, setAnalyzed] = useState<Set<string>>(new Set());
  const [usageBytes, setUsageBytes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const db = await getDatabase();
      const [list, ids, estimate] = await Promise.all([listGames(db), analyzedGameIds(db), storageEstimate()]);
      setGames(list);
      setAnalyzed(ids);
      setUsageBytes(estimate?.usage ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGames((g) => g ?? []);
    }
  }, []);

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteGame(await getDatabase(), id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { games, analyzed, usageBytes, error, refresh, remove };
}
