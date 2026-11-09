import { describe, expect, it } from "vitest";
import { piecesFromFen, squareCoords } from "./fen";

describe("piecesFromFen", () => {
  it("reads the starting position", () => {
    const pieces = piecesFromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect(pieces).toHaveLength(32);
    expect(pieces).toContainEqual({ square: "e1", color: "w", type: "k" });
    expect(pieces).toContainEqual({ square: "d8", color: "b", type: "q" });
    expect(pieces).toContainEqual({ square: "h2", color: "w", type: "p" });
  });

  it("reads sparse positions", () => {
    expect(piecesFromFen("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1")).toEqual([
      { square: "e8", color: "b", type: "k" },
      { square: "e2", color: "w", type: "p" },
      { square: "e1", color: "w", type: "k" },
    ]);
  });

  it("rejects malformed placement", () => {
    expect(() => piecesFromFen("8/8/8 w - - 0 1")).toThrow();
    expect(() => piecesFromFen("9/8/8/8/8/8/8/8 w - - 0 1")).toThrow();
    expect(() => piecesFromFen("x7/8/8/8/8/8/8/8 w - - 0 1")).toThrow();
  });
});

describe("squareCoords", () => {
  it("maps algebraic squares to zero-based coordinates", () => {
    expect(squareCoords("a1")).toEqual({ file: 0, rank: 0 });
    expect(squareCoords("h8")).toEqual({ file: 7, rank: 7 });
  });
});
