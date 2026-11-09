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
