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

### 2026-11-08 · Design · Clock data without guessing (session 3)
`[%clk]` gives the clock *after* a move, including the increment, so time spent is
`previous own clock − this clock + increment`. Real-data edge cases the parser had to
respect: neither site runs the clock on each side's first move (it shows the starting
time, so "spent" would be fiction); Lichess records whole seconds and Chess.com tenths
(so the resolution is kept and shown as ±1 s); a player can be *given* time by the opponent,
making the clock go up (reported as `inconsistent`, not clamped to 0); correspondence clocks
aren't think time. Values are labelled `measured` vs `estimated` (no TimeControl header,
increment assumed 0). Verified against the recorded Lichess game: 10.h4 shows 4:16
remaining and 26 s spent (4:39 → 4:16 with +3).

### 2026-11-08 · Design · Batch analysis where storage is the queue (session 3)
A persisted queue would have to stay in sync with imports and deletions and could be
left half-written by a crash. Instead the queue is recomputed before every game as "games
without any stored analysis" minus recorded failures, and each analysis is saved the moment
it finishes. A reload therefore loses at most one game's work, and there's no queue to
corrupt. A subtle hazard drove the worker layout: `UciEngine.stop()` makes the *current*
search return early with a shallower result. If batch and single-game analysis shared a
worker, pausing one could silently degrade the other's evaluations, so each role has its
own worker. Covered by 11 runner tests (pause, interrupted reload, crash retry, unreadable
PGN, duplicate start, cross-tab lock, deletion mid-run, storage failure).

### 2026-11-08 · Bug · A full disk would have failed every game in the batch (session 3)
Found by re-reading the runner: a `saveAnalysis` error (e.g. QuotaExceededError) was caught
as a per-game failure, so the runner would analyse and "fail" every remaining game one
after another. Storage errors now propagate out of the per-game handler and pause the job
with the reason shown, keeping it resumable. A regression test asserts the runner stops
after the first failed save and blames no individual game.

### 2026-11-08 · Design · Restore that cannot destroy data (session 4)
Backups restore by *merging*. The restore is planned first (pure read, shown to the user as
a preview), then applied in one IndexedDB transaction using `add()` rather than `put()`.
`add()` fails on an existing key instead of overwriting it, and any failure aborts the
whole transaction, so a restore is all-or-nothing and can never overwrite or delete. The
test simulates the realistic race (the same game imported in another tab between preview
and restore): the restore fails and the database is byte-for-byte unchanged. Validation
re-parses every PGN and recomputes its id, so a hand-edited backup can't plant a record
whose id disagrees with its content.

### 2026-11-08 · Bug · Promotion square listed four times (session 4)
The first Playwright run printed React "duplicate key `te8`" warnings: a pawn on the 7th
rank has four legal moves to the same square (one per promotion piece), and
`legalDestinations` returned all four. It was harmless visually but meant React could drop
or duplicate board elements. Fixed by de-duplicating, with a unit regression test. To catch
this class of bug automatically, every E2E test now fails on any page console error.

### 2026-11-08 · Bug · Board overflowed laptop screens (session 4)
An E2E test clicking e1 failed: at 1280×720 the bottom rank sat below the fold, so the
click never reached the board. That was a real usability problem (common laptop height),
not just a test issue. The board is now sized to `min(640px, 100%, 100vh − 210px)`, and the
test helper clicks through the element so Playwright scrolls it into view.

### 2026-11-08 · Measurement · Test suite (session 4)
Final review re-run: typecheck clean, 140/140 Vitest (22 files), 14/14 Playwright (19.6 s,
while the strategy experiment was using CPU in the background), build OK.

140 unit/integration tests (Vitest, includes real-Stockfish tests) in ~2 s; 14 Playwright
E2E tests in Chromium in ~38 s locally (3 workers), stable across a `--repeat-each=2` run
(26/26). Catalogue build time shown in-app: 12 ms for one analysed 46-ply game (Chrome,
same machine as earlier benchmarks).

### 2026-11-08 · Measurement · Strategy experiment results (session 5)
`npm run bench:strategy`: 53 distinct real games, 3,873 moves, each strategy compared move
by move with a uniform depth-18 reference (Stockfish 19 lite, Node 24, Core Ultra 7 155H).
Raw: `bench/results/strategy-2026-11-09T02-59-17-760Z.json` (gitignored experimental output;
reference cached in `reference-d18.json`).

| Strategy | Searches | Class agree | Severity agree | Mistake+ P / R | Inaccuracy+ P / R |
|---|---|---|---|---|---|
| uniform d14 (current) | 3,926 | 81.0% | 92.1% | 88.0 / 86.2 | 84.0 / 85.5 |
| uniform d12 | 3,926 | 75.3% | 89.7% | 87.8 / 80.4 | 80.1 / 81.6 |
| uniform d10 | 3,926 | 71.1% | 88.4% | 84.6 / 73.9 | 76.2 / 77.1 |
| d10 → d14 @ 0.03 | 5,511 | 75.5% | 92.3% | 88.9 / 87.1 | 90.0 / 80.4 |
| d10 → d14 @ 0.02 | 5,965 | 75.6% | 92.2% | 88.3 / 84.2 | 88.6 / 82.8 |
| d10 → d16 @ 0.03 | 5,511 | 76.7% | 93.8% | 92.8 / 91.2 | 91.6 / 82.4 |

(341 reference mistake-or-worse moves.) Findings: selective deepening keeps mistake
detection at d14 quality or better, but loses inaccuracy recall and "best move" agreement,
because unrefined positions keep shallow best moves. **Wall-clock timings are not reported
as results**: other CPU-heavy work (E2E runs, screenshots) overlapped the candidate runs.
Decision D-021: keep uniform d14; re-time on an idle machine before reconsidering.

### 2026-11-08 · Design · Legal SEE and the first tactical detectors (session 5)
`core/see.ts` evaluates exchanges by playing them with chess.js legal moves, so absolute
pins, x-rays, king legality, promotions and en passant are handled by construction (17
tests, each isolating one rule). Detectors (`src/tactics/`) report a pattern only when three
independent signals agree: SEE material gain ≥ 2, the engine's own move is that capture,
and the move lost ≥ 0.10 expected score. That conjunction separates a tactical opportunity
from a merely available capture. Writing tests caught two wrong *expectations*: Bxf7+ is also
safe when a queen backs up the f-file, and a pawn's four promotion moves aren't four squares.

### 2026-11-08 · Measurement · Tactics dataset v1 and detector cost (session 5)
`npm run tactics:dataset` analysed 53 real games (3,873 moves) at the default plan and kept
moves with loss ≥ 0.05: **661 items** (390 dev / 271 holdout, split by game). Unvalidated
firing counts: hanging-piece 24, missed-capture 12 (3.6% and 1.8% of items). Cost in Node:
1.48 ms per item for both detectors, 2.9 ms per `bestCaptureOn` call. **There are no human
labels yet, so precision and recall are unknown.** Raw: `bench/tactics/build-summary.json`.
Limitation: games mostly from one ~1750 Lichess player, so a representative evaluation needs
more players and rating bands.

### 2026-11-08 · Testing · Driving the labeling tool in a browser (session 6)
`/label.html` had only been typechecked. A Playwright spec (14 tests; a slice of the real
unlabeled dataset served by route interception; nothing written to the repo) found five real
bugs, all in a tool whose output becomes evidence: (1) switching split left the engine hint
visible, a leak in a *blind* tool; (2) a split with no items rendered "Loading..." with no
selector, so the user could not switch back; (3) letters typed into the focused split select
also drove the tool; (4) Ctrl/Meta/Alt chords were hijacked (Ctrl+A toggled the before/after
view); (5) focus stayed trapped in the name field or select, so labeling keys silently stopped
working. Lesson: three of my first-draft tests *passed against the buggy code* because they
did not discriminate (the modifier test, an arrow-key test, and a "rapid key presses" test that
cannot expose a race because CDP delivers keys sequentially). I rewrote them to use synthetic
events and the keys the bug actually affected, confirmed they failed (6 red) before fixing, and
deleted the race test rather than keep one that proves nothing.

### 2026-11-08 · Testing · Refactoring the catalogue onto move facts (session 6)
To keep `extractMistakes` identical, I dumped its output from the *old* code over every real
fixture game (4 games x 4 identity variants x pseudo-random verdicts, 422 KB), refactored, and
compared: byte-identical. Then I mutation-checked the new module: seven deliberate breakages
(ambiguous owner, unclamped loss, divide by zero starting time, opponent keyed to the player,
dropped colour check, dropped range check, case-sensitive identity) and the suite caught all
seven. One failure on the first run was my own wrong expectation (a rising clock without a
known increment is correctly "inconsistent", not an estimate). An informal one-off timing (not
recorded as a result) suggested PGN parsing dominates the cost, so building facts for all moves
is cheap; the `include` predicate mainly avoids retaining per-move objects.
