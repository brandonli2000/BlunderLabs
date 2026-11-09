import { PgnError } from "../core/pgn";
import { addGames } from "../storage/library";
import { toGameRecord, type GameRecord } from "./gameRecord";

export interface ImportSummary {
  total: number;
  added: string[];
  duplicates: string[];
  /** Games that couldn't be parsed; the rest of the batch is still imported. */
  failed: { index: number; message: string }[];
}

/**
 * Parse PGN strings (newest first) and store them, skipping duplicates.
 * One unreadable game doesn't fail the batch.
 */
export async function importPgns(
  db: IDBDatabase,
  pgns: string[],
  importedFor: string | null,
  now: number = Date.now(),
): Promise<ImportSummary> {
  const records: GameRecord[] = [];
  const failed: ImportSummary["failed"] = [];

  for (const [index, pgn] of pgns.entries()) {
    try {
      // Offset by index so "most recently imported first" keeps the source's
      // newest-first order within one batch.
      records.push(await toGameRecord(pgn, importedFor, now - index));
    } catch (err) {
      if (!(err instanceof PgnError)) throw err;
      failed.push({ index, message: err.message });
    }
  }

  const { added, duplicates } = await addGames(db, records);
  return { total: pgns.length, added, duplicates, failed };
}
