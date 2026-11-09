import { describe, expect, it } from "vitest";
import { UciEngine } from "./engine";
import { createNodeTransport } from "./nodeTransport";

describe("createNodeTransport", () => {
  it("supports several engine instances in one process (regression)", async () => {
    for (let i = 0; i < 3; i++) {
      const engine = new UciEngine(createNodeTransport());
      const result = await engine.search("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", { depth: 4 });
      expect(result.bestMove).toBe("a1a8");
      engine.terminate();
    }
  });
});
