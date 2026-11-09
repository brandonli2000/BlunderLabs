# Tactical-mistake labeling guidelines (v1.0)

These guidelines define the two questions labelers answer in `/label.html`. The labels
are the ground truth for measuring BlunderLab's tactical detectors, so they must describe
**the chess**, not what the algorithm does. Never look at detector output while labeling
(the tool doesn't show it).

## The setting

Each item is a real move from a real game that the engine (Stockfish 19 lite, depth 14)
judged to lose at least 5% expected score: an inaccuracy, mistake or blunder. You see the
position before the move, the move played, and (on request) the position after it and the
engine's lines.

Answer each question **yes**, **no**, or **unsure**:
- **yes**: a club player shown the position would agree immediately.
- **no**: the pattern isn't there, or it's there but irrelevant to why the move was bad.
- **unsure**: genuinely borderline, or you'd need deep calculation. Unsure items are
  excluded from precision and recall, so use unsure rather than guessing.

Decide from the board first. Use the engine hint (`e`) only to check a calculation, not to
make the decision for you.

Material values: pawn 1, knight 3, bishop 3, rook 5, queen 9.

## Q1: Left hanging (detector: `hanging-piece`)

> After the move, can the opponent simply win material (net at least a minor piece, i.e.
> ≥ 2 points) by capturing a piece the mover left inadequately defended?

Answer **yes** when, after the move:
- a piece of the mover's is undefended and attacked, and taking it wins ≥ 2 net; or
- it is defended, but not enough (attacked by a cheaper piece, or more attackers than
  defenders) so the capture sequence wins ≥ 2 net; or
- the move itself started an exchange that loses ≥ 2 net (e.g. Rxd5 when the pawn is
  defended by a pawn).

It doesn't matter whether the move *created* the problem (moved the piece into danger,
removed a defender) or merely *failed to fix* an existing one. Both are "left hanging".

Answer **no** when:
- the capture is an even trade (knight for knight) or wins only a pawn;
- the "hanging" piece is a deliberate, sound sacrifice (the engine doesn't consider the move
  a big loss *because of* the material);
- taking the piece loses (it's poisoned: a mate or bigger material loss follows);
- the move was bad for a different main reason (e.g. it allows mate) and no material can
  actually be won by capture.

Edge cases:
- *Material can be won, but the opponent's best move is something even stronger (mate)*:
  answer **yes** if the piece really can be taken for ≥ 2 net. The pattern exists even if
  something else is worse; note it in the free-text notes if useful.
- *The piece can be won by a fork or pin rather than a direct capture*: **no** for this
  question (that's a different pattern for a later detector), unless the direct capture
  also wins.
- *Pawn hanging*: **no** (below the 2-point threshold).

## Q2: Missed capture (detector: `missed-capture`)

> Before the move, did the mover have a capture that wins material (net ≥ 2) and was
> clearly the right move?

Answer **yes** when, in the position before the move:
- the mover could capture an opponent piece and come out ≥ 2 ahead after any recaptures, and
- that capture is clearly better than the move played (no hidden refutation), and
- the move played didn't take the same material another way.

Answer **no** when:
- the "free" piece is poisoned (taking allows mate, loses a bigger piece, or traps the capturer);
- the capture wins only a pawn, or is an even trade;
- the mover captured the same piece with a different piece;
- another, unrelated move was clearly stronger, and the capture wasn't actually good.

## General rules

- Label each question independently. A move can be both (ignored a free piece *and* hung
  one of its own).
- Don't label causes. These questions ask what was on the board, never why the player
  missed it.
- Use the notes for anything surprising; notes are kept in the dataset.
- Label in sessions of ≤ 30 minutes; fatigue causes inconsistency.

## Examples (from the unit tests; constructed positions, not part of the dataset)

| Position (FEN) | Move | Q1 | Q2 | Why |
|---|---|---|---|---|
| `4k3/8/8/3p4/8/8/3N4/4K3 w - - 0 1` | Nc4 | yes | no | Knight walks into dxc4 (+3). |
| `4k3/8/8/3p4/2N5/8/8/4K3 w - - 0 1` | Ke2 | yes | no | Knight already attacked; move ignores it. |
| `4k3/8/2p5/3p4/8/8/8/3RK3 w - - 0 1` | Rxd5 | yes | no | Losing exchange: pawn for rook (−4). |
| `4k3/8/4p3/3n4/8/2N5/8/4K3 w - - 0 1` | Nxd5 | no | no | Even trade. |
| `4k3/8/2n5/8/8/8/8/2R1K3 w - - 0 1` | Ke2 | no | yes | Rxc6 wins a free knight. |
| `4k3/1p6/2n5/8/8/8/8/2R1K3 w - - 0 1` | Ke2 | no | no | Knight defended by b7; Rxc6 bxc6 loses. |
| `r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3` | Nf6 | no | no | Allows Qxf7# (mate, not material). |

## Splits

Items are split into **dev** (~70% of games) and **holdout** (~30%) by game, so no game
contributes to both. Label dev first. Detector development may look at dev disagreements;
the holdout is only used to report a final number for a fixed detector version, and should
ideally be labeled by someone who hasn't seen the detector code.

## Versioning

Changing these definitions bumps the guidelines version. Labels made under an older
version must be re-checked before they're compared with new detector versions.
