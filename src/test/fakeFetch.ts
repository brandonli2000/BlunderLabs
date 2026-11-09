import { readFileSync } from "node:fs";
import type { FetchFn } from "../import/errors";

/** Read a recorded API response from src/import/fixtures. */
export function fixture(name: string): string {
  return readFileSync(new URL(`../import/fixtures/${name}`, import.meta.url), "utf8");
}

type Route = Response | (() => Response | Promise<Response>);

/**
 * A fetch stand-in that serves fixed responses by exact URL (or URL prefix
 * ending in "*") and records every requested URL. Unknown URLs fail the test loudly.
 */
export function fakeFetch(routes: Record<string, Route>): FetchFn & { calls: string[] } {
  const calls: string[] = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push(url);
    if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const key = Object.keys(routes).find((k) => (k.endsWith("*") ? url.startsWith(k.slice(0, -1)) : url === k));
    if (!key) throw new Error(`fakeFetch: unexpected URL ${url}`);
    const route = routes[key]!;
    return typeof route === "function" ? route() : route.clone();
  };
  return Object.assign(fn, { calls });
}

/** A streaming body delivered in fixed-size chunks, to exercise incremental parsing. */
export function chunkedResponse(text: string, chunkSize: number, init?: ResponseInit): Response {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
  return new Response(stream, init);
}
