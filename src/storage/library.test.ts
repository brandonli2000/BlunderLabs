import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import type { GameAnalysis } from "../analysis/gameAnalysis";
import { importPgns } from "../library/importGames";
import { fixture } from "../test/fakeFetch";
import { SCHOLARS_MATE } from "../test/fixtures";
import { DB_VERSION, openDatabase, StorageError, toStorageError } from "./db";
import { addGames, analyzedGameIds, ANALYSIS_FORMAT, deleteGame, getAnalysis, getGame, listGames, saveAnalysis } from "./library";
import { splitPgn } from "../core/pgn";
import { toGameRecord } from "../library/gameRecord";

const LICHESS = splitPgn(fixture("lichess-thibault-3.pgn"));

const fakeAnalysis = (durationMs = 1): GameAnalysis => ({
  positions: [],
  moves: [],
  accuracy: { w: 90, b: 80 },
  limits: { depth: 14 },
  refine: null,
  refinedPositions: 0,
  durationMs,
});

let factory: IDBFactory;
let db: IDBDatabase;
beforeEach(async () => {
  factory = new IDBFactory(); // fresh, isolated database per test
  db = await openDatabase("test", factory);
});

describe("importPgns + library", () => {
  it("stores games and lists them newest-imported first in source order", async () => {
    const summary = await importPgns(db, LICHESS, "lichess:thibault", 5000);
    expect(summary).toMatchObject({ total: 3, duplicates: [], failed: [] });
    expect(summary.added).toHaveLength(3);

    const games = await listGames(db);
    expect(games.map((g) => g.id)).toEqual(summary.added);
    expect((await getGame(db, summary.added[0]!))?.white).toBe("thibault");
    expect(await getGame(db, "lichess:missing")).toBeNull();
  });

  it("skips duplicates across imports and within one batch", async () => {
    await importPgns(db, LICHESS.slice(0, 2), "lichess:thibault");
    const again = await importPgns(db, [...LICHESS, LICHESS[2]!], "lichess:thibault");
    expect(again.added).toHaveLength(1);
    expect(again.duplicates).toHaveLength(3);
    expect(await listGames(db)).toHaveLength(3);
  });

  it("imports the readable games when some are invalid", async () => {
    const summary = await importPgns(db, [SCHOLARS_MATE, "1. e4 e5 2. Ke3 *"], null);
    expect(summary.added).toHaveLength(1);
    expect(summary.failed).toEqual([{ index: 1, message: expect.any(String) }]);
  });

  it("persists across connections", async () => {
    await importPgns(db, LICHESS, null);
    db.close();
    const reopened = await openDatabase("test", factory);
    expect(await listGames(reopened)).toHaveLength(3);
  });
});

describe("analyses", () => {
  it("saves, loads and lists analyses per engine key", async () => {
    const [record] = await Promise.all([toGameRecord(SCHOLARS_MATE, null, 0)]);
    await addGames(db, [record!]);
    await saveAnalysis(db, { gameId: record!.id, engineKey: "sf|d14", createdAt: 1, analysis: fakeAnalysis(42) });

    const loaded = await getAnalysis(db, record!.id, "sf|d14");
    expect(loaded?.analysis.durationMs).toBe(42);
    expect(loaded?.format).toBe(ANALYSIS_FORMAT);
    expect(await getAnalysis(db, record!.id, "sf|d20")).toBeNull();
    expect(await analyzedGameIds(db)).toEqual(new Set([record!.id]));
  });

  it("ignores analyses stored in an outdated format", async () => {
    const tx = db.transaction("analyses", "readwrite");
    tx.objectStore("analyses").put({ gameId: "g", engineKey: "k", format: ANALYSIS_FORMAT - 1, createdAt: 0, analysis: fakeAnalysis() });
    await new Promise((r) => (tx.oncomplete = r));
    expect(await getAnalysis(db, "g", "k")).toBeNull();
  });

  it("deleting a game also deletes its analyses, and only its own", async () => {
    const summary = await importPgns(db, LICHESS, null);
    const [a, b] = summary.added as [string, string];
    for (const id of [a, b]) {
      await saveAnalysis(db, { gameId: id, engineKey: "k1", createdAt: 0, analysis: fakeAnalysis() });
      await saveAnalysis(db, { gameId: id, engineKey: "k2", createdAt: 0, analysis: fakeAnalysis() });
    }
    await deleteGame(db, a);

    expect(await getGame(db, a)).toBeNull();
    expect(await getAnalysis(db, a, "k1")).toBeNull();
    expect(await getAnalysis(db, a, "k2")).toBeNull();
    expect(await getAnalysis(db, b, "k1")).not.toBeNull();
    expect(await listGames(db)).toHaveLength(2);
  });
});

describe("schema", () => {
  it("creates the current schema version with expected stores and indexes", () => {
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual(["analyses", "games", "jobs"]);
    const tx = db.transaction(["games", "analyses"]);
    expect([...tx.objectStore("games").indexNames].sort()).toEqual(["importedAt", "importedFor"]);
    expect([...tx.objectStore("analyses").indexNames]).toEqual(["gameId"]);
  });

  it("turns quota failures into a readable StorageError", () => {
    const err = toStorageError(new DOMException("full", "QuotaExceededError"));
    expect(err).toBeInstanceOf(StorageError);
    expect(err.message).toMatch(/storage is full/i);
  });
});
