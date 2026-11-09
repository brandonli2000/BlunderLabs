# Engineering decisions

Format: ID, date, decision, context, alternatives, consequences. Append new entries;
mark superseded ones instead of deleting them.

---

## D-001 · 2026-11-08 · Browser-first TypeScript app, no backend yet
**Decision:** Build BlunderLab as a static web app (TypeScript, React, Vite). All analysis
runs client-side.
**Context:** Phase 1 needs import, analysis and review. Lichess and Chess.com APIs are
CORS-enabled, and Stockfish runs in WASM, so none of it requires a server.
**Alternatives:** Backend from day one (Node/Python + DB): more operational cost and
slower iteration, with no Phase 1 feature needing it. Desktop app: a worse distribution
story for a public product.
**Consequences:** Zero hosting cost, private by default, works offline once loaded. Accounts,
sync and heavy batch analysis will need a backend later (Phase 6); keeping logic in pure
modules keeps that migration feasible.

## D-002 · 2026-11-08 · React for UI
**Decision:** React 19 with function components; no state-management or UI-kit library.
**Alternatives:** Svelte/Solid (smaller, but a thinner ecosystem for a years-long project);
vanilla TS (too much hand-rolled UI plumbing as the product grows).
**Consequences:** Chess logic must stay outside components (enforced in CLAUDE.md).

## D-003 · 2026-11-08 · Stockfish 19 "lite single-threaded" WASM, served verbatim
**Decision:** Use the `stockfish` npm package's lite single-threaded build (~1.9 MB),
served as static files at `/engine/` through a small Vite plugin, not bundled.
**Context:** The full NNUE build is ~99 MB; the multi-threaded builds need COOP/COEP
headers (cross-origin isolation), which complicate hosting and break some embeds.
**Alternatives:** Full build (far too large to download); multi-threaded lite (faster,
but needs special headers); a server-side engine (cost, privacy).
**Consequences:** Weaker than full Stockfish but far stronger than any human, which is
fine for grading human moves. Revisit multi-threaded lite once hosting is chosen
(possibly as an opt-in "deep analysis" mode). The same build runs in Node for tests.

## D-004 · 2026-11-08 · Licensing is an open decision (needs the user)
**Context:** Stockfish is GPL-3.0. Shipping the engine files to browsers is distribution.
Running it as a separate worker program that talks UCI is commonly treated as
aggregation, but the safest compliant options are (a) license BlunderLab under GPL-3.0,
or (b) keep BlunderLab under any licence while distributing Stockfish unmodified with
its licence and a source link. chess.js is BSD-2-Clause.
**Status:** `package.json` says `UNLICENSED` (private) until the owner decides. **Must be
resolved before any public deployment.** Whatever is chosen, ship Stockfish's
`Copying.txt` and a source link with the engine files.

## D-005 · 2026-11-08 · Move grading by expected-score loss (Lichess-compatible)
**Decision:** Convert centipawns to expected score with the logistic
`1/(1+e^(−0.00368208·cp))` (cp clamped to ±1000; mates → 0/1). Grade a move by the
mover's expected-score loss: ≥0.05 inaccuracy, ≥0.10 mistake, ≥0.15 blunder. The engine's
top move is "best". Move accuracy uses Lichess' fitted curve; game accuracy is the
harmonic mean of move accuracies.
**Why:** Raw centipawn loss overstates errors in already-decided positions (losing 300cp
at +900 doesn't matter). An expected-score model reflects practical consequences and is
widely understood. Matching Lichess' published constants makes our numbers familiar
and comparable.
**Known limitations:** No "only move", "brilliant" or "missed win" categories yet. The
harmonic mean is a simplification of Lichess' volatility-weighted blend. This is the
*symptom* layer only; causes come in Phase 3. Thresholds may later be tuned by rating.

## D-006 · 2026-11-08 · White-POV `Score` with explicit winner for mates
**Decision:** The internal score type is `{ cp } | { mateIn, winner }`, always White-POV;
conversion from UCI's side-to-move POV happens only at the engine boundary.
**Why:** Signed mate counts make "mate 0" (already checkmated) ambiguous after a POV flip,
and mixed perspectives are the most common source of eval bugs in chess tools.

## D-007 · 2026-11-08 · Own SVG board, interim Unicode pieces
**Decision:** Render the board as our own SVG component instead of using chessground or
react-chessboard. Pieces are Unicode glyphs for now.
**Why:** Full control over the visual identity, no GPL board dependency (chessground is
GPL-3.0), and only a small amount of code. Unicode glyphs vary by font and platform, so an
original SVG piece set is planned (PROGRESS.md).
**Consequences:** Drag-and-drop move input has to be built ourselves (planned).

## D-008 · 2026-11-08 · Real-engine integration tests
**Decision:** Engine and analysis tests run the actual Stockfish WASM build in Node
instead of mocking UCI output.
**Why:** UCI edge cases (terminal positions, bounds, MultiPV ordering, POV) are exactly
where mocks lie. The lite build makes the full suite run in under a second.

## D-009 · 2026-11-08 · Transparent AI authorship and CI from the start
**Decision:** Commits containing AI-written code carry a `Co-Authored-By: Claude`
trailer (from this point on; the first five commits predate the rule), and the README
states how the project is built. A GitHub Actions workflow runs typecheck, tests and
build on every push.
**Why:** This is a portfolio project, so its credibility depends on accurate authorship;
the owner's contribution is direction, decisions, evaluation and understanding, and that
should be visible and defensible. CI enforces the "never claim it works untested" rule
mechanically rather than relying on discipline.

## D-010 · 2026-11-08 · IndexedDB via the raw API, tested with fake-indexeddb
**Decision:** Persist games and analyses in one IndexedDB database (`blunderlab`) using
the browser API directly (~150 lines in `src/storage/`). Add `fake-indexeddb` as a
**dev-only** dependency so storage is tested in Node.
**Alternatives:** `idb`/Dexie wrappers (nicer API, but a runtime dependency for code
we can keep small); localStorage (synchronous, ~5 MB cap, strings only, unsuitable for
analyses of 10–50 KB each); a server (contradicts D-001 and privacy by default).
**Migrations:** an append-only array; `DB_VERSION = MIGRATIONS.length`, and each step
upgrades from v to v+1 so a browser at any old version catches up. Released steps must
never be edited.
**Analyses are a cache, not a source of truth:** stored with `format` and an
`engineKey` (engine build + depth). A format change makes old entries be ignored and
recomputed rather than migrated.
**Limits:** quota errors surface as "storage is full, delete some games". Usage is shown
via `navigator.storage.estimate()`. Persistent storage (`navigator.storage.persist()`)
is not requested yet, so browsers may evict data under storage pressure. To revisit
together with export/backup (PROGRESS).

## D-011 · 2026-11-08 · Game identity derived from PGN headers
See ENGINEERING_LOG "Game identity from the PGN itself": `lichess:<id>`,
`chesscom:<live|daily>:<id>`, else `pgn:<sha256-prefix>` of normalized content. The
96-bit hash prefix makes accidental collisions negligible at library scale.

## D-012 · 2026-11-08 · Hash routing, no router library
**Decision:** `#/` (library) and `#/game/<id>` (review), parsed in `src/ui/route.ts`.
**Why:** Reloads and bookmarks restore the open game; works on any static host without
rewrite rules; two routes don't justify a dependency.

## D-013 · 2026-11-08 · Separate engine worker for exploration; latest-wins scheduling
**Decision:** Full-game analysis and interactive exploration use two Stockfish workers
(`getEngine("analysis" | "explore")`). Live lines go through `LatestSearch`.
**Why:** With one worker, live lines would wait behind a 10–60 s game analysis. A second
worker costs another ~2 MB of WASM plus its hash table. Latest-wins keeps the engine on
the position actually shown (ENGINEERING_LOG).

## D-014 · 2026-11-08 · Username import runs in the browser against public APIs
**Decision:** Fetch directly from `lichess.org/api/games/user/{name}` (streamed PGN;
standard speeds only via `perfType`) and `api.chess.com/pub/player/{name}/games/...`
(monthly archives walked newest to oldest, serially, at most 24 archives). Both send CORS
headers (verified with real requests on 2026-11-08).
**Security/privacy:** usernames are validated against `[A-Za-z0-9_-]{2,30}` and
URL-encoded; archive URLs returned by Chess.com are only followed if they start with
`https://api.chess.com/pub/player/`; PGN is parsed as data and rendered as text (React
escaping), never as HTML.
**Rate limits:** HTTP 429 gives a "wait a minute" message; requests are serial. There is
no automatic retry, to avoid hammering the APIs.
**Not handled:** private Lichess games need OAuth. That's acceptable because the product
targets the user's own public games.

## D-015 · 2026-11-08 · Clock data is derived from the stored PGN, not stored separately
**Decision:** `parseGame` attaches `clockMs` (from `[%clk]`) to each move, and
`computeGameClock` derives time spent. Nothing new is persisted.
**Why:** The PGN is already the source of truth; a second copy could drift, and a parsing
fix would otherwise need a data migration. Parsing costs a few ms per game (benchmarked).
**Rules:** spent = previous own clock − this clock + increment (clocks are recorded after
the increment). Each side's first move is unmeasured (neither site runs the clock yet).
Values are `measured` when the increment is known, and `estimated` (increment assumed 0)
when the TimeControl header is missing. Negative results beyond the clock's resolution
(e.g. opponent-granted time) are reported as `inconsistent`, never guessed.
Correspondence games get no think time. Resolution (1 s vs 0.1 s) is kept with the data.
**Non-goal:** clock values are facts about the clock. BlunderLab must not label them as
emotions or mental states ("panicked", "rushed").

## D-016 · 2026-11-08 · Batch analysis: storage is the queue
**Decision:** The batch runner has no persisted queue. The queue is "games without any
stored analysis", recomputed before each game, minus the job's recorded failures. A small
`jobs` record (schema v2) stores only status (running/paused) and failures.
**Why:** Each completed analysis is saved the moment it finishes, so a crash or reload
loses at most the game in progress, and there's no queue state to corrupt or get out of
sync with imports and deletions.
**Concurrency:** batch uses its own worker (`getEngine("batch")`), so pausing or cancelling
never `stop`s a search belonging to single-game analysis or live exploration (stopping
a shared worker would silently return a shallower result). Duplicate jobs are prevented
in-tab (one runner and one loop) and across tabs (Web Locks, `ifAvailable`). Without Web
Locks support, only the in-tab guard applies.
**Honesty:** analysis runs only while a tab is open. A job that was running when the page
closed is shown as "interrupted" and resumes only when the user clicks Resume.
**Failures:** an EngineError is retried once on a fresh worker (dead workers are replaced
automatically), and unreadable PGNs fail immediately. Failures are listed with a Retry action.

## D-017 · 2026-11-08 · Mistake catalogue computed on demand
**Decision:** The catalogue is derived when the view opens, from the newest valid analysis
per game plus the game's PGN (for positions, clocks, phase). There's no mistakes store yet.
**Why:** It can't go stale, and the extraction logic can change without a migration.
Measured build time is shown in the UI. If it becomes slow for large libraries,
materialize it into a store keyed by `[gameId, ply]` (a v3 migration).
**Safety:** if a stored analysis doesn't line up with its game (move count or SAN
mismatch), that game contributes nothing rather than attaching verdicts to the wrong moves.
**Scope:** the catalogue says where expected score was lost and in what context (phase,
clock). It does not claim causes; that is Phase 3.

## D-018 · 2026-11-08 · Game phase heuristic adapted from Lichess' Divider
**Decision:** endgame when at most 6 minor/major pieces remain; middlegame when at most 10
remain or a side has fewer than 4 pieces on its back rank; otherwise opening. Adapted from
Lichess' open-source Divider, without its mixedness score. It is labelled a heuristic.

## D-019 · 2026-11-08 · Backup format and merge-only restore
**Decision:** Backups are JSON `{ format: "blunderlab-backup", version, exportedAt, games,
analyses }`. Restore validates (rebuilding each game record from its PGN), previews, then
applies with `add()` in one transaction. It never overwrites or deletes. Files from a newer
format version are refused with an "update the app" message, and older versions will get
explicit upgrade steps. Jobs are not backed up (they're transient).
**Alternatives:** "replace library" restore (simpler, but a wrong file destroys data);
per-record transactions (a partial restore on failure).
**Persistence:** `navigator.storage.persist()` is requested only when the user clicks, with an
explanation. Browsers decide whether to grant it, and the UI says so honestly.

## D-020 · 2026-11-08 · Playwright E2E with recorded fixtures and real Stockfish
**Decision:** E2E tests run the real app in Chromium: real Stockfish worker, real IndexedDB,
a fresh browser context per test. Lichess/Chess.com are always intercepted (`page.route`),
and any unexpected real API call returns HTTP 599 so it fails loudly. Any page console
error fails the test.
**Why real Stockfish:** short fixture games analyse in seconds, and the engine/worker
integration is exactly what unit tests can't cover. Chromium only, for now; Firefox and WebKit
would mainly add CI time until there are browser-specific features.
**CI:** a separate `e2e` job; the HTML report is uploaded on failure.

## D-021 · 2026-11-08 · Analysis plan stays uniform depth 14 after the strategy experiment
**Evidence:** `bench/strategy.bench.ts` on 53 real games (3,873 moves) against a uniform
depth-18 reference. See ENGINEERING_LOG "Strategy experiment results".
**Decision:** Keep `DEFAULT_PLAN` = uniform depth 14 for now.
**Why:** The d10→d14 refine plan matched d14 on mistake-or-worse detection (P/R 88.9/87.1
vs 88.0/86.2) but lost inaccuracy recall (80.4 vs 85.5%) and "best move" agreement (75.5 vs
81.0%), because unrefined positions keep depth-10 best moves. Its speed advantage is
unproven: timings were taken while other CPU-heavy work ran. Refine to depth 16 was the most
accurate (P/R 92.8/91.2) but, by those noisy timings, slower than d14.
**Revisit:** re-time on an idle machine (the reference is cached), and consider "d10 → d16"
for *batch* analysis, where mistake detection matters more than best-move labels.

## D-022 · 2026-11-08 · SEE over legal moves, not attack bitboards
**Decision:** `core/see.ts` plays exchange sequences with chess.js legal moves.
**Why:** Correct by construction for absolute pins, x-rays, king legality, promotions and en
passant, which are exactly the cases hand-rolled attack-map SEE gets wrong. Cost is a few
legal-move generations per step, measured at well under a millisecond per call (ENGINEERING_LOG).
That's irrelevant at a handful of squares per move. It isn't suitable inside a search engine,
which we don't write.
**Known limitations:** static (one square, no checks/threats/zwischenzugs), fixed piece values,
relative pins ignored, least-valuable recapture convention. Detectors compensate by
requiring engine agreement.

## D-023 · 2026-11-08 · Detectors need static AND engine evidence, and carry versions
**Decision:** A tactical detection requires (1) an SEE material gain ≥ 2, (2) the engine's
own move to be the capture in question (best reply for hanging pieces, best move for missed
captures), and (3) an expected-score loss ≥ 0.10 for the move. Each detector has a version
number, a subtype, and machine-readable evidence plus a one-line explanation.
**Why:** SEE alone over-reports ("free" pieces that are poisoned); the engine alone can't
say *what* happened. The conjunction is the distinction between a tactical opportunity and
a merely available capture, and it targets precision over recall: a wrong explanation is
worse than none.
**Not exposed in the UI** until a labeled holdout supports ≥ 90% precision with a Wilson
interval whose lower bound is meaningful (not just a high point estimate on a few labels).

## D-024 · 2026-11-08 · Evaluation dataset: real mistakes, game-level split, blind labeling
**Decision:** `bench/tactics/dataset-v1.json` holds every move with loss ≥ 0.05 from 53 real
public games, each item self-contained (positions + engine evidence), all labels null.
Items are split dev/holdout (~70/30) by hashing the game id, so a game never straddles
splits. Labels are made in `/label.html`, which never runs detectors (blind) and hides
engine hints until requested; guidelines define the questions as chess concepts, not
detector rules (`docs/tactics/labeling-guidelines.md`).
**Why:** Unit-test positions (constructed to exercise rules) must not double as evaluation
data. Evaluating on mistakes from real games measures performance where it will be used.
Blind labeling avoids confirmation bias, and the game-level split avoids leakage between
correlated moves of one game.
**Limitation:** one source player (thibault, ~1700–1850 Lichess blitz) dominates the set; a
representative evaluation needs games across rating bands and players.
