import { createRequire } from "node:module";
import type { EngineTransport } from "./engine";

interface StockfishModule {
  (): { processCommand(cmd: string): void; terminate(): void; listener?: (line: string) => void };
}

/**
 * Runs the same Stockfish WASM build the browser uses, inside Node.
 * Test/benchmark only: lets engine tests exercise the real engine.
 */
export function createNodeTransport(): EngineTransport {
  const require = createRequire(import.meta.url);
  const enginePath = (require("stockfish") as { findEngine(flavor: string): string }).findEngine("lite-single");
  // The Emscripten module resolves its .wasm path only on first evaluation;
  // a cached second instance looks for "stockfish.wasm" and fails. Evict it
  // so every transport gets a freshly evaluated module (ENGINEERING_LOG).
  delete require.cache[enginePath];
  const engine = (require(enginePath) as StockfishModule)();

  let handler: (line: string) => void = () => {};
  engine.listener = (line) => handler(line);
  return {
    send: (command) => engine.processCommand(command),
    onLine: (h) => {
      handler = h;
    },
    terminate: () => engine.terminate(),
  };
}
