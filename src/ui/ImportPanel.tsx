import { useState } from "react";
import { OPERA_GAME } from "./sampleGames";

interface ImportPanelProps {
  onImport: (pgnText: string) => void;
  error: string | null;
}

export function ImportPanel({ onImport, error }: ImportPanelProps) {
  const [text, setText] = useState("");

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    const content = await file.text();
    setText(content);
    onImport(content);
  };

  return (
    <section className="panel import-panel" aria-labelledby="import-heading">
      <h2 id="import-heading" className="panel-title">
        Import
      </h2>
      <textarea
        className="pgn-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Paste PGN here\n\n[Event "…"]\n1. e4 e5 2. Nf3 …'}
        spellCheck={false}
        rows={6}
      />
      <div className="import-actions">
        <button className="btn btn-primary" onClick={() => onImport(text)} disabled={!text.trim()}>
          Load PGN
        </button>
        <label className="btn">
          Open file
          <input
            type="file"
            accept=".pgn,application/x-chess-pgn,text/plain"
            hidden
            onChange={(e) => void readFile(e.target.files?.[0])}
          />
        </label>
        <button className="btn btn-quiet" onClick={() => onImport(OPERA_GAME)}>
          Try a sample
        </button>
      </div>
      {error && (
        <p className="import-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
