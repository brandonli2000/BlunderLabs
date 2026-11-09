import { useEffect, useRef, useState } from "react";
import type { PvLine, SearchLimits } from "../engine/engine";
import { LatestSearch } from "../engine/latestSearch";
import { getEngine } from "./engineInstance";

export const LIVE_LIMITS: SearchLimits = { depth: 18, multiPv: 3 };

export interface LiveLines {
  fen: string;
  lines: PvLine[];
  final: boolean;
}

/** Streaming engine lines for `fen` (null = idle), on the exploration worker. */
export function useLiveLines(fen: string | null): LiveLines | null {
  const [live, setLive] = useState<LiveLines | null>(null);
  const searchRef = useRef<LatestSearch | null>(null);

  useEffect(() => {
    searchRef.current ??= new LatestSearch(getEngine("explore"));
    const search = searchRef.current;
    if (!fen) {
      search.cancel();
      setLive(null);
      return;
    }
    setLive({ fen, lines: [], final: false });
    search.request(fen, LIVE_LIMITS, (searchedFen, lines, final) => setLive({ fen: searchedFen, lines, final }));
  }, [fen]);

  useEffect(() => () => searchRef.current?.cancel(), []);

  return live && live.fen === fen ? live : null;
}
