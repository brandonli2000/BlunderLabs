import { useMemo } from "react";
import { piecesFromFen, squareCoords, type PieceType } from "../core/fen";
import type { Color } from "../core/types";

export interface BoardArrow {
  from: string;
  to: string;
  tone: "best" | "played";
}

interface BoardProps {
  fen: string;
  orientation: Color;
  lastMove?: { from: string; to: string } | null;
  arrows?: BoardArrow[];
  /** Square to mark with the classification of the move that landed there. */
  marker?: { square: string; tone: "inaccuracy" | "mistake" | "blunder"; label: string } | null;
}

// Interim piece rendering: Unicode glyphs with a text-presentation selector.
// An original BlunderLab piece set is planned (PROGRESS.md).
const GLYPHS: Record<PieceType, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const TEXT_PRESENTATION = "︎";
const FILES = "abcdefgh";

export function Board({ fen, orientation, lastMove, arrows = [], marker }: BoardProps) {
  const pieces = useMemo(() => piecesFromFen(fen), [fen]);

  /** Top-left corner of a square in board units for the current orientation. */
  const pos = (square: string) => {
    const { file, rank } = squareCoords(square);
    return orientation === "w" ? { x: file, y: 7 - rank } : { x: 7 - file, y: rank };
  };

  const squares = [];
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const square = `${FILES[file]}${rank + 1}`;
      const { x, y } = pos(square);
      const light = (file + rank) % 2 === 1;
      const highlighted = lastMove && (lastMove.from === square || lastMove.to === square);
      squares.push(
        <rect
          key={square}
          x={x}
          y={y}
          width={1}
          height={1}
          className={`sq ${light ? "sq-light" : "sq-dark"}${highlighted ? " sq-last" : ""}`}
        />,
      );
    }
  }

  const bottomRank = orientation === "w" ? "1" : "8";
  const leftFile = orientation === "w" ? "a" : "h";

  return (
    <svg className="board" viewBox="0 0 8 8" role="img" aria-label={`Chess position ${fen}`}>
      <defs>
        {(["best", "played"] as const).map((tone) => (
          <marker
            key={tone}
            id={`arrowhead-${tone}`}
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="2.4"
            markerHeight="2.4"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" className={`arrowhead arrow-${tone}`} />
          </marker>
        ))}
      </defs>
      {squares}
      {FILES.split("").map((f) => {
        const { x } = pos(`${f}${bottomRank}`);
        return (
          <text key={`f${f}`} x={x + 0.94} y={7.93} className="coord" textAnchor="end">
            {f}
          </text>
        );
      })}
      {[1, 2, 3, 4, 5, 6, 7, 8].map((r) => {
        const { y } = pos(`${leftFile}${r}`);
        return (
          <text key={`r${r}`} x={0.05} y={y + 0.22} className="coord">
            {r}
          </text>
        );
      })}
      {pieces.map((p) => {
        const { x, y } = pos(p.square);
        return (
          <text
            key={`${p.square}${p.color}${p.type}`}
            x={x + 0.5}
            y={y + 0.55}
            className={`piece piece-${p.color}`}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {GLYPHS[p.type] + TEXT_PRESENTATION}
          </text>
        );
      })}
      {arrows.map((a) => {
        const from = pos(a.from);
        const to = pos(a.to);
        const [x1, y1, x2, y2] = [from.x + 0.5, from.y + 0.5, to.x + 0.5, to.y + 0.5];
        // Stop short of the target centre so the head sits inside the square.
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        const shorten = 0.28;
        return (
          <line
            key={`${a.from}${a.to}${a.tone}`}
            x1={x1}
            y1={y1}
            x2={x2 - ((x2 - x1) / len) * shorten}
            y2={y2 - ((y2 - y1) / len) * shorten}
            className={`arrow arrow-${a.tone}`}
            markerEnd={`url(#arrowhead-${a.tone})`}
          />
        );
      })}
      {marker &&
        (() => {
          const { x, y } = pos(marker.square);
          return (
            <g className={`marker marker-${marker.tone}`} transform={`translate(${x + 0.86} ${y + 0.14})`}>
              <circle r={0.17} />
              <text textAnchor="middle" dominantBaseline="central">
                {marker.label}
              </text>
            </g>
          );
        })()}
    </svg>
  );
}
