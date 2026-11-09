# BlunderLab

Evidence-based chess improvement: find out *why* you blunder, test it, and train it.

**Status:** early development (Phase 1: import, Stockfish analysis, game review).
See [ROADMAP.md](ROADMAP.md) and [PROGRESS.md](PROGRESS.md).

## Develop

```sh
npm install
npm run dev     # http://localhost:5173
npm run check   # typecheck + tests (runs real Stockfish in Node)
npm run build
```

Analysis runs locally in your browser with Stockfish 19 (WASM). No game data leaves your
machine.

Design decisions and their reasoning are in [DECISIONS.md](DECISIONS.md); real challenges, bugs and measurements
are in [ENGINEERING_LOG.md](ENGINEERING_LOG.md).

Docs: [ARCHITECTURE.md](ARCHITECTURE.md) · [DECISIONS.md](DECISIONS.md) · contributor/AI
instructions in [CLAUDE.md](CLAUDE.md).

Stockfish is © the Stockfish developers, GPL-3.0 (https://github.com/official-stockfish/Stockfish).
