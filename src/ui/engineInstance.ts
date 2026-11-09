import { UciEngine } from "../engine/engine";
import { createWorkerTransport } from "../engine/workerTransport";

let engine: UciEngine | null = null;

/** The app's single Stockfish worker, created on first use. */
export function getEngine(): UciEngine {
  engine ??= new UciEngine(createWorkerTransport());
  return engine;
}
