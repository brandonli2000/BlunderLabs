import { describe, expect, it } from "vitest";
import { wilsonInterval } from "./stats";

describe("wilsonInterval", () => {
  it("matches reference values", () => {
    // Reference: 8/10 → [0.4902, 0.9433] (standard Wilson 95% values).
    const i = wilsonInterval(8, 10)!;
    expect(i.low).toBeCloseTo(0.4902, 3);
    expect(i.high).toBeCloseTo(0.9433, 3);
  });

  it("stays inside [0, 1] and has width even at 0/n and n/n", () => {
    const zero = wilsonInterval(0, 20)!;
    expect(zero.low).toBe(0);
    expect(zero.high).toBeGreaterThan(0.1);
    const all = wilsonInterval(20, 20)!;
    expect(all.high).toBe(1);
    expect(all.low).toBeLessThan(0.9); // 20/20 does NOT demonstrate ≥ 90% precision
  });

  it("narrows as n grows and handles n = 0", () => {
    const small = wilsonInterval(9, 10)!;
    const large = wilsonInterval(900, 1000)!;
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
    expect(wilsonInterval(0, 0)).toBeNull();
  });
});
