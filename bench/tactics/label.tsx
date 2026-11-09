/**
 * Labeling tool for the tactics dataset (dev only: `npm run dev`, open /label.html).
 *
 * Judge first, then see the assistant. For each question the detector's
 * suggestion (dev split only) and its supporting engine line appear only after
 * you have answered; you can then keep or change your answer. A suggestion never
 * becomes a label by itself. Your first answer is recorded separately so results
 * can also be scored on judgments made before any reveal. The holdout split never
 * shows suggestions. Engine hints stay hidden until requested. Labels are kept
 * in this browser (localStorage) while you work; "Export" downloads the dataset
 * with your labels for bench/tactics/labels/.
 */
import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { pvToSan } from "../../src/core/moves";
import { applyLabels, judge, mergeSavedLabels, reviewCoverage, stateFromDataset, suggestionFor, type CoverageRow, type ReviewState, type Suggestion } from "../../src/tactics/assist";
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
const BUTTON_TEXT: Record<Label, string> = { yes: "yes", no: "no", unsure: "unsure / needs review" };

function storageKey(d: TacticsDataset) {
  return `blunderlab.labels.${d.createdAt}`;
}
function reviewKey(d: TacticsDataset) {
  return `blunderlab.reviews.${d.createdAt}`;
}
function readSaved(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}");
  } catch {
    return {};
  }
}
const hasLabel = (s: ReviewState, id: string, q: DetectorId) => Boolean(s.labels[id]?.[q]);

function App() {
  const [dataset, setDataset] = useState<TacticsDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<ReviewState>({ labels: {}, reviews: {} });
  const [notice, setNotice] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [split, setSplit] = useState<"dev" | "holdout">("dev");
  const [showAfter, setShowAfter] = useState(false);
  const [showEngine, setShowEngine] = useState(false);
  const [labeler, setLabeler] = useState(() => localStorage.getItem("blunderlab.labeler") ?? "");

  const load = useCallback((text: string) => {
    try {
      const d = parseDataset(text);
      // Labels already in the file are the starting point; this browser's saved work is newer
      // and wins, but any label it changes is reported rather than replaced silently.
      const saved: ReviewState = { labels: readSaved(storageKey(d)) as ReviewState["labels"], reviews: readSaved(reviewKey(d)) as ReviewState["reviews"] };
      const merged = mergeSavedLabels(stateFromDataset(d), saved);
      setDataset(d);
      setState(merged.state);
      setNotice(merged.conflicts ? `${merged.conflicts} label(s) in the opened file differ from your saved browser work; the saved browser work was kept.` : null);
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
  const done = items.filter((i) => QUESTIONS.every((q) => hasLabel(state, i.id, q.id))).length;
  const coverage = useMemo(() => (dataset ? reviewCoverage(applyLabels(dataset, state).items.filter((i) => i.split === split)) : []), [dataset, state, split]);

  const setLabel = useCallback(
    (id: DetectorId, value: Label) => {
      if (!item || !dataset) return;
      // The suggestion is looked up only to record what the reveal will show; it is never applied.
      const next = judge(state, item.id, id, value, suggestionFor(item, id));
      setState(next);
      try {
        localStorage.setItem(storageKey(dataset), JSON.stringify(next.labels));
        localStorage.setItem(reviewKey(dataset), JSON.stringify(next.reviews));
      } catch {
        setNotice("Could not save to this browser's storage. Export now to keep your labels.");
      }
    },
    [item, state, dataset],
  );

  // Moving to another item (or split) always hides the answer-revealing hints again.
  const showItem = useCallback((at: number) => {
    setIndex(at);
    setShowAfter(false);
    setShowEngine(false);
  }, []);

  const go = useCallback((delta: number) => showItem(Math.max(0, Math.min(items.length - 1, index + delta))), [items.length, index, showItem]);

  const nextUnlabeled = useCallback(() => {
    const at = items.findIndex((i, k) => k > index && !QUESTIONS.every((q) => hasLabel(state, i.id, q.id)));
    if (at >= 0) showItem(at);
  }, [items, index, state, showItem]);

  const nextNeedingReview = useCallback(() => {
    const at = items.findIndex((i, k) => k > index && QUESTIONS.some((q) => state.labels[i.id]?.[q.id] === "unsure"));
    if (at >= 0) showItem(at);
  }, [items, index, state, showItem]);

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
      else if (e.key === "u") nextNeedingReview();
      else if (e.key === "a") setShowAfter((s) => !s);
      else if (e.key === "e") setShowEngine((s) => !s);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setLabel, go, nextUnlabeled, nextNeedingReview]);

  const exportLabeled = () => {
    if (!dataset) return;
    localStorage.setItem("blunderlab.labeler", labeler);
    const out: TacticsDataset = { ...applyLabels(dataset, state), labeler: labeler || null };
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
        <button className="btn" onClick={nextNeedingReview}>
          Next needs review (u)
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

      {notice && <p className="import-error">{notice}</p>}
      <Coverage rows={coverage} split={split} />

      {item && (
        <ItemView
          item={item}
          answers={state.labels[item.id] ?? {}}
          initials={state.reviews[item.id] ?? {}}
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
  initials: ReviewState["reviews"][string];
  showAfter: boolean;
  showEngine: boolean;
  onLabel: (id: DetectorId, value: Label) => void;
  guidelinesVersion: string;
}

function ItemView({ item, answers, initials, showAfter, showEngine, onLabel, guidelinesVersion }: ItemViewProps) {
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
                  {BUTTON_TEXT[l]} <kbd>{q.keys[k]}</kbd>
                </button>
              ))}
            </div>
            <Reveal item={item} detector={q.id} answer={answers[q.id]} initial={initials[q.id]?.initial} />
          </section>
        ))}
        <p className="hint">
          Guidelines: docs/tactics/labeling-guidelines.md (v{guidelinesVersion}). Answer from the board first.{" "}
          {item.split === "dev" ? "The assistant's suggestion appears under a question only after you answer it." : "Holdout: suggestions are never shown."} Unsure items need
          another look (<kbd>u</kbd>) and are excluded from scoring.
        </p>
      </div>
    </div>
  );
}

/** The assistant's suggestion for one question, shown only once the human has answered it (dev split only). */
function Reveal({ item, detector, answer, initial }: { item: DatasetItem; detector: DetectorId; answer: Label | undefined; initial: Label | undefined }) {
  if (!answer || item.split !== "dev") return null;
  const suggestion: Suggestion | null = suggestionFor(item, detector);
  const note = !suggestion
    ? "Assistant: the detector found nothing here. That is not evidence the pattern is absent."
    : answer === "yes"
      ? "Assistant suggests yes: it agrees with your answer."
      : "Assistant suggests yes: it differs from your answer. Check the line, then keep or change your answer.";
  return (
    <div className="hint" data-testid={`reveal-${detector}`}>
      <p>{note}</p>
      {suggestion && (
        <>
          <p>
            {suggestion.explanation}{" "}
            <span className="label-data">
              (detector v{suggestion.version}, {suggestion.subtype})
            </span>
          </p>
          <p className="label-data">
            Engine line {detector === "hanging-piece" ? "after the move played" : "from the position before the move"}: {suggestion.line.san.join(" ") || "—"}
          </p>
        </>
      )}
      {initial && initial !== answer && (
        <p>
          Your first answer was {initial}; the answer is now {answer}.
        </p>
      )}
    </div>
  );
}

/** Reviewed coverage of the current split. Deliberately not accuracy: see `npm run tactics:evaluate`. */
function Coverage({ rows, split }: { rows: CoverageRow[]; split: string }) {
  return (
    <section className="panel label-coverage">
      <h2 className="panel-title">Reviewed coverage ({split})</h2>
      {rows.map((r) => {
        const reviewed = r.yes + r.no;
        return (
          <p key={r.detector} className="batch-line label-data">
            {r.detector}: {reviewed}/{r.total} reviewed ({r.total ? Math.round((100 * reviewed) / r.total) : 0}%) · yes {r.yes} · no {r.no} · unsure {r.unsure} · unlabeled{" "}
            {r.unlabeled}
            {r.suggestionsSeen > 0 && ` · suggestions seen ${r.suggestionsSeen}, kept ${r.agreedWithSuggestion}, revised after reveal ${r.revisedAfterReveal}`}
          </p>
        );
      })}
      <p className="hint">
        Coverage only. It says how much you have judged, not how accurate the detectors are; precision and recall come from npm run tactics:evaluate on your exported
        labels.
      </p>
    </section>
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
        <span className="masthead-nav">Tactics labeling (judge first, then reveal)</span>
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
