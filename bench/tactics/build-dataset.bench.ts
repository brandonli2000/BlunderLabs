/**
 * Build the unlabeled tactics dataset from real games and measure detector
 * cost. Run: `npm run tactics:dataset` (a few minutes: every game is analysed
 * at the app's default plan). Writes bench/tactics/dataset-v1.json.
 *
 * The output has NO labels. Labels are added by a person with /label.html,
 * following docs/tactics/labeling-guidelines.md.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { expect, it } from "vitest";
import lichess50 from "../fixtures/lichess-thibault-50.pgn?raw";
import { analysisEngineKey, analyzeGame, DEFAULT_PLAN } from "../../src/analysis/gameAnalysis";
import { parseGame, splitPgn } from "../../src/core/pgn";
import { bestCaptureOn } from "../../src/core/see";
import { UciEngine } from "../../src/engine/engine";
import { createNodeTransport } from "../../src/engine/nodeTransport";
import { DATASET_FORMAT, DATASET_VERSION, GUIDELINES_VERSION, itemsFromContexts, type TacticsDataset } from "../../src/tactics/dataset";
import { buildMoveContexts, detectPatterns, type MoveContext } from "../../src/tactics/index";
import { benchmarkGames } from "../workload";

const OUT = new URL("./dataset-v1.json", import.meta.url);

it("builds the unlabeled tactics dataset and measures detector cost", async () => {
  if (existsSync(OUT) && !process.env.OVERWRITE) {
    // Never clobber a file that may already carry human labels.
    throw new Error("bench/tactics/dataset-v1.json exists. Set OVERWRITE=1 to rebuild it (labels in it would be lost).");
  }
  const games = [...splitPgn(lichess50), ...benchmarkGames().map((g) => g.pgn)].map((pgn) => parseGame(pgn));
  const seen = new Set<string>();
  const engine = new UciEngine(createNodeTransport());
  const engineKey = analysisEngineKey(DEFAULT_PLAN.limits, DEFAULT_PLAN.refine);
  const contexts: MoveContext[] = [];

  for (const game of games) {
    const id = game.headers.GameId ? `lichess:${game.headers.GameId}` : (game.headers.Link ?? "?").replace(/^https:\/\/www\.chess\.com\/game\/(live|daily)\//, "chesscom:$1:");
    if (seen.has(id)) continue;
    seen.add(id);
    const analysis = await analyzeGame(engine, game, DEFAULT_PLAN);
    contexts.push(...buildMoveContexts(id, game, analysis));
  }
  engine.terminate();

  const items = itemsFromContexts(contexts, engineKey);
  const dataset: TacticsDataset = {
    format: DATASET_FORMAT,
    version: DATASET_VERSION,
    guidelinesVersion: GUIDELINES_VERSION,
    createdAt: new Date().toISOString(),
    source: `bench/fixtures/lichess-thibault-50.pgn + src/import/fixtures (Lichess and Chess.com public games, recorded 2026-11-08); ${seen.size} games; moves with expected-score loss ≥ 0.05; ${engineKey}`,
    labeler: null,
    items,
  };
  mkdirSync(new URL("./", import.meta.url), { recursive: true });
  writeFileSync(OUT, JSON.stringify(dataset, null, 1));

  // Cost and firing rates (no labels involved).
  const t0 = performance.now();
  const fired: Record<string, number> = { "hanging-piece": 0, "missed-capture": 0 };
  for (const item of items) for (const d of detectPatterns(item.context)) fired[d.detector]!++;
  const detectMs = performance.now() - t0;

  const t1 = performance.now();
  let seeCalls = 0;
  for (const c of contexts) {
    const reply = c.bestAfter;
    if (reply) {
      bestCaptureOn(c.fenAfter, reply.slice(2, 4));
      seeCalls++;
    }
  }
  const seeMs = performance.now() - t1;

  const bySplit = { dev: items.filter((i) => i.split === "dev").length, holdout: items.filter((i) => i.split === "holdout").length };
  const summary = {
    cpu: cpus()[0]?.model,
    node: process.version,
    games: seen.size,
    movesAnalysed: contexts.length,
    datasetItems: items.length,
    bySplit,
    fired,
    detectorMsPerItem: +(detectMs / items.length).toFixed(3),
    bestCaptureOnMsPerCall: +(seeMs / seeCalls).toFixed(3),
  };
  console.log(summary);
  writeFileSync(new URL("./build-summary.json", import.meta.url), JSON.stringify(summary, null, 2));
  expect(items.length).toBeGreaterThan(0);
});
