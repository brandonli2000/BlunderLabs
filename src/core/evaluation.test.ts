import { describe, expect, it } from "vitest";
import { formatScore, toWhitePov, whiteWinProbability, winProbabilityFor } from "./evaluation";

describe("toWhitePov", () => {
  it("flips centipawns when Black is to move", () => {
    expect(toWhitePov({ cp: 50 }, "w")).toEqual({ cp: 50 });
    expect(toWhitePov({ cp: 50 }, "b")).toEqual({ cp: -50 });
  });

  it("maps signed mate counts to a winner", () => {
    expect(toWhitePov({ mate: 3 }, "b")).toEqual({ mateIn: 3, winner: "b" });
    expect(toWhitePov({ mate: -2 }, "b")).toEqual({ mateIn: 2, winner: "w" });
  });

  it("treats mate 0 as the side to move being checkmated", () => {
    expect(toWhitePov({ mate: 0 }, "b")).toEqual({ mateIn: 0, winner: "w" });
    expect(toWhitePov({ mate: 0 }, "w")).toEqual({ mateIn: 0, winner: "b" });
  });
});

describe("win probability", () => {
  it("is 0.5 at equality and symmetric", () => {
    expect(whiteWinProbability({ cp: 0 })).toBe(0.5);
    expect(whiteWinProbability({ cp: 200 }) + whiteWinProbability({ cp: -200 })).toBeCloseTo(1, 10);
  });

  it("matches the Lichess curve (+1 pawn ≈ 59.1%)", () => {
    expect(whiteWinProbability({ cp: 100 })).toBeCloseTo(0.591, 3);
  });

  it("is monotonic and clamps extreme scores", () => {
    expect(whiteWinProbability({ cp: 300 })).toBeGreaterThan(whiteWinProbability({ cp: 100 }));
    expect(whiteWinProbability({ cp: 5000 })).toBe(whiteWinProbability({ cp: 1000 }));
  });

  it("is decisive for mates and respects perspective", () => {
    expect(whiteWinProbability({ mateIn: 5, winner: "w" })).toBe(1);
    expect(winProbabilityFor({ mateIn: 5, winner: "w" }, "b")).toBe(0);
  });
});

describe("formatScore", () => {
  it("formats scores for display", () => {
    expect(formatScore({ cp: 135 })).toBe("+1.35");
    expect(formatScore({ cp: -40 })).toBe("−0.40");
    expect(formatScore({ cp: 0 })).toBe("0.00");
    expect(formatScore({ mateIn: 3, winner: "w" })).toBe("M3");
    expect(formatScore({ mateIn: 2, winner: "b" })).toBe("−M2");
    expect(formatScore({ mateIn: 0, winner: "w" })).toBe("1-0");
  });
});
