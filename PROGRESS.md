# BlunderLab progress

_Last updated: 2026-11-08 (session 5)_

**Current phase:** Phase 2 (Player intelligence and mistake mining), working on the
Tactical Intelligence Engine v1. Phase 1 is functionally complete except deployment, which
waits on the licence decision. See ROADMAP.md ("Where we are").
**Health (session 5):** typecheck clean · 178/178 unit/integration tests (26 files) · build OK ·
14/14 Playwright E2E at the last E2E run (session 4; no UI changes since) · GitHub `main` =
`2535fe0` (pushed with approval); session-5 commits are local and **not pushed**.

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
- **Analysis-strategy experiment (done):** 53 games vs a depth-18 reference; uniform d14 kept
  (D-021; table in ENGINEERING_LOG). Raw outputs are local and gitignored.
- **Tactical Intelligence Engine v1 (built, NOT validated, not in the UI):**
  - `core/see.ts`: legal static exchange evaluation (pins, x-rays, king legality, promotions,
    en passant). 17 tests.
  - `src/tactics/`: hanging-piece (subtypes created / unaddressed / losing-exchange /
    unknown-before) and missed-capture (still-available / gone). Each requires SEE gain ≥ 2,
    engine agreement and loss ≥ 0.10. 12 tests on constructed positions.
  - Evaluation: dataset format + `bench/tactics/dataset-v1.json` (661 real-game items: 390 dev /
    271 holdout, **all labels null**), `/label.html` blind labeling tool, guidelines
    (`docs/tactics/labeling-guidelines.md` v1.0), `npm run tactics:evaluate` (precision,
    recall, Wilson CIs, disagreement report). Unvalidated firing: hanging 24, missed 12.

## In progress 🟡
- **Detector validation:** waiting for the owner's labels on the dev split. Precision and
  recall are unknown until then. Do not claim any accuracy.
- `/label.html` has not yet been exercised in a browser by a person (typechecked only); the
  first labeling session should confirm it works end to end (load, label, export).

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
0. **Owner:** decide the licence (D-004); approve pushing session-5 commits; start labeling:
   `npm run dev` → `/label.html` → label dev items (~30 min sessions) → Export → save as
   `bench/tactics/labels/dataset-v1.labeled.json`.
1. Smoke-test `/label.html` in a browser (load, keyboard labeling, export) and fix anything found.
2. Once ≥ ~100 dev items are labeled: `npm run tactics:evaluate`, read the disagreement report,
   and improve the detectors (bump their versions). Record results in ENGINEERING_LOG.
3. Broaden the evaluation games (other players and rating bands) before trusting any number.
4. Per-player profile v0 (design 0001 §4–5): `extractMoveFacts`, time classes, clock buckets,
   `wilsonInterval` (already in `core/stats.ts`), explicit player keys.
5. Re-time analysis strategies on an idle machine (`npm run bench:strategy`; the reference is cached).
6. Next detectors on the same framework (forks, pins, overloaded defenders), each with labels.

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
- **2026-11-08 · S5:** Strategy experiment finished (kept d14, D-021). Built legal SEE,
  hanging-piece and missed-capture detectors (v1), Wilson intervals, the tactics dataset
  format, 661-item unlabeled real-game dataset, blind labeling tool, guidelines and evaluation
  harness. Experimental benchmark outputs gitignored. Long-term context consolidated into
  CLAUDE.md / ROADMAP.md. Tests 140 → 178.
