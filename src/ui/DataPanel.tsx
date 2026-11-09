import { useEffect, useState } from "react";
import { applyRestore, backupFileName, createBackup, planRestore, validateBackup, type RestorePlan } from "../storage/backup";
import { formatBytes, getDatabase } from "./database";

type RestoreState =
  | { kind: "idle" }
  | { kind: "checking"; fileName: string }
  | { kind: "preview"; fileName: string; plan: RestorePlan }
  | { kind: "restoring" }
  | { kind: "done"; games: number; analyses: number }
  | { kind: "error"; message: string };

type Persistence = "unsupported" | "persistent" | "best-effort" | "denied";

/** Backup, restore and storage durability: keeping the user's library safe. */
export function DataPanel({ onRestored }: { onRestored: () => void }) {
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [restore, setRestore] = useState<RestoreState>({ kind: "idle" });
  const [persistence, setPersistence] = useState<Persistence>("best-effort");
  const [showRejected, setShowRejected] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!navigator.storage?.persisted) return setPersistence("unsupported");
      try {
        setPersistence((await navigator.storage.persisted()) ? "persistent" : "best-effort");
      } catch {
        setPersistence("unsupported");
      }
    })();
  }, []);

  const download = async () => {
    try {
      const backup = await createBackup(await getDatabase());
      const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = backupFileName();
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setExportNote(`${backup.games.length} games and ${backup.analyses.length} analyses · ${formatBytes(blob.size)}`);
    } catch (err) {
      setExportNote(`Backup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const check = async (file: File | undefined) => {
    if (!file) return;
    setShowRejected(false);
    setRestore({ kind: "checking", fileName: file.name });
    try {
      const validated = await validateBackup(await file.text());
      const plan = await planRestore(await getDatabase(), validated);
      setRestore({ kind: "preview", fileName: file.name, plan });
    } catch (err) {
      setRestore({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const apply = async (plan: RestorePlan) => {
    setRestore({ kind: "restoring" });
    try {
      const result = await applyRestore(await getDatabase(), plan);
      setRestore({ kind: "done", ...result });
      onRestored();
    } catch (err) {
      // applyRestore is all-or-nothing, so the library is unchanged.
      setRestore({
        kind: "error",
        message: `Restore failed and nothing was changed: ${err instanceof Error ? err.message : String(err)}. Check the file again, then retry.`,
      });
    }
  };

  const requestPersistence = async () => {
    try {
      setPersistence((await navigator.storage.persist()) ? "persistent" : "denied");
    } catch {
      setPersistence("denied");
    }
  };

  return (
    <section className="panel data-panel" aria-labelledby="data-heading">
      <h2 id="data-heading" className="panel-title">
        Your data
      </h2>

      <div className="data-row">
        <button className="btn" onClick={() => void download()}>
          Download backup
        </button>
        <label className={`btn${restore.kind === "checking" || restore.kind === "restoring" ? " btn-disabled" : ""}`}>
          Restore from backup…
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              void check(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {exportNote && <p className="hint">{exportNote}</p>}

      {restore.kind === "checking" && <p className="hint">Checking {restore.fileName}…</p>}
      {restore.kind === "restoring" && <p className="hint">Restoring…</p>}
      {restore.kind === "error" && (
        <p className="import-error" role="alert">
          {restore.message}
        </p>
      )}
      {restore.kind === "done" && (
        <p className="import-result" role="status">
          Restored <strong>{restore.games}</strong> games and <strong>{restore.analyses}</strong> analyses.
        </p>
      )}
      {restore.kind === "preview" && (
        <div className="restore-preview" role="region" aria-label="Restore preview">
          <p className="batch-line">
            <strong>{restore.fileName}</strong> would add <strong>{restore.plan.newGames.length}</strong> games and{" "}
            <strong>{restore.plan.newAnalyses.length}</strong> analyses.
          </p>
          <ul className="restore-facts">
            {restore.plan.existingGames > 0 && <li>{restore.plan.existingGames} games already in your library stay as they are.</li>}
            {restore.plan.existingAnalyses > 0 && <li>{restore.plan.existingAnalyses} analyses already saved stay as they are.</li>}
            {restore.plan.orphanAnalyses > 0 && <li>{restore.plan.orphanAnalyses} analyses skipped (their game isn't in the backup).</li>}
            {restore.plan.rejected.length > 0 && (
              <li className="import-warn">
                {restore.plan.rejected.length} invalid entries skipped.{" "}
                <button className="link-btn" onClick={() => setShowRejected((s) => !s)}>
                  {showRejected ? "Hide" : "Details"}
                </button>
              </li>
            )}
            <li>Nothing in your library is deleted or overwritten.</li>
          </ul>
          {showRejected && (
            <ul className="batch-failure-list">
              {restore.plan.rejected.slice(0, 50).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
              {restore.plan.rejected.length > 50 && <li>…and {restore.plan.rejected.length - 50} more</li>}
            </ul>
          )}
          <div className="data-row">
            <button
              className="btn btn-primary"
              onClick={() => void apply(restore.plan)}
              disabled={restore.plan.newGames.length + restore.plan.newAnalyses.length === 0}
            >
              {restore.plan.newGames.length + restore.plan.newAnalyses.length === 0 ? "Nothing new to restore" : "Restore"}
            </button>
            <button className="btn btn-quiet" onClick={() => setRestore({ kind: "idle" })}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className="hint data-persistence">
        {persistence === "persistent" && "Persistent storage is on: the browser won't clear this library to free space."}
        {persistence === "best-effort" && (
          <>
            Browsers may clear site data when disk space runs low.{" "}
            <button className="link-btn" onClick={() => void requestPersistence()}>
              Ask the browser to keep it
            </button>
          </>
        )}
        {persistence === "denied" && "The browser declined persistent storage (it decides based on how you use the site). Keep a backup."}
        {persistence === "unsupported" && "This browser can't guarantee storage is kept. Keep a backup."}
      </p>
    </section>
  );
}
