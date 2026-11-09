import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import type { GameAnalysis } from "../analysis/gameAnalysis";
import { splitPgn } from "../core/pgn";
import { importPgns } from "../library/importGames";
import { fixture } from "../test/fakeFetch";
import { DB_VERSION, openDatabase } from "./db";
import { loadBatchJob, saveBatchJob, type BatchJob } from "./jobs";
import { gameIdsNewestFirst, getLatestAnalysis, isAnalysisShape, listGames, saveAnalysis } from "./library";

const LICHESS = splitPgn(fixture("lichess-thibault-3.pgn"));

const analysis = (durationMs: number): GameAnalysis => ({
  positions: [{ ply: 0, fen: "x", score: { cp: 0 }, bestMove: null, bestLine: [], depth: 1 }],
  moves: [],
  accuracy: { w: null, b: null },
  limits: { depth: 14 },
  refine: null,
  refinedPositions: 0,
  durationMs,
});

describe("schema migration", () => {
  it("upgrades a v1 database with data to the current version without losing games", async () => {
    const factory = new IDBFactory();
    const v1 = await openDatabase("m", factory, 1);
    await importPgns(v1, LICHESS, "lichess:thibault");
    expect([...v1.objectStoreNames]).not.toContain("jobs");
    v1.close();

    const current = await openDatabase("m", factory);
    expect(current.version).toBe(DB_VERSION);
    expect([...current.objectStoreNames]).toContain("jobs");
    expect(await listGames(current)).toHaveLength(3);
  });
});

describe("batch job persistence", () => {
  it("saves, loads and clears the job", async () => {
    const db = await openDatabase("j", new IDBFactory());
    expect(await loadBatchJob(db)).toBeNull();
    const job: BatchJob = { id: "batch", status: "paused", engineKey: "k", failed: { g1: "boom" }, startedAt: 1, updatedAt: 2 };
    await saveBatchJob(db, job);
    expect(await loadBatchJob(db)).toEqual(job);
    await saveBatchJob(db, null);
    expect(await loadBatchJob(db)).toBeNull();
  });

  it("treats a corrupted job record as no job", async () => {
    const db = await openDatabase("j2", new IDBFactory());
    const tx = db.transaction("jobs", "readwrite");
    tx.objectStore("jobs").put({ id: "batch", status: "exploded", failed: "nope" });
    await new Promise((r) => (tx.oncomplete = r));
    expect(await loadBatchJob(db)).toBeNull();
  });
});

describe("queue and latest-analysis helpers", () => {
  it("lists game ids newest-imported first", async () => {
    const db = await openDatabase("q", new IDBFactory());
    const { added } = await importPgns(db, LICHESS, null, 10_000);
    expect(await gameIdsNewestFirst(db)).toEqual(added); // importPgns keeps source order newest first
  });

  it("returns the newest valid analysis under any engine key, skipping corrupted ones", async () => {
    const db = await openDatabase("l", new IDBFactory());
    await saveAnalysis(db, { gameId: "g", engineKey: "old", createdAt: 1, analysis: analysis(1) });
    await saveAnalysis(db, { gameId: "g", engineKey: "new", createdAt: 3, analysis: analysis(3) });
    // Newest record is corrupted (positions/moves mismatch): must be ignored.
    await saveAnalysis(db, { gameId: "g", engineKey: "bad", createdAt: 9, analysis: { ...analysis(9), positions: [] } });
    expect((await getLatestAnalysis(db, "g"))?.engineKey).toBe("new");
    expect(await getLatestAnalysis(db, "none")).toBeNull();
  });

  it("validates analysis shapes read back from storage", () => {
    expect(isAnalysisShape(analysis(1))).toBe(true);
    expect(isAnalysisShape(null)).toBe(false);
    expect(isAnalysisShape({ positions: [], moves: [] })).toBe(false);
    expect(isAnalysisShape({ ...analysis(1), moves: [{ classification: "good" }], positions: [{}, {}] })).toBe(false);
  });
});
