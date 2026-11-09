# BlunderLab architecture

## Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript 7 (strict) | `tsc --noEmit` for typechecking only |
| UI | React 19 | Function components + hooks, no state library yet |
| Build / dev | Vite 8 | Custom plugin serves Stockfish files (see below) |
| Tests | Vitest 5 | Node environment; real-engine integration tests |
| Chess rules | chess.js 1.4 | PGN parsing, SAN/UCI conversion, legality |
| Engine | Stockfish 19 WASM (`stockfish` npm, lite single-threaded build) | Runs in a Web Worker |
| Styling | Plain CSS with custom properties | `src/styles/global.css` |
| Storage | IndexedDB (raw API) | `src/storage/`; tested with fake-indexeddb (dev only) |
| Backend | none | Planned only for Phase 6 (accounts/sync) |

## Directory layout

```
src/
  core/        Pure chess domain logic (no DOM, no engine)
    types.ts       Color, Score (White-POV), helpers
    pgn.ts         splitPgn, parseGame → ParsedGame { headers, startFen, moves[] }
    fen.ts         piecesFromFen, squareCoords (for rendering)
    evaluation.ts  UciScore → Score (toWhitePov), win probability, formatScore
    classify.ts    classifyMove, moveAccuracy, gameAccuracy
  engine/      Talking to UCI engines
    uci.ts         parseInfo, parseBestMove (pure)
    engine.ts      UciEngine: handshake, serialized searches, MultiPV, stop, terminate
    workerTransport.ts  Browser: Stockfish in a Web Worker
    nodeTransport.ts    Tests: same WASM build inside Node
  analysis/    Orchestration over engine + core
    gameAnalysis.ts  analyzeGame → GameAnalysis { positions[], moves[], accuracy, durationMs };
                     analysisEngineKey(limits) for caching
  import/      Public-API clients (fetch injected for tests)
    errors.ts      ImportError kinds, username validation, fetchOrThrow
    lichess.ts     streamed PGN export → string[]
    chesscom.ts    monthly archives, newest first → string[]
    fixtures/      real recorded API responses, used by tests and benchmarks
  library/     Domain model of the user's collection
    gameRecord.ts  GameRecord, gameIdentity (dedup key), toGameRecord
    importGames.ts importPgns: parse → identify → store; per-game failures tolerated
  storage/     IndexedDB
    db.ts          openDatabase, append-only MIGRATIONS, StorageError
    library.ts     addGames (dedup), listGames, getGame, deleteGame (cascades),
                   saveAnalysis/getAnalysis (format-versioned cache), analyzedGameIds
  ui/          React components (render + interaction only)
    App (hash routes), LibraryPage, ImportPanel, GameList, ReviewPage, ReviewParts,
    Board (SVG, click-to-move), MoveList, EvalGraph; hooks useLibrary,
    useGameAnalysis, useLiveLines; engineInstance (one worker per role), database
bench/         Shared workload + Node runner (npm run bench) + browser page (/bench.html)
  styles/      global.css (design tokens + components)
  test/        shared fixtures
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
         PGN[] ─importPgns→ toGameRecord (parse + gameIdentity) → addGames (dedup) → IndexedDB "games"
Library: listGames + analyzedGameIds → LibraryPage / GameList → #/game/<id>
Review:  getGame → parseGame → Review
         getAnalysis(gameId, engineKey) ─hit─→ shown instantly
                                        └miss→ analyzeGame ("analysis" worker) → saveAnalysis
Explore: click-to-move → playMove (chess.js) → Variation state → useLiveLines → LatestSearch ("explore" worker)
```

`importedFor` (e.g. "lichess:thibault") records whose games these are. Phase 2's
cross-game mistake mining relies on it to know which side of each game is "the player".

## Testing strategy

- Unit tests for every pure module (`core`, `engine/uci`).
- Integration tests run the **real** Stockfish WASM under Node (`createNodeTransport`):
  mate detection, POV normalization, terminal positions, MultiPV, queueing, full game analysis.
- CI (`.github/workflows/ci.yml`): typecheck, tests and build on every push/PR to main.
- UI is currently verified manually in a browser. Component and E2E tests (Playwright)
  are planned once the UI stabilizes.

## Future (not built)

- **Player profiles / mistake catalogue:** new object stores (added via a migration)
  derived from stored analyses + `importedFor`.
- **Per-move clocks** from `[%clk]` comments (both sites provide them) for time-pressure diagnosis.
- **Diagnosis:** `src/diagnosis/` with motif detectors and cause classifier, pure and tested.
- **Backend (Phase 6):** only when accounts/sync are needed. Candidates are evaluated then.
