import { parseGame, PgnError, type ParsedGame } from "../core/pgn";
import { EngineError } from "../engine/engine";
import type { BatchJob } from "../storage/jobs";
import type { GameAnalysis } from "./gameAnalysis";

/**
 * Everything the batch runner touches, injected so the scheduling logic is
 * testable without IndexedDB, workers or a real engine.
 */
export interface BatchDeps {
  engineKey: string;
  /** Ids of games with no stored analysis yet, in processing order. */
  pendingGameIds(): Promise<string[]>;
  loadGamePgn(id: string): Promise<string | null>;
  saveAnalysis(id: string, analysis: GameAnalysis): Promise<void>;
  loadJob(): Promise<BatchJob | null>;
  saveJob(job: BatchJob | null): Promise<void>;
  analyze(game: ParsedGame, signal: AbortSignal, onProgress: (done: number, total: number) => void): Promise<GameAnalysis>;
  /** Interrupt the engine's current search (used on pause/cancel for a prompt stop). */
  stopEngine(): void;
  /**
   * Run `work` while holding an exclusive cross-tab lock. Resolves false
   * without running it if another tab holds the lock.
   */
  withLock(work: () => Promise<void>): Promise<boolean>;
  /** Whether another tab currently holds the lock (i.e. is running the batch). */
  lockHeldElsewhere(): Promise<boolean>;
  now(): number;
}

export type BatchStatus =
  | "idle"
  /** A job was running when the page closed; nothing runs until the user resumes. */
  | "interrupted"
  | "running"
  | "paused"
  /** Another tab is running the batch. */
  | "locked";

export interface BatchProgress {
  status: BatchStatus;
  /** Games analysed since this runner started (this page session). */
  completed: number;
  remaining: number;
  failed: { id: string; message: string }[];
  current: { id: string; done: number; total: number } | null;
  /** Set when the last job finished, for a summary line. */
  finishedAt: number | null;
  /** Why the job stopped on its own (e.g. storage full); cleared on the next start. */
  error: string | null;
}

/** An engine failure is retried once on a fresh engine before the game is marked failed. */
const ENGINE_ATTEMPTS = 2;

/**
 * Analyses every unanalysed game, one at a time, saving each result as soon
 * as it's ready. Progress lives in storage, not memory: the set of games
 * still lacking an analysis *is* the queue, so a reload loses at most the
 * game in progress. Analysis only happens while a page is open and running.
 */
export class BatchRunner {
  private readonly deps: BatchDeps;
  private readonly listeners = new Set<(p: BatchProgress) => void>();
  private progress: BatchProgress = { status: "idle", completed: 0, remaining: 0, failed: [], current: null, finishedAt: null, error: null };
  private job: BatchJob | null = null;
  private abort: AbortController | null = null;
  private loop: Promise<void> | null = null;

  constructor(deps: BatchDeps) {
    this.deps = deps;
  }

  get state(): BatchProgress {
    return this.progress;
  }

  subscribe(listener: (p: BatchProgress) => void): () => void {
    this.listeners.add(listener);
    listener(this.progress);
    return () => this.listeners.delete(listener);
  }

  /** Restore state after a page load. Never starts analysis by itself. */
  async load(): Promise<void> {
    this.job = await this.deps.loadJob();
    const remaining = await this.countRemaining();
    let status: BatchStatus = !this.job ? "idle" : this.job.status === "running" ? "interrupted" : "paused";
    if (this.job?.status === "running" && (await this.deps.lockHeldElsewhere())) status = "locked";
    this.update({ status, remaining, failed: failedList(this.job) });
  }

  /** Start or resume. A second call while running is a no-op (no duplicate jobs). */
  start(): Promise<void> {
    if (this.loop) return this.loop;
    this.loop = this.deps
      .withLock(() => this.run())
      .then((acquired) => {
        if (!acquired) this.update({ status: "locked" });
      })
      .finally(() => {
        this.loop = null;
      });
    return this.loop;
  }

  /** Stop after abandoning the current game; resumable. */
  async pause(): Promise<void> {
    await this.halt();
    if (this.job) {
      this.job = { ...this.job, status: "paused", updatedAt: this.deps.now() };
      await this.deps.saveJob(this.job);
    }
    this.update({ status: "paused", current: null, remaining: await this.countRemaining() });
  }

  /** Stop and forget the job (completed analyses are kept). */
  async cancel(): Promise<void> {
    await this.halt();
    this.job = null;
    await this.deps.saveJob(null);
    this.update({ status: "idle", current: null, failed: [], remaining: await this.countRemaining() });
  }

  /** Clear the failure list and run again, retrying those games. */
  async retryFailed(): Promise<void> {
    if (this.job) {
      this.job = { ...this.job, failed: {}, updatedAt: this.deps.now() };
      await this.deps.saveJob(this.job);
    }
    this.update({ failed: [] });
    await this.start();
  }

  /** Re-count remaining games (e.g. after an import or delete). */
  async refresh(): Promise<void> {
    if (this.progress.status !== "running") this.update({ remaining: await this.countRemaining() });
  }

  private async halt(): Promise<void> {
    if (!this.abort) return;
    this.abort.abort();
    this.deps.stopEngine();
    await this.loop?.catch(() => undefined);
  }

  private async run(): Promise<void> {
    const controller = new AbortController();
    this.abort = controller;
    const now = this.deps.now();
    this.job = {
      id: "batch",
      status: "running",
      engineKey: this.deps.engineKey,
      failed: this.job?.failed ?? {},
      startedAt: this.job?.startedAt ?? now,
      updatedAt: now,
    };
    const attempts = new Map<string, number>();
    try {
      await this.deps.saveJob(this.job);
      this.update({ status: "running", finishedAt: null, error: null, failed: failedList(this.job) });
      for (;;) {
        if (controller.signal.aborted) return;
        const queue = await this.queue();
        this.update({ remaining: queue.length });
        const id = queue[0];
        if (!id) break;

        const outcome = await this.analyzeOne(id, controller.signal);
        if (outcome === "aborted") return;
        if (outcome === "done") {
          this.update({ completed: this.progress.completed + 1 });
          continue;
        }
        const tries = (attempts.get(id) ?? 0) + 1;
        attempts.set(id, tries);
        if (outcome.retryable && tries < ENGINE_ATTEMPTS) continue;
        await this.markFailed(id, outcome.message);
      }
      // Queue drained: the job is complete.
      this.job = null;
      await this.deps.saveJob(null);
      this.update({ status: "idle", current: null, remaining: 0, finishedAt: this.deps.now() });
    } catch (err) {
      // Not a per-game problem (those are handled in analyzeOne): typically storage
      // failing (quota). Retrying other games would fail the same way, so pause the
      // job, keep it resumable, and say why.
      const message = err instanceof Error ? err.message : String(err);
      if (this.job) this.job = { ...this.job, status: "paused", updatedAt: this.deps.now() };
      await this.deps.saveJob(this.job).catch(() => undefined);
      this.update({ status: "paused", current: null, error: message });
    } finally {
      this.abort = null;
    }
  }

  /** Per-game failures are returned; storage failures (load/save) propagate and pause the job. */
  private async analyzeOne(id: string, signal: AbortSignal): Promise<"done" | "aborted" | { message: string; retryable: boolean }> {
    const pgn = await this.deps.loadGamePgn(id);
    if (pgn === null) return "done"; // deleted meanwhile: nothing to do
    let analysis: GameAnalysis;
    try {
      const game = parseGame(pgn);
      this.update({ current: { id, done: 0, total: game.moves.length + 1 } });
      analysis = await this.deps.analyze(game, signal, (done, total) => this.update({ current: { id, done, total } }));
    } catch (err) {
      if (signal.aborted) return "aborted";
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof PgnError) return { message: `Unreadable game: ${message}`, retryable: false };
      return { message, retryable: err instanceof EngineError };
    } finally {
      this.update({ current: null });
    }
    if (signal.aborted) return "aborted";
    await this.deps.saveAnalysis(id, analysis);
    return "done";
  }

  private async markFailed(id: string, message: string): Promise<void> {
    this.job = { ...this.job!, failed: { ...this.job!.failed, [id]: message }, updatedAt: this.deps.now() };
    await this.deps.saveJob(this.job);
    this.update({ failed: failedList(this.job) });
  }

  /** Pending games minus the ones this job already gave up on. */
  private async queue(): Promise<string[]> {
    const failed = this.job?.failed ?? {};
    return (await this.deps.pendingGameIds()).filter((id) => !(id in failed));
  }

  private async countRemaining(): Promise<number> {
    return (await this.queue()).length;
  }

  private update(patch: Partial<BatchProgress>): void {
    this.progress = { ...this.progress, ...patch };
    for (const listener of this.listeners) listener(this.progress);
  }
}

function failedList(job: BatchJob | null): BatchProgress["failed"] {
  return Object.entries(job?.failed ?? {}).map(([id, message]) => ({ id, message }));
}
