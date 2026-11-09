/**
 * IndexedDB schema and low-level helpers. All persistent user data lives in
 * this one database, on the user's device only.
 *
 * Migrations: append a function to MIGRATIONS and bump nothing else; the DB
 * version is MIGRATIONS.length. Each migration upgrades from version i to i+1
 * and must never be edited once released, because users' browsers hold databases at
 * every historical version.
 */

export const DB_NAME = "blunderlab";

export const STORES = { games: "games", analyses: "analyses" } as const;

type Migration = (db: IDBDatabase, tx: IDBTransaction) => void;

const MIGRATIONS: Migration[] = [
  // v1: games keyed by stable id; analyses keyed by [gameId, engineKey].
  (db) => {
    const games = db.createObjectStore(STORES.games, { keyPath: "id" });
    games.createIndex("importedAt", "importedAt");
    games.createIndex("importedFor", "importedFor");
    const analyses = db.createObjectStore(STORES.analyses, { keyPath: ["gameId", "engineKey"] });
    analyses.createIndex("gameId", "gameId");
  },
];

export const DB_VERSION = MIGRATIONS.length;

export class StorageError extends Error {
  override name = "StorageError";
}

export function openDatabase(name: string = DB_NAME, factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(name, DB_VERSION);
    } catch {
      reject(new StorageError("This browser doesn't allow local storage (private mode?). Games can't be saved."));
      return;
    }
    request.onupgradeneeded = (event) => {
      const tx = request.transaction!;
      for (let v = event.oldVersion; v < DB_VERSION; v++) MIGRATIONS[v]!(request.result, tx);
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgraded the schema: close so it isn't blocked; this tab must reload.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(new StorageError(`Couldn't open local storage: ${request.error?.message ?? "unknown error"}`));
    request.onblocked = () => reject(new StorageError("BlunderLab is open in another tab with an older version. Close it and reload."));
  });
}

export function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Resolves when the transaction commits; maps quota errors to a clear message. */
export function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    const fail = () => reject(toStorageError(tx.error));
    tx.onerror = fail;
    tx.onabort = fail;
  });
}

export function toStorageError(error: DOMException | Error | null): StorageError {
  if (error?.name === "QuotaExceededError") {
    return new StorageError("Browser storage is full. Delete some games to make room.");
  }
  return new StorageError(`Saving failed: ${error?.message ?? "unknown error"}`);
}
