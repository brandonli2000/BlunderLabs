/**
 * Labeling tool for the tactics dataset (dev only: `npm run dev`, open /label.html).
 *
 * Blind by design: the detectors are never run here, so their output can't
 * influence the labels. Engine hints are hidden until requested. Labels are
 * kept in this browser (localStorage) while you work; "Export" downloads
 * the dataset with your labels for bench/tactics/labels/.
 */
import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { pvToSan } from "../../src/core/moves";
import { parseDataset, type DatasetItem, type Label, type TacticsDataset } from "../../src/tactics/dataset";
import type { DetectorId } from "../../src/tactics/types";
import { Board } from "../../src/ui/Board";
import "../../src/styles/global.css";

const QUESTIONS: { id: DetectorId; title: string; prompt: string; keys: [string, string, string] }[] = [
  {
    id: "hanging-piece",
    title: "Left hanging",
    prompt: "After the move, can the opponent simply win material (net ≥ a minor piece, or a losing exchange the mover started) by capturing a piece the mover left inadequately defended?",
    keys: ["1", "2", "3"],
  },
  {
    id: "missed-capture",
    title: "Missed capture",
    prompt: "Before the move, did the mover have a capture that wins material (net ≥ a minor piece) and that was clearly the right move?",
    keys: ["4", "5", "6"],
  },
];
const LABELS: Label[] = ["yes", "no", "unsure"];

type Labels = Record<string, Partial<Record<DetectorId, Label>>>;

function storageKey(d: TacticsDataset) {
  return `blunderlab.labels.${d.createdAt}`;
}

function App() {
  const [dataset, setDataset] = useState<TacticsDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [labels, setLabels] = useState<Labels>({});
  const [index, setIndex] = useState(0);
  const [split, setSplit] = useState<"dev" | "holdout">("dev");
  const [showAfter, setShowAfter] = useState(false);
  const [showEngine, setShowEngine] = useState(false);
  const [labeler, setLabeler] = useState(() => localStorage.getItem("blunderlab.labeler") ?? "");

  const load = useCallback((text: string) => {
    try {
      const d = parseDataset(text);
      const saved = JSON.parse(localStorage.getItem(storageKey(d)) ?? "{}") as Labels;
      // Labels already in the file are the starting point; local work overrides them.
      const fromFile: Labels = {};
      for (const it of d.items) fromFile[it.id] = Object.fromEntries(Object.entries(it.labels).filter(([, v]) => v !== null));
      setDataset(d);
      setLabels({ ...fromFile, ...saved });
      setIndex(0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    fetch("/bench/tactics/dataset-v1.json")
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("No bench/tactics/dataset-v1.json yet: run npm run tactics:dataset."))))
      .then(load)
      .catch((err: Error) => setError(err.message));
  }, [load]);

  const items = useMemo(() => dataset?.items.filter((i) => i.split === split) ?? [], [dataset, split]);
  const item: DatasetItem | undefined = items[Math.min(index, items.length - 1)];
  const done = items.filter((i) => QUESTIONS.every((q) => labels[i.id]?.[q.id])).length;

  const setLabel = useCallback(
    (id: DetectorId, value: Label) => {
      if (!item || !dataset) return;
      const next = { ...labels, [item.id]: { ...labels[item.id], [id]: value } };
      setLabels(next);
      localStorage.setItem(storageKey(dataset), JSON.stringify(next));
    },
    [item, labels, dataset],
  );

  // Moving to another item (or split) always hides the answer-revealing hints again.
  const showItem = useCallback((at: number) => {
    setIndex(at);
    setShowAfter(false);
    setShowEngine(false);
  }, []);

  const go = useCallback((delta: number) => showItem(Math.max(0, Math.min(items.length - 1, index + delta))), [items.length, index, showItem]);

  const nextUnlabeled = useCallback(() => {
    const at = items.findIndex((i, k) => k > index && !QUESTIONS.every((q) => labels[i.id]?.[q.id]));
    if (at >= 0) showItem(at);
  }, [items, index, labels, showItem]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Leave form fields alone (a <select> uses letters and arrows itself) and never
      // hijack browser shortcuts such as Ctrl+A or Alt+Left.
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      for (const q of QUESTIONS) {
        const k = q.keys.indexOf(e.key);
        if (k >= 0) return setLabel(q.id, LABELS[k]!);
      }
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "n") nextUnlabeled();
      else if (e.key === "a") setShowAfter((s) => !s);
      else if (e.key === "e") setShowEngine((s) => !s);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setLabel, go, nextUnlabeled]);

  const exportLabeled = () => {
    if (!dataset) return;
    localStorage.setItem("blunderlab.labeler", labeler);
    const out: TacticsDataset = {
      ...dataset,
      labeler: labeler || null,
      items: dataset.items.map((i) => ({
        ...i,
        labels: { "hanging-piece": labels[i.id]?.["hanging-piece"] ?? null, "missed-capture": labels[i.id]?.["missed-capture"] ?? null },
      })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "dataset-v1.labeled.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  if (error && !dataset) {
    return (
      <Shell>
        <p className="import-error">{error}</p>
        <FilePicker onText={load} />
      </Shell>
    );
  }
  if (!dataset) return <Shell>Loading…</Shell>;

  return (
    <Shell>
      <div className="label-bar">
        <label>
          Split{" "}
          <select
            className="text-input"
            value={split}
            onChange={(e) => {
              setSplit(e.target.value as "dev" | "holdout");
              showItem(0);
              // Give focus back to the page so the labeling keys work immediately.
              e.target.blur();
            }}
          >
            <option value="dev">dev</option>
            <option value="holdout">holdout</option>
          </select>
        </label>
        <span className="mt-mono">
          {item ? `${Math.min(index, items.length - 1) + 1}/${items.length} · ${done} fully labeled` : `No items in the ${split} split.`}
        </span>
        <button className="btn" onClick={() => go(-1)}>
          ◀ Prev
        </button>
        <button className="btn" onClick={() => go(1)}>
          Next ▶
        </button>
        <button className="btn" onClick={nextUnlabeled}>
          Next unlabeled (n)
        </button>
        <input
          className="text-input"
          placeholder="Your name (labeler)"
          value={labeler}
          onChange={(e) => setLabeler(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <button className="btn btn-primary" onClick={exportLabeled}>
          Export labels
        </button>
        <FilePicker onText={load} />
      </div>

      {item && (
        <ItemView
          item={item}
          answers={labels[item.id] ?? {}}
          showAfter={showAfter}
          showEngine={showEngine}
          onLabel={setLabel}
          guidelinesVersion={dataset.guidelinesVersion}
        />
      )}
    </Shell>
  );
}

interface ItemViewProps {
  item: DatasetItem;
  answers: Partial<Record<DetectorId, Label>>;
  showAfter: boolean;
  showEngine: boolean;
  onLabel: (id: DetectorId, value: Label) => void;
  guidelinesVersion: string;
}

function ItemView({ item, answers, showAfter, showEngine, onLabel, guidelinesVersion }: ItemViewProps) {
  const c = item.context;
  const fen = showAfter ? c.fenAfter : c.fenBefore;
  const played = { from: c.move.uci.slice(0, 2), to: c.move.uci.slice(2, 4) };
  const hint = showEngine ? (showAfter ? c.bestAfter : c.bestBefore) : null;
  const arrows = hint ? [{ from: hint.slice(0, 2), to: hint.slice(2, 4), tone: "best" as const }] : [];

  return (
    <div className="label-main">
      <div className="label-board">
        <Board fen={fen} orientation={c.mover} lastMove={showAfter ? played : null} arrows={showAfter ? arrows : [{ ...played, tone: "played" as const }, ...arrows]} />
        <p className="hint">
          {showAfter ? "Position after the move." : "Position before the move (grey arrow = move played)."} <kbd>a</kbd> toggles before/after ·{" "}
          <kbd>e</kbd> engine hint
        </p>
      </div>
      <div className="label-side">
        <p className="game-title">
          {c.moveLabel}
          {c.move.san} <span className="game-result">by {c.mover === "w" ? "White" : "Black"}</span>
        </p>
        <p className="game-sub">
          {item.id} · expected score lost {(c.loss * 100).toFixed(0)}% ({c.classification}) ·{" "}
          <a href={`https://lichess.org/analysis/${c.fenBefore.replace(/ /g, "_")}`} target="_blank" rel="noreferrer">
            open on Lichess
          </a>
        </p>
        {showEngine && (
          <p className="hint">
            Engine before: {c.bestBefore ? pvToSan(c.fenBefore, c.lineBefore, 6).join(" ") : "—"}
            <br />
            Engine reply after: {c.bestAfter ? pvToSan(c.fenAfter, c.lineAfter, 6).join(" ") : "—"}
          </p>
        )}
        {QUESTIONS.map((q) => (
          <section key={q.id} className="panel">
            <h2 className="panel-title">{q.title}</h2>
            <p className="batch-line">{q.prompt}</p>
            <div className="data-row">
              {LABELS.map((l, k) => (
                <button key={l} className={`btn${answers[q.id] === l ? " btn-primary" : ""}`} onClick={() => onLabel(q.id, l)}>
                  {l} <kbd>{q.keys[k]}</kbd>
                </button>
              ))}
            </div>
          </section>
        ))}
        <p className="hint">Guidelines: docs/tactics/labeling-guidelines.md (v{guidelinesVersion}). Detector output is never shown here.</p>
      </div>
    </div>
  );
}

function FilePicker({ onText }: { onText: (text: string) => void }) {
  return (
    <label className="btn">
      Open dataset…
      <input type="file" accept=".json" hidden onChange={(e) => void e.target.files?.[0]?.text().then(onText)} />
    </label>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <header className="masthead">
        <span className="wordmark-name">
          Blunder<span>Lab</span>
        </span>
        <span className="masthead-nav">Tactics labeling (blind)</span>
      </header>
      {children}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
