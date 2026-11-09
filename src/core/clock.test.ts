import { describe, expect, it } from "vitest";
import { fixture } from "../test/fakeFetch";
import { computeGameClock, formatClock, formatSpent, parseClockComment, parseTimeControl, timeClassOf } from "./clock";
import { parseGame, splitPgn } from "./pgn";

describe("parseTimeControl", () => {
  it("reads live, increment, fractional increment, daily and untimed formats", () => {
    expect(parseTimeControl("300+3")).toEqual({ kind: "live", initialMs: 300_000, incrementMs: 3000 });
    expect(parseTimeControl("180")).toEqual({ kind: "live", initialMs: 180_000, incrementMs: 0 });
    expect(parseTimeControl("60+0.5")).toEqual({ kind: "live", initialMs: 60_000, incrementMs: 500 });
    expect(parseTimeControl("1/259200")).toEqual({ kind: "daily", secondsPerMove: 259_200 });
    expect(parseTimeControl("-")).toEqual({ kind: "untimed" });
  });

  it("returns null for missing or unknown formats", () => {
    expect(parseTimeControl(undefined)).toBeNull();
    expect(parseTimeControl("?")).toBeNull();
    expect(parseTimeControl("40/7200:3600")).toBeNull(); // multi-period FIDE style: not supported yet
  });
});

describe("parseClockComment", () => {
  it("parses whole seconds, tenths and hours", () => {
    expect(parseClockComment(" [%clk 0:05:00] ")).toBe(300_000);
    expect(parseClockComment("[%clk 0:02:58.7]")).toBe(178_700);
    expect(parseClockComment("[%clk 1:30:05]")).toBe(5_405_000);
    expect(parseClockComment("[%eval 0.3] [%clk 0:00:09.1] nice")).toBe(9_100);
  });

  it("ignores comments without a valid clock", () => {
    expect(parseClockComment(undefined)).toBeNull();
    expect(parseClockComment("good move")).toBeNull();
    expect(parseClockComment("[%clk 0:75:00]")).toBeNull();
    expect(parseClockComment("[%emt 0:00:05]")).toBeNull();
  });
});

const W = "w" as const;
const B = "b" as const;
const live = (initialS: number, incS: number) => ({ kind: "live" as const, initialMs: initialS * 1000, incrementMs: incS * 1000 });

describe("computeGameClock", () => {
  it("returns null when no move has a clock", () => {
    expect(computeGameClock([{ color: W, clockMs: null }], live(60, 0))).toBeNull();
  });

  it("measures spent time with increment, leaving each side's first move unmeasured", () => {
    // 300+3: White thinks 1 s on move 2 (300 − 1 + 3 = 302), Black thinks 10 s (300 − 10 + 3 = 293).
    const clock = computeGameClock(
      [
        { color: W, clockMs: 300_000 },
        { color: B, clockMs: 300_000 },
        { color: W, clockMs: 302_000 },
        { color: B, clockMs: 293_000 },
      ],
      live(300, 3),
    )!;
    expect(clock.resolutionMs).toBe(1000);
    expect(clock.moves.map((m) => m.gap)).toEqual(["first-move", "first-move", null, null]);
    expect(clock.moves[2]).toMatchObject({ remainingMs: 302_000, spentMs: 1000, spentSource: "measured" });
    expect(clock.moves[3]).toMatchObject({ spentMs: 10_000, spentSource: "measured" });
  });

  it("marks values as estimated when the increment is unknown", () => {
    const clock = computeGameClock(
      [
        { color: W, clockMs: 60_000 },
        { color: B, clockMs: 60_000 },
        { color: W, clockMs: 55_500 },
      ],
      null,
    )!;
    expect(clock.resolutionMs).toBe(100);
    expect(clock.moves[2]).toMatchObject({ spentMs: 4500, spentSource: "estimated" });
  });

  it("reports gaps for missing clocks instead of guessing", () => {
    const clock = computeGameClock(
      [
        { color: W, clockMs: 60_000 },
        { color: B, clockMs: 60_000 },
        { color: W, clockMs: null },
        { color: B, clockMs: 58_000 },
        { color: W, clockMs: 50_000 }, // previous own clock missing → can't measure
        { color: B, clockMs: 57_000 },
      ],
      live(60, 0),
    )!;
    expect(clock.moves.map((m) => m.gap)).toEqual(["first-move", "first-move", "missing-clock", null, "missing-clock", null]);
    expect(clock.moves[2]!.remainingMs).toBeNull();
  });

  it("flags time added by the opponent as inconsistent, but clamps rounding noise to zero", () => {
    const clock = computeGameClock(
      [
        { color: W, clockMs: 60_000 },
        { color: B, clockMs: 60_000 },
        { color: W, clockMs: 75_000 }, // +15 s granted by the opponent (Lichess "moretime")
        { color: B, clockMs: 59_000 },
        { color: W, clockMs: 75_900 }, // whole-second rounding can't explain −0.9 s at 100 ms resolution…
      ],
      live(60, 0),
    )!;
    expect(clock.moves[2]!.gap).toBe("inconsistent");
    expect(clock.moves[4]!.gap).toBe("inconsistent"); // …so it's flagged rather than clamped

    const coarse = computeGameClock(
      [
        { color: W, clockMs: 60_000 },
        { color: B, clockMs: 60_000 },
        { color: W, clockMs: 61_000 }, // 1 s noise at 1 s resolution, 0 increment
      ],
      live(60, 0),
    )!;
    expect(coarse.moves[2]).toMatchObject({ spentMs: 0, gap: null });
  });

  it("does not compute think time for correspondence games", () => {
    const clock = computeGameClock(
      [
        { color: W, clockMs: 259_200_000 },
        { color: B, clockMs: 259_200_000 },
        { color: W, clockMs: 200_000_000 },
      ],
      { kind: "daily", secondsPerMove: 259_200 },
    )!;
    expect(clock.moves.every((m) => m.spentMs === null && m.gap === "correspondence")).toBe(true);
  });
});

describe("clocks from real PGNs", () => {
  it("Lichess (whole seconds, 300+3): every move gets its clock; measured times are non-negative", () => {
    const game = parseGame(splitPgn(fixture("lichess-thibault-3.pgn"))[0]!);
    expect(game.moves.every((m) => m.clockMs !== null)).toBe(true);
    expect(game.moves[2]!.clockMs).toBe(302_000); // 2. f4 {[%clk 0:05:02]}
    const clock = computeGameClock(game.moves, parseTimeControl(game.headers.TimeControl))!;
    expect(clock.resolutionMs).toBe(1000);
    // 2. f4: 300 − 302 + 3 = 1 s
    expect(clock.moves[2]).toMatchObject({ spentMs: 1000, spentSource: "measured" });
    expect(clock.moves.slice(2).every((m) => m.spentMs !== null && m.spentMs >= 0)).toBe(true);
  });

  it("Chess.com (tenths, no increment)", () => {
    const pgn = (JSON.parse(fixture("chesscom-month.json")) as { games: { pgn: string }[] }).games[2]!.pgn;
    const game = parseGame(pgn);
    const clock = computeGameClock(game.moves, parseTimeControl(game.headers.TimeControl))!;
    expect(clock.timeControl).toEqual({ kind: "live", initialMs: 180_000, incrementMs: 0 });
    expect(clock.resolutionMs).toBe(100);
    // 2. c4 {[%clk 0:02:59.5]} after 1. d4 {[%clk 0:03:00]} → 0.5 s
    expect(clock.moves[2]).toMatchObject({ remainingMs: 179_500, spentMs: 500 });
  });

  it("keeps clocks attached to the right move through repetitions and variations", () => {
    const game = parseGame(
      "1. Nf3 {[%clk 0:01:00]} Nf6 {[%clk 0:01:00]} 2. Ng1 {[%clk 0:00:59]} Ng8 {[%clk 0:00:58]} " +
        "3. Nf3 {[%clk 0:00:57]} (3. e4 {[%clk 0:00:01]}) 3... Nf6 {[%clk 0:00:56]} *",
    );
    expect(game.moves.map((m) => m.clockMs)).toEqual([60_000, 60_000, 59_000, 58_000, 57_000, 56_000]);
  });
});

describe("formatting", () => {
  it("formats clocks with tenths only when low and available", () => {
    expect(formatClock(299_400, 1000)).toBe("4:59");
    expect(formatClock(3_723_000, 1000)).toBe("1:02:03");
    expect(formatClock(8_400, 100)).toBe("0:08.4");
    expect(formatClock(8_400, 1000)).toBe("0:08");
  });

  it("formats spent time compactly and marks estimates", () => {
    expect(formatSpent(400, 100, "measured")).toBe("0.4s");
    expect(formatSpent(12_000, 1000, "measured")).toBe("12s");
    expect(formatSpent(65_000, 1000, "estimated")).toBe("~1m05s");
  });
});

describe("timeClassOf (Lichess estimated duration: initial + 40 x increment)", () => {
  const cls = (tag: string | undefined) => timeClassOf(parseTimeControl(tag));

  it("splits at 3, 8 and 25 minutes of estimated duration", () => {
    expect(cls("60+0")).toBe("bullet");
    expect(cls("179+0")).toBe("bullet");
    expect(cls("180+0")).toBe("blitz");
    expect(cls("479+0")).toBe("blitz");
    expect(cls("480+0")).toBe("rapid");
    expect(cls("1499+0")).toBe("rapid");
    expect(cls("1500+0")).toBe("classical");
    expect(cls("5400+30")).toBe("classical");
  });

  it("counts the increment as 40 extra moves", () => {
    expect(cls("120+1")).toBe("bullet"); // 160 s
    expect(cls("120+2")).toBe("blitz"); // 200 s
    expect(cls("300+3")).toBe("blitz"); // 420 s
    expect(cls("300+5")).toBe("rapid"); // 500 s
    expect(cls("0+1")).toBe("bullet"); // 40 s: zero start time still classifies
    expect(cls("300+2.5")).toBe("blitz"); // fractional increment, 400 s
  });

  it("calls daily games correspondence, and untimed or unreadable controls unknown", () => {
    expect(cls("1/259200")).toBe("correspondence");
    expect(cls("-")).toBe("unknown");
    expect(cls(undefined)).toBe("unknown");
    expect(cls("?")).toBe("unknown");
    expect(cls("40/7200:3600")).toBe("unknown");
    expect(timeClassOf(null)).toBe("unknown");
  });
});
