import { UciEngine } from "../src/engine/engine";
import { createWorkerTransport } from "../src/engine/workerTransport";
import { formatReport, runBenchmarks } from "./workload";

// Dev-only page: `npm run dev`, open /bench.html, wait for "done".
// The report is also exposed as window.__benchResult for automation.
const out = document.getElementById("out")!;
const log = (msg: string) => {
  out.textContent += `${msg}\n`;
};

void (async () => {
  log(`userAgent: ${navigator.userAgent}`);
  log(`hardwareConcurrency: ${navigator.hardwareConcurrency}`);
  const report = await runBenchmarks(() => new UciEngine(createWorkerTransport()), log);
  log("");
  log(formatReport(report));
  log("done");
  (window as unknown as { __benchResult: unknown }).__benchResult = {
    environment: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, date: new Date().toISOString() },
    report,
  };
})();
