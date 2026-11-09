import { describe, expect, it } from "vitest";
import { classifyMove, gameAccuracy, moveAccuracy } from "./classify";

describe("classifyMove", () => {
  it("marks the engine move as best regardless of eval noise", () => {
    expect(classifyMove(0.6, 0.55, true)).toBe("best");
  });

  it("grades by expected-score loss at the threshold boundaries", () => {
    expect(classifyMove(0.5, 0.46, false)).toBe("good");
    expect(classifyMove(0.5, 0.45, false)).toBe("inaccuracy");
    expect(classifyMove(0.5, 0.4, false)).toBe("mistake");
    expect(classifyMove(0.5, 0.35, false)).toBe("blunder");
  });

  it("never penalizes a move that improved the eval", () => {
    expect(classifyMove(0.4, 0.6, false)).toBe("good");
  });
});

describe("accuracy", () => {
  it("is ~100 for no loss and drops with loss", () => {
    expect(moveAccuracy(0.5, 0.5)).toBeCloseTo(100, 0);
    expect(moveAccuracy(0.5, 0.4)).toBeLessThan(moveAccuracy(0.5, 0.45));
    expect(moveAccuracy(1, 0)).toBe(0);
  });

  it("game accuracy punishes a single disaster more than the arithmetic mean", () => {
    const accs = [100, 100, 100, 10];
    const arithmetic = accs.reduce((a, b) => a + b) / accs.length;
    expect(gameAccuracy(accs)!).toBeLessThan(arithmetic);
    expect(gameAccuracy([])).toBeNull();
    expect(gameAccuracy([0, 0])).toBe(1);
  });
});
