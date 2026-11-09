# BlunderLab: instructions for AI collaborators

BlunderLab is a chess improvement platform for public users. Its differentiator is
**evidence-based diagnostic training**: find which skills a player lacks, test those
hypotheses, train them, and measure whether the training worked. It is a long-term
product, not a prototype.

## Guiding objective

BlunderLab is the owner's (a high-school student's) primary software-engineering
portfolio project for university admissions (especially Waterloo CS/SE). That means:
- **Choose tasks by:** technical depth, originality, real-world usefulness, measurable
  impact, engineering quality, maintainability, and genuine learning, *not* by how
  impressive a screenshot looks. Never add complexity, frameworks, services or AI
  models just to look impressive. Every feature must serve a real purpose.
- **Differentiate.** Do not rebuild Chess.com/Lichess/Aimchess/DecodeChess features for
  their own sake. Prefer original algorithms and experimentally testable ideas. The
  flagship is evidence-based diagnostic training (ROADMAP Phase 3–5).
- **Aim for real users.** Prioritize reaching a public deployment, then real players
  (the owner's tutoring students, clubs, beginners), feedback, and measured outcomes.
- **Honesty is non-negotiable.** Never fabricate users, statistics, results or
  achievements. Never misrepresent authorship: AI writes and reviews a lot of the code,
  while the owner directs, decides and must understand it. Never imply admission is
  guaranteed.
- **Teach the owner.** For each significant decision or algorithm, explain the reasoning
  plainly so the owner can discuss and defend it. Record it in `DECISIONS.md` and, when
  it involved a real challenge, bug or measurement, in `ENGINEERING_LOG.md`.

## Session protocol (mandatory)

**Start of session**
1. Read `PROGRESS.md` (current state + "Next session" section), then skim `ROADMAP.md`
   and any `ARCHITECTURE.md` / `DECISIONS.md` sections relevant to the task.
2. Check `git status` and `git log --oneline -15`; run `npm run check` to confirm a green baseline.
3. Give the user a concise plan (highest-priority tasks first), then implement.

**End of session**
1. Verify: `npm run check` and `npm run build` pass; exercise UI changes in a real browser.
2. Update `PROGRESS.md` (done / partial / planned, bugs, next tasks with enough detail
   that a fresh session can start cold).
3. Add a `DECISIONS.md` entry for any significant choice; add `ENGINEERING_LOG.md`
   entries for hard bugs, challenges, performance numbers (measured, with method) and
   lessons. Update `ARCHITECTURE.md` only when structure or interfaces changed. Edit
   incrementally, never rewrite wholesale.
4. Give the owner a short "worth understanding" note: the key concept or tradeoff from
   the session, in plain language.
5. Commit in meaningful units. Commits with AI-written code carry a
   `Co-Authored-By: Claude <noreply@anthropic.com>` trailer. **Never push, force-push,
   rewrite history, or publish without explicit user approval.**

## Commands

- `npm run dev`: dev server (serves Stockfish at `/engine/`)
- `npm run check`: typecheck + all tests (includes real-Stockfish integration tests)
- `npm run build`: production build into `dist/`

## Engineering rules

- **Honesty about status.** Never call something working unless it was tested. In docs,
  keep "done", "partial" and "planned" distinct.
- **Pure core, thin UI.** Chess and analysis logic lives in `src/core`, `src/engine` and
  `src/analysis` as pure, DOM-free TypeScript with unit tests. React components render
  state and call into that logic; they hold no chess rules.
- **Test what matters.** New logic gets Vitest tests in the same folder (`*.test.ts`).
  Engine-dependent behaviour is tested against the real Stockfish build via
  `createNodeTransport()`, not mocks. Bug fixes start with a failing test.
- **Incremental changes.** Small, verified steps over large speculative rewrites.
- **Dependencies are a cost.** Add one only when it saves substantial, tricky work, and
  record it in `DECISIONS.md`. Current runtime deps: react, react-dom, chess.js, stockfish.
- **No speculative abstraction.** No interfaces, factories or layers until a second real
  use exists. Prefer plain functions and data. No duplicated logic: extract on the
  second copy.
- **TypeScript strict** (including `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
  No `any`; avoid non-null `!` except where an index is provably in range.
- **Scores:** every stored `Score` is White-POV (`src/core/types.ts`). Convert raw UCI
  scores with `toWhitePov` at the engine boundary only.
- **Privacy:** analysis runs locally; never send user games anywhere without an explicit,
  documented product decision.
- Comments explain *why*, not *what*. Keep files focused (split around ~300 lines).

## Visual identity: "lab notebook"

The look should be distinctive and consistent. Do not drift into generic SaaS/AI styling.
- Warm graph-paper ground (`--paper` with a faint 24px grid), ink-dark text, thin rules,
  small radii (3px). It should feel like a precise instrument or lab notebook.
- **Monospace for all chess data** (moves, evals, counts, labels); system sans for prose.
  Small uppercase tracked monospace for panel titles.
- Sage-and-ivory board. A single **signal scale reserved for move quality**: ochre
  (inaccuracy) → orange (mistake) → vermilion (blunder), teal for best. Do not use these
  colours decoratively.
- Forbidden: gradients as decoration, glassmorphism, purple/blue "AI" palettes, emoji
  icons, drop-shadow-heavy cards, stock illustration, marketing filler copy.
- All colours are CSS custom properties in `src/styles/global.css`, with light and dark
  themes. Add tokens there rather than hard-coding colours in components.
- Accessibility: keyboard navigation for every core flow, visible focus, labelled
  controls, sufficient contrast in both themes.
