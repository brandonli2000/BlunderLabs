import { useEffect, useState } from "react";
import { BatchRunner, type BatchProgress } from "../analysis/batch";
import { analysisEngineKey, analyzeGame, DEFAULT_PLAN } from "../analysis/gameAnalysis";
import { loadBatchJob, saveBatchJob } from "../storage/jobs";
import { analyzedGameIds, gameIdsNewestFirst, getGame, saveAnalysis } from "../storage/library";
import { getDatabase } from "./database";
import { getEngine } from "./engineInstance";

const LOCK_NAME = "blunderlab-batch-analysis";
const ENGINE_KEY = analysisEngineKey(DEFAULT_PLAN.limits, DEFAULT_PLAN.refine);

let runner: BatchRunner | null = null;

/** The page's single batch runner. It lives at module level so navigating between views doesn't stop it. */
export function getBatchRunner(): BatchRunner {
  if (runner) return runner;
  runner = new BatchRunner({
    engineKey: ENGINE_KEY,
    pendingGameIds: async () => {
      const db = await getDatabase();
      const [ids, analyzed] = await Promise.all([gameIdsNewestFirst(db), analyzedGameIds(db)]);
      return ids.filter((id) => !analyzed.has(id));
    },
    loadGamePgn: async (id) => (await getGame(await getDatabase(), id))?.pgn ?? null,
    saveAnalysis: async (id, analysis) =>
      saveAnalysis(await getDatabase(), { gameId: id, engineKey: ENGINE_KEY, createdAt: Date.now(), analysis }),
    loadJob: async () => loadBatchJob(await getDatabase()),
    saveJob: async (job) => saveBatchJob(await getDatabase(), job),
    // getEngine re-creates the worker if a previous one crashed, so retries get a fresh engine.
    analyze: (game, signal, onProgress) => analyzeGame(getEngine("batch"), game, { ...DEFAULT_PLAN, signal, onProgress }),
    stopEngine: () => getEngine("batch").stop(),
    withLock: async (work) => {
      // Web Locks make the batch exclusive across tabs; without the API, fall back to this tab only.
      if (!("locks" in navigator)) {
        await work();
        return true;
      }
      return navigator.locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
        if (!lock) return false;
        await work();
        return true;
      });
    },
    lockHeldElsewhere: async () => {
      if (!("locks" in navigator)) return false;
      const { held = [] } = await navigator.locks.query();
      return held.some((l) => l.name === LOCK_NAME);
    },
    now: () => Date.now(),
  });
  void runner.load();
  return runner;
}

export function useBatch(): BatchProgress {
  const [progress, setProgress] = useState<BatchProgress>(() => getBatchRunner().state);
  useEffect(() => getBatchRunner().subscribe(setProgress), []);
  return progress;
}
