import { useEffect, useRef } from "react";
import type { MoveVerdict } from "../analysis/gameAnalysis";
import { formatClock, formatSpent, type GameClock, type MoveTime } from "../core/clock";
import type { GameMove } from "../core/pgn";
import { CLASS_GLYPH, CLASS_LABEL } from "./annotations";

interface MoveListProps {
  startFen: string;
  moves: GameMove[];
  verdicts: MoveVerdict[] | null;
  clock: GameClock | null;
  ply: number;
  onSeek: (ply: number) => void;
}

const GAP_TEXT = {
  "first-move": "first move: clocks not running yet",
  "missing-clock": "clock not recorded",
  inconsistent: "clock went up (time added?): not measurable",
  correspondence: "correspondence game",
} as const;

export function MoveList({ startFen, moves, verdicts, clock, ply, onSeek }: MoveListProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Keep the active move visible by scrolling the list only (never the page).
  useEffect(() => {
    const list = listRef.current;
    const active = activeRef.current;
    if (!list || !active) return;
    const top = active.offsetTop - list.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + active.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top + active.offsetHeight - list.clientHeight;
    }
  }, [ply]);

  // Games from a FEN may start on any move number and with Black to move.
  const firstNumber = Number(startFen.split(" ")[5]) || 1;
  const offset = moves[0]?.color === "b" ? 1 : 0;
  const rows: { number: number; white?: GameMove; black?: GameMove }[] = [];
  for (const move of moves) {
    const index = Math.floor((move.ply - 1 + offset) / 2);
    rows[index] ??= { number: firstNumber + index };
    rows[index]![move.color === "w" ? "white" : "black"] = move;
  }

  const cell = (move: GameMove | undefined) => {
    if (!move) return <span className="ml-move ml-empty">…</span>;
    const verdict = verdicts?.[move.ply - 1];
    const cls = verdict?.classification;
    const glyph = cls ? CLASS_GLYPH[cls] : undefined;
    const active = move.ply === ply;
    const time = clock?.moves[move.ply - 1];
    return (
      <button
        ref={active ? activeRef : undefined}
        className={`ml-move${active ? " ml-active" : ""}${cls ? ` ml-${cls}` : ""}`}
        onClick={() => onSeek(move.ply)}
        title={[cls ? CLASS_LABEL[cls] : null, time && clock ? timeTitle(time, clock.resolutionMs) : null].filter(Boolean).join(" · ") || undefined}
      >
        <span className="ml-san">
          {move.san}
          {glyph && <span className="ml-glyph">{glyph}</span>}
        </span>
        {time?.spentMs != null && clock && (
          <span className={`ml-time${time.spentSource === "estimated" ? " ml-time-est" : ""}`}>
            {formatSpent(time.spentMs, clock.resolutionMs, time.spentSource!)}
          </span>
        )}
      </button>
    );
  };

  return (
    <ol className="move-list" ref={listRef}>
      {rows.filter(Boolean).map((row) => (
        <li key={row.number} className="ml-row">
          <span className="ml-num">{row.number}.</span>
          {cell(row.white)}
          {cell(row.black)}
        </li>
      ))}
    </ol>
  );
}

function timeTitle(time: MoveTime, resolutionMs: number): string {
  const parts: string[] = [];
  if (time.remainingMs !== null) parts.push(`clock ${formatClock(time.remainingMs, resolutionMs)}`);
  if (time.spentMs !== null) {
    parts.push(`${time.spentSource === "estimated" ? "≈" : ""}${(time.spentMs / 1000).toFixed(resolutionMs < 1000 ? 1 : 0)} s on this move`);
    if (time.spentSource === "estimated") parts.push("increment unknown, assumed 0");
    else if (resolutionMs === 1000) parts.push("±1 s (clock recorded in whole seconds)");
  }
  if (time.gap) parts.push(GAP_TEXT[time.gap]);
  return parts.join(" · ");
}
