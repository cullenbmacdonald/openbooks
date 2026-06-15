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
See [docs/adding-an-interface.md](docs/adding-an-interface.md).

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
  blocked. See [docs/irc-and-dcc.md](docs/irc-and-dcc.md).
- **DCC transfers can stall.** `dcc/dcc.go` has a dial timeout + per-read idle
  deadline so a stalled sender fails instead of hanging with a `.temp` file.
- **The Discord bot shares one IRC connection** for all users, so it serializes
  requests through a `Broker` and connects with a distinct nick (`<name>-bot`)
  to avoid colliding with the web server. See
  [docs/discord-bot.md](docs/discord-bot.md).
- **Don't commit `server/app/package-lock.json` churn.** npm rewrites it with
  `"peer": true` noise; keep it out of unrelated commits.

## Deeper docs

- [docs/architecture.md](docs/architecture.md) — packages, layering, data flow
- [docs/irc-and-dcc.md](docs/irc-and-dcc.md) — the IRC/DCC search+download protocol
- [docs/adding-an-interface.md](docs/adding-an-interface.md) — build a new UI on `core.IrcClient`
- [docs/discord-bot.md](docs/discord-bot.md) — Discord bot design + config
- [docs/development.md](docs/development.md) — local dev, mock servers, workflows

> These `docs/*.md` are engineering references for contributors/agents. The
> published user docs are the mkdocs site under `docs/docs/`.
