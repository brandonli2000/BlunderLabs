import { useCallback, useEffect, useState } from "react";

export type Route = { view: "library" } | { view: "mistakes" } | { view: "game"; id: string; ply: number | null };

/** `#/` library · `#/mistakes` catalogue · `#/game/<id>[/<ply>]` review. Works on any static host. */
export function parseHash(hash: string): Route {
  if (hash === "#/mistakes") return { view: "mistakes" };
  const match = hash.match(/^#\/game\/([^/]+)(?:\/(\d{1,4}))?$/);
  if (match) {
    try {
      return { view: "game", id: decodeURIComponent(match[1]!), ply: match[2] ? Number(match[2]) : null };
    } catch {
      // Malformed escape sequence: fall through to the library.
    }
  }
  return { view: "library" };
}

export function routeHash(route: Route): string {
  if (route.view === "mistakes") return "#/mistakes";
  if (route.view === "game") return `#/game/${encodeURIComponent(route.id)}${route.ply !== null ? `/${route.ply}` : ""}`;
  return "#/";
}

export function useHashRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = useCallback((next: Route) => {
    window.location.hash = routeHash(next);
  }, []);
  return [route, navigate];
}
