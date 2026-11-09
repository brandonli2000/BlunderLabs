import { UciEngine } from "../engine/engine";
import { createWorkerTransport } from "../engine/workerTransport";

export type EngineRole = "analysis" | "explore";

const engines = new Map<EngineRole, UciEngine>();

/**
 * One Stockfish worker per role, created on first use. Full-game analysis and
 * interactive exploration get separate workers so live lines stay responsive
 * while a game is being analysed in the background.
 */
export function getEngine(role: EngineRole = "analysis"): UciEngine {
  let engine = engines.get(role);
  if (!engine) {
    engine = new UciEngine(createWorkerTransport());
    engines.set(role, engine);
  }
  return engine;
}
