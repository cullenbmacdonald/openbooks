# Plan: Frontend & Node dependency upgrade (`server/app`)

Status: **implemented** on `deps/upgrade-fe` — gates 0-3 green (steps 1-8 done);
remaining before merge: Gate 4 manual Chrome-extension pass (step 7) and a CI run.
Tracking: [`docs/docs/developers/todo.md`](../docs/developers/todo.md) → Maintenance →
"Update the React frontend and Node dependencies".

OpenBooks' React client (`server/app`) is pinned to a 2022-era stack. This plan
brings every dependency to its current latest, removes dead dependencies, and —
because the project currently has **no linter, no tests, and no frontend CI** —
stands up a five-gate verification net (types → lint → unit/component tests →
headless E2E against the mock → manual Chrome pass, backed by CI) so the whole
upgrade can be validated end-to-end, fully agentically, with no live IRC
connection. See [Verification strategy](#verification-strategy--how-we-know-it-works).

> The web UI is a thin client over `core.IrcClient` (see the Golden Rule in
> `CLAUDE.md`). None of this touches Go code or the IRC/DCC core — it is confined
> to `server/app`. The `//go:embed app/dist` contract is unchanged: we still
> produce `server/app/dist`.

## Discoveries (current state)

- **Toolchain is already current.** Local `node v25.2.1` / `npm 11.6.2`. There is
  nothing to do for Node/npm itself — "update Node" means the *client
  dependencies*, plus dropping the bogus `npm` runtime dep below.
- **Small surface.** ~22 source files, ~2,380 lines. The blast radius is the
  styling/theming layer, not application logic.
- **Build contract.** `npm run build` = `tsc && vite build` → emits
  `server/app/dist`, which `server/routes.go` embeds. A red `tsc` fails the
  build, so every type regression is caught at build time.
- **Dead dependencies (remove, don't bump):**
  - `react-router-dom` — listed in `package.json`, **zero imports** in `src`.
  - `npm` (`^8.19.1`) — npm itself pinned as a runtime dependency. Bogus; remove.
- **`@emotion/react`** has **no direct imports** in `src`; it exists only as
  Mantine 5's styling engine. Its fate is decided by the Mantine strategy below.
- **`lodash`** is used once (`lodash/throttle` in `state/store.ts`). Keep + bump.
- **`framer-motion`** used in 4 files (`AnimatePresence`, `motion`,
  `HTMLMotionProps`). The package still ships as `framer-motion` at v12, so we
  keep the name and bump (no switch to the `motion` package needed).
- **Known unrelated red test:** `core/search_parser_test.go` fails on `master`
  (Go, parser-vs-testdata). Out of scope; ignore.

## Target versions

| Package | Current | Target | Notes |
|---|---|---|---|
| `react` / `react-dom` | 18.2 | **19.x** | new JSX transform already in use |
| `@types/react` / `@types/react-dom` | 18.0 | **19.x** | |
| `@mantine/core` `/hooks` `/notifications` | 5.2 | **9.x** | the hard part — see below |
| `@mantine/emotion` | — | **9.x** | NEW: re-adds `createStyles`/emotion escape hatch |
| `@emotion/react` | 11.10 | **11.x** | kept as peer of `@mantine/emotion` |
| `@reduxjs/toolkit` | 1.8 | **2.x** | |
| `react-redux` | 8.0 | **9.x** | requires React 18+ ✓ |
| `@tanstack/react-table` | 8.5 | **8.x** | same major, just current |
| `@tanstack/react-virtual` | 3.0.0-**alpha** | **3.x stable** | API stabilized |
| `framer-motion` | 7.2 | **12.x** | keep package name |
| `phosphor-react` | 1.4 (deprecated) | **`@phosphor-icons/react` 2.x** | rename pkg + imports |
| `vite` | 3.1 | **8.x** | |
| `@vitejs/plugin-react` | 2.1 | **6.x** | |
| `typescript` | 4.8 | **5.x/6.x** | |
| `prettier` | 2.7 | **3.x** | reformat pass |
| `@types/node` | 18.7 | **current** | |
| `react-router-dom` | 6.3 | **removed** | unused |
| `npm` | 8.19 | **removed** | bogus runtime dep |

New tooling added by this work (there is currently **no** linter, **no** test
runner, and **no** frontend CI — see Verification strategy):

| Package | Purpose |
|---|---|
| `eslint` + `typescript-eslint` + `eslint-plugin-react-hooks` + `-react` + `-jsx-a11y` | flat-config lint; hook-rule + dead-import gate |
| `vitest` + `@testing-library/react` + `@testing-library/jest-dom` + `@testing-library/user-event` + `jsdom` | unit/component test layer |
| `@playwright/test` | headless E2E against the mock servers |

(Resolve exact patch versions at install time; table tracks the target majors.)

## The hard part: Mantine 5 → 9

Mantine 7 dropped the emotion-by-default styling engine and rewrote theming.
Mantine 9 is two more majors on top. The breaking changes that actually hit this
codebase:

1. **CSS import now required.** Mantine 7+ ships real CSS. `main.tsx` (or
   `App.tsx`) must `import "@mantine/core/styles.css"` (and
   `"@mantine/notifications/styles.css"`). Without it everything renders unstyled.
2. **`createStyles` / `createEmotionCache` removed from `@mantine/core`.** Used in:
   `App.tsx`, `components/sidebar/styles.ts`, `components/tables/styles.ts`,
   `components/sidebar/Sidebar.tsx`, `components/tables/Filters/FacetFilter.tsx`,
   `pages/SearchPage.tsx`.
   **Strategy: install `@mantine/emotion`**, which re-exports `createStyles` and
   `createEmotionCache`. This keeps all six files' styling logic intact (minus
   the import path + provider wiring) instead of rewriting them as CSS modules.
   Lowest-risk path; revisit CSS modules later if desired.
3. **`theme.colorScheme` removed from the theme object.** Styles that branch on
   `theme.colorScheme === "dark"` (in both `styles.ts` files, `App.tsx`'s
   `AppShell` styles) must move to the emotion helper's color-scheme argument or
   Mantine's `light-dark()` CSS function.
4. **Color scheme provider rewrite.** `ColorScheme`, `ColorSchemeProvider`
   (App.tsx) are gone. Replace with `MantineProvider defaultColorScheme` +
   `useMantineColorScheme()` for the dark/light toggle. The current
   `useLocalStorage`-backed toggle is now handled by Mantine's own color-scheme
   manager (`localStorageColorSchemeManager`).
5. **`MantineProvider` prop changes.** `withGlobalStyles`, `withNormalizeCSS`,
   `emotionCache` are removed. Emotion cache now goes through
   `<MantineEmotionProvider>` from `@mantine/emotion` + the `emotionTransform`
   on `MantineProvider`. Theme `primaryShade`, `colors`, `components.defaultProps`
   still supported.
6. **`AppShell` fully rewritten.** v5 `<AppShell navbar={<Sidebar/>}>` → v7+
   compositional API: `<AppShell navbar={{...}}>` with `<AppShell.Navbar>` /
   `<AppShell.Main>` children. `Sidebar` markup must move inside `AppShell.Navbar`.
7. **Notifications API.** `NotificationsProvider` → `<Notifications/>` component;
   `showNotification` (used in `state/util.ts`) → `notifications.show`. Requires
   the notifications CSS import.
8. **`@mantine/hooks` `useTextSelection` removed** (`components/tables/ErrorTable.tsx`).
   Replace with a small local hook over the `selectionchange` event (or drop the
   feature if it's only cosmetic — confirm during implementation).
   `useMergedRef`, `getHotkeyHandler`, `useElementSize`, `useLocalStorage`,
   `useViewportSize` still exist.
9. **Component prop audit.** `activeStyles`, `ActionIcon` `color`, `Burger`,
   `ScrollArea`, `Table`, `TextInput`, `Box` — verify props against v9 (e.g.
   Table now wants `Table.Thead/Tbody/Tr/Td` subcomponents). `tsc` will surface
   most of these.

Everything else (React 19, RTK 2, react-redux 9, react-table 8.x, react-virtual
stable, vite 8, TS, prettier) is comparatively mechanical — bump, fix the type
errors `tsc` reports, reformat.

## Verification strategy — how we know it works

Goal: a **fully agentic implementation with extremely high confidence**, so every
change is gated by automated checks the agent runs itself, and the whole upgrade
is shadowed by a regression net that was **authored against the working `master`
app first** (so it is a trusted oracle, not a post-hoc rationalization).

The current frontend has **none** of this — no linter, no tests, no frontend CI.
Building the safety net is therefore step 0 of the work, not an afterthought.

### The five gates (every one must be green to call a step done)

**Gate 0 — Static types (`tsc --noEmit`).** Strict mode is already on. This is the
primary catch for the Mantine/RTK/React type breaks. Surfaced by `npm run build`
(`tsc && vite build`); also exposed as a standalone `npm run typecheck` so it can
run without emitting.

**Gate 1 — Lint (`npm run lint`, NEW).** Add ESLint flat config with
`typescript-eslint`, `eslint-plugin-react-hooks` (critical across the React 19
move), `eslint-plugin-react`, and `eslint-plugin-jsx-a11y`. Run with
`--max-warnings=0`. This deterministically catches the things `tsc` won't: leftover
dead imports (old `phosphor-react`/`createStyles`/`react-router` references),
rules-of-hooks violations, unused vars after refactors. Prettier 3 `--check` is
part of this gate.

**Gate 2 — Unit / component tests (`npm run test`, NEW — Vitest + React Testing
Library + jsdom).** Two kinds, both authored against `master` first:
- **Pure logic (markup-independent, so stable across the whole upgrade):** the
  Redux layer — `stateSlice`, `historySlice`, `notificationSlice` reducers, the
  `socketMiddleware` message parsing/dispatch, and `api` config. These pin
  behavior across RTK 1→2 and react-redux 8→9 exactly.
- **Render smoke tests:** mount each component (and the whole `<App/>`) inside the
  real provider stack + store and assert it renders without throwing. `render(<App/>)`
  alone exercises the entire Mantine 9 provider/emotion/AppShell wiring — a missing
  CSS import, broken provider, or bad prop throws here. Query by **role/text**, never
  by Mantine class names, so the tests survive the AppShell/Table markup rewrite.

**Gate 3 — End-to-end against the mock (`npm run e2e`, NEW — Playwright,
headless).** The strongest automated proof: boot the real wired app and click it
like a user, no human in the loop.
- Fixture boots `task dev:mock` (mock IRC+DCC on `:6667`) + the built server
  (`openbooks server --tls=false --server localhost:6667`), waits for readiness.
- Spec drives the actual UI: load page → type a query → assert the results table
  populates from the mock → trigger a download → assert it appears in
  sidebar History/Library → toggle dark/light and assert it persists.
- **Console + page-error assertions:** the test fails on any `console.error` or
  uncaught exception. A correct Mantine 9 migration must be console-clean (no
  missing-stylesheet, emotion, or prop warnings). Selectors are role/text-based so
  the same spec runs unchanged on `master` (baseline) and on the upgraded app.

**Gate 4 — Manual agentic pass (Chrome extension, `mcp__claude-in-chrome__*`).**
The "looked at it with my own eyes" layer on top of the automated E2E:
- Capture **baseline screenshots on `master` first** (initial load, search+results,
  download/library, dark+light) — the visual oracle.
- After the upgrade, drive the same flows, `read_console_messages` to confirm
  console-clean, and **screenshot-compare against the baseline** — every visual
  diff must be explainable/intentional (Mantine 9 may shift spacing/typography).
- Record a `gif_creator` clip of the search→download happy path as the final
  human-reviewable artifact.

### Durable gate — CI (NEW `.github/workflows/frontend.yml`)

Run gates 0–3 on every PR touching `server/app` in a clean Ubuntu runner:
`npm ci` → `lint` → `typecheck` → `test` → `build` → boot mock+server → `e2e`
(with `playwright install --with-deps`). This proves the result reproduces off my
machine and keeps it from regressing later. (There is currently no PR CI at all,
so this is also a standalone improvement.)

### Definition of done

A step is "done" only when gates 0–3 are green locally. The **whole upgrade** is
done when: gates 0–3 green, the Playwright spec passes identically against the
upgraded app, the Chrome-extension pass is console-clean with baseline-parity
screenshots + happy-path gif, CI is green, and `./build.sh` produces a working
binary serving the embedded app.

## Execution order (incremental, each step gated by the five gates above)

Do this on a branch, committing per green step so any regression bisects cleanly.

1. **Build the safety net on `master` FIRST (the oracle).**
   - Add ESLint + Prettier-check (Gate 1), Vitest + RTL (Gate 2), Playwright (Gate
     3); add `lint`/`typecheck`/`test`/`e2e` scripts and the CI workflow.
   - Write the Redux-logic unit tests, the render smoke tests, and the
     search→download E2E spec **against the current app** and watch them pass.
     This is the regression net for everything that follows.
   - Capture the Chrome-extension baseline screenshots + gif (Gate 4 oracle).
2. **Dead-weight + low-risk bumps:** remove `react-router-dom` and `npm`; bump
   `vite`/`@vitejs/plugin-react`/`typescript`/`prettier`/`@types/node`,
   `react-virtual` → stable, `react-table` → current. Run all gates.
3. **React 19 + types + react-redux 9 + RTK 2.** Expect Gate 0/2 fixes in `state/`.
   Run all gates.
4. **Icons:** `phosphor-react` → `@phosphor-icons/react`; update the 5 import sites.
   Gate 1 catches stragglers; gates verify icons still render.
5. **framer-motion → 12.** Run all gates; E2E + manual verify sidebar/drawer anims.
6. **Mantine 5 → 9** (the big one), in sub-steps, each fully gated before the next.
   The E2E + render-smoke tests (role/text selectors) are the safety net here:
   a. Install `@mantine/*@9` + `@mantine/emotion`; add the CSS imports.
   b. Rewire providers in `App.tsx` (Mantine + Emotion + color scheme + Notifications).
   c. Port `createStyles` sites via `@mantine/emotion`; fix `theme.colorScheme`.
   d. Rewrite `AppShell` to the compositional API.
   e. Notifications API (`state/util.ts`).
   f. Replace `useTextSelection`; sweep remaining prop/type errors from gates 0/1.
7. **Full verification** vs. baseline: all gates green, E2E console-clean, manual
   screenshot-parity + happy-path gif.
8. **Cleanup:** `prettier --write`, ensure no `package-lock.json` peer-noise churn
   leaks into unrelated diffs (CLAUDE.md warning), final `./build.sh`, confirm CI
   green.
9. Tick the to-do item.

## Risks / watch-list

- **Mantine 9 is the only place this can get genuinely stuck** — specifically
  `AppShell` and the color-scheme rewrite. If `@mantine/emotion` proves painful,
  the fallback is converting the six `createStyles` sites to CSS modules (more
  churn, no emotion runtime). Decide at step 6c, not before.
- **`useTextSelection` removal** may change behavior in `ErrorTable`; confirm what
  it's actually for before reimplementing vs. dropping.
- **react-redux 9 + RTK 2** tighten types around `configureStore`/middleware and
  `Provider`; expect a few `tsc` fixes in `state/`.
- Keep `package-lock.json` churn out of unrelated commits (CLAUDE.md).
