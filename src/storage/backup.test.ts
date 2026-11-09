import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import type { GameAnalysis } from "../analysis/gameAnalysis";
import { splitPgn } from "../core/pgn";
import { importPgns } from "../library/importGames";
import { fixture } from "../test/fakeFetch";
import { SCHOLARS_MATE } from "../test/fixtures";
import { applyRestore, BACKUP_VERSION, BackupError, createBackup, planRestore, validateBackup } from "./backup";
import { openDatabase } from "./db";
import { addGames, getGame, latestAnalysesByGame, listGames, saveAnalysis } from "./library";
import { toGameRecord } from "../library/gameRecord";

const LICHESS = splitPgn(fixture("lichess-thibault-3.pgn"));

function analysisFor(plies: number): GameAnalysis {
  return {
    positions: Array.from({ length: plies + 1 }, (_, ply) => ({ ply, fen: "x", score: { cp: 0 }, bestMove: null, bestLine: [], depth: 14 })),
    moves: Array.from({ length: plies }, (_, i) => ({
      ply: i + 1,
      color: i % 2 ? "b" : "w",
      san: "x",
      classification: "good" as const,
      winBefore: 0.5,
      winAfter: 0.5,
      accuracy: 99,
      bestMoveSan: null,
      bestMoveUci: null,
    })),
    accuracy: { w: 99, b: 99 },
    limits: { depth: 14 },
    refine: null,
    refinedPositions: 0,
    durationMs: 1,
  };
}

let factory: IDBFactory;
beforeEach(() => {
  factory = new IDBFactory();
});

async function seededLibrary(name: string) {
  const db = await openDatabase(name, factory);
  const { added } = await importPgns(db, LICHESS, "lichess:thibault", 5_000);
  const games = await listGames(db);
  await saveAnalysis(db, { gameId: added[0]!, engineKey: "k", createdAt: 7, analysis: analysisFor(games[0]!.plies) });
  return { db, added };
}

describe("backup round trip", () => {
  it("restores an identical library into an empty database", async () => {
    const { db } = await seededLibrary("src");
    const text = JSON.stringify(await createBackup(db, new Date("2026-11-08T12:00:00Z")));

    const target = await openDatabase("dst", factory);
    const validated = await validateBackup(text);
    expect(validated.rejected).toEqual([]);
    const plan = await planRestore(target, validated);
    expect(plan).toMatchObject({ existingGames: 0, existingAnalyses: 0, orphanAnalyses: 0 });
    expect(await applyRestore(target, plan)).toEqual({ games: 3, analyses: 1 });

    expect(await listGames(target)).toEqual(await listGames(db));
    expect([...(await latestAnalysesByGame(target)).values()]).toEqual([...(await latestAnalysesByGame(db)).values()]);
  });

  it("merges into an existing library without overwriting anything", async () => {
    const { db } = await seededLibrary("src");
    const backup = await validateBackup(JSON.stringify(await createBackup(db)));

    // Target already has one of the games, with different local metadata, plus its own game.
    const target = await openDatabase("dst", factory);
    const local = await toGameRecord(LICHESS[0]!, "lichess:someone-else", 1);
    const own = await toGameRecord(SCHOLARS_MATE, null, 2);
    await addGames(target, [local, own]);

    const plan = await planRestore(target, backup);
    expect(plan.newGames).toHaveLength(2);
    expect(plan.existingGames).toBe(1);
    await applyRestore(target, plan);

    expect(await listGames(target)).toHaveLength(4);
    expect((await getGame(target, local.id))?.importedFor).toBe("lichess:someone-else"); // untouched
    expect(await getGame(target, own.id)).not.toBeNull(); // not deleted

    // Restoring the same backup again adds nothing.
    const again = await planRestore(target, backup);
    expect(again.newGames).toEqual([]);
    expect(again.newAnalyses).toEqual([]);
  });
});

describe("validation", () => {
  const expectBackupError = async (text: string, pattern: RegExp) => {
    await expect(validateBackup(text)).rejects.toThrow(BackupError);
    await expect(validateBackup(text)).rejects.toThrow(pattern);
  };

  it("rejects files that aren't usable backups", async () => {
    await expectBackupError("not json {", /isn't valid JSON/);
    await expectBackupError('{"hello":1}', /isn't a BlunderLab backup/);
    await expectBackupError('{"format":"blunderlab-backup","version":"1","games":[],"analyses":[]}', /version/);
    await expectBackupError(`{"format":"blunderlab-backup","version":${BACKUP_VERSION + 1},"games":[],"analyses":[]}`, /newer version/);
    await expectBackupError('{"format":"blunderlab-backup","version":1,"games":{}}', /missing its games/);
  });

  it("drops bad entries with reasons and keeps the good ones", async () => {
    const { db } = await seededLibrary("src");
    const backup = await createBackup(db);
    const good = backup.games[0]!;
    const tampered = { ...backup.games[1]!, id: "lichess:FAKEFAKE" };
    const unreadable = { ...backup.games[2]!, pgn: "1. e4 e5 2. Ke3 *" };
    const doc = {
      ...backup,
      games: [good, tampered, unreadable, { id: 5 }, good],
      analyses: [
        backup.analyses[0],
        { ...backup.analyses[0], engineKey: "other", format: 0 },
        { ...backup.analyses[0], engineKey: "corrupt", analysis: { positions: [], moves: [] } },
        { nope: true },
      ],
    };
    const validated = await validateBackup(JSON.stringify(doc));

    expect(validated.games.map((g) => g.id)).toEqual([good.id]); // in-file duplicate collapsed
    expect(validated.analyses).toHaveLength(1);
    expect(validated.rejected).toHaveLength(6);
    expect(validated.rejected.join("\n")).toMatch(/doesn't match its PGN/);
    expect(validated.rejected.join("\n")).toMatch(/unreadable PGN/);
    expect(validated.rejected.join("\n")).toMatch(/unsupported format/);
    expect(validated.rejected.join("\n")).toMatch(/incomplete or corrupted/);
  });

  it("skips analyses whose game is in neither the library nor the backup", async () => {
    const { db } = await seededLibrary("src");
    const backup = await createBackup(db);
    const validated = await validateBackup(JSON.stringify({ ...backup, games: [] }));
    const plan = await planRestore(await openDatabase("empty", factory), validated);
    expect(plan.orphanAnalyses).toBe(1);
    expect(plan.newAnalyses).toEqual([]);
  });
});

describe("atomicity", () => {
  it("a restore that fails part-way writes nothing", async () => {
    const { db } = await seededLibrary("src");
    const validated = await validateBackup(JSON.stringify(await createBackup(db)));
    const target = await openDatabase("dst", factory);
    const plan = await planRestore(target, validated);

    // Between planning and applying, one planned game appears (e.g. imported in another tab).
    // Its `add` fails with a ConstraintError, which must roll back the whole restore.
    await addGames(target, [plan.newGames[2]!]);
    await expect(applyRestore(target, plan)).rejects.toThrow();

    expect((await listGames(target)).map((g) => g.id)).toEqual([plan.newGames[2]!.id]);
    expect((await latestAnalysesByGame(target)).size).toBe(0);
  });
});
