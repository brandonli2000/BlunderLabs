# BlunderLab roadmap

## Vision

Most analysis tools tell a player *that* a move was bad and *what* was better.
BlunderLab aims to find out **why** they keep making the same kinds of mistakes,
and then to prove whether targeted practice fixes them.

The core loop:

1. **Observe.** Import a player's games and analyse every move with Stockfish.
2. **Hypothesise.** Classify mistakes by pattern and likely underlying cause (e.g. missed
   opponent threat, calculation depth, piece left hanging, time trouble, opening knowledge).
3. **Test.** Run diagnostic exercises built to tell competing causes apart.
4. **Train.** Run adaptive practice on the confirmed weaknesses, using positions from the
   player's own games and similar positions.
5. **Measure.** Check whether the weakness actually shrinks, both in training and in new games.

Principles: accurate before impressive; explanations must be correct or absent; the
user's data stays theirs; every "insight" must be traceable to evidence.

## Phases

Status legend: ✅ done · 🟡 in progress · ⬜ planned

### Phase 1: Foundation: import, analysis, review (🟡 current)
Goal: a reliable, pleasant single-game review tool that everything else builds on.
- ✅ PGN parsing (multi-game files, comments/variations ignored, FEN starts)
- ✅ Stockfish 19 in the browser (WASM worker) with a tested UCI wrapper
- ✅ Move classification by expected-score loss; per-move and game accuracy
- ✅ Review UI: board, move list, navigation, eval graph, best-move arrow, verdicts
- ⬜ Import from Lichess and Chess.com by username (public APIs, browser-side)
- ⬜ Local game library (IndexedDB): persist games and analyses, list/filter/delete
- ⬜ Interactive board: drag/click moves to explore variations with live engine lines
- ⬜ Original piece set (replacing interim Unicode glyphs)
- ⬜ Analysis quality: MultiPV for "only move" detection, configurable depth, cache by FEN
- ⬜ Deployment pipeline (static hosting) + licence decision (see DECISIONS D-004)

### Phase 2: Player profile and mistake mining
Goal: move from single games to patterns across many games.
- Batch analysis of imported game collections (background queue, resumable)
- Per-player dashboard: accuracy by phase, colour, opening, time control and clock time
- Mistake catalogue: every inaccuracy/mistake/blunder with position, context and clock
- First **tactical motif detectors** (hanging piece, fork, pin, back-rank, missed capture,
  missed mate), as pure functions over positions + engine PVs, with tests

### Phase 3: Diagnosis engine (core differentiator)
Goal: explain *why*, with evidence and confidence.
- Cause taxonomy (versioned, documented): threat blindness, calculation horizon,
  evaluation error, tactical pattern gap, conversion technique, time pressure, opening prep
- Feature extraction per mistake (material swing, PV length to refutation, threat
  presence, clock data, phase, move-time anomalies)
- Rule-based classifier first (transparent, testable), later statistical/learned models
  evaluated against labelled data
- Confidence scores; "insufficient evidence" is a valid answer

### Phase 4: Diagnostic exercises and personalised puzzles
- Puzzle generation from the player's own mistakes (verify uniqueness of solution with MultiPV)
- Similar-position retrieval (motif + structure features) to widen training sets
- **Diagnostic probes**: exercise variants built to separate causes (e.g. same position
  with and without an explicit "opponent's threat?" prompt; varying calculation depth)

### Phase 5: Adaptive training and measurement
- Spaced repetition and difficulty adjustment (Elo/Glicko-style rating per skill)
- Skill model per player that updates from exercise results and new games
- Improvement reports: before/after comparisons with uncertainty, not just counts

### Phase 6: Accounts, sync and coaching
- Optional accounts and cross-device sync (introduces a backend; see ARCHITECTURE "Future")
- AI-assisted coaching: natural-language explanations grounded strictly in engine and
  diagnosis data (no free-form chess claims from an LLM)
- Coach/student sharing, study plans

## Explicitly out of scope (for now)
Playing games online, opening-book authoring, variants, mobile native apps.
