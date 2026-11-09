import { ReviewPage } from "./ReviewPage";

export function App() {
  return (
    <div className="app">
      <header className="masthead">
        <div className="wordmark">
          <span className="wordmark-mark" aria-hidden>
            ??
          </span>
          <span className="wordmark-name">
            Blunder<span>Lab</span>
          </span>
        </div>
        <span className="masthead-tag">Game review</span>
      </header>
      <main>
        <ReviewPage />
      </main>
    </div>
  );
}
