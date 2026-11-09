import { describe, expect, it } from "vitest";
import { isPromotion, legalDestinations, pieceColorAt, playMove, playSan, pvToSan } from "./moves";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const PROMO = "8/4P1k1/8/8/8/8/8/4K3 w - - 0 1";

describe("legalDestinations", () => {
  it("lists legal targets for the side to move only", () => {
    expect(legalDestinations(START, "g1").sort()).toEqual(["f3", "h3"]);
    expect(legalDestinations(START, "e7")).toEqual([]); // black piece, white to move
    expect(legalDestinations(START, "e4")).toEqual([]); // empty square
  });

  it("respects pins and check", () => {
    // White king e1 in check from the rook on e8: only king moves or blocks are legal.
    const fen = "4r1k1/8/8/8/8/8/3B4/4K3 w - - 0 1";
    expect(legalDestinations(fen, "d2")).toEqual(["e3"]);
  });
});

describe("playMove", () => {
  it("plays legal moves and reports SAN, UCI and positions", () => {
    expect(playMove(START, "e2", "e4")).toEqual({
      san: "e4",
      uci: "e2e4",
      fenBefore: START,
      fenAfter: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    });
  });

  it("returns null for illegal moves instead of throwing", () => {
    expect(playMove(START, "e2", "e5")).toBeNull();
    expect(playMove("not a fen", "e2", "e4")).toBeNull();
  });

  it("handles promotion choice, including underpromotion", () => {
    expect(isPromotion(PROMO, "e7", "e8")).toBe(true);
    expect(legalDestinations(PROMO, "e7")).toEqual(["e8"]); // four promotion moves, one square (regression)
    expect(isPromotion(START, "e2", "e4")).toBe(false);
    expect(playMove(PROMO, "e7", "e8", "n")?.san).toBe("e8=N+"); // knight on e8 checks g7
    expect(playMove(PROMO, "e7", "e8", "q")?.uci).toBe("e7e8q");
  });

  it("handles castling and en passant", () => {
    expect(playMove("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "e1", "g1")?.san).toBe("O-O");
    expect(playMove("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2", "e5", "d6")?.san).toBe("exd6");
  });
});

describe("pvToSan", () => {
  it("converts a PV and stops at illegal moves or the ply limit", () => {
    expect(pvToSan(START, ["e2e4", "e7e5", "g1f3"])).toEqual(["e4", "e5", "Nf3"]);
    expect(pvToSan(START, ["e2e4", "e7e5", "g1f3"], 2)).toEqual(["e4", "e5"]);
    expect(pvToSan(START, ["e2e4", "e2e4"])).toEqual(["e4"]);
    expect(pvToSan(PROMO, ["e7e8q"])).toEqual(["e8=Q"]);
  });
});

describe("pieceColorAt", () => {
  it("reads piece colours", () => {
    expect(pieceColorAt(START, "e1")).toBe("w");
    expect(pieceColorAt(START, "e8")).toBe("b");
    expect(pieceColorAt(START, "e4")).toBeNull();
  });
});

describe("playSan", () => {
  it("plays typed moves, tolerating missing check marks, glyphs and zeros for castling", () => {
    expect(playSan(START, "Nf3")?.uci).toBe("g1f3");
    expect(playSan(START, " e4!? ")?.san).toBe("e4");
    expect(playSan(PROMO, "e8=N")?.san).toBe("e8=N+");
    expect(playSan("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "0-0")?.san).toBe("O-O");
  });

  it("returns null for illegal, ambiguous or empty input", () => {
    expect(playSan(START, "Nf6")).toBeNull();
    expect(playSan(START, "")).toBeNull();
    expect(playSan(START, "hello")).toBeNull();
    // Two knights can reach d2: "Nd2" is ambiguous.
    expect(playSan("4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1", "Nd2")).toBeNull();
  });
});
