import type { MoveClass } from "../core/classify";

/** Conventional annotation glyphs for the classes we flag. */
export const CLASS_GLYPH: Partial<Record<MoveClass, string>> = {
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};

export const CLASS_LABEL: Record<MoveClass, string> = {
  best: "Best",
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
};

export function isFlagged(c: MoveClass): c is "inaccuracy" | "mistake" | "blunder" {
  return c === "inaccuracy" || c === "mistake" || c === "blunder";
}
