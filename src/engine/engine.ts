import { toWhitePov } from "../core/evaluation";
import { sideToMove, type Score } from "../core/types";
import { parseBestMove, parseInfo, type UciInfo } from "./uci";

/**
 * Minimal line-based channel to a UCI engine. The browser implementation
 * wraps a Web Worker; tests use the same engine build under Node.
 */
export interface EngineTransport {
  send(command: string): void;
  /** Register the single output handler; called once per output line. */
  onLine(handler: (line: string) => void): void;
  /** Register a handler for fatal transport failures (e.g. the worker crashed). */
  onError?(handler: (message: string) => void): void;
  terminate(): void;
}

export interface SearchLimits {
  depth?: number;
  movetimeMs?: number;
  multiPv?: number;
}

export interface PvLine {
  multipv: number;
  depth: number;
  /** White POV. */
  score: Score;
  pv: string[];
}

export interface SearchResult {
  fen: string;
  /** Null when the side to move has no legal moves (mate / stalemate). */
  bestMove: string | null;
  /** Deepest exact line per multipv slot, ordered best first. */
  lines: PvLine[];
}

export class EngineError extends Error {
  override name = "EngineError";
}

interface PendingSearch {
  fen: string;
  lines: Map<number, PvLine>;
  onInfo: ((line: PvLine) => void) | undefined;
  resolve: (result: SearchResult) => void;
  reject: (error: Error) => void;
}

/**
 * Serializes searches over one engine process. Callers can issue searches
 * concurrently; they run one at a time in call order.
 */
export class UciEngine {
  private readonly transport: EngineTransport;
  private readonly waiters: { token: string; resolve: () => void; reject: (error: Error) => void }[] = [];
  private current: PendingSearch | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private multiPv = 1;
  private ready: Promise<void> | null = null;
  private dead = false;
  /** Time from first `init()` to `readyok`, in ms; null until ready. */
  initMs: number | null = null;

  constructor(transport: EngineTransport) {
    this.transport = transport;
    transport.onLine((line) => this.handleLine(line));
    transport.onError?.((message) => this.fail(new EngineError(`Engine crashed: ${message}`)));
  }

  /** True once terminated or crashed; a dead engine rejects every request. */
  get isDead(): boolean {
    return this.dead;
  }

  /** Handshake; safe to call repeatedly. */
  init(): Promise<void> {
    this.ready ??= (async () => {
      const started = performance.now();
      await this.sendAndWait("uci", "uciok");
      await this.sendAndWait("isready", "readyok");
      this.initMs = performance.now() - started;
    })();
    return this.ready;
  }

  /** Search one position. Rejects if the engine is terminated first. */
  search(fen: string, limits: SearchLimits = {}, onInfo?: (line: PvLine) => void): Promise<SearchResult> {
    const run = async (): Promise<SearchResult> => {
      if (this.dead) throw new EngineError("Engine terminated");
      await this.init();
      const multiPv = limits.multiPv ?? 1;
      if (multiPv !== this.multiPv) {
        this.transport.send(`setoption name MultiPV value ${multiPv}`);
        this.multiPv = multiPv;
      }
      this.transport.send(`position fen ${fen}`);
      await this.sendAndWait("isready", "readyok");
      return new Promise<SearchResult>((resolve, reject) => {
        this.current = { fen, lines: new Map(), onInfo, resolve, reject };
        this.transport.send(goCommand(limits));
      });
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** Ask the running search (if any) to finish early; its promise still resolves. */
  stop(): void {
    if (this.current) this.transport.send("stop");
  }

  /** Begin a fresh game context (clears hash between unrelated games). */
  newGame(): Promise<void> {
    const run = async () => {
      await this.init();
      this.transport.send("ucinewgame");
      await this.sendAndWait("isready", "readyok");
    };
    const done = this.queue.then(run, run);
    this.queue = done.catch(() => undefined);
    return done;
  }

  terminate(): void {
    this.transport.terminate();
    this.fail(new EngineError("Engine terminated"));
  }

  /** Mark the engine dead and reject everything in flight. */
  private fail(error: EngineError): void {
    this.dead = true;
    this.current?.reject(error);
    this.current = null;
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }

  private sendAndWait(command: string, token: string): Promise<void> {
    if (this.dead) return Promise.reject(new EngineError("Engine terminated"));
    return new Promise((resolve, reject) => {
      this.waiters.push({ token, resolve, reject });
      this.transport.send(command);
    });
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    const waiter = this.waiters[0];
    if (waiter && trimmed === waiter.token) {
      this.waiters.shift();
      waiter.resolve();
      return;
    }
    const search = this.current;
    if (!search) return;

    const info = parseInfo(trimmed);
    if (info) {
      if (info.bound) return; // bounds aren't exact evaluations
      const pvLine = toPvLine(info, search.fen);
      search.lines.set(pvLine.multipv, pvLine);
      search.onInfo?.(pvLine);
      return;
    }
    const best = parseBestMove(trimmed);
    if (best) {
      this.current = null;
      const lines = [...search.lines.values()].sort((a, b) => a.multipv - b.multipv);
      search.resolve({ fen: search.fen, bestMove: best.move, lines });
    }
  }
}

function toPvLine(info: UciInfo, fen: string): PvLine {
  return {
    multipv: info.multipv,
    depth: info.depth,
    score: toWhitePov(info.score, sideToMove(fen)),
    pv: info.pv,
  };
}

function goCommand(limits: SearchLimits): string {
  if (limits.depth !== undefined) return `go depth ${limits.depth}`;
  if (limits.movetimeMs !== undefined) return `go movetime ${limits.movetimeMs}`;
  return "go depth 16";
}
