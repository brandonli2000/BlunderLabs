import { useEffect, useRef } from "react";
import type { MoveVerdict } from "../analysis/gameAnalysis";
import type { GameMove } from "../core/pgn";
import { CLASS_GLYPH, CLASS_LABEL } from "./annotations";

interface MoveListProps {
  startFen: string;
  moves: GameMove[];
  verdicts: MoveVerdict[] | null;
  ply: number;
  onSeek: (ply: number) => void;
}

export function MoveList({ startFen, moves, verdicts, ply, onSeek }: MoveListProps) {
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
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
    return (
      <button
        ref={active ? activeRef : undefined}
        className={`ml-move${active ? " ml-active" : ""}${cls ? ` ml-${cls}` : ""}`}
        onClick={() => onSeek(move.ply)}
        title={cls ? CLASS_LABEL[cls] : undefined}
      >
        {move.san}
        {glyph && <span className="ml-glyph">{glyph}</span>}
      </button>
    );
  };

  return (
    <ol className="move-list">
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
