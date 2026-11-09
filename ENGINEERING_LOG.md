# Engineering log

A factual record of hard problems, bugs, measurements and lessons. It is the source
material for the README, interviews and applications, so **only real, verifiable entries
go here**: link commits, give numbers with the method used to get them, and say plainly
when something was AI-implemented under the owner's direction.

Entry types: **Challenge** · **Bug** · **Measurement** · **Design** · **User feedback** · **Lesson**

---

### 2026-11-08 · Design · Representing evaluations without perspective bugs
UCI engines report scores from the side to move's point of view, and mates as signed
counts. After flipping to White's view, "mate 0" (side to move is already checkmated) has
no sign, so you can't tell who won. Solution: one internal type `{cp} | {mateIn, winner}`,
always White-POV, with conversion in exactly one place (`toWhitePov` at the engine
boundary). Tested against real Stockfish output for both colours, checkmate and stalemate.
See DECISIONS D-006, commit e5bcdf3.

### 2026-11-08 · Bug · Move on the exact threshold classified wrongly
A move losing exactly 5 percentage points (0.50 → 0.45) was graded "good" instead of
"inaccuracy". Cause: `0.5 − 0.45 = 0.04999…` in IEEE-754 floating point. Found by a
boundary-value unit test. Fixed with a 1e-9 epsilon. Lesson: test thresholds *at* the
boundary, not only either side of it.

### 2026-11-08 · Bug · Stalemate evaluated as `-0`
Negating `cp 0` for Black-to-move positions produced `-0`, which fails deep-equality
checks and could print as "−0.00". Found by the real-engine stalemate test. Fixed in
`toWhitePov`.

### 2026-11-08 · Bug · Eval graph colours inverted in dark mode
The graph used theme tokens (`--ink`, `--paper`) for "Black's share" and "White's share";
in dark mode those swap, so the graph showed Black's advantage as White's. Found while
manually testing in Chrome. Fixed with theme-independent graph tokens. Lesson: semantic
data colours must not reuse UI theme colours.

### 2026-11-08 · Measurement · Engine build size vs. strength tradeoff
Stockfish 19 WASM builds (from npm package metadata): full NNUE ≈ 99 MB wasm; lite
single-threaded ≈ 1.85 MB wasm (1.20 MB gzipped, from `vite build` output). The lite
build was chosen (DECISIONS D-003). The full test suite, including real-engine analysis
of a 7-move game at depth 10, runs in ~0.4 s on the dev machine (Vitest timing).
Throughput at production depth was not measured in session 1; see the session-2
benchmark entry below.

### 2026-11-08 · Measurement · First reproducible benchmarks (session 2)
Workload and method: `bench/README.md`. Hardware: Intel Core Ultra 7 155H (22 logical
cores, hybrid P/E), 31.4 GB RAM, Windows 11. Engine: Stockfish 19 lite single-threaded,
depth 14. Raw data: `bench/results/node-2026-11-09T01-18-15-735Z.json`,
`bench/results/chrome-2026-11-09T01-19Z.json`.

| Metric | Node 24.16 | Chrome 157 (2 runs) |
|---|---|---|
| Engine init (median of 5) | 55 ms | 115 ms / 227 ms |
| Analysis, 6 games / 432 positions | 24.3 s (17.8 pos/s) | 60.9 s / 65.0 s (7.1 / 6.6 pos/s) |
| Longest game (129 positions) | 6.7 s | 19.1 s / 18.2 s |
| Import CPU cost per game (parse + hash) | 4.4 ms | 8.6 ms / 11.5 ms |
| Stored analysis size | 10–53 KB per game (≈0.41 KB per position) | same |

Separately, in the app (not the bench harness), a real 25-game Lichess import took 1.0 s
end to end including network, and the library used 82.7 KB for those 25 games
(`navigator.storage.estimate()`, so ≈3.3 KB per game including IndexedDB overhead).

**Interpretation, with honest uncertainty:** the browser was ~2.5× slower than Node on
identical WASM. Main-thread parsing was also ~2× slower, which points to an environment
effect on the whole browser rather than the engine. Suspects (unverified): Chrome was
driven by an automation extension with a debugger attached, and Windows may schedule
browser threads on efficiency cores. One manual in-app analysis of the same 47-position
game took 4.0 s (vs 5.2–9.6 s in the bench page), consistent with high variance. **Next
step:** re-run in a clean, unautomated Chrome window before drawing conclusions.

**What it means for the product:** a typical 40-move game (~80 positions) takes roughly
5–12 s at depth 14 in the browser. That's fine for single-game review but too slow for
"analyse my last 100 games" (Phase 2 batch analysis). Options to evaluate later:
multi-threaded lite build (needs COOP/COEP), shallower first pass with selective deepening
around eval swings, or parallel workers.

### 2026-11-08 · Bug · Second Stockfish instance in Node fails to load its WASM
The first benchmark run crashed creating the *second* engine in the same process:
`ENOENT ... node_modules/stockfish/bin/stockfish.wasm`. Cause: the Emscripten-generated
module computes its `.wasm` path only when the module is first evaluated; Node's
`require` cache hands back the already-evaluated module, which then falls back to the
default file name. Tests never hit it because each test file creates one engine. Fix:
evict the module from `require.cache` before each load (`nodeTransport.ts`), plus a
regression test creating three engines. The browser was never affected (each Web Worker
evaluates the script fresh). Lesson: benchmarks exercise code paths tests don't.

### 2026-11-08 · Design · Game identity from the PGN itself
De-duplication needs a stable id per game. Using the import source ("this came from the
Lichess API") would treat the same game as different if the user later uploads it as a
PGN file. Instead the id comes from the PGN headers: Lichess `GameId`/`Site` →
`lichess:<id>`, Chess.com `Link` → `chesscom:live:<id>`, otherwise a SHA-256 of
start position + players + date + result + SAN moves (so comments and formatting don't
change it). Tested against real API data, including a Lichess export with `GameId` stripped.

### 2026-11-08 · Design · "Latest request wins" for live engine lines
When a user clicks quickly through explored moves, naively queueing a search per
position makes the engine fall seconds behind the board. `LatestSearch` keeps at most
one pending request: a new request stops the running search and replaces whatever was
waiting, and a generation counter discards info lines from superseded searches. The
real-engine test proves an intermediate position never reaches the engine and a depth-30
search is cut short.

### 2026-11-08 · Bug · Missing PGN dates stored as "????.??.??"
chess.js fills absent Seven-Tag-Roster headers with placeholders, so headerless PGNs got
the date `????.??.??`. Found by a unit test; dates without digits are now stored as null.
