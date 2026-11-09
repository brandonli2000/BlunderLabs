# BlunderLab progress

_Last updated: 2026-11-08 (session 4)_

**Current phase:** Phase 2 (Player intelligence and mistake mining). Phase 1 is functionally
complete except deployment, which waits on the licence decision. See ROADMAP.md.
**Health (final review, session 4):** typecheck clean · 140/140 unit/integration tests
(22 files) · 14/14 Playwright E2E tests (also stable over a 2× repeat run) · production build OK · GitHub CI green on `88dbe53` (the last push;
session-4 commits are local and not pushed).

## Implemented and verified ✅
- **Core** (unit tests): PGN parsing, clocks (`[%clk]` + TimeControl → remaining/spent with
  measured/estimated/gap labels), White-POV scores, win probability, classification,
  accuracy, legal moves (click and typed SAN, promotion, castling, en passant), PV → SAN,
  move numbering, game-phase heuristic.
- **Engine** (real-Stockfish tests): queued searches, MultiPV, stop, crash propagation
  (dead workers are replaced), latest-wins live search, multiple instances in Node.
- **Analysis:** fixed-depth grading (depth 14 default), optional refine pass (shallow +
  selective deepening, never mixing depths in a verdict); not the default (see experiment).
- **Import:** Lichess (streamed) and Chess.com (monthly archives) by username, PGN
  paste/file; typed errors; dedup by PGN-derived identity. (unit + E2E with recorded fixtures)
- **Library (IndexedDB v2):** games, analyses, batch job; cascade delete; schema migration
  v1→v2 tested with data; corrupted records ignored safely.
- **Batch analysis:** analyse all unanalysed games on a dedicated worker; immediate saves;
  pause / cancel / resume; "interrupted" after reload (resumes only on request); one retry
  after an engine crash; failure list with retry; a storage failure pauses the job with the
  reason; Web Locks prevent duplicate jobs across tabs. (11 runner tests + 3 E2E)
- **Mistake catalogue:** flagged moves across games with position preview, phase, clock,
  expected-score change; severity/phase/side/text filters; sort by drop/date/clock; links to
  the exact review position (`#/game/<id>/<ply>`). (unit + E2E)
- **Review:** clocks in player strips and spent time per move; analysis restored instantly;
  click-to-move or typed-move exploration with live MultiPV lines; promotion picker
  (E2E-verified, including underpromotion).
- **Backup & restore:** versioned JSON export; validated, previewed, merge-only,
  all-or-nothing restore; persistent-storage request. (unit + E2E round trip into a fresh profile)
- **Usability:** board fits 720 px-tall screens; library first on phones; clearer verdict
  wording; keyboard move entry. Screenshots checked at 1440×900, 1280×720 and 390×844, light
  and dark.
- **Benchmarks:** Node and browser harnesses (`bench/`), results in `bench/results/`.

## In progress 🟡
- **Analysis-strategy experiment** (`npm run bench:strategy`): compares uniform depth
  14/12/10 and three shallow-then-deep plans against a depth-18 reference on 56 real games.
  Started in session 3. The depth-18 reference finished during session 4
  (`bench/results/reference-d18.json`, kept uncommitted until the candidate results exist);
  the six candidate runs were still in progress at the final review (Vitest buffers output
  until the end).
  **No results yet; the default analysis plan is unchanged (uniform depth 14).** When it
  finishes: results land in `bench/results/strategy-*.json` and `reference-d18.json`.
  Record accuracy (agreement, precision/recall for mistake+) and cost in ENGINEERING_LOG
  before changing `DEFAULT_PLAN`. Timings from this run were taken under concurrent load
  (browser testing), so re-time candidates on an idle machine (the reference is cached).

## Partially implemented / known gaps
- No drag-and-drop on the board (click and typed moves work).
- Variations are one level deep and not saved.
- Pieces are interim Unicode glyphs.
- Mistake-preview board only appears on hover/focus on wide screens; on phones, tap opens the review.
- Mistake catalogue and analyses are computed on demand; fine at current scale, unmeasured for 1,000+ games.
- Browser benchmark numbers (session 2) came from an automation-attached Chrome; re-run cleanly.

## Known risks
- Licence undecided (DECISIONS D-004): **blocks public deployment**.
- Batch analysis speed: ~5–20 s per game in the browser at depth 14 (session 2 measurement),
  so 100 games takes 10–30 minutes. The strategy experiment exists to address this with evidence.

## Next session: concrete tasks (in priority order)
0. **Owner decisions:** licence (recommended GPL-3.0, D-004); approve pushing session-4 commits.
1. **Collect the strategy experiment results** (or re-run `npm run bench:strategy` on an idle
   machine) and decide `DEFAULT_PLAN` with documented accuracy/cost trade-offs.
2. **Move facts + player profile v0** (design 0001, §4–5): `extractMoveFacts`, catalogue
   refactored onto it, time classes, clock buckets, Wilson intervals, minimum-n rule,
   explicit player keys.
3. **Legal SEE** (`core/see.ts`) with exhaustive unit tests (design 0001, §6.1).
4. **Hanging-piece / missed-capture detectors** + a labelled-set evaluation harness; show
   evidence lines in the catalogue only once precision ≥ 90%.
5. Drag-and-drop board input; original SVG piece set.

## Session log
- **2026-11-08 · S1:** Set up the persistent docs system (CLAUDE.md, ROADMAP, PROGRESS,
  ARCHITECTURE, DECISIONS). Scaffolded the app; built the PGN/UCI/evaluation/classification
  core, the Stockfish engine wrapper and game analysis with tests; built the first review UI.
  Fixed two bugs found by tests (float error at the classification threshold; `-0` from
  POV negation) and a dark-mode eval-graph colour inversion found in the browser.
  Later in the session: recorded the university-admissions objective in CLAUDE.md and
  ROADMAP.md (impact milestones, research/evaluation track, competitor comparison);
  added ENGINEERING_LOG.md and a CI workflow.
- **2026-11-08 · S2:** Lichess and Chess.com username import (tested against recorded real
  responses, verified live); IndexedDB library with PGN-derived game identity, dedup,
  cascading delete, versioned migrations and an analysis cache; library and review views
  with hash routing; click-to-move variation exploration with live lines on a second
  worker (`LatestSearch`); reproducible Node + browser benchmarks. Fixed: multi-instance
  Stockfish loading in Node (found by the benchmark), missing-date placeholder, and
  Chess.com opening names. Tests went from 37 to 84.
- **2026-11-08 · S3:** Per-move clocks; optional refine pass in `analyzeGame` plus the
  strategy experiment harness; engine crash propagation; resumable batch analysis (schema
  v2 `jobs`, Web Locks, dedicated worker); mistake catalogue with phase heuristic and review
  deep links. Pushed to GitHub (CI green). Tests 84 → 132.
- **2026-11-08 · S4:** Backup/restore (validated, previewed, merge-only, atomic);
  Playwright E2E suite (14 tests, console errors fail tests) and CI job; usability fixes
  (viewport-fitted board, typed moves, library-first on phones, verdict wording); design 0001
  for the player profile and first motif detector; docs brought up to date for S3–S4.
  Bugs found by E2E: duplicate promotion targets, board overflowing 720 px screens.
  Tests 132 → 140 unit + 14 E2E.
