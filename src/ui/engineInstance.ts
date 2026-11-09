import { UciEngine } from "../engine/engine";
import { createWorkerTransport } from "../engine/workerTransport";

export type EngineRole = "analysis" | "explore" | "batch";

const engines = new Map<EngineRole, UciEngine>();

/**
 * One Stockfish worker per role, created on first use and re-created if it
 * died (crash or terminate). Roles never share a worker, so stopping one
 * role's search can't cut short another's: single-game analysis, live
 * exploration and batch analysis each get their own.
 */
export function getEngine(role: EngineRole = "analysis"): UciEngine {
  let engine = engines.get(role);
  if (!engine || engine.isDead) {
    engine = new UciEngine(createWorkerTransport());
    engines.set(role, engine);
  }
  return engine;
}
