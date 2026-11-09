import type { GameAnalysis } from "../analysis/gameAnalysis";
import { whiteWinProbability } from "../core/evaluation";
import { isFlagged } from "./annotations";

interface EvalGraphProps {
  analysis: GameAnalysis;
  ply: number;
  onSeek: (ply: number) => void;
}

const H = 100;

/** White's expected score across the game; flagged moves are marked on the curve. */
export function EvalGraph({ analysis, ply, onSeek }: EvalGraphProps) {
  const n = Math.max(1, analysis.positions.length - 1);
  const pts = analysis.positions.map((p) => ({ x: p.ply, y: H * (1 - whiteWinProbability(p.score)) }));
  const line = pts.map((p) => `${p.x},${p.y.toFixed(2)}`).join(" ");
  const area = `0,${H} ${line} ${n},${H}`;

  const seek = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(Math.round(((e.clientX - rect.left) / rect.width) * n));
  };

  return (
    <svg
      className="eval-graph"
      viewBox={`0 0 ${n} ${H}`}
      preserveAspectRatio="none"
      onClick={seek}
      role="img"
      aria-label="Evaluation graph. Click to jump to a move."
    >
      <line x1={0} x2={n} y1={H / 2} y2={H / 2} className="eg-mid" vectorEffect="non-scaling-stroke" />
      <polygon points={area} className="eg-area" />
      <polyline points={line} className="eg-line" vectorEffect="non-scaling-stroke" />
      <line x1={ply} x2={ply} y1={0} y2={H} className="eg-cursor" vectorEffect="non-scaling-stroke" />
      {analysis.moves.map((m) =>
        isFlagged(m.classification) && m.classification !== "inaccuracy" ? (
          <line
            key={m.ply}
            x1={m.ply}
            x2={m.ply}
            y1={pts[m.ply]!.y}
            y2={pts[m.ply]!.y}
            className={`eg-dot eg-${m.classification}`}
            vectorEffect="non-scaling-stroke"
          />
        ) : null,
      )}
    </svg>
  );
}
