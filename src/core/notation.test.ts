import { describe, expect, it } from "vitest";
import { numberedSans } from "./notation";

describe("numberedSans", () => {
  it("numbers a line starting with White", () => {
    expect(numberedSans("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", ["e4", "e5", "Nf3"])).toEqual([
      "1.e4",
      "e5",
      "2.Nf3",
    ]);
  });

  it("uses an ellipsis when the line starts with Black, from the FEN move number", () => {
    expect(numberedSans("4k3/8/8/8/8/8/8/4K3 b - - 3 12", ["Kd7", "Kd2", "Ke6"])).toEqual(["12…Kd7", "13.Kd2", "Ke6"]);
  });
});
