import { useCallback, useEffect, useRef, useState } from "react";
import { analysisEngineKey, analyzeGame, DEFAULT_PLAN, type GameAnalysis } from "../analysis/gameAnalysis";
import type { ParsedGame } from "../core/pgn";
import { getLatestAnalysis, saveAnalysis } from "../storage/library";
import { getDatabase } from "./database";
import { getEngine } from "./engineInstance";

export type AnalysisState =
  | { status: "idle" }
  | { status: "running"; done: number; total: number }
  | { status: "done"; analysis: GameAnalysis; saveError: string | null }
  | { status: "error"; message: string };

const ENGINE_KEY = analysisEngineKey(DEFAULT_PLAN.limits, DEFAULT_PLAN.refine);

/**
 * Full-game analysis for one stored game: restores a saved analysis on
 * mount, runs Stockfish on demand, and persists the result.
 */
export function useGameAnalysis(gameId: string, game: ParsedGame | null, onSaved: () => void) {
  const [state, setState] = useState<AnalysisState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await getLatestAnalysis(await getDatabase(), gameId);
        if (!cancelled && stored) setState({ status: "done", analysis: stored.analysis, saveError: null });
      } catch {
        // Unreadable cache is not fatal; the user can re-analyse.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const cancel = useCallback(() => {
    if (!abortRef.current) return;
    abortRef.current.abort();
    abortRef.current = null;
    getEngine("analysis").stop();
  }, []);

  useEffect(() => cancel, [cancel]);

  const run = useCallback(async () => {
    if (!game) return;
    cancel();
    const controller = new AbortController();
    abortRef.current = controller;
    const total = game.moves.length + 1;
    setState({ status: "running", done: 0, total });

    let analysis: GameAnalysis;
    try {
      analysis = await analyzeGame(getEngine("analysis"), game, {
        ...DEFAULT_PLAN,
        signal: controller.signal,
        onProgress: (done, planned) => setState({ status: "running", done, total: planned }),
      });
    } catch (err) {
      if (!controller.signal.aborted) setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (controller.signal.aborted) return;
    abortRef.current = null;

    let saveError: string | null = null;
    try {
      await saveAnalysis(await getDatabase(), { gameId, engineKey: ENGINE_KEY, createdAt: Date.now(), analysis });
      onSaved();
    } catch (err) {
      saveError = err instanceof Error ? err.message : String(err);
    }
    setState({ status: "done", analysis, saveError });
  }, [game, gameId, cancel, onSaved]);

  const stop = useCallback(() => {
    cancel();
    setState({ status: "idle" });
  }, [cancel]);

  return { state, run, stop };
}
