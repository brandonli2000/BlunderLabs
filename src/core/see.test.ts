import { describe, expect, it } from "vitest";
import { bestCaptureOn, nullMoveFen, pieceOn, seeCapture } from "./see";

// Positions are constructed so each test isolates one rule. Values: P1 N3 B3 R5 Q9.
describe("seeCapture: basic exchanges", () => {
  it("an undefended piece is simply won", () => {
    expect(seeCapture("n3k3/8/8/8/8/8/8/R3K3 w - - 0 1", { from: "a1", to: "a8" })).toBe(3);
  });

  it("capturing a pawn defended by a pawn with a rook loses the exchange", () => {
    expect(seeCapture("4k3/8/2p5/3p4/8/8/8/3RK3 w - - 0 1", { from: "d1", to: "d5" })).toBe(-4);
  });

  it("knight for knight is even", () => {
    expect(seeCapture("4k3/8/4p3/3n4/8/2N5/8/4K3 w - - 0 1", { from: "c3", to: "d5" })).toBe(0);
  });

  it("returns null for non-captures, illegal moves and bad FENs", () => {
    expect(seeCapture("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", { from: "a1", to: "a5" })).toBeNull();
    expect(seeCapture("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", { from: "a1", to: "h8" })).toBeNull();
    expect(seeCapture("garbage", { from: "a1", to: "a8" })).toBeNull();
  });
});

describe("seeCapture: sequences and the right to stop", () => {
  it("the defender stops recapturing when continuing would lose more", () => {
    // Rxd3 wins a knight; Qxd3 would be answered by cxd3, so Black stops: +3.
    expect(seeCapture("4k3/8/8/3q4/8/3n4/2P5/3RK3 w - - 0 1", { from: "d1", to: "d3" })).toBe(3);
  });

  it("x-ray: a rook behind a rook joins the exchange once the line opens", () => {
    // Rxd5 Rxd5 Rxd5: White ends a pawn up.
    expect(seeCapture("3rk3/8/8/3p4/8/8/3R4/3RK3 w - - 0 1", { from: "d2", to: "d5" })).toBe(1);
    // Same without the back rook: Rxd5 Rxd5 loses the exchange for a pawn.
    expect(seeCapture("3rk3/8/8/3p4/8/8/3R4/4K3 w - - 0 1", { from: "d2", to: "d5" })).toBe(-4);
  });

  it("x-ray through a queen on a diagonal", () => {
    // d5 is defended by the e6 pawn; White has a queen (c4) in front of a bishop (b3) on the diagonal.
    // The queen must capture first: Qxd5 exd5 Bxd5 → +1 − 9 + 1 = −7.
    expect(seeCapture("4k3/8/4p3/3p4/2Q5/1B6/8/4K3 w - - 0 1", { from: "c4", to: "d5" })).toBe(-8 + 1);
  });
});

describe("seeCapture: legality", () => {
  it("a defender pinned to its king cannot recapture", () => {
    // The f6 knight defends d5 but is pinned on the 6th rank by the a6 rook.
    expect(seeCapture("8/8/R4n1k/3p4/8/2N5/8/4K3 w - - 0 1", { from: "c3", to: "d5" })).toBe(1);
    // Without the pin, Nxd5 Nxd5 loses a knight for a pawn.
    expect(seeCapture("8/8/5n1k/3p4/8/2N5/8/4K3 w - - 0 1", { from: "c3", to: "d5" })).toBe(-2);
  });

  it("the king may only recapture on an undefended square", () => {
    // Qxf7+: the bishop covers f7, so Kxf7 is illegal and the pawn is won.
    expect(seeCapture("4k3/5p2/8/8/2B5/5Q2/8/4K3 w - - 0 1", { from: "f3", to: "f7" })).toBe(1);
    // Without the bishop, Kxf7 wins the queen.
    expect(seeCapture("4k3/5p2/8/8/8/5Q2/8/4K3 w - - 0 1", { from: "f3", to: "f7" })).toBe(-8);
  });

  it("counts promotion gains, including when the promoted piece is recaptured", () => {
    // exd8=Q+ Kxd8: White gave a pawn and got a rook → +4.
    expect(seeCapture("3rk3/4P3/8/8/8/8/8/4K3 w - - 0 1", { from: "e7", to: "d8" })).toBe(4);
    // Underpromotion is evaluated as asked: exd8=N, and the king recaptures → 5 + 2 − 3 = +4 as well.
    expect(seeCapture("3rk3/4P3/8/8/8/8/8/4K3 w - - 0 1", { from: "e7", to: "d8", promotion: "n" })).toBe(4);
  });

  it("handles en passant as the first capture", () => {
    expect(seeCapture("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2", { from: "e5", to: "d6" })).toBe(1);
  });
});

describe("bestCaptureOn", () => {
  it("compares every first capturer and keeps the best", () => {
    // d5 is defended by the b6 knight. cxd5 Nxd5 Qxd5 nets a pawn; starting with the queen loses it.
    const fen = "4k3/8/1n6/3p4/2P5/8/8/3QK3 w - - 0 1";
    expect(seeCapture(fen, { from: "d1", to: "d5" })).toBe(-5);
    expect(bestCaptureOn(fen, "d5")).toMatchObject({ gain: 1, san: "cxd5" });
  });

  it("a second attacker protects the first capturer's square", () => {
    // Bxf7+ is safe because the f3 queen then guards f7 along the file, so the king can't recapture.
    expect(bestCaptureOn("4k3/5p2/8/8/2B5/5Q2/8/4K3 w - - 0 1", "f7")?.gain).toBe(1);
  });

  it("finds en passant and returns null when nothing can capture", () => {
    expect(bestCaptureOn("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2", "d6")).toMatchObject({ gain: 1, san: "exd6" });
    expect(bestCaptureOn("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", "h8")).toBeNull();
  });
});

describe("nullMoveFen", () => {
  it("passes the move and clears en passant rights", () => {
    expect(nullMoveFen("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2")).toBe("4k3/8/8/3pP3/8/8/8/4K3 b - - 0 2");
  });

  it("refuses when the side to move is in check", () => {
    expect(nullMoveFen("4k3/8/8/8/8/8/8/4K2r w - - 0 1")).toBeNull();
  });

  it("reads pieces", () => {
    expect(pieceOn("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", "a1")).toEqual({ color: "w", type: "r" });
    expect(pieceOn("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", "a2")).toBeNull();
  });
});
