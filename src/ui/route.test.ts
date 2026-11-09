import { describe, expect, it } from "vitest";
import { parseHash, routeHash } from "./route";

describe("hash routes", () => {
  it("round-trips game ids containing reserved characters", () => {
    for (const id of ["lichess:0IdR4QNI", "chesscom:live:186809963000", "pgn:ab/cd#e f"]) {
      expect(parseHash(routeHash({ view: "game", id }))).toEqual({ view: "game", id });
    }
  });

  it("falls back to the library for unknown or malformed hashes", () => {
    expect(parseHash("")).toEqual({ view: "library" });
    expect(parseHash("#/nope")).toEqual({ view: "library" });
    expect(parseHash("#/game/%E0%A4%A")).toEqual({ view: "library" });
  });
});
