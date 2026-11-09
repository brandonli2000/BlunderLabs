# BlunderLab progress

_Last updated: 2026-11-09 (session 7)_

**Current phase:** Phase 2 (Player intelligence and mistake mining), working on the
Tactical Intelligence Engine v1. Phase 1 is functionally complete except deployment, which
waits on the licence decision. See ROADMAP.md ("Where we are").
**Health (session 7):** typecheck clean · 231/231 unit/integration tests (28 files, excluding the
untracked `src/core/seeOracle.test.ts`, which fails on its own, see Known gaps) · build OK ·
35/35 Playwright E2E (14 app + 21 labeling-tool) · GitHub `main` = `c17800c`: the three
session-5 commits were **pushed with the owner's approval** at the start of session 6.
Session-6 commits are local and **not pushed**.

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
- **Move facts (design 0001 §4, done for the fields listed):** `extractMoveFacts` (`library/moveFacts.ts`)
  yields one observation per analysed move, both sides, flagged or not: classification, loss,
  phase, time class, clock (remaining, spent with provenance and gap reason, fraction of
  starting time), and explicit identity (`playerKey` only on the imported account's own moves,
  `byOwner` true/false/null). One all-or-nothing validity gate (analysis must match the game's
  moves, plies, colours, and carry win values in 0–1). `timeClassOf` in `core/clock.ts`
  (Lichess definition). Tests: 31 for the facts, 3 for time classes, 3 new catalogue tests;
  the facts module was mutation-checked (7 deliberate breakages, all caught). Deliberately
  absent: the `motifs` field (detectors are unvalidated, so nothing would be honest to put there).
- **Mistake catalogue now derives from move facts** (`extractMistakes` = flagged projection).
  Output verified byte-identical to the old implementation over every real fixture game
  (4 games x 4 identity variants) before the old code was removed; the catalogue E2E still passes.
- **Assisted labeling (session 7, D-026; built and browser-tested, not yet used by a person):**
  `/label.html` shows the detector's suggestion and supporting engine line for a question only
  after you answer it, on the dev split only; the holdout never shows one. Suggestions are
  "yes" or nothing (never "no"), are never written as labels, and your first answer is stored
  separately (`review` field, optional, dataset version still 1). "unsure / needs review" is the
  existing excluded-from-scoring label with a `u` key to revisit. A coverage panel shows
  reviewed/unsure/unlabeled counts and how often you kept or revised after a reveal, labeled as
  coverage, not accuracy. `npm run tactics:evaluate` reports coverage apart from precision/recall,
  adds a table on first blind answers when review records exist, and states the 90% target only
  if the Wilson lower bound reaches it. Reopening a file whose labels differ from saved browser
  work now reports the conflict. Logic in `src/tactics/assist.ts` (16 tests) plus 7 browser tests.
- **`/label.html` verified in a real browser (Playwright, 14 tests):** dataset loading,
  keyboard labeling, navigation, persistence, export round trip, error paths, blind-tool
  guarantees. Five bugs found and fixed (see ENGINEERING_LOG). Labels in those tests live only
  in the test browser; **no human labels exist yet** and none were generated.

## In progress 🟡
- **Per-player improvement profile (design 0001): foundation only.** Move facts exist and are
  tested; there is no bucketing, rate, confidence interval, `profiles` store or profile UI yet.
- **Detector validation:** waiting for the owner's labels on the dev split. Precision and
  recall are unknown until then. Do not claim any accuracy.
- `/label.html` is browser-tested by automation but no person has labeled with it yet; the
  first real labeling session is still the true usability test (feel, pacing, guideline clarity).

## Partially implemented / known gaps
- **Uncommitted/failing file not from session 7:** `src/core/seeOracle.test.ts` (untracked, an SEE
  differential oracle test) fails its `> 500 positions from real games` assertion (gets 95). Not
  touched. Fix the position source or the threshold before committing it; the test also takes
  a few seconds.
- A `latestSearch` engine test timed out once under full-suite load (passes alone); watch for flakiness.
- Assisted labeling only speeds hard cases and revision: the detector is silent on most items,
  and recall needs those labeled by hand (dev: 14 hanging firings of 390 items).
- No drag-and-drop on the board (click and typed moves work).
- Variations are one level deep and not saved.
- Pieces are interim Unicode glyphs.
- Mistake-preview board only appears on hover/focus on wide screens; on phones, tap opens the review.
- Mistake catalogue and analyses are computed on demand; fine at current scale, unmeasured for 1,000+ games.
- Browser benchmark numbers (session 2) came from an automation-attached Chrome; re-run cleanly.
- `MoveFact.clockMs` is the clock *after* the move (as the catalogue always showed). The time a
  player had when starting to think is the previous own clock; for time-pressure statistics that
  is the more faithful quantity and should be considered when building clock buckets.
- Move facts for all moves are not yet used by any UI or store; materializing them is only
  needed if profiles over 1,000+ games prove slow (unmeasured).

## Known risks
- Licence undecided (DECISIONS D-004): **blocks public deployment**.
- Batch analysis speed: ~5–20 s per game in the browser at depth 14 (session 2 measurement),
  so 100 games takes 10–30 minutes. The strategy experiment exists to address this with evidence.

## Next session: concrete tasks (in priority order)
0. **Owner:** decide the licence (D-004); approve pushing session-6/7 commits; start labeling:
   `npm run dev` → `/label.html` → enter your name → answer each question from the board first, then read the
   reveal and keep or change your answer; mark real doubts "unsure / needs review" and revisit with `u`.
   ~30 min sessions; Export → save as `bench/tactics/labels/dataset-v1.labeled.json`. Label the holdout
   only at the end (it shows no suggestions) and do not tune detectors on it.
1. Profile statistics module `library/profile.ts` (design 0001 §5), pure and tested: bucket move
   facts by phase x colour x time class x clock bucket (over 50% / 20-50% / under 20% of starting
   time, plus absolute under 30 s), rate per 100 moves, expected score lost per 100 moves,
   `wilsonInterval` (already in `core/stats.ts`), the n < 50 "not enough games" rule, the
   non-overlapping-interval comparison rule. Decide clock-at-decision vs clock-after first.
   Group facts by `playerKey` (never by display name).
2. Once ≥ ~100 dev items are labeled: `npm run tactics:evaluate`, read the disagreement report,
   and improve the detectors (bump their versions). Record results in ENGINEERING_LOG.
3. Broaden the evaluation games (other players and rating bands) before trusting any number.
4. `profiles` store (schema migration v3) and the minimal profile view (design 0001 §3, §8 step 4):
   one table per dimension, no charts at first; "no data", not zeros, for empty buckets.
5. Re-time analysis strategies on an idle machine (`npm run bench:strategy`; the reference is cached).
6. Next detectors on the same framework (forks, pins, overloaded defenders), each with labels.

## Session log (newest last)
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
- **2026-11-08 · S6:** Pushed the session-5 commits (owner-approved). Drove `/label.html` in
  Chromium with a new Playwright spec and fixed five bugs it exposed (engine hint leaking across
  split switches, dead end on an empty split, keys leaking from a focused select, hijacked
  Ctrl/Alt chords, focus trapped in the name field). Built `extractMoveFacts` and `timeClassOf`
  test-first, moved the catalogue onto the facts with a byte-identical differential check, and
  mutation-checked the new tests. Tests 178 -> 215 unit, 14 -> 28 E2E.
- **2026-11-09 · S7:** Assisted labeling (D-026): reveal-after-answer suggestions on the dev split,
  first-answer record, unsure/needs-review navigation, coverage panel, evaluation that separates
  coverage from precision/recall and can score blind first answers, conflict reporting on reopen.
  Holdout untouched; no labels exist, so no accuracy claim. Mutation-checked the two key guards.
  Tests 215 -> 231 unit, 28 -> 35 E2E.
