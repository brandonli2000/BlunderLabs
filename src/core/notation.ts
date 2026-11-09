import { sideToMove } from "./types";

/** "12…Nf6 13.Bxf7+ Ke7" style labels, numbered from the starting position. */
export function numberedSans(fen: string, sans: string[]): string[] {
  let moveNumber = Number(fen.split(" ")[5]) || 1;
  let color = sideToMove(fen);
  return sans.map((san, i) => {
    const label = color === "w" ? `${moveNumber}.${san}` : i === 0 ? `${moveNumber}…${san}` : san;
    if (color === "b") moveNumber++;
    color = color === "w" ? "b" : "w";
    return label;
  });
}
