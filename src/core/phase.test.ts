import { describe, expect, it } from "vitest";
import { gamePhase } from "./phase";

describe("gamePhase", () => {
  it("calls the starting position and early development the opening", () => {
    expect(gamePhase("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe("opening");
    // 1.e4 e5 2.Nf3 Nc6: each side has 7 pieces on its back rank still.
    expect(gamePhase("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3")).toBe("opening");
  });

  it("switches to middlegame once a side has developed off its back rank", () => {
    // Italian after castling: both sides still have 5 pieces on the back rank → opening.
    expect(gamePhase("r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 2 6")).toBe("opening");
    // After Bg5 and Qe2, White's back rank holds only Ra1, Rf1, Kg1 (3 pieces) → middlegame.
    expect(gamePhase("r2q1rk1/ppp2ppp/2np1n2/2b1p1B1/2B1P1b1/2NP1N2/PPP1QPPP/R4RK1 w - - 4 8")).toBe("middlegame");
  });

  it("switches to middlegame when trades leave ten or fewer pieces", () => {
    expect(gamePhase("r3k2r/ppp2ppp/2n5/3q4/3Q4/2N5/PPP2PPP/R3K2R w KQkq - 0 12")).toBe("middlegame");
  });

  it("calls positions with six or fewer pieces the endgame", () => {
    expect(gamePhase("8/5pk1/6p1/8/8/6P1/5PK1/3R4 w - - 0 40")).toBe("endgame");
    expect(gamePhase("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1")).toBe("endgame");
  });
});
