/**
 * Analysis-strategy experiment: is a shallow pass + selective deepening
 * faster than uniform depth 14 without losing classification accuracy?
 *
 * Ground truth: uniform depth-18 analysis (stronger than any candidate, not
 * perfect). Candidates are measured on the same real games and compared move
 * by move against it. Run: `npm run bench:strategy` (tens of minutes; the
 * depth-18 reference is cached in bench/results/reference-d18.json).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { expect, it } from "vitest";
import lichess50 from "./fixtures/lichess-thibault-50.pgn?raw";
import { analyzeGame, ENGINE_ID, type GameAnalysis, type RefinePlan } from "../src/analysis/gameAnalysis";
import { parseGame, splitPgn, type ParsedGame } from "../src/core/pgn";
import type { MoveClass } from "../src/core/classify";
import { UciEngine, type SearchLimits } from "../src/engine/engine";
import { createNodeTransport } from "../src/engine/nodeTransport";
import { benchmarkGames } from "./workload";

interface Strategy {
  name: string;
  limits: SearchLimits;
  refine: RefinePlan | null;
}

const REFERENCE: Strategy = { name: "uniform d18 (reference)", limits: { depth: 18 }, refine: null };
const CANDIDATES: Strategy[] = [
  { name: "uniform d14 (current)", limits: { depth: 14 }, refine: null },
  { name: "uniform d12", limits: { depth: 12 }, refine: null },
  { name: "uniform d10", limits: { depth: 10 }, refine: null },
  { name: "d10 → d14 @ loss≥0.03", limits: { depth: 10 }, refine: { depth: 14, minLoss: 0.03 } },
  { name: "d10 → d14 @ loss≥0.02", limits: { depth: 10 }, refine: { depth: 14, minLoss: 0.02 } },
  { name: "d10 → d16 @ loss≥0.03", limits: { depth: 10 }, refine: { depth: 16, minLoss: 0.03 } },
];

const RESULTS = new URL("./results/", import.meta.url);
const REFERENCE_CACHE = new URL("./results/reference-d18.json", import.meta.url);

type Verdicts = { cls: MoveClass; loss: number }[];
interface Run {
  verdicts: Verdicts;
  ms: number;
  searches: number;
}

function games(): { id: string; game: ParsedGame }[] {
  const lichess = splitPgn(lichess50).map((pgn) => parseGame(pgn));
  const fixtures = benchmarkGames().map((g) => parseGame(g.pgn));
  return [...lichess, ...fixtures]
    .map((game) => ({ id: game.headers.GameId ?? game.headers.Link ?? game.headers.Site ?? "?", game }))
    .filter((g, i, all) => all.findIndex((o) => o.id === g.id) === i);
}

function summarize(a: GameAnalysis): Run {
  return {
    verdicts: a.moves.map((m) => ({ cls: m.classification, loss: Math.max(0, m.winBefore - m.winAfter) })),
    ms: a.durationMs,
    searches: a.positions.length + a.refinedPositions,
  };
}

async function runStrategy(strategy: Strategy, list: { id: string; game: ParsedGame }[], cached: Record<string, Run> = {}) {
  const engine = new UciEngine(createNodeTransport());
  const runs: Record<string, Run> = {};
  for (const [i, { id, game }] of list.entries()) {
    if (cached[id]) {
      runs[id] = cached[id];
      continue;
    }
    runs[id] = summarize(await analyzeGame(engine, game, { limits: strategy.limits, refine: strategy.refine }));
    if (i % 10 === 0) console.log(`${strategy.name}: ${i + 1}/${list.length}`);
  }
  engine.terminate();
  return runs;
}

const SEVERITY: Record<MoveClass, number> = { best: 0, good: 0, inaccuracy: 1, mistake: 2, blunder: 3 };

function compare(candidate: Record<string, Run>, reference: Record<string, Run>) {
  let moves = 0;
  let sameClass = 0;
  let sameSeverity = 0;
  let absLossErr = 0;
  const counts = { tp2: 0, fp2: 0, fn2: 0, tp1: 0, fp1: 0, fn1: 0 }; // ≥mistake (2) and ≥inaccuracy (1)
  let ms = 0;
  let searches = 0;
  for (const [id, ref] of Object.entries(reference)) {
    const cand = candidate[id]!;
    ms += cand.ms;
    searches += cand.searches;
    ref.verdicts.forEach((r, i) => {
      const c = cand.verdicts[i]!;
      moves++;
      if (c.cls === r.cls) sameClass++;
      if (SEVERITY[c.cls] === SEVERITY[r.cls]) sameSeverity++;
      absLossErr += Math.abs(c.loss - r.loss);
      for (const level of [1, 2] as const) {
        const predicted = SEVERITY[c.cls] >= level;
        const actual = SEVERITY[r.cls] >= level;
        if (predicted && actual) counts[`tp${level}`]++;
        else if (predicted) counts[`fp${level}`]++;
        else if (actual) counts[`fn${level}`]++;
      }
    });
  }
  const pr = (tp: number, fp: number, fn: number) => ({
    precision: tp / Math.max(1, tp + fp),
    recall: tp / Math.max(1, tp + fn),
    support: tp + fn,
  });
  return {
    moves,
    ms,
    searches,
    classAgreement: sameClass / moves,
    severityAgreement: sameSeverity / moves,
    meanAbsLossErrorPct: (100 * absLossErr) / moves,
    mistakeOrWorse: pr(counts.tp2, counts.fp2, counts.fn2),
    inaccuracyOrWorse: pr(counts.tp1, counts.fp1, counts.fn1),
  };
}

it("compares analysis strategies against a depth-18 reference", async () => {
  const list = games();
  console.log(`${list.length} games, ${list.reduce((s, g) => s + g.game.moves.length, 0)} moves`);

  mkdirSync(RESULTS, { recursive: true });
  const cache = existsSync(REFERENCE_CACHE)
    ? (JSON.parse(readFileSync(REFERENCE_CACHE, "utf8")) as { engine: string; runs: Record<string, Run> })
    : null;
  const reference = await runStrategy(REFERENCE, list, cache?.engine === ENGINE_ID ? cache.runs : {});
  writeFileSync(REFERENCE_CACHE, JSON.stringify({ engine: ENGINE_ID, depth: 18, runs: reference }));

  const rows = [];
  for (const strategy of CANDIDATES) {
    const runs = await runStrategy(strategy, list);
    rows.push({ strategy: strategy.name, ...compare(runs, reference) });
    console.log(rows.at(-1));
  }
  const environment = { node: process.version, cpu: cpus()[0]?.model, engine: ENGINE_ID, date: new Date().toISOString() };
  const stamp = environment.date.replace(/[:.]/g, "-");
  writeFileSync(new URL(`./strategy-${stamp}.json`, RESULTS), JSON.stringify({ environment, games: list.length, rows }, null, 2));
  expect(rows.length).toBe(CANDIDATES.length);
});
