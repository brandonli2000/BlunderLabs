import { describe, expect, it } from "vitest";
import { playMove } from "../core/moves";
import { sideToMove } from "../core/types";
import { detectHangingPiece } from "./hangingPiece";
import { detectPatterns } from "./index";
import { detectMissedCapture } from "./missedCapture";
import type { MoveContext } from "./types";

/**
 * A detector context for `uci` played in `fenBefore`, with scripted engine
 * evidence. Positions are constructed so each test isolates one rule; they
 * are TEST examples and are never part of the evaluation dataset.
 */
function ctx(fenBefore: string, uci: string, engine: { bestBefore?: string; bestAfter?: string; loss?: number }): MoveContext {
  const played = playMove(fenBefore, uci.slice(0, 2), uci.slice(2, 4));
  if (!played) throw new Error(`illegal test move ${uci}`);
  return {
    gameId: "test",
    ply: 1,
    moveLabel: sideToMove(fenBefore) === "w" ? "1." : "1…",
    mover: sideToMove(fenBefore),
    fenBefore,
    fenAfter: played.fenAfter,
    move: { san: played.san, uci: played.uci },
    bestBefore: engine.bestBefore ?? null,
    lineBefore: engine.bestBefore ? [engine.bestBefore] : [],
    bestAfter: engine.bestAfter ?? null,
    lineAfter: engine.bestAfter ? [engine.bestAfter] : [],
    loss: engine.loss ?? 0.3,
    classification: "blunder",
  };
}

describe("hanging piece", () => {
  it("created: the move puts a piece where it can be won", () => {
    // Nc4 walks into the d5 pawn.
    const d = detectHangingPiece(ctx("4k3/8/8/3p4/8/8/3N4/4K3 w - - 0 1", "d2c4", { bestAfter: "d5c4" }));
    expect(d).toMatchObject({ detector: "hanging-piece", subtype: "created", square: "c4", piece: "n", materialGain: 3 });
    expect(d!.explanation).toBe("After 1.Nc4, the knight on c4 can be won: dxc4 nets 3 by exchange count.");
  });

  it("created: the move removes a defender", () => {
    // The c3 knight is defended only by the b2 pawn; b4 abandons it, and Bxc3+ wins it.
    const d = detectHangingPiece(ctx("4k3/8/8/4b3/8/2N5/1P6/4K3 w - - 0 1", "b2b4", { bestAfter: "e5c3" }));
    expect(d).toMatchObject({ subtype: "created", square: "c3", materialGain: 3 });
  });

  it("unaddressed: the piece was already losable and the move ignored it", () => {
    const d = detectHangingPiece(ctx("4k3/8/8/3p4/2N5/8/8/4K3 w - - 0 1", "e1e2", { bestAfter: "d5c4" }));
    expect(d).toMatchObject({ subtype: "unaddressed", square: "c4", evidence: expect.objectContaining({ exposureBefore: 3 }) });
  });

  it("losing exchange: the player starts an exchange that loses material", () => {
    // Rxd5 grabs a pawn defended by the c6 pawn.
    const d = detectHangingPiece(ctx("4k3/8/2p5/3p4/8/8/8/3RK3 w - - 0 1", "d1d5", { bestAfter: "c6d5" }));
    expect(d).toMatchObject({ subtype: "losing-exchange", square: "d5", piece: "r", materialGain: 5 });
  });

  it("unknown-before: the player was in check, so there's no legal null move to compare with", () => {
    // Ne4 blocks the check but drops the knight to the rook.
    const d = detectHangingPiece(ctx("4k3/4r3/8/8/8/8/3N4/4K3 w - - 0 1", "d2e4", { bestAfter: "e7e4" }));
    expect(d).toMatchObject({ subtype: "unknown-before", square: "e4" });
  });

  it("does not fire on fair trades, defended pieces, quiet replies or small losses", () => {
    // Nxd5 exd5: knight for knight.
    expect(detectHangingPiece(ctx("4k3/8/4p3/3n4/8/2N5/8/4K3 w - - 0 1", "c3d5", { bestAfter: "e6d5" }))).toBeNull();
    // Bd4 is attacked by the knight but defended by the e3 pawn: Nxd4 exd4 is even.
    expect(detectHangingPiece(ctx("4k3/8/1n6/8/8/4P3/8/2B1K3 w - - 0 1", "c1d2", { bestAfter: "b6d5" }))).toBeNull();
    // The engine's reply isn't a capture.
    expect(detectHangingPiece(ctx("4k3/8/8/3p4/8/8/3N4/4K3 w - - 0 1", "d2c4", { bestAfter: "e8e7" }))).toBeNull();
    // The engine says the move barely mattered (e.g. a sound sacrifice).
    expect(detectHangingPiece(ctx("4k3/8/8/3p4/8/8/3N4/4K3 w - - 0 1", "d2c4", { bestAfter: "d5c4", loss: 0.02 }))).toBeNull();
  });

  it("a mate isn't reported as a hanging piece (Scholar's mate: Qxf7# wins only a pawn by count)", () => {
    const before = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3";
    expect(detectHangingPiece(ctx(before, "g8f6", { bestAfter: "h5f7" }))).toBeNull();
  });
});

describe("missed capture", () => {
  it("still-available: the engine's best move won material and the player played something else", () => {
    const d = detectMissedCapture(ctx("4k3/8/2n5/8/8/8/8/2R1K3 w - - 0 1", "e1e2", { bestBefore: "c1c6" }));
    expect(d).toMatchObject({ detector: "missed-capture", subtype: "still-available", square: "c6", piece: "n", materialGain: 3 });
    expect(d!.explanation).toBe("Before 1.Ke2, Rxc6 would have won the knight on c6 (nets 3 by exchange count), and it was the engine's choice.");
  });

  it("gone: the move itself spoiled the capture", () => {
    // Bc4 blocks the rook's file.
    const d = detectMissedCapture(ctx("4k3/8/2n5/8/8/8/8/2R1KB2 w - - 0 1", "f1c4", { bestBefore: "c1c6" }));
    expect(d).toMatchObject({ subtype: "gone" });
  });

  it("taking the same piece with a different attacker counts as taking the opportunity", () => {
    const fen = "4k3/8/2n5/1B6/8/8/8/2R1K3 w - - 0 1"; // both Bb5 and Rc1 attack c6
    expect(detectMissedCapture(ctx(fen, "b5c6", { bestBefore: "c1c6" }))).toBeNull();
  });

  it("requires engine agreement and a real material gain", () => {
    const fen = "4k3/8/2n5/8/8/8/8/2R1K3 w - - 0 1";
    expect(detectMissedCapture(ctx(fen, "e1e2", { bestBefore: "e1d2" }))).toBeNull(); // engine preferred something else
    expect(detectMissedCapture(ctx(fen, "c1c6", { bestBefore: "c1c6" }))).toBeNull(); // played it
    expect(detectMissedCapture(ctx(fen, "e1e2", { bestBefore: "c1c6", loss: 0.01 }))).toBeNull(); // didn't matter
    // A knight defended by a pawn: Rxc6 bxc6 loses the exchange.
    expect(detectMissedCapture(ctx("4k3/1p6/2n5/8/8/8/8/2R1K3 w - - 0 1", "e1e2", { bestBefore: "c1c6" }))).toBeNull();
  });
});

describe("detectPatterns", () => {
  it("can report both patterns on one move", () => {
    // White ignores a free knight (Rxc6) and plays Nc4?? into the pawn.
    const fen = "4k3/8/2n5/3p4/8/8/3N4/2R1K3 w - - 0 1";
    const found = detectPatterns(ctx(fen, "d2c4", { bestBefore: "c1c6", bestAfter: "d5c4" }));
    expect(found.map((d) => d.detector).sort()).toEqual(["hanging-piece", "missed-capture"]);
  });
});
