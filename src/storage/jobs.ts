import { committed, promisify, STORES } from "./db";

/**
 * Persisted state of the batch-analysis job. Completed analyses are saved
 * individually as they finish, so this record only needs what can't be
 * recomputed: whether a job was in progress, and which games failed.
 */
export interface BatchJob {
  id: "batch";
  status: "running" | "paused";
  engineKey: string;
  /** gameId → error message, for games skipped by this job. */
  failed: Record<string, string>;
  startedAt: number;
  updatedAt: number;
}

export async function loadBatchJob(db: IDBDatabase): Promise<BatchJob | null> {
  const raw = await promisify<unknown>(db.transaction(STORES.jobs).objectStore(STORES.jobs).get("batch"));
  return isBatchJob(raw) ? raw : null; // a corrupted record is treated as "no job"
}

export async function saveBatchJob(db: IDBDatabase, job: BatchJob | null): Promise<void> {
  const tx = db.transaction(STORES.jobs, "readwrite");
  const done = committed(tx);
  if (job) tx.objectStore(STORES.jobs).put(job);
  else tx.objectStore(STORES.jobs).delete("batch");
  await done;
}

function isBatchJob(value: unknown): value is BatchJob {
  const j = value as Partial<BatchJob> | null;
  return (
    !!j &&
    j.id === "batch" &&
    (j.status === "running" || j.status === "paused") &&
    typeof j.engineKey === "string" &&
    typeof j.failed === "object" &&
    j.failed !== null
  );
}
