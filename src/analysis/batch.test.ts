import { describe, expect, it } from "vitest";
import { EngineError } from "../engine/engine";
import type { BatchJob } from "../storage/jobs";
import { SCHOLARS_MATE } from "../test/fixtures";
import { BatchRunner, type BatchDeps } from "./batch";
import type { GameAnalysis } from "./gameAnalysis";

const fakeAnalysis: GameAnalysis = {
  positions: [],
  moves: [],
  accuracy: { w: null, b: null },
  limits: {},
  refine: null,
  refinedPositions: 0,
  durationMs: 1,
};

type Behaviour = "engine-error" | "engine-error-once" | "hang";

/** In-memory stand-ins for storage, engine and lock, with failure injection per game id. */
function world(gameIds: string[]) {
  const games = new Map(gameIds.map((id) => [id, SCHOLARS_MATE]));
  const saved = new Map<string, number>(); // id → times saved
  const analyzeCalls: string[] = [];
  const behaviour = new Map<string, Behaviour>();
  let job: BatchJob | null = null;
  let lockFree = true;
  let loadingId = ""; // the runner loads a game's PGN right before analysing it

  const deps: BatchDeps = {
    engineKey: "test-key",
    pendingGameIds: async () => [...games.keys()].filter((id) => !saved.has(id)),
    loadGamePgn: async (id) => {
      loadingId = id;
      return games.get(id) ?? null;
    },
    saveAnalysis: async (id) => void saved.set(id, (saved.get(id) ?? 0) + 1),
    loadJob: async () => (job ? structuredClone(job) : null),
    saveJob: async (j) => void (job = j ? structuredClone(j) : null),
    analyze: async (_game, signal) => {
      const id = loadingId;
      analyzeCalls.push(id);
      const mode = behaviour.get(id);
      if (mode === "engine-error-once") behaviour.delete(id);
      if (mode === "engine-error" || mode === "engine-error-once") throw new EngineError("Engine crashed: test");
      if (mode === "hang") {
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      }
      return fakeAnalysis;
    },
    stopEngine: () => {},
    withLock: async (work) => {
      if (!lockFree) return false;
      lockFree = false;
      try {
        await work();
      } finally {
        lockFree = true;
      }
      return true;
    },
    lockHeldElsewhere: async () => !lockFree,
    now: () => 1000,
  };

  return {
    deps,
    games,
    saved,
    analyzeCalls,
    behaviour,
    getJob: () => job,
    setJob: (j: BatchJob | null) => void (job = j),
    holdLockElsewhere: () => void (lockFree = false),
  };
}

const runningJob: BatchJob = { id: "batch", status: "running", engineKey: "test-key", failed: {}, startedAt: 1, updatedAt: 2 };

describe("BatchRunner", () => {
  it("analyses every pending game once, saving each immediately, then clears the job", async () => {
    const w = world(["a", "b", "c"]);
    const runner = new BatchRunner(w.deps);
    await runner.load();
    expect(runner.state).toMatchObject({ status: "idle", remaining: 3 });

    await runner.start();
    expect([...w.saved.entries()]).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 1],
    ]);
    expect(runner.state).toMatchObject({ status: "idle", completed: 3, remaining: 0, failed: [] });
    expect(w.getJob()).toBeNull();
  });

  it("skips games that are already analysed", async () => {
    const w = world(["a", "b"]);
    w.saved.set("a", 1);
    await new BatchRunner(w.deps).start();
    expect(w.analyzeCalls).toEqual(["b"]);
  });

  it("ignores a second start while running (no duplicate jobs)", async () => {
    const w = world(["a", "b"]);
    const runner = new BatchRunner(w.deps);
    await Promise.all([runner.start(), runner.start(), runner.start()]);
    expect(w.analyzeCalls).toEqual(["a", "b"]);
  });

  it("pauses mid-game without saving a partial result, then resumes where it left off", async () => {
    const w = world(["a", "b", "c"]);
    w.behaviour.set("b", "hang");
    const runner = new BatchRunner(w.deps);
    const running = runner.start();
    await until(() => runner.state.current?.id === "b");

    await runner.pause();
    await running;
    expect(runner.state.status).toBe("paused");
    expect(w.getJob()?.status).toBe("paused");
    expect(w.saved.has("b")).toBe(false);

    w.behaviour.delete("b");
    await runner.start();
    expect([...w.saved.keys()].sort()).toEqual(["a", "b", "c"]);
    expect([...w.saved.values()].every((n) => n === 1)).toBe(true);
  });

  it("reports a job that was running when the page closed as interrupted, and resumes it on request", async () => {
    const w = world(["a", "b"]);
    w.saved.set("a", 1); // finished before the reload
    w.setJob(runningJob);

    const runner = new BatchRunner(w.deps); // a fresh page
    await runner.load();
    expect(runner.state).toMatchObject({ status: "interrupted", remaining: 1 });
    expect(w.analyzeCalls).toEqual([]); // nothing runs until the user resumes

    await runner.start();
    expect(w.analyzeCalls).toEqual(["b"]);
    expect(runner.state.status).toBe("idle");
  });

  it("retries an engine crash once, records persistent failures, and keeps going", async () => {
    const w = world(["a", "b", "c", "d"]);
    w.behaviour.set("a", "engine-error-once"); // recovers on retry
    w.behaviour.set("b", "engine-error"); // fails twice → failed
    w.games.set("c", "1. e4 e5 2. Ke3 *"); // unreadable → failed without retry
    const runner = new BatchRunner(w.deps);
    await runner.start();

    expect(w.analyzeCalls).toEqual(["a", "a", "b", "b", "d"]);
    expect([...w.saved.keys()].sort()).toEqual(["a", "d"]);
    expect(runner.state.failed.map((f) => f.id).sort()).toEqual(["b", "c"]);
    expect(runner.state.failed.find((f) => f.id === "c")!.message).toMatch(/Unreadable game/);
    expect(runner.state.status).toBe("idle");
  });

  it("retryFailed re-attempts failed games", async () => {
    const w = world(["a", "b"]);
    w.behaviour.set("b", "engine-error");
    const runner = new BatchRunner(w.deps);
    await runner.start();
    expect(runner.state.failed).toHaveLength(1);

    w.behaviour.delete("b");
    await runner.retryFailed();
    expect(w.saved.has("b")).toBe(true);
    expect(runner.state.failed).toEqual([]);
  });

  it("does nothing when another tab holds the lock", async () => {
    const w = world(["a"]);
    w.holdLockElsewhere();
    const runner = new BatchRunner(w.deps);
    await runner.start();
    expect(runner.state.status).toBe("locked");
    expect(w.analyzeCalls).toEqual([]);
  });

  it("shows locked rather than interrupted when another tab is running the job", async () => {
    const w = world(["a"]);
    w.setJob(runningJob);
    w.holdLockElsewhere();
    const runner = new BatchRunner(w.deps);
    await runner.load();
    expect(runner.state.status).toBe("locked");
  });

  it("skips games deleted while the job runs, and cancel forgets the job", async () => {
    const w = world(["a", "b"]);
    w.behaviour.set("a", "hang");
    const runner = new BatchRunner(w.deps);
    const running = runner.start();
    await until(() => runner.state.current?.id === "a");
    w.games.delete("b");
    await runner.cancel();
    await running;
    expect(runner.state).toMatchObject({ status: "idle", remaining: 1 });
    expect(w.getJob()).toBeNull();
  });
});

async function until(condition: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 1));
  }
}
