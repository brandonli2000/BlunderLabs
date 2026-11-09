export type ImportErrorKind =
  | "invalid-username"
  | "not-found"
  | "no-games"
  | "rate-limited"
  | "network"
  | "bad-response"
  | "aborted";

/** A user-presentable import failure. `message` is written for end users. */
export class ImportError extends Error {
  override name = "ImportError";
  readonly kind: ImportErrorKind;

  constructor(kind: ImportErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchGamesOptions {
  /** Maximum number of games to return (newest first). */
  max: number;
  signal?: AbortSignal;
  /** Called with the number of games received so far. */
  onProgress?: (received: number) => void;
  /** Injected for tests; defaults to the global fetch. */
  fetchFn?: FetchFn;
}

// Both sites allow letters, digits, "_" and "-". Validating locally gives a
// clearer error than a 404 and guarantees nothing odd reaches the URL path.
const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/;

export function validateUsername(raw: string): string {
  const username = raw.trim();
  if (!USERNAME.test(username)) {
    throw new ImportError(
      "invalid-username",
      "Usernames contain 2–30 letters, digits, “_” or “-”.",
    );
  }
  return username;
}

/** Wrap fetch so every failure becomes an ImportError with a useful message. */
export async function fetchOrThrow(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
  site: string,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch (err) {
    if (isAbort(err, init.signal)) throw new ImportError("aborted", "Import cancelled.");
    throw new ImportError("network", `Couldn't reach ${site}. Check your connection and try again.`);
  }
  if (response.status === 429) {
    throw new ImportError("rate-limited", `${site} is rate-limiting requests. Wait a minute, then try again.`);
  }
  return response;
}

export function isAbort(err: unknown, signal?: AbortSignal | null): boolean {
  return Boolean(signal?.aborted) || (err instanceof DOMException && err.name === "AbortError");
}
