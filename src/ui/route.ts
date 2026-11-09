import { useCallback, useEffect, useState } from "react";

export type Route = { view: "library" } | { view: "game"; id: string };

/** `#/` → library, `#/game/<id>` → review. Hash routing works on any static host. */
export function parseHash(hash: string): Route {
  const match = hash.match(/^#\/game\/(.+)$/);
  if (match) {
    try {
      return { view: "game", id: decodeURIComponent(match[1]!) };
    } catch {
      // Malformed escape sequence: fall through to the library.
    }
  }
  return { view: "library" };
}

export function routeHash(route: Route): string {
  return route.view === "game" ? `#/game/${encodeURIComponent(route.id)}` : "#/";
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
