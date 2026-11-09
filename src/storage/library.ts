import type { GameAnalysis } from "../analysis/gameAnalysis";
import type { GameRecord } from "../library/gameRecord";
import { committed, promisify, STORES } from "./db";

/**
 * Bump when the shape of GameAnalysis changes incompatibly. Stored analyses
 * with another version are ignored (and re-computed) rather than migrated:
 * they're a cache of engine output, so re-analysis is always possible.
 */
export const ANALYSIS_FORMAT = 1;

export interface StoredAnalysis {
  gameId: string;
  /** Engine build + search settings, see `analysisEngineKey`. */
  engineKey: string;
  format: number;
  createdAt: number;
  analysis: GameAnalysis;
}

export interface AddGamesResult {
  added: string[];
  duplicates: string[];
}

/*
 * Multi-step writes chain IDB request callbacks instead of awaiting between
 * requests: a transaction auto-commits once it has no pending requests, and
 * awaiting a promise mid-transaction is not reliably safe across engines.
 */

/** Insert games, skipping ids already stored (or repeated within the batch). One transaction. */
export async function addGames(db: IDBDatabase, records: GameRecord[]): Promise<AddGamesResult> {
  const tx = db.transaction(STORES.games, "readwrite");
  const store = tx.objectStore(STORES.games);
  const done = committed(tx);
  const result: AddGamesResult = { added: [], duplicates: [] };
  const seen = new Set<string>();

  for (const record of records) {
    if (seen.has(record.id)) {
      result.duplicates.push(record.id);
      continue;
    }
    seen.add(record.id);
    const lookup = store.getKey(record.id);
    lookup.onsuccess = () => {
      if (lookup.result === undefined) {
        store.add(record);
        result.added.push(record.id);
      } else {
        result.duplicates.push(record.id);
      }
    };
  }
  await done;
  return result;
}

/** All games, most recently imported first (ties: newest game date first). */
export async function listGames(db: IDBDatabase): Promise<GameRecord[]> {
  const games = await promisify<GameRecord[]>(db.transaction(STORES.games).objectStore(STORES.games).getAll());
  return games.sort((a, b) => b.importedAt - a.importedAt || (b.date ?? "").localeCompare(a.date ?? ""));
}

export async function getGame(db: IDBDatabase, id: string): Promise<GameRecord | null> {
  const game = await promisify<GameRecord | undefined>(db.transaction(STORES.games).objectStore(STORES.games).get(id));
  return game ?? null;
}

/** Delete a game and every stored analysis of it, atomically. */
export async function deleteGame(db: IDBDatabase, id: string): Promise<void> {
  const tx = db.transaction([STORES.games, STORES.analyses], "readwrite");
  const done = committed(tx);
  tx.objectStore(STORES.games).delete(id);
  const analyses = tx.objectStore(STORES.analyses);
  const lookup = analyses.index("gameId").getAllKeys(id);
  lookup.onsuccess = () => {
    for (const key of lookup.result) analyses.delete(key);
  };
  await done;
}

export async function saveAnalysis(db: IDBDatabase, stored: Omit<StoredAnalysis, "format">): Promise<void> {
  const tx = db.transaction(STORES.analyses, "readwrite");
  const done = committed(tx);
  tx.objectStore(STORES.analyses).put({ ...stored, format: ANALYSIS_FORMAT } satisfies StoredAnalysis);
  await done;
}

export async function getAnalysis(db: IDBDatabase, gameId: string, engineKey: string): Promise<StoredAnalysis | null> {
  const stored = await promisify<StoredAnalysis | undefined>(
    db.transaction(STORES.analyses).objectStore(STORES.analyses).get([gameId, engineKey]),
  );
  return stored && stored.format === ANALYSIS_FORMAT ? stored : null;
}

/** Ids of games that have at least one stored analysis (any settings). */
export async function analyzedGameIds(db: IDBDatabase): Promise<Set<string>> {
  const index = db.transaction(STORES.analyses).objectStore(STORES.analyses).index("gameId");
  const keys = await promisify(index.getAllKeys());
  return new Set(keys.map((k) => (k as [string, string])[0]));
}
