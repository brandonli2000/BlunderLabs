import type { PvLine, SearchLimits, SearchResult } from "./engine";

interface Searcher {
  search(fen: string, limits: SearchLimits, onInfo?: (line: PvLine) => void): Promise<SearchResult>;
  stop(): void;
}

type OnUpdate = (fen: string, lines: PvLine[], final: boolean) => void;

interface Request {
  fen: string;
  limits: SearchLimits;
  onUpdate: OnUpdate;
}

/**
 * "Latest request wins" scheduling for interactive analysis. When the user
 * steps through positions quickly, only the newest position is searched:
 * a running search is stopped, and intermediate requests are dropped rather
 * than queued. Updates from a superseded search are never delivered.
 */
export class LatestSearch {
  private readonly engine: Searcher;
  private pending: Request | null = null;
  private running = false;
  /** Incremented on every request/cancel; stale searches compare against it. */
  private generation = 0;

  constructor(engine: Searcher) {
    this.engine = engine;
  }

  request(fen: string, limits: SearchLimits, onUpdate: OnUpdate): void {
    this.generation++;
    this.pending = { fen, limits, onUpdate };
    if (this.running) this.engine.stop();
    else void this.runNext();
  }

  cancel(): void {
    this.generation++;
    this.pending = null;
    if (this.running) this.engine.stop();
  }

  private async runNext(): Promise<void> {
    const request = this.pending;
    if (!request) return;
    this.pending = null;
    this.running = true;
    const generation = this.generation;
    const lines = new Map<number, PvLine>();
    const sorted = () => [...lines.values()].sort((a, b) => a.multipv - b.multipv);

    try {
      const result = await this.engine.search(request.fen, request.limits, (line) => {
        if (generation !== this.generation) return;
        lines.set(line.multipv, line);
        request.onUpdate(request.fen, sorted(), false);
      });
      if (generation === this.generation) request.onUpdate(request.fen, result.lines, true);
    } catch {
      // Engine terminated: nothing to deliver.
    } finally {
      this.running = false;
      if (this.pending) void this.runNext();
    }
  }
}
