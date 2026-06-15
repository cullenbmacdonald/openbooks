# CLAUDE.md

Orientation for coding agents working in this repo. Keep it accurate — update it
when the architecture changes.

OpenBooks is a single-purpose IRC client that searches for and downloads eBooks
from IRC Highway's `#ebooks` channel. It exposes the same core over multiple
**interfaces**: a terminal CLI, a web server (React frontend), a desktop webview,
and a Discord bot.

## Golden rule

There is **one** implementation of "connect to IRC, search, download, parse":
`core.IrcClient` (`core/client.go`). Every interface is a thin wrapper that calls
it and supplies a `core.Handlers` callback struct. **Do not** reimplement IRC,
DCC, or search-result parsing inside a UI — wire up `core.IrcClient` instead.
See [Adding an Interface](docs/docs/developers/adding-an-interface.md).

## Layout

| Path | Role |
|------|------|
| `irc/` | Low-level IRC connection (`irc.Conn`) |
| `dcc/` | DCC file-transfer protocol (how files actually arrive) |
| `core/` | Shared orchestration: `IrcClient`, `Handlers`, search/download, parsers |
| `cli/` | Terminal interface (wraps `core.IrcClient`) |
| `server/` | Web server: chi router, websockets, embedded React app (`//go:embed app/dist`) |
| `discord/` | Discord bot: `Run` + `Broker` (serializes the shared connection) |
| `desktop/` | Native webview over the web server |
| `cmd/openbooks/` | Cobra entrypoint (default desktop; `server` / `cli` subcommands) |
| `cmd/mock_server/`, `mock/` | Mock IRC + DCC servers for local dev/tests |

## Build / run / test

This repo uses [go-task](https://taskfile.dev) (`Taskfile.yaml`), not Make.

```bash
task dev:mock      # run mock IRC+DCC server on localhost:6667
task dev:server    # build + run web server against the mock
task dev:cli       # build + run CLI against the mock
task dev:client    # run the React frontend in dev mode (server/app)
task dev:desktop   # experimental webview mode

go test ./...      # tests
./build.sh         # build React app + cross-platform binaries into build/
```

### Frontend embed gotcha (read this before `go build`)

`server/` does `//go:embed app/dist`. On a fresh checkout that directory does
**not** exist, so **any** build pulling in `server` or `desktop` (including
`go build ./...` and `cmd/openbooks`) fails with:

```
server/routes.go: pattern app/dist: no matching files found
```

Fix it one of two ways:

- Real build: `cd server/app && npm install && npm run build` (or `./build.sh`).
- Go-only compile check (no frontend needed):
  `mkdir -p server/app/dist && touch server/app/dist/index.html`
  then build/vet, then `rm -rf server/app/dist`.

The `core`, `irc`, `dcc`, `cli`, and `discord` packages build standalone without
the frontend (e.g. `go build ./discord/`).

### Known pre-existing test failure

`core/search_parser_test.go` fails on `master` (`Expected 57 results but got 40`)
— a parser-vs-testdata mismatch unrelated to current work. Don't be alarmed and
don't "fix" it unless that's the task.

## Things that will bite you

- **IRC etiquette is load-bearing.** Searches are rate-limited (≥10s) and IRC
  Highway **allow-lists client versions** via CTCP VERSION. `ircVersion` in
  `cmd/openbooks/main.go` must stay on their allow-list or connections are
  blocked. See [IRC & DCC](docs/docs/developers/irc-and-dcc.md).
- **DCC transfers can stall.** `dcc/dcc.go` has a dial timeout + per-read idle
  deadline so a stalled sender fails instead of hanging with a `.temp` file.
- **The Discord bot shares one IRC connection** for all users, so it serializes
  requests through a `Broker` and connects with a distinct nick (`<name>-bot`)
  to avoid colliding with the web server. See
  [Discord Bot](docs/docs/developers/discord-bot.md).
- **Don't commit `server/app/package-lock.json` churn.** npm rewrites it with
  `"peer": true` noise; keep it out of unrelated commits.

## Deeper docs

These live in the mkdocs **Developers** section (`docs/docs/developers/`):

- [Architecture](docs/docs/developers/architecture.md) — packages, layering, data flow
- [IRC & DCC](docs/docs/developers/irc-and-dcc.md) — the IRC/DCC search+download protocol
- [Adding an Interface](docs/docs/developers/adding-an-interface.md) — build a new UI on `core.IrcClient`
- [Discord Bot](docs/docs/developers/discord-bot.md) — Discord bot design + config
- [Local Development](docs/docs/developers/development.md) — local dev, mock servers, workflows
