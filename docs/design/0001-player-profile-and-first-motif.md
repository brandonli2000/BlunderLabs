# Design 0001: Player improvement profile and the first tactical motif detector

Status: **in progress**: §6 (SEE, detectors) built in session 5, unvalidated; §4 move facts built in session 6 (D-025); §5 statistics and the §3 profiles store not started · Author: BlunderLab maintainers · 2026-11-08

## 1. Goal

Turn the cross-game mistake catalogue into a **per-player improvement profile** that
answers, with evidence and honest uncertainty:

- Where does this player lose expected score: which phases, colours, time controls and
  clock situations?
- Which observable tactical patterns recur in their mistakes?

It must stay explainable: every number links back to the moves it was computed from.

## 2. Three levels of claims

The product must never blur these. UI copy and code names follow this vocabulary.

| Level | Example | Established by |
|---|---|---|
| **Observation** | "10.h4 dropped expected score from 29% to 15%." | Engine evaluation (exists today) |
| **Pattern** | "After 10.h4 the knight on f4 could be taken for free." | A deterministic detector over the position plus the engine line (this proposal) |
| **Hypothesis** | "You often miss opponent threats." | Repeated patterns, **then** a diagnostic test (Phase 3–4, later) |

The profile reports observations and patterns. Hypotheses are out of scope until there
are diagnostic exercises that can confirm or reject them.

## 3. Whose moves? Player identity

Libraries mix games from several usernames, and PGN uploads carry only names. Mixing
unrelated players would make every statistic meaningless.

- **Player key**: `source:username` lower-cased (`lichess:thibault`, `chesscom:hikaru`),
  taken from `GameRecord.importedFor`. In each game, the side whose name matches is
  "the player". This exists as `ownerColor()` in `library/moveFacts.ts`.
- **Profile** = an explicit, user-made set of player keys ("me" = `lichess:x` +
  `chesscom:y`). Keys are **never merged automatically** by matching names: different
  people share names.
- **PGN uploads** have no key. The user may *claim* a player name in a PGN for a profile;
  until then those games are excluded from profiles (still in the catalogue).
- Default view: one profile per player key found in the library. A profile with no games
  in a filter shows "no data", not zeros.

Storage: a small `profiles` store (`{ id, name, keys: string[], claimedPgnNames: string[] }`),
added by schema migration v3.

## 4. Data model: move facts, not just mistakes

Rates need denominators: "3 blunders" means nothing without "out of how many moves".
So the first building block is a per-move fact table for the player's moves (flagged or
not), derived like the catalogue (stored PGN + newest valid analysis):

```ts
interface MoveFact {
  gameId: string; ply: number; playerKey: string; color: Color;
  classification: MoveClass; loss: number;            // observation
  phase: GamePhase;
  timeClass: "bullet" | "blitz" | "rapid" | "classical" | "correspondence" | "unknown";
  clockFraction: number | null;  // remaining / initial, live games only
  clockMs: number | null;
  motifs: MotifTag[];            // patterns (section 6), empty when none detected
}
```

`extractMistakes` becomes a filter over `extractMoveFacts`, so the two views can't disagree.
Time class uses Lichess' definition (estimated duration = initial + 40 × increment:
under 3 min bullet, under 8 min blitz, under 25 min rapid, otherwise classical), so it's
comparable with what players see on Lichess.

Performance: computed on demand like the catalogue (currently about 12 ms per analysed game
in the browser). If profiles over 1,000+ games get slow, materialize facts into a store
keyed by `[gameId, ply]`.

## 5. Profile statistics

For every bucket (phase × colour × time class × clock bucket, filterable):

- **moves** (n), **mistakes+blunders** (k), **rate** = k / n per 100 moves
- **expected score lost per 100 moves** (sum of `loss`); this weights a blunder that
  turns a win into a loss more than a slip in a lost position
- **95% Wilson score interval** for the rate. Wilson rather than the normal approximation
  because rates are small and n is often small, where the normal interval breaks down
  (it can go below 0).

Rules that keep it honest:
- Buckets with n < 50 moves show "not enough games yet" instead of a rate.
- A bucket is only highlighted as worse than another when the intervals don't overlap (a
  conservative test). With small samples most differences will be "not distinguishable",
  and the UI must say so rather than rank noise.
- **Clock buckets**: remaining time as a fraction of the starting time (over 50%, 20–50%,
  under 20%), plus an absolute bucket "under 30 s". Labels describe the clock ("under 20%
  of starting time"), never emotions ("panic").
- **Confounding is real**: low clock correlates with late, complex positions. The profile
  may say "your mistake rate is higher with under 20% of your time left", but must not say
  "time pressure causes your mistakes". Separating those is a Phase 3 diagnostic question
  (e.g. comparing the same phase across clock buckets).

## 6. First motif detector: hanging pieces and missed captures

Chosen first because these patterns are common at club level, can be verified mechanically,
and have a crisp, testable definition. That makes them the right foundation for an
explainable detector framework.

### 6.1 Building block: legal static exchange evaluation (SEE)

`see(fen, square, side) → material gain for `side` of starting a capture sequence on
`square``, using standard values (P 1, N 3, B 3, R 5, Q 9).

Algorithm: repeatedly capture on `square` with the **least valuable legal capturer** of
the side to move, alternating sides. Record the gain sequence, then fold it backwards
with the "either side may stop capturing" rule (`gain[i] = max(-gain[i+1], value)`).

Each step uses chess.js legal moves, so pins, en passant and promotions are handled
correctly. That's slower than bitboard SEE, but only a handful of squares per mistake are
evaluated, so it doesn't matter. Pure function, unit-tested on textbook exchange positions
(defended vs undefended pieces, x-ray attackers behind rooks/queens, pinned defenders,
pawn recaptures).

### 6.2 Patterns

For a flagged move M by the player (inaccuracy or worse), with engine evaluations before
and after:

**P1, "Left material en prise" (hanging after the move)**
- After M, the opponent's engine-preferred reply is a capture on square s, and
- `see(after M, s, opponent) ≥ 2` (at least a minor piece net, or a pawn plus exchange), and
- before M, the same piece (or the piece that moved to s) was **not** losing material:
  `see(before M, s′, opponent) ≤ 0`, where s′ is that piece's square before M.
- Evidence: piece, square, SEE gain, the engine's capture.

**P2, "Missed capture"**
- Before M, the player had a capture on square s with `see(before M, s, player) ≥ 2`, and
- the engine's best move before M is that capture (so it wasn't a trap), and
- M is not that capture, and M is at least a *mistake*.
- Evidence: the available capture and its SEE gain.

Requiring agreement with the engine line is deliberate. It removes most false positives
where a "free" piece is actually poisoned (the material can be won back or mate follows).

Output: `MotifTag = { motif: "hanging-piece" | "missed-capture"; square: string; piece: PieceType; gain: number; line: string[] }`,
rendered as one factual sentence: "After 10.h4, the knight on f4 could be won (…Bxf4 nets 3)".

### 6.3 Validation plan (before showing it to users)

1. **Unit tests** on constructed positions for every rule and every exclusion.
2. **Labelled set**: the owner hand-labels ~150 real mistakes from imported games (both
   patterns, plus "neither"), stored as a versioned fixture.
3. **Report precision and recall** per motif in ENGINEERING_LOG.md. Ship when precision ≥ 90%
   (a wrong explanation is worse than none). Recall can grow later.
4. Regression: the labelled set runs in CI, so detector changes show their effect.

## 7. Non-goals (for this step)

- No machine learning, no embeddings, no LLM explanations. Every output must be
  reproducible from the position, the engine line and documented rules.
- No cause attribution ("you don't check opponent threats"). Patterns only.
- No cross-player comparisons or ratings estimates.

## 8. Implementation order

_Progress: steps 1, 2 (time class), 5 and 6 (detectors, unvalidated) are done. Differences from
the sketch in §4: facts cover **both** sides (`byOwner`, and `playerKey` only on the account's
own moves), `ownerColor` lives in `library/moveFacts.ts`, there is no `motifs` field yet, and
there is an explicit `spentGap`. See D-025._

1. `extractMoveFacts` and a refactor of the catalogue onto it (tests: catalogue unchanged).
2. Time-class helper plus tests; clock buckets.
3. Profile statistics module (`library/profile.ts`): bucketing, Wilson interval, minimum-n rule. Pure and unit-tested.
4. `profiles` store (migration v3) and the minimal profile view: one table per dimension, no charts at first.
5. SEE (`core/see.ts`) with exhaustive tests.
6. Motif detectors P1/P2 (`core/motifs.ts`), labelled-set evaluation harness, then UI evidence lines.
