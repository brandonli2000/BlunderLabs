# BlunderLab roadmap

## Guiding objective

BlunderLab is a long-term portfolio project for university admissions (University of
Waterloo CS/SE in particular), built by a high-school student over months or years with
extensive AI assistance under the owner's direction. Its aim is to show, with real
evidence, the ability to **identify a meaningful problem, design an original solution,
build reliable software, make hard engineering decisions, and help real people**.
Nothing here assumes or guarantees an admissions outcome.

Task selection criteria, in order of weight: technical depth · originality · real-world
usefulness · measurable impact · engineering quality · maintainability · genuine learning
and leadership. Screenshot appeal is not a criterion.

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

### How BlunderLab differs from existing tools
| Tool | What it does | What BlunderLab adds |
|---|---|---|
| Lichess / Chess.com review | Per-move grades, best move, accuracy | Cross-game *causes*, hypotheses tested by diagnostic exercises |
| Aimchess | Skill-area scores and generic training | Cause classification with evidence and confidence; measured training effect per player |
| DecodeChess | Natural-language explanation of single positions | Longitudinal diagnosis of the *player*, not just the position |

## Impact milestones (real-world track)

These sit alongside the phases. Record each one in PROGRESS.md and ENGINEERING_LOG.md
only once it has actually happened, with real numbers.
- **I-1 Public alpha:** deployed at a stable URL, licence chosen, privacy note published.
- **I-2 First real users:** the owner's tutoring students and a local club use it; a
  structured feedback channel exists.
- **I-3 Feedback loop:** at least one feature visibly changed because of user feedback (documented).
- **I-4 Measured outcome:** a pre-registered small study (e.g. targeted vs. generic
  training on diagnosed weaknesses) with honest results, including null results.
- **I-5 Community:** support for club or coach use (shared study plans, beginner mode).

## Research and evaluation track

The original-algorithm work needs evaluation methods, not just implementations:
- **Labelled mistake dataset:** a small hand-labelled set of real mistakes with causes,
  labelled by the owner and stored with a versioned taxonomy. It is used to measure
  classifier precision/recall.
- **Classifier benchmarks:** rule-based baseline first; every change is compared on the
  same dataset and the results recorded in ENGINEERING_LOG.md.
- **Training-effect measurement:** per-skill ratings with uncertainty. Improvement claims
  require before/after comparisons on held-out positions or later games.
- **Performance budgets:** analysis throughput (positions/sec), time-to-interactive, and
  memory, measured with a repeatable script.

## Phases

Status legend: ✅ done · 🟡 in progress · ⬜ planned

### Phase 1: Foundation: import, analysis, review (🟡 current)
Goal: a reliable, pleasant single-game review tool that everything else builds on.
- ✅ PGN parsing (multi-game files, comments/variations ignored, FEN starts)
- ✅ Stockfish 19 in the browser (WASM worker) with a tested UCI wrapper
- ✅ Move classification by expected-score loss; per-move and game accuracy
- ✅ Review UI: board, move list, navigation, eval graph, best-move arrow, verdicts
- ✅ Import from Lichess and Chess.com by username (public APIs, browser-side)
- ✅ Local game library (IndexedDB): persist games and analyses, list/filter/delete
- 🟡 Interactive board: click-to-move variation exploration with live engine lines
  (no drag-and-drop or keyboard move entry yet)
- ✅ Reproducible benchmarks (Node + browser harness, `bench/`)
- ⬜ Original piece set (replacing interim Unicode glyphs)
- ⬜ Analysis quality: MultiPV for "only move" detection, configurable depth, cache by FEN
- 🟡 Continuous integration (workflow file written; activates once pushed to GitHub)
- ⬜ Deployment pipeline (static hosting) + licence decision (see DECISIONS D-004) → milestone I-1
- ⬜ Basic privacy-respecting usage telemetry *only if* opt-in and documented (needed for I-4)

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
