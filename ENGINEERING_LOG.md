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
Throughput at production depth has **not yet been measured**: TODO, add a benchmark script.
