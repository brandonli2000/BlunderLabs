# BlunderLab architecture

## Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript 7 (strict) | `tsc --noEmit` for typechecking only |
| UI | React 19 | Function components + hooks, no state library yet |
| Build / dev | Vite 8 | Custom plugin serves Stockfish files (see below) |
| Tests | Vitest 5 · Playwright 1.65 | Unit/integration in Node (real engine); E2E in Chromium |
| Chess rules | chess.js 1.4 | PGN parsing, SAN/UCI conversion, legality |
| Engine | Stockfish 19 WASM (`stockfish` npm, lite single-threaded build) | Runs in a Web Worker |
| Styling | Plain CSS with custom properties | `src/styles/global.css` |
| Storage | IndexedDB (raw API) | `src/storage/`; tested with fake-indexeddb (dev only) |
| Backend | none | Planned only for Phase 6 (accounts/sync) |

## Directory layout

```
src/
  core/        Pure chess domain logic (no DOM, no engine, no storage)
    types.ts       Color, Score (White-POV), helpers
    pgn.ts         splitPgn, parseGame → ParsedGame { headers, startFen, moves[] (with clockMs) }
    clock.ts       parseTimeControl, parseClockComment, computeGameClock (spent time: measured/estimated/gaps)
    fen.ts         piecesFromFen, squareCoords (for rendering)
    moves.ts       legalDestinations, isPromotion, playMove, playSan, pvToSan
    notation.ts    numberedSans ("12…Nf6 13.Bxf7+")
    phase.ts       gamePhase heuristic (adapted from Lichess' Divider)
    evaluation.ts  UciScore → Score (toWhitePov), win probability, formatScore
    classify.ts    classifyMove, moveAccuracy, gameAccuracy
  engine/      Talking to UCI engines
    uci.ts         parseInfo, parseBestMove (pure)
    engine.ts      UciEngine: handshake, serialized searches, MultiPV, stop, terminate,
                   crash propagation (onError → rejects in-flight work, isDead)
    latestSearch.ts  latest-request-wins scheduling for live lines
    workerTransport.ts  Browser: Stockfish in a Web Worker
    nodeTransport.ts    Tests/benchmarks: same WASM build inside Node
  analysis/    Orchestration over engine + core
    gameAnalysis.ts  analyzeGame (optional refine pass) → GameAnalysis; DEFAULT_PLAN;
                     analysisEngineKey(limits, refine) for caching
    batch.ts         BatchRunner: resumable batch analysis over injected deps
  import/      Public-API clients (fetch injected for tests)
    errors.ts      ImportError kinds, username validation, fetchOrThrow
    lichess.ts     streamed PGN export → string[]
    chesscom.ts    monthly archives, newest first → string[]
    fixtures/      real recorded API responses, used by tests, E2E and benchmarks
  library/     Domain model of the user's collection
    gameRecord.ts  GameRecord, gameIdentity (dedup key), toGameRecord, openingFromEcoUrl
    importGames.ts importPgns: parse → identify → store; per-game failures tolerated
    mistakes.ts    extractMistakes (+ ownerColor), filterMistakes, sortMistakes
  storage/     IndexedDB (schema v2)
    db.ts          openDatabase, append-only MIGRATIONS (v1 games/analyses, v2 jobs), StorageError
    library.ts     games + analyses: addGames (dedup), listGames, getGame, deleteGame (cascades),
                   saveAnalysis, getLatestAnalysis, latestAnalysesByGame, gameIdsNewestFirst,
                   isAnalysisShape (validation of stored data)
    jobs.ts        persisted batch job (status + failures)
    backup.ts      createBackup, validateBackup, planRestore, applyRestore (all-or-nothing)
  ui/          React components (render + interaction only)
    App (hash routes #/, #/mistakes, #/game/<id>[/<ply>]), LibraryPage, ImportPanel,
    GameList, BatchPanel, DataPanel, MistakesPage, ReviewPage (+ MoveInput), ReviewParts,
    Board (SVG, click-to-move), MoveList (clocks), EvalGraph; hooks useLibrary,
    useGameAnalysis, useLiveLines; batchInstance (singleton runner + Web Locks),
    engineInstance (one worker per role: analysis, explore, batch), database
  styles/      global.css (design tokens + components)
  test/        shared fixtures and fake fetch
bench/         workload.ts (shared), node.bench.ts (npm run bench), strategy.bench.ts
               (npm run bench:strategy), browser page (/bench.html), fixtures/, results/
e2e/           Playwright specs (npm run test:e2e); helpers.ts has the console-error fixture
docs/design/   Design proposals (0001: player profile + first motif detector)
```

Dependency direction: `ui → {library, storage, analysis, import} → engine → core`.
`storage` imports only types from `library`/`analysis`. `core` imports
nothing from other app folders. `analysis` depends on the engine through the
`PositionSearcher` interface, so tests can use a fake.

## Key interfaces

- **`Score`** (`core/types.ts`): `{ cp }` or `{ mateIn, winner }`, always White's point of
  view. `mateIn: 0` means the position is already checkmate. Raw UCI scores
  (`UciScore`, side-to-move POV) are converted once, in `UciEngine`, via `toWhitePov`.
- **`EngineTransport`** (`engine/engine.ts`): `send(cmd)`, `onLine(handler)`,
  `terminate()`. Anything that speaks UCI line-by-line can be plugged in.
- **`UciEngine.search(fen, limits, onInfo?) → SearchResult`**: searches are queued and run
  one at a time. Bound (lower/upper) info lines are ignored. Result holds `bestMove`
  (null if no legal moves) and the deepest exact line per MultiPV slot.
- **`analyzeGame(searcher, game, { limits, signal, onProgress })`**: evaluates all n+1
  positions at a fixed depth (default 14), then grades each move by the mover's
  expected-score loss. Cancellable via `AbortSignal`.

## Engine delivery

`vite.config.ts` contains a small plugin that serves
`node_modules/stockfish/bin/stockfish-19-lite-single.{js,wasm}` at `/engine/stockfish.{js,wasm}`
in dev and emits them into `dist/engine/` at build time. The worker script finds its wasm
by swapping `.js` → `.wasm` on its own URL, so the two names must stay paired. The
single-threaded build needs no COOP/COEP headers, so any static host works.

## Data flow

```
Import:  username ─fetchLichessGames / fetchChessComGames→ PGN[]   (or PGN text ─splitPgn→ PGN[])
         PGN[] ─importPgns→ toGameRecord (parse + gameIdentity) → addGames (dedup) → "games"
Library: listGames + analyzedGameIds → LibraryPage / GameList → #/game/<id>
Review:  getGame → parseGame (+ clocks) → Review
         getLatestAnalysis(gameId) ─hit─→ shown instantly
                                   └miss→ analyzeGame (DEFAULT_PLAN, "analysis" worker) → saveAnalysis
Explore: click or typed SAN → playMove/playSan → Variation → useLiveLines → LatestSearch ("explore" worker)
Batch:   BatchRunner loop: pending = gameIdsNewestFirst − analyzedGameIds − job.failed
         → analyzeGame ("batch" worker) → saveAnalysis (immediately) → repeat; job status in "jobs"
Mistakes: latestAnalysesByGame + listGames → extractMistakes per game → filter/sort → #/game/<id>/<ply>
Backup:  createBackup (one read tx) → JSON download;  file → validateBackup → planRestore (preview)
         → applyRestore (one write tx, add() only)
```

`importedFor` (e.g. "lichess:thibault") records whose games these are; `ownerColor()`
uses it to separate the player's moves from opponents'. The planned player profile builds
on this (design 0001).

## Testing strategy

- Unit tests for every pure module (`core`, `engine/uci`).
- Integration tests run the **real** Stockfish WASM under Node (`createNodeTransport`):
  mate detection, POV normalization, terminal positions, MultiPV, queueing, full game analysis.
- CI (`.github/workflows/ci.yml`): job `check` (typecheck, unit tests, build) and job `e2e`
  (Playwright) on every push/PR to main.
- E2E (`e2e/`, Playwright, Chromium): real app, real Stockfish and IndexedDB, external APIs
  intercepted with recorded fixtures; any page console error fails a test.
- Benchmarks (`bench/`) are separate from tests and write results files.

## Future (not built)

- **Player profiles / mistake catalogue:** new object stores (added via a migration)
  derived from stored analyses + `importedFor`.
- **Per-move clocks** from `[%clk]` comments (both sites provide them) for time-pressure diagnosis.
- **Diagnosis:** `src/diagnosis/` with motif detectors and cause classifier, pure and tested.
- **Backend (Phase 6):** only when accounts/sync are needed. Candidates are evaluated then.
