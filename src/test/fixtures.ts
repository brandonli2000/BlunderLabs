/** Scholar's mate: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#. Black's 3...Nf6 is a blunder. */
export const SCHOLARS_MATE = `[Event "Fixture"]
[Site "?"]
[White "White"]
[Black "Black"]
[Result "1-0"]

1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0`;

/** Annotated game with comments, NAGs and a variation; the main line must survive. */
export const ANNOTATED = `[Event "Annotated"]
[Result "*"]

1. e4 {King's pawn} e5 2. Nf3 $1 (2. f4 exf4) 2... Nc6 3. Bb5 a6 *`;

export const TWO_GAMES = `${SCHOLARS_MATE}\n\n${ANNOTATED}\n`;

/** Game starting from a custom position (FEN tag). */
export const FROM_FEN = `[Event "FEN"]
[SetUp "1"]
[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]
[Result "*"]

1. e4 Kd7 *`;
