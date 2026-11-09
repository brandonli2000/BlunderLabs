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
| Storage | none yet | IndexedDB planned (Phase 1) |
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
    gameAnalysis.ts  analyzeGame → GameAnalysis { positions[], moves[] verdicts, accuracy }
  ui/          React components (render + interaction only)
    App, ReviewPage, Board (SVG), MoveList, EvalGraph, ImportPanel, annotations, engineInstance
  styles/      global.css (design tokens + components)
  test/        shared fixtures
```

Dependency direction: `ui → analysis → engine → core`, and `ui → core`. `core` imports
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

## Data flow (review)

```
PGN text ─splitPgn→ game strings ─parseGame→ ParsedGame
ParsedGame ─analyzeGame(UciEngine(WorkerTransport))→ GameAnalysis
ReviewPage state { game, ply, orientation, analysis state } → Board / MoveList / EvalGraph
```

## Testing strategy

- Unit tests for every pure module (`core`, `engine/uci`).
- Integration tests run the **real** Stockfish WASM under Node (`createNodeTransport`):
  mate detection, POV normalization, terminal positions, MultiPV, queueing, full game analysis.
- CI (`.github/workflows/ci.yml`): typecheck, tests and build on every push/PR to main.
- UI is currently verified manually in a browser. Component and E2E tests (Playwright)
  are planned once the UI stabilizes.

## Future (not built)

- **Storage:** IndexedDB repository module (`src/storage/`) holding games, analyses keyed
  by `(fen, engine version, depth)`, and player profiles.
- **Import clients:** `src/import/lichess.ts` (NDJSON export API), `src/import/chesscom.ts`
  (monthly archives API). Both are CORS-enabled and called from the browser.
- **Diagnosis:** `src/diagnosis/` with motif detectors and cause classifier, pure and tested.
- **Backend (Phase 6):** only when accounts/sync are needed. Candidates are evaluated then.
