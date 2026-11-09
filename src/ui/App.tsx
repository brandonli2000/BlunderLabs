import { LibraryPage } from "./LibraryPage";
import { ReviewPage } from "./ReviewPage";
import { useHashRoute } from "./route";
import { useLibrary } from "./useLibrary";

export function App() {
  const [route, navigate] = useHashRoute();
  const library = useLibrary();

  return (
    <div className="app">
      <header className="masthead">
        <a className="wordmark" href="#/">
          <span className="wordmark-mark" aria-hidden>
            ??
          </span>
          <span className="wordmark-name">
            Blunder<span>Lab</span>
          </span>
        </a>
        <nav className="masthead-nav" aria-label="Main">
          <a href="#/" className={route.view === "library" ? "nav-active" : undefined}>
            Library
          </a>
          <span className={route.view === "game" ? "nav-active" : "nav-disabled"}>Review</span>
        </nav>
      </header>
      <main>
        {route.view === "library" ? (
          <LibraryPage library={library} onOpen={(id) => navigate({ view: "game", id })} />
        ) : (
          <ReviewPage key={route.id} gameId={route.id} onAnalysisSaved={() => void library.refresh()} />
        )}
      </main>
    </div>
  );
}
