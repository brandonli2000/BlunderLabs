/**
 * Library backup and restore.
 *
 * A backup is a versioned JSON document holding every game and stored
 * analysis. Restoring *merges*: it only ever adds records that aren't already
 * present, inside one IndexedDB transaction, so a failed or interrupted
 * restore leaves the existing library exactly as it was.
 */
import { isAnalysisShape, ANALYSIS_FORMAT, type StoredAnalysis } from "./library";
import { committed, promisify, STORES } from "./db";
import { toGameRecord, type GameRecord } from "../library/gameRecord";

export const BACKUP_FORMAT = "blunderlab-backup";
/** Bump on incompatible changes; add an upgrade step in `upgradeBackup` for older versions. */
export const BACKUP_VERSION = 1;
/** Refuse files larger than this before parsing (protects the tab from huge or hostile files). */
export const MAX_BACKUP_BYTES = 200 * 1024 * 1024;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  games: GameRecord[];
  analyses: StoredAnalysis[];
}

export class BackupError extends Error {
  override name = "BackupError";
}

/** Snapshot the whole library in one read transaction (consistent even if writes happen meanwhile). */
export async function createBackup(db: IDBDatabase, now: Date = new Date()): Promise<Backup> {
  const tx = db.transaction([STORES.games, STORES.analyses]);
  const [games, analyses] = await Promise.all([
    promisify<GameRecord[]>(tx.objectStore(STORES.games).getAll()),
    promisify<StoredAnalysis[]>(tx.objectStore(STORES.analyses).getAll()),
  ]);
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), games, analyses };
}

export function backupFileName(now: Date = new Date()): string {
  return `blunderlab-backup-${now.toISOString().slice(0, 10)}.json`;
}

export interface ValidatedBackup {
  exportedAt: string;
  games: GameRecord[];
  analyses: StoredAnalysis[];
  /** Entries dropped during validation, with reasons (shown to the user). */
  rejected: string[];
}

/**
 * Parse and validate a backup file. Throws BackupError if the file as a whole
 * is unusable; individual bad entries are dropped and listed in `rejected`.
 *
 * Every game's PGN is re-parsed and its record rebuilt, so ids and summary
 * fields always match the PGN. A hand-edited or corrupted record can't
 * smuggle in a wrong id.
 */
export async function validateBackup(text: string): Promise<ValidatedBackup> {
  if (text.length > MAX_BACKUP_BYTES) throw new BackupError("This file is too large to be a BlunderLab backup.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError("This file isn't valid JSON, so it can't be a BlunderLab backup.");
  }
  const doc = raw as Partial<Backup> | null;
  if (!doc || typeof doc !== "object" || doc.format !== BACKUP_FORMAT) {
    throw new BackupError("This JSON file isn't a BlunderLab backup.");
  }
  if (typeof doc.version !== "number" || !Number.isInteger(doc.version) || doc.version < 1) {
    throw new BackupError("The backup's version is missing or invalid.");
  }
  if (doc.version > BACKUP_VERSION) {
    throw new BackupError(
      `This backup was made by a newer version of BlunderLab (format v${doc.version}; this app reads up to v${BACKUP_VERSION}). Update the app and try again.`,
    );
  }
  if (!Array.isArray(doc.games) || !Array.isArray(doc.analyses)) {
    throw new BackupError("The backup is missing its games or analyses list.");
  }

  const rejected: string[] = [];
  const games: GameRecord[] = [];
  const seen = new Set<string>();
  for (const [i, entry] of doc.games.entries()) {
    const g = entry as Partial<GameRecord> | null;
    if (!g || typeof g.pgn !== "string" || typeof g.id !== "string") {
      rejected.push(`Game #${i + 1}: missing id or PGN.`);
      continue;
    }
    let rebuilt: GameRecord;
    try {
      rebuilt = await toGameRecord(g.pgn, typeof g.importedFor === "string" ? g.importedFor : null, validTime(g.importedAt));
    } catch (err) {
      rejected.push(`Game #${i + 1} (${g.id}): unreadable PGN (${err instanceof Error ? err.message : String(err)}).`);
      continue;
    }
    if (rebuilt.id !== g.id) {
      rejected.push(`Game #${i + 1}: id "${g.id}" doesn't match its PGN (expected "${rebuilt.id}").`);
      continue;
    }
    if (seen.has(rebuilt.id)) continue; // duplicate inside the file: keep the first
    seen.add(rebuilt.id);
    games.push(rebuilt);
  }

  const analyses: StoredAnalysis[] = [];
  const seenAnalyses = new Set<string>();
  for (const [i, entry] of doc.analyses.entries()) {
    const a = entry as Partial<StoredAnalysis> | null;
    if (!a || typeof a.gameId !== "string" || typeof a.engineKey !== "string" || typeof a.createdAt !== "number") {
      rejected.push(`Analysis #${i + 1}: missing game id, engine key or date.`);
      continue;
    }
    if (a.format !== ANALYSIS_FORMAT) {
      rejected.push(`Analysis #${i + 1} (${a.gameId}): saved in an unsupported format (${String(a.format)}); re-analyse instead.`);
      continue;
    }
    if (!isAnalysisShape(a.analysis)) {
      rejected.push(`Analysis #${i + 1} (${a.gameId}): data is incomplete or corrupted.`);
      continue;
    }
    const key = `${a.gameId}\u0000${a.engineKey}`;
    if (seenAnalyses.has(key)) continue;
    seenAnalyses.add(key);
    analyses.push(a as StoredAnalysis);
  }

  return { exportedAt: typeof doc.exportedAt === "string" ? doc.exportedAt : "unknown", games, analyses, rejected };
}

export interface RestorePlan {
  newGames: GameRecord[];
  existingGames: number;
  newAnalyses: StoredAnalysis[];
  existingAnalyses: number;
  /** Analyses whose game is neither in the library nor in the backup. */
  orphanAnalyses: number;
  rejected: string[];
}

/** Work out what a restore would add, without writing anything. */
export async function planRestore(db: IDBDatabase, backup: ValidatedBackup): Promise<RestorePlan> {
  const tx = db.transaction([STORES.games, STORES.analyses]);
  const [gameKeys, analysisKeys] = await Promise.all([
    promisify(tx.objectStore(STORES.games).getAllKeys()),
    promisify(tx.objectStore(STORES.analyses).getAllKeys()),
  ]);
  const haveGames = new Set(gameKeys as string[]);
  const haveAnalyses = new Set((analysisKeys as [string, string][]).map(([g, k]) => `${g}\u0000${k}`));
  const newGames = backup.games.filter((g) => !haveGames.has(g.id));
  const knownGameIds = new Set([...haveGames, ...newGames.map((g) => g.id)]);

  let existingAnalyses = 0;
  let orphanAnalyses = 0;
  const newAnalyses: StoredAnalysis[] = [];
  for (const a of backup.analyses) {
    if (!knownGameIds.has(a.gameId)) orphanAnalyses++;
    else if (haveAnalyses.has(`${a.gameId}\u0000${a.engineKey}`)) existingAnalyses++;
    else newAnalyses.push(a);
  }
  return {
    newGames,
    existingGames: backup.games.length - newGames.length,
    newAnalyses,
    existingAnalyses,
    orphanAnalyses,
    rejected: backup.rejected,
  };
}

/**
 * Apply a plan in ONE transaction using `add` (never `put`): an existing
 * record makes the whole transaction abort rather than be overwritten, and
 * any failure (quota, a tab closing mid-write) rolls everything back.
 */
export async function applyRestore(db: IDBDatabase, plan: RestorePlan): Promise<{ games: number; analyses: number }> {
  const tx = db.transaction([STORES.games, STORES.analyses], "readwrite");
  const done = committed(tx);
  const games = tx.objectStore(STORES.games);
  const analyses = tx.objectStore(STORES.analyses);
  for (const g of plan.newGames) games.add(g);
  for (const a of plan.newAnalyses) analyses.add(a);
  await done;
  return { games: plan.newGames.length, analyses: plan.newAnalyses.length };
}

function validTime(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : Date.now();
}
