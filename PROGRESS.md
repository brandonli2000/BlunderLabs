# BlunderLab progress

_Last updated: 2026-11-08 (session 1)_

**Current phase:** Phase 1 (Foundation). See ROADMAP.md.
**Health:** `npm run check` → typecheck clean, 37/37 tests pass · `npm run build` OK ·
manually verified in Chrome (dark theme).

## Implemented and verified ✅
- Project scaffold: Vite 8 + React 19 + TS 7 strict + Vitest 5; git repo initialized.
- PGN: multi-game splitting (BOM/CRLF safe), parsing with headers, FEN starts; comments,
  NAGs and variations ignored. Illegal moves raise `PgnError`. (unit tests)
- UCI parsing: info lines (cp/mate, bounds, multipv, empty PV at terminal positions),
  bestmove incl. `(none)`. (unit tests)
- `UciEngine`: handshake, queued searches, MultiPV, stop, terminate (rejects pending).
  (integration tests on real Stockfish: mate-in-1 both colours, checkmate, stalemate,
  MultiPV ordering, concurrent calls)
- Evaluation: White-POV scores, win probability (Lichess curve), formatting. (unit tests)
- Classification: best/good/inaccuracy/mistake/blunder by expected-score loss; move and
  game accuracy. (unit tests; Scholar's-mate integration test flags 3…Nf6?? correctly)
- Review UI (manually tested in Chrome): paste/open-file/sample import, game picker for
  multi-game files, SVG board with coordinates, last-move highlight, best-move arrow,
  classification marker on the board, move list with glyphs and colours, eval graph with
  click-to-seek, player strips with accuracy and error counts, keyboard navigation
  (←/→/Home/End, F to flip), progress bar with cancel, light and dark themes.

## Partially implemented 🟡
- Board is view-only: no move input or variation exploration yet.
- Pieces are interim Unicode glyphs (rendering depends on the system font).
- Move list scrolls the active move into view with `scrollIntoView`, which may also
  scroll the page on small screens. Needs a container-only scroll.
- Light theme was only checked via CSS review, not visually in a browser this session.

## Known bugs / risks
- No automated UI tests yet (component/E2E). UI regressions are caught only manually.
- Licence undecided (DECISIONS D-004): **blocks public deployment**.
- Analysis is not persisted; reloading the page loses it.
- CI workflow is written but has never run (no GitHub remote yet).

## Next session: concrete tasks (in priority order)
_Ordered by the admissions-focused criteria in ROADMAP.md: the foundation for real users
and for cross-game mistake mining comes first._
0. **Owner decisions:** licence (DECISIONS D-004) and whether/when to create the GitHub
   repo (CI is already written in `.github/workflows/ci.yml`). Both block milestone I-1.
1. **Lichess import by username**: `src/import/lichess.ts`. Use
   `GET https://lichess.org/api/games/user/{name}?max=N&pgnInJson=false&clocks=true`
   (`Accept: application/x-chess-pgn`), stream the response, reuse `splitPgn`/`parseGame`.
   Unit-test the parsing with a recorded fixture; do not hit the network in tests.
2. **Chess.com import**: `https://api.chess.com/pub/player/{name}/games/archives`, then
   monthly archives (`games[].pgn`). Same fixture-based testing.
3. Import UI: a username + source picker in ImportPanel, listing recent games to choose from.
4. **Persistence**: `src/storage/` on IndexedDB (games + analyses keyed by game id and
   engine settings), and a simple library view.
5. Parse `[%clk]` comments into per-move clock times (needed for the time-pressure
   diagnosis later). chess.js `getComments()` exposes them.
6. Interactive board (click-to-move, variation exploration with live engine lines).
7. Benchmark script for analysis throughput (positions/sec at depth 14); record the
   result in ENGINEERING_LOG.md.
8. Deploy a public alpha (static host) once the licence is decided → milestone I-1.
9. Original SVG piece set; then component tests (Testing Library) for MoveList/Board.

## Session log
- **2026-11-08 · S1:** Set up the persistent docs system (CLAUDE.md, ROADMAP, PROGRESS,
  ARCHITECTURE, DECISIONS). Scaffolded the app; built the PGN/UCI/evaluation/classification
  core, the Stockfish engine wrapper and game analysis with tests; built the first review UI.
  Fixed two bugs found by tests (float error at the classification threshold; `-0` from
  POV negation) and a dark-mode eval-graph colour inversion found in the browser.
  Later in the session: recorded the university-admissions objective in CLAUDE.md and
  ROADMAP.md (impact milestones, research/evaluation track, competitor comparison);
  added ENGINEERING_LOG.md and a CI workflow.
