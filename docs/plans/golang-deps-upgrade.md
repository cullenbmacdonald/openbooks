# Plan: Go toolchain & module dependency upgrade

Status: **proposed** (not yet started)
Tracking: [`docs/docs/developers/todo.md`](../docs/developers/todo.md) → Maintenance →
"Update to the latest Go release and bump module dependencies".

OpenBooks' Go side is pinned to a 2022-era stack: `go.mod` declares `go 1.19`,
the `golang.org/x/*` packages are on 2022 pseudo-versions, and several direct
dependencies are two-to-four years stale. This plan moves the module to a current
Go release, bumps every dependency to its current latest, and — critically —
defines a **self-driving verification loop** (build every package and build tag →
cross-compile every release target → `vet` + race-detector tests → `govulncheck`
→ run the binaries against the mock servers and watch a real search/download
complete) so the upgrade is *proven* end-to-end, not assumed.

> This is the Go counterpart to
> [Frontend & Node dependency upgrade](./frontend-deps-upgrade.md). The two are
> **independent** and should land as separate branches/PRs: that plan never
> touches Go; this plan never touches `server/app` source. They meet only at the
> `//go:embed app/dist` contract (this plan still consumes whatever `dist` the
> frontend produces) and in CI/Dockerfile, where both a Node bump and a Go bump
> are pending — coordinate those two files so the second PR doesn't clobber the
> first.

## Why this is a "huge jump"

Four years of Go releases (1.19 → current) plus four years of dependency drift.
Most of it is mechanical and safe, but two things make this more than a
`go get -u`:

1. **`mholt/archiver/v3` is the load-bearing migration** (this plan's Mantine).
   v3 is deprecated; the successor was **renamed** to a new module with a
   **completely different API** — `ByExtension`, the `Walker` interface, and
   `Walk`/`ErrStopWalk` (every symbol `util/archiver.go` depends on) are gone.
   This is the one file that needs a real rewrite, not a version bump. See
   [The hard part](#the-hard-part-archiver-v3--v4) below.
2. **The cgo webview desktop stack is fragile and platform-specific.**
   `webview/webview`, `inkeliz/gowebview`, `inkeliz/w32`, and `git.wow.st/gmp/jni`
   are only compiled under `-tags webview` and are **excluded from the
   `CGO_ENABLED=0` release builds**. They are the easiest deps to break and the
   easiest to forget to test, because no default build or CI job exercises them.

Everything else (chi, uuid, gorilla/websocket, cobra, cors, progressbar,
discordgo, testify, the `golang.org/x/*` set) is comparatively routine.

## Discoveries (current state)

- **Toolchain is already current locally.** `go version` → `go1.26.1
  darwin/arm64`. "Update Go" therefore means: raise the `go` directive in
  `go.mod`, optionally add a `toolchain` line, and bump the versions baked into
  CI and the Dockerfile (which still pin old Go/Node) — the dev machine itself
  needs nothing.
- **Module:** `github.com/evan-buss/openbooks`, `go 1.19`, **22 indirect** marker
  lines, `go.sum` ~108 lines. Small, comprehensible dependency graph.
- **Frontend-free packages already build clean.** `go build ./core/ ./irc/
  ./dcc/ ./cli/ ./discord/ ./util/` exits 0 and `go vet` is quiet on `master`.
  Good baseline.
- **`server/` and `desktop/` need the embed shim to build at all** (CLAUDE.md):
  `mkdir -p server/app/dist && touch server/app/dist/index.html` for a Go-only
  compile check, or a real frontend build. Any `go build ./...` that omits this
  fails on `server/routes.go: pattern app/dist: no matching files found` — that
  is *not* a dependency-upgrade regression; don't chase it.
- **Direct dependencies and their staleness:**

  | Module | Current | Notes |
  |---|---|---|
  | `github.com/go-chi/chi/v5` | v5.0.7 | router; v5 line, low-risk bump |
  | `github.com/google/uuid` | v1.3.0 | low-risk |
  | `github.com/gorilla/websocket` | v1.5.0 | low-risk; check maintenance status |
  | `github.com/mholt/archiver/v3` | v3.5.1 | **deprecated — the hard part** |
  | `github.com/rs/cors` | v1.8.2 | low-risk |
  | `github.com/schollz/progressbar/v3` | v3.10.1 | low-risk |
  | `github.com/spf13/cobra` | v1.5.0 | low-risk |
  | `github.com/stretchr/testify` | v1.7.2 | test-only, low-risk |
  | `github.com/bwmarrin/discordgo` | v0.29.0 | already near-current |
  | `github.com/webview/webview` | 2022 pseudo-version | **cgo, webview tag only** |
  | `github.com/inkeliz/gowebview` | v1.0.1 | **cgo, webview tag only** |
  | `golang.org/x/crypto` `/sys` `/term` | v0.0.0-2022… | bump to tagged releases |

- **Build/test surface:** three test files —
  `dcc/dcc_test.go`, `core/server_parser_test.go`, `core/search_parser_test.go`.
- **Known unrelated red test:** `core/search_parser_test.go` fails on `master`
  (`Expected 57 results but got 40`, parser-vs-testdata). Out of scope; it must
  be **equally red before and after** the upgrade — if its failure *changes*,
  that's signal; if it stays identical, ignore it (CLAUDE.md).
- **Build contract:** `build.sh` / `task release:build` cross-compile **five
  targets** with `CGO_ENABLED=0`: `windows/amd64`, `darwin/amd64`,
  `darwin/arm64`, `linux/amd64`, `linux/arm64`. The desktop/webview build is
  separate (`task release:build-desktop`, cgo, host platform only).
- **CI / packaging also pin old versions** (must move in lockstep):
  - `.github/workflows/release.yml` → `setup-go` `^1.19.2`, `setup-node` `18`.
  - `Dockerfile` → `FROM node:16`, `FROM golang` (untagged → floats, should be
    pinned to the chosen Go version).
  - `task go-update` already exists (`go get -u ./... && go mod tidy`) — the
    mechanical bump has a button; the verification is the work.

## Target versions

| Item | Current | Target | Notes |
|---|---|---|---|
| `go` directive (`go.mod`) | 1.19 | **current stable major.minor** | pick the latest GA at execution time; add a matching `toolchain` line |
| `golang.org/x/crypto` | v0.0.0-2022… | **latest tagged** | pseudo-version → real tag |
| `golang.org/x/sys` `/term` | v0.0.0-2022… | **latest tagged** | |
| `go-chi/chi/v5` | v5.0.7 | **latest v5** | |
| `google/uuid` | v1.3.0 | **latest v1** | |
| `gorilla/websocket` | v1.5.0 | **latest** | verify it's still maintained; note `coder/websocket` as a fallback only if abandoned |
| `rs/cors` | v1.8.2 | **latest** | |
| `schollz/progressbar/v3` | v3.10.1 | **latest v3** | |
| `spf13/cobra` (+ `pflag`) | v1.5.0 | **latest** | |
| `stretchr/testify` | v1.7.2 | **latest v1** | |
| `bwmarrin/discordgo` | v0.29.0 | **latest** | |
| `mholt/archiver/v3` | v3.5.1 | **`mholt/archives` (v4 line)** | **rename + API rewrite — see below** |
| webview stack (`webview/webview`, `inkeliz/gowebview`, `inkeliz/w32`, `wow.st/gmp/jni`) | 2022 pins | **latest** | cgo; bump cautiously, test under `-tags webview` |
| compression indirects (`klauspost/compress`, `pierrec/lz4/v4`, `andybalholm/brotli`, `ulikunitz/xz`, `dsnet/compress`, `nwaples/rardecode`, etc.) | 2022 pins | **whatever the new archiver pulls** | mostly transitive to the archiver choice |
| CI `setup-go` | ^1.19.2 | **match `go.mod`** | |
| CI `setup-node` / Docker `node` | 18 / 16 | **match the frontend plan** | coordinate with the Node bump |
| Docker `golang` base | untagged | **pinned to chosen Go** | |

(Resolve exact patch versions at execution time via `go get` / `go list -m -u
all`; this table tracks intent, not literals.)

## The hard part: archiver v3 → v4

`util/archiver.go` is the only Go file that needs real rework. It currently uses
four symbols that **do not exist** in the successor module:

- `archiver.ByExtension(path)` — format detection from a filename.
- `archiver.Walker` / `wIface.(archiver.Walker)` — the type assertion.
- `w.Walk(path, walkFn)` — iterate archive entries.
- `archiver.ErrStopWalk` / `archiver.File` — the walk's stop sentinel + entry type.

The successor (`github.com/mholt/archives`, the renamed v4) replaces all of this
with a different model: `archives.Identify()` for format detection and an
`Extractor` interface whose `Extract` takes a context + a per-entry handler
callback. The two behaviours this file relies on must be re-expressed in that
model:

1. **Extension detection on a `.temp`-suffixed path.** Today it strips `.temp`
   and calls `ByExtension`. The rewrite must detect format from the *real*
   extension (the code already computes `path[:len(path)-len(".temp")]`) using
   whatever the new API offers (likely `Identify` by filename, or by sniffing
   the opened file's magic bytes — the latter is actually more robust and may let
   us drop the `.temp` string-surgery entirely; decide during implementation).
2. **"Extract exactly one file, else deliver the archive itself."** The current
   walk grabs the first entry, and if a *second* entry appears it deletes the
   extracted file, stops the walk, and returns the original archive. In a
   callback-based `Extract`, replicate this by counting entries: extract the
   first, and on seeing a second, remove the extracted file and signal stop
   (return a sentinel error from the handler and treat it as success, or track
   state and short-circuit). The `IsArchive` helper (also `ByExtension`-based)
   needs the same detection swap.

> **Decision point — don't pre-commit.** If `mholt/archives` proves awkward for
> the "first-and-only-file" semantics, the fallback is to keep `archiver/v3`
> (it still compiles; deprecation is not removal) and bump *everything else*,
> deferring this single dep. Decide based on what the new API actually looks like
> at execution time, not from this doc. Either way, `dcc/`’s download tests and a
> live mock download (which exercises extraction) are the oracle that the
> behaviour is preserved.

## The other risk: the cgo webview desktop build

`desktop/desktop_webview.go`, `desktop_webview_windows.go`, and the
`webview`/`gowebview`/`w32`/`jni` deps are:

- **Behind a build tag** (`-tags webview`) — `go build ./...` does **not** compile
  them, so a clean default build proves nothing about them.
- **cgo + platform-specific** — the macOS path differs from Windows
  (`*_windows.go`), and the release pipeline builds them with cgo *enabled* only
  via `task release:build-desktop`, host-platform only.

Therefore the verification loop **must** include an explicit
`go build -tags webview ./desktop/` (and ideally `task release:build-desktop`) on
the host, and the doc must flag that Windows can only be smoke-built, not run,
from this environment. If a webview dep bump breaks cgo, isolate it: pin the
webview stack back and bump the rest, because the desktop mode is "experimental"
(per the Taskfile/CLAUDE.md) and must not block the core/server/cli/discord
upgrade.

## Verification loop (prove it, don't trust it)

The mock servers (`cmd/mock_server`, `mock/`) let us exercise a full
search→download→extract cycle with no real IRC connection. The upgrade is "done"
only when **every** gate below is green. Each is a concrete, observable check an
agent can run and read the output of.

**Static gates (fast, run on every step):**

1. **`go mod tidy` is a no-op afterward.** After bumps, `go mod tidy` then
   `git diff --exit-code go.mod go.sum` — a dirty tree means the graph isn't
   settled.
2. **Compile every package, including the embed-gated ones.** Create the dist
   shim (`mkdir -p server/app/dist && touch server/app/dist/index.html`), then
   `go build ./...`. Remove the shim after. **Exit 0 required.**
3. **Compile every build tag.** `go build -tags webview ./desktop/` on the host.
   This is the only thing that exercises the cgo stack.
4. **Cross-compile all five release targets.** Run the `CGO_ENABLED=0 GOOS/GOARCH`
   matrix from `build.sh` (or `task release:build`). A dep that uses a syscall
   unavailable on `windows` or `linux/arm64` fails here and nowhere else.
5. **`go vet ./...`** clean (modulo the embed shim) — must match the `master`
   baseline (quiet today).
6. **`govulncheck ./...`** — a *named benefit* of this upgrade. Capture the
   before (on `master`) and after; the after should have **fewer or zero**
   call-stack-reachable vulns. This is the headline justification for the bump.

**Behavioural gates (the real proof):**

7. **`go test ./...`** — and separately **`go test -race ./...`**. The race
   detector across the IRC/DCC/websocket concurrency is the highest-value test a
   dependency bump can run. The only allowed failure is the pre-existing
   `core/search_parser_test.go` mismatch, and its output must be **byte-identical**
   to the `master` baseline (capture both).
8. **CLI against the mock** — `task dev:mock` (background) + `task dev:cli`,
   then drive an actual search and a download. Confirm a file lands and, if it's
   an archive, that **extraction ran** (the archiver-rewrite oracle). Watch the
   progressbar render (progressbar bump) and the IRC handshake succeed.
9. **Server against the mock** — `task dev:server` (which builds the embedded app
   + serves it), then hit the websocket endpoint and run a search→download. This
   exercises chi, gorilla/websocket, cors, and the embed contract together. A
   lightweight client (the React app, or a scripted websocket client, or the
   Chrome extension against the served URL) confirms results stream back.
10. **Discord bot smoke** — at minimum `go build ./discord/`; if a test Discord
    token + the mock are available, start `discord.Run` and confirm the broker
    connects and a search round-trips. (discordgo is already near-current, so this
    is low-risk, but the `Broker`/serialization path should still be exercised.)
11. **Desktop (host-platform, best-effort)** — `task dev:desktop` /
    `build-desktop`; if a window opens and loads the served UI, the cgo bump is
    good. If the environment can't open a GUI, fall back to the `-tags webview`
    compile gate (#3) and say so explicitly in the report — don't claim it ran if
    it only compiled.

**Reporting rule (the agentic discipline):** every gate above must be reported as
the *command run + the observed result*, not "should pass". A gate that was
skipped (e.g. desktop GUI unavailable, no Discord token) is reported as **skipped
with the reason**, never silently dropped. "It builds" is not "it works" — gates
8–10 are what move this from the former to the latter.

## Execution order (incremental, each step independently green)

Do this on a branch, committing per green step so any regression bisects cleanly.
**Run the static gates after every step; run the behavioural gates at the
checkpoints marked ✅.**

1. **Baseline capture.** On `master`: record `go version`, `go list -m all`,
   `govulncheck` output, the exact `go test ./...` output (including the known red
   test), and a successful mock CLI+server download. This is the oracle every
   later step compares against.
2. **Go directive + `golang.org/x/*`.** Raise `go 1.19` → current, add
   `toolchain`, bump the `x/crypto`,`x/sys`,`x/term` pseudo-versions to tags.
   Static gates. ✅ `go test -race ./...`.
3. **Low-risk direct deps.** chi, uuid, gorilla/websocket, cors, progressbar,
   cobra/pflag, testify, discordgo — bump together (`go get` each, or
   `task go-update` then prune). Fix any minor API nits `go build`/`vet`
   surface. Static gates + ✅ mock CLI/server smoke (gates 8–9).
4. **archiver v3 → v4 (the hard part).** Swap the module, rewrite
   `util/archiver.go`'s `ExtractArchive`/`IsArchive` to the new API, let
   `go mod tidy` reshuffle the compression indirects. ✅ **Mandatory**: mock
   download of an *archived* book proves extraction still yields exactly one
   file (gate 8) + `go test ./dcc/...`. If it gets stuck, invoke the documented
   fallback (keep v3, defer) rather than blocking.
5. **Webview/cgo stack.** Bump the four cgo deps. ✅ `-tags webview` compile
   (gate 3) + host desktop run if possible (gate 11). On breakage, pin back and
   note it — must not block steps 2–4.
6. **Full cross-compile + the whole verification loop.** All five release
   targets, race tests, `govulncheck` (compare to baseline), every behavioural
   gate. Capture a transcript of each.
7. **CI + packaging.** Bump `setup-go` and the Docker `golang` base to match
   `go.mod`; align `setup-node`/Docker `node` with the frontend plan (coordinate
   so the two PRs don't fight over those files). Confirm `task release:build`
   still produces all five binaries.
8. **Cleanup.** `gofmt`/`goimports` pass, ensure `go.mod`/`go.sum` are tidy and
   minimal, no stray `// indirect` churn. Final full loop.
9. Tick the to-do item.

## Risks / watch-list

- **archiver v4 is the only place this can genuinely get stuck.** The
  "first-and-only-file, else deliver the archive" semantic is subtle; the mock
  archived-download is the *only* trustworthy proof it's preserved. Documented
  fallback: keep v3, bump everything else.
- **The cgo webview stack breaks silently** — no default build or CI job touches
  it. Without the explicit `-tags webview` gate it will look fine and ship
  broken. It's "experimental", so it must never block the core upgrade.
- **`gorilla/websocket` maintenance.** If it's effectively unmaintained at
  execution time, note it and the `coder/websocket` alternative — but **do not**
  switch libraries inside a dependency-bump PR; that's a separate, larger change
  with its own API migration. Bump-in-place or stay put.
- **Cross-compilation is where platform-specific syscalls bite.** A dep that
  builds on `darwin/arm64` can still fail `windows/amd64` or `linux/arm64`. The
  five-target matrix (gate 4) is non-negotiable.
- **CI/Docker drift.** If `release.yml`/`Dockerfile` aren't bumped with `go.mod`,
  the release pipeline builds with a Go version older than the module declares
  and may fail outside local dev. Step 7 exists precisely for this.
- **Don't "fix" the known red parser test.** It must stay identically red; a
  *change* in its output is the signal, sameness is the expectation (CLAUDE.md).
- **`ircVersion` is unaffected.** It's a CTCP allow-list string in
  `cmd/openbooks/main.go`, not a dependency — this upgrade must not touch it
  (CLAUDE.md).
</content>
</invoke>
