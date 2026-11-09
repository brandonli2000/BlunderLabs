import { mkdirSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { expect, it } from "vitest";
import { UciEngine } from "../src/engine/engine";
import { createNodeTransport } from "../src/engine/nodeTransport";
import { formatReport, runBenchmarks } from "./workload";

// Run with `npm run bench`. Writes bench/results/node-<timestamp>.json.
it("benchmarks engine init, game analysis and import parsing (Node)", async () => {
  const rssBefore = process.memoryUsage().rss;
  const report = await runBenchmarks(() => new UciEngine(createNodeTransport()), (m) => console.log(m));
  const environment = {
    runtime: `node ${process.version}`,
    platform: `${platform()} ${release()} ${arch()}`,
    cpu: cpus()[0]?.model ?? "unknown",
    logicalCores: cpus().length,
    totalMemGB: +(totalmem() / 1024 ** 3).toFixed(1),
    rssBeforeMB: +(rssBefore / 1024 ** 2).toFixed(1),
    rssAfterMB: +(process.memoryUsage().rss / 1024 ** 2).toFixed(1),
    date: new Date().toISOString(),
  };
  console.log(formatReport(report));
  console.log(environment);

  mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
  const stamp = environment.date.replace(/[:.]/g, "-");
  writeFileSync(new URL(`./results/node-${stamp}.json`, import.meta.url), JSON.stringify({ environment, report }, null, 2));
  expect(report.analysis.length).toBeGreaterThan(0);
});
