import { openDatabase } from "../storage/db";

let database: Promise<IDBDatabase> | null = null;

/** The app's IndexedDB connection, opened once on first use. */
export function getDatabase(): Promise<IDBDatabase> {
  database ??= openDatabase();
  return database;
}

/** Bytes used / available for this origin, if the browser exposes it. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return usage !== undefined && quota !== undefined ? { usage, quota } : null;
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
