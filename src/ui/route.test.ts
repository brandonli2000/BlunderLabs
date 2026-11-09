import { describe, expect, it } from "vitest";
import { parseHash, routeHash } from "./route";

describe("hash routes", () => {
  it("round-trips game ids containing reserved characters, with and without a ply", () => {
    for (const id of ["lichess:0IdR4QNI", "chesscom:live:186809963000", "pgn:ab/cd#e f"]) {
      for (const ply of [null, 0, 37]) {
        expect(parseHash(routeHash({ view: "game", id, ply }))).toEqual({ view: "game", id, ply });
      }
    }
  });

  it("parses the mistakes view", () => {
    expect(parseHash("#/mistakes")).toEqual({ view: "mistakes" });
    expect(routeHash({ view: "mistakes" })).toBe("#/mistakes");
  });

  it("falls back to the library for unknown or malformed hashes", () => {
    expect(parseHash("")).toEqual({ view: "library" });
    expect(parseHash("#/nope")).toEqual({ view: "library" });
    expect(parseHash("#/game/%E0%A4%A")).toEqual({ view: "library" });
    expect(parseHash("#/game/x/abc")).toEqual({ view: "library" });
  });
});
