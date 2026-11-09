# BlunderLab progress

_Last updated: 2026-11-08 (session 2)_

**Current phase:** Phase 1 (Foundation). See ROADMAP.md.
**Health:** `npm run check` → typecheck clean, 84/84 tests pass · `npm run build` OK ·
`npm run bench` OK · main flows manually verified in Chrome 157 against the live
Lichess and Chess.com APIs.

## Implemented and verified ✅
- **Core** (unit tests): PGN split/parse (multi-game, FEN starts, comments/variations
  ignored), White-POV scores, win probability, move classification, accuracy, FEN reading,
  legal moves / promotion / castling / en passant (`core/moves.ts`), PV → SAN, move numbering.
- **Engine** (real-Stockfish integration tests): `UciEngine` (queued searches, MultiPV,
  stop, terminate, init timing); `LatestSearch` (latest-wins live analysis); Node transport
  supports multiple engines per process.
- **Analysis:** full-game grading at depth 14, timing recorded, cache key per engine build + depth.
- **Username import** (tests replay recorded real API responses; manually verified live):
  - Lichess: streamed export with live progress; standard speeds only.
  - Chess.com: monthly archives newest-first, serial requests, capped at 24 archives,
    variants filtered out.
  - Errors: invalid username (no request made), unknown/closed account, no games,
    HTTP 429, other HTTP errors, network failure, stream dropped mid-download, cancel.
  - Live check: 25 Lichess games (thibault) in 1.0 s; 10 Chess.com games (hikaru);
    re-import → "0 new · 25 already in library"; unknown user → clear error.
- **PGN import:** paste / file / sample, into the same library with the same dedup.
- **Library (IndexedDB):** games + analyses survive reloads (verified in Chrome); dedup
  across imports and across sources (same Lichess game via API or PGN file); delete with
  inline confirm cascades to analyses (verified: 34 games / 0 analyses after deleting an
  analysed game); filter box; storage usage display; schema migrations framework; quota
  error message. (storage tests via fake-indexeddb)
- **Review:** loads from the library by URL (`#/game/<id>`); saved analysis appears instantly
  after reload; board orientation follows the imported player's colour.
- **Variation exploration** (manually verified): click a piece, then a square; legal-move
  dots; a non-game move starts a variation; playing the game's own move just advances;
  ←/→ step through the variation; Esc / "Back to game" returns; live MultiPV-3 Stockfish
  lines to depth 18 on a separate worker, with a best-move arrow.
- **Benchmarks:** `bench/` workload (6 real games) with Node and browser harnesses; results
  in `bench/results/` and ENGINEERING_LOG.

## Partially implemented 🟡
- Promotion picker: logic unit-tested, UI **not exercised in the browser** yet.
- Board input is click-only: no drag-and-drop and no keyboard move entry (an accessibility gap).
- Variations are one level deep (no sub-variations) and are lost on navigation or reload (by design for now).
- Browser benchmark numbers come from an automation-attached Chrome and look pessimistic
  (see ENGINEERING_LOG); they need a clean re-run.
- Chess.com opening names (from `ECOUrl`) only apply to games imported after this
  change. Records saved earlier keep the ECO code until re-imported.
- Pieces are still interim Unicode glyphs.
- Light theme not visually checked in a browser (only dark).

## Known bugs / risks
- No automated UI/E2E tests; UI regressions are caught only manually.
- `navigator.storage.persist()` not requested, so the browser may evict the library under
  storage pressure. There's no export/backup yet.
- Licence undecided (DECISIONS D-004): **blocks public deployment**.
- Repo pushed to https://github.com/brandonli2000/BlunderLabs on 2026-11-08; the first CI run
  result has not been checked yet (see the Actions tab).
- Import parsing costs ~4–11 ms/game (chess.js); fine for 100 games, worth profiling for
  bulk imports of thousands.
- Full analysis takes ~5–20 s per game in the browser at depth 14, too slow for
  batch analysis of many games (Phase 2).

## Next session: concrete tasks (in priority order)
0. **Owner decision** (not blocking local work): licence (recommended GPL-3.0, DECISIONS D-004).
   Check the first CI run on GitHub Actions.
1. **Per-move clock times:** parse `[%clk h:mm:ss(.s)]` comments (both sites send them;
   chess.js `getComments()` returns them keyed by FEN) into `GameMove.clockMs`, and show
   time spent per move in the move list. This is the first diagnostic signal beyond engine
   loss (time pressure). Bump `ANALYSIS_FORMAT` only if the analysis shape changes.
2. **Batch analysis queue** (Phase 2 foundation): "Analyse all unanalysed games" in the
   library, running in the background with progress, resumable after reload, cancellable.
   Re-measure throughput in a clean Chrome first, then decide on faster strategies
   (e.g. a shallow pass plus selective deepening).
3. **Mistake catalogue v0:** after batch analysis, list every mistake/blunder by the
   imported player across games (position, eval swing, phase, clock). It's the raw
   material for Phase 3 diagnosis.
4. Export/backup of the library (JSON download) + request persistent storage.
5. Drag-and-drop and keyboard move input; exercise the promotion picker in the browser.
6. Component/E2E tests (Playwright) for import → review → explore.
7. Original SVG piece set.

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
