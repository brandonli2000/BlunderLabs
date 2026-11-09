# Benchmarks

Reproducible performance measurements. Never quote a number in docs that isn't backed
by a results file in `bench/results/`.

## Workload (`workload.ts`)
Six real games recorded from the public APIs (`src/import/fixtures/`): 3 Lichess blitz
games (24–47 positions) and 3 Chess.com blitz/bullet games (89–129 positions), 432
positions in total. Measured:

1. **Engine init:** create a fresh engine (worker + WASM instantiation) and wait for
   `readyok`. 5 runs; the median is reported (the first run includes cold caches).
2. **Full-game analysis:** `analyzeGame` at depth 14 (the app default), MultiPV 1, one
   game at a time on one engine. Reports ms and positions/s per game, plus the JSON size
   of the result (approximates its IndexedDB footprint).
3. **Import CPU cost:** `toGameRecord` (chess.js PGN parse + SHA-256 identity + summary)
   over all six games × 100. Network time is excluded because it isn't reproducible.

## Running
- **Node:** `npm run bench`. Writes `bench/results/node-<timestamp>.json` with CPU, core
  count, RAM, Node version and RSS.
- **Browser:** `npm run dev`, open `http://localhost:5173/bench.html` in a foreground tab,
  wait for `done`. Copy `window.__benchResult` into `bench/results/<browser>-<date>.json`.
  Close other heavy tabs; don't attach DevTools during the run.

## Caveats
- Stockfish is single-threaded here (lite-single build). Times depend on per-core speed
  and on which core the OS schedules the worker (hybrid P/E-core CPUs vary a lot).
- Search at fixed depth takes very different time per position (tactical positions
  extend), so positions/s varies between games. Compare the same workload only.
