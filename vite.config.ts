import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// Stockfish ships as a standalone worker script + wasm binary. We serve both
// verbatim under /engine/ instead of bundling them (see DECISIONS.md D-003).
const require = createRequire(import.meta.url);
const ENGINE_DIR = join(dirname(require.resolve("stockfish/package.json")), "bin");
const ENGINE_FILES: Record<string, string> = {
  "stockfish.js": "stockfish-19-lite-single.js",
  "stockfish.wasm": "stockfish-19-lite-single.wasm",
};

function stockfishEngine(): Plugin {
  return {
    name: "blunderlab:stockfish",
    configureServer(server) {
      server.middlewares.use("/engine", (req, res, next) => {
        const name = (req.url ?? "").replace(/^\//, "").split("?")[0] ?? "";
        const file = ENGINE_FILES[name];
        if (!file) return next();
        res.setHeader("Content-Type", name.endsWith(".wasm") ? "application/wasm" : "text/javascript");
        res.end(readFileSync(join(ENGINE_DIR, file)));
      });
    },
    generateBundle() {
      for (const [publicName, file] of Object.entries(ENGINE_FILES)) {
        this.emitFile({ type: "asset", fileName: `engine/${publicName}`, source: readFileSync(join(ENGINE_DIR, file)) });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), stockfishEngine()],
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
