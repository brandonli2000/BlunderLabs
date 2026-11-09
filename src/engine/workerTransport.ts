import type { EngineTransport } from "./engine";

/** Path of the Stockfish build served by the Vite plugin (see vite.config.ts). */
export const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish.js`;

/** Runs Stockfish in a dedicated Web Worker. */
export function createWorkerTransport(url: string = ENGINE_URL): EngineTransport {
  const worker = new Worker(url);
  return {
    send: (command) => worker.postMessage(command),
    onLine: (handler) => {
      worker.onmessage = (event: MessageEvent<unknown>) => {
        if (typeof event.data === "string") handler(event.data);
      };
    },
    onError: (handler) => {
      worker.onerror = (event) => {
        event.preventDefault();
        handler(event.message || "worker error");
      };
      worker.onmessageerror = () => handler("unreadable message from worker");
    },
    terminate: () => worker.terminate(),
  };
}
