import { createRequire } from "node:module";
import type { EngineTransport } from "./engine";

/**
 * Runs the same Stockfish WASM build the browser uses, inside Node.
 * Test-only: lets engine and analysis tests exercise the real engine.
 */
export function createNodeTransport(): EngineTransport {
  const require = createRequire(import.meta.url);
  const loadEngine = require("stockfish") as (
    flavor: string,
    onMessage: (line: string) => void,
  ) => { processCommand(cmd: string): void; terminate(): void };

  let handler: (line: string) => void = () => {};
  const engine = loadEngine("lite-single", (line) => handler(line));
  return {
    send: (command) => engine.processCommand(command),
    onLine: (h) => {
      handler = h;
    },
    terminate: () => engine.terminate(),
  };
}
