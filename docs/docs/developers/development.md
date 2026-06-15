# Local development

## Prerequisites

- Go (module targets `go 1.19`).
- Node.js + npm (only needed to build/run the React frontend in `server/app`).
- [go-task](https://taskfile.dev) (`task`) — the task runner (`Taskfile.yaml`).

## Common tasks

```bash
task                 # list available tasks
task dev:init        # install Go + NPM dependencies
task dev:mock        # run the mock IRC + DCC server (localhost:6667)
task dev:server      # build + run web server against the mock (--tls=false)
task dev:cli         # build + run CLI against the mock
task dev:client      # run the React frontend (vite dev server)
task dev:desktop     # experimental webview mode (-tags webview)
```

`task dev:server` / `task dev:cli` point at `localhost:6667` with `--tls=false`,
so they talk to `task dev:mock` instead of the real IRC Highway — use this for
development so you don't hit the live servers (and their rate limits).

## Building

```bash
# Frontend (required before any build that imports server/ or desktop/)
cd server/app && npm install && npm run build

# Single binary
cd cmd/openbooks && go build

# All platforms + frontend
./build.sh        # outputs to build/
```

### The `app/dist` embed gotcha

`server/routes.go` has `//go:embed app/dist`. If `server/app/dist/` doesn't exist
(fresh checkout, frontend not built), builds that include `server`/`desktop` fail:

```
server/routes.go: pattern app/dist: no matching files found
```

For a **Go-only** change where you just want to compile/vet without building the
frontend:

```bash
mkdir -p server/app/dist && touch server/app/dist/index.html
go build ./... && go vet ./...
rm -rf server/app/dist
```

`core`, `irc`, `dcc`, `cli`, and `discord` build standalone (e.g.
`go build ./discord/`) — no stub needed for those.

## Testing

```bash
go test ./...
go test ./dcc/ ./core/      # specific packages
```

The `dcc` tests exercise real transfers against `mock/dcc_server.go`.

**Known pre-existing failure:** `core/search_parser_test.go` fails on `master`
(`Expected 57 results but got 40`) — a parser/testdata mismatch, not from current
work. Verify a suspected regression against a clean `master` before assuming you
caused a `core` test failure:

```bash
git stash --include-untracked && go test ./core/; git stash pop
```

## Mock servers

`cmd/mock_server` (using `mock/irc_server.go` + `mock/dcc_server.go`) emulates the
IRC search/download handshake and serves a sample `great-gatsby.epub` and a
canned search results zip. This lets you run the full search→download flow
offline. Point any interface at it with `--server localhost:6667 --tls=false`.

## Conventions

- Keep IRC/DCC/search logic in `core/` (one implementation). Interfaces wrap
  `core.IrcClient` — see [adding-an-interface.md](adding-an-interface.md).
- Run `gofmt` on changed files; `go vet ./...` should be clean.
- Don't include `server/app/package-lock.json` `"peer": true` churn in unrelated
  commits.
- Respect IRC etiquette (rate limit, version allow-list) — see
  [irc-and-dcc.md](irc-and-dcc.md#constraints-you-must-respect).
