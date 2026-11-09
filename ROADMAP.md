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

## Where we are (updated 2026-11-08)

Phase 1 (foundation) is functionally complete; public deployment waits on the licence
decision. Phase 2 is in progress: batch analysis, clocks and the mistake catalogue are done,
and the first original algorithm work (legal SEE + two tactical detectors + an evaluation
dataset) is built but **not yet validated**.

**Next priorities:** (1) owner labels the dev split → measure and improve detectors;
(2) per-player profile statistics on top of the new move facts (design 0001 §5); (3) clean re-timing of analysis strategies;
(4) deployment once licensed.

**Unresolved issues:** licence (GPL-3.0 recommended, D-004) blocks deployment · no human
labels yet (detector precision unknown) · evaluation games come mostly from one player ·
browser benchmark numbers need a clean, unautomated re-run · no drag-and-drop board input or
original piece set. Session-level detail lives in PROGRESS.md.

## Phases

Status legend: ✅ done · 🟡 in progress · ⬜ planned

### Phase 1: Foundation: import, analysis, review (✅ functionally complete; deployment pending)
Goal: a reliable, pleasant single-game review tool that everything else builds on.
- ✅ PGN parsing (multi-game files, comments/variations ignored, FEN starts)
- ✅ Stockfish 19 in the browser (WASM worker) with a tested UCI wrapper
- ✅ Move classification by expected-score loss; per-move and game accuracy
- ✅ Review UI: board, move list, navigation, eval graph, best-move arrow, verdicts
- ✅ Import from Lichess and Chess.com by username (public APIs, browser-side)
- ✅ Local game library (IndexedDB): persist games and analyses, list/filter/delete
- ✅ Interactive board: click-to-move and typed (SAN) moves, variations, promotion choice,
  live engine lines (drag-and-drop not yet)
- ✅ Library backup/restore (versioned JSON, merge-only, validated) + persistent-storage request
- ✅ End-to-end tests (Playwright, recorded API fixtures, real Stockfish) in CI
- ✅ Reproducible benchmarks (Node + browser harness, `bench/`)
- ⬜ Original piece set (replacing interim Unicode glyphs)
- ⬜ Analysis quality: MultiPV for "only move" detection, configurable depth, cache by FEN
- ✅ Continuous integration on GitHub Actions (typecheck, unit, build, E2E)
- ⬜ Deployment pipeline (static hosting) + licence decision (see DECISIONS D-004) → milestone I-1
- ⬜ Basic privacy-respecting usage telemetry *only if* opt-in and documented (needed for I-4)

### Phase 2: Player profile and mistake mining (🟡 current)
Goal: move from single games to patterns across many games.
- ✅ Per-move clock times from `[%clk]` (measured vs estimated, explicit gaps)
- ✅ Batch analysis of imported collections (resumable, pausable, crash-tolerant, one tab at a time)
- ✅ Mistake catalogue v0: every flagged move with position, phase, clock; filters; links to review
- ✅ Analysis-strategy experiment vs a depth-18 reference (53 games): keep uniform depth 14
  for now (D-021); refine plans need a clean re-timing before adoption
- ✅ Library backup/restore and E2E test suite (supporting work done during this phase)
- 🟡 **Tactical Intelligence Engine v1** (first original algorithm work):
  - ✅ Legal static exchange evaluation (`core/see.ts`)
  - ✅ Detectors v1: hanging piece, missed capture (SEE + engine agreement + loss), versioned, with evidence
  - ✅ Evaluation infrastructure: dataset format, 661 unlabeled real-game items (dev/holdout by
    game), blind labeling tool, guidelines v1.0, precision/recall/Wilson harness
  - ⬜ **Human labels** (owner) → dev-split error analysis → detector v2 → holdout precision
  - ⬜ Show detections in the catalogue only after holdout precision ≥ 90% with a meaningful
    lower confidence bound (D-023)
- 🟡 Per-player improvement profile: rates with Wilson intervals by phase, colour, time
  class and clock bucket; explicit player identity (design: `docs/design/0001-…`)
  - ✅ Move facts for every analysed move with explicit identity, phase, time class and clock (D-025)
  - ⬜ Bucketing, rates and Wilson intervals (`library/profile.ts`), `profiles` store, profile view
- ⬜ Further detectors on the same framework: forks, pins, overloaded defenders, back-rank
  weaknesses, discovered attacks, missed mate; calculation-depth analysis (how deep the
  refutation was)

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
