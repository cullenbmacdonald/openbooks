# Architecture (engineering reference)

> Internal reference for contributors and coding agents. For end-user docs see
> the mkdocs site under `docs/docs/`.

OpenBooks is structured as **one shared core** with several thin **interfaces**
on top. The core knows how to talk to IRC, search for books, and download files.
Each interface decides only how a human (or bot) drives it and what to do with
the results.

```
                 ┌────────────────────────────────────────────┐
  interfaces     │  cli/      server/      discord/   desktop/  │
                 └─────┬──────────┬────────────┬─────────┬──────┘
                       │          │            │         │ (webview over server)
                       ▼          ▼            ▼         │
                 ┌────────────────────────────────────┐ │
  shared core    │  core.IrcClient  (core/client.go)   │◄┘
                 │  + core.Handlers callbacks          │
                 └───────┬───────────────┬─────────────┘
                         │               │
                ┌────────▼─────┐   ┌─────▼──────┐
  primitives    │ irc.Conn     │   │ dcc        │  + core parsers
                │ (irc/)       │   │ (dcc/)     │    (search/server lists)
                └──────────────┘   └────────────┘
```

## Packages

- **`irc/`** — `irc.Conn` wraps a TCP/TLS socket and speaks raw IRC
  (`Connect`, `JoinChannel`, `SendMessage`, `Pong`, `SendNotice`).
- **`dcc/`** — parses `DCC SEND` strings and streams the file over a separate TCP
  connection. This is how both search results and books physically arrive.
- **`core/`** — the brains:
  - `core/reader.go` — `StartReader` classifies each raw IRC line into an
    `event` (SearchResult, BookResult, NoResults, Ping, Version, …) and invokes
    the registered low-level `EventHandler`.
  - `core/irchighway.go` — `Join`, `SearchBook`, `DownloadBook`, `SendVersionInfo`.
  - `core/file.go` — `DownloadExtractDCCString`: download a DCC offer to disk and
    extract single-file archives.
  - `core/search_parser.go` / `core/server_parser.go` — parse the results file
    into `[]BookDetail` and parse the channel user list.
  - **`core/client.go` — `IrcClient` + `Handlers`: the single high-level API every
    interface uses.** See [adding-an-interface.md](adding-an-interface.md).
- **`cli/`, `server/`, `discord/`, `desktop/`** — interfaces (below).
- **`cmd/openbooks/`** — Cobra CLI; the binary's `main`.
- **`mock/`, `cmd/mock_server/`** — fake IRC + DCC servers for offline dev/tests.

## The shared layer: `core.IrcClient`

`IrcClient` owns an `irc.Conn` and turns raw IRC events into ready-to-use
callbacks. A consumer:

1. `client := core.NewIrcClient(username, version, saveDir)`
2. `client.Connect(server, enableTLS)`
3. `client.StartReader(ctx, handlers)` — registers internal handlers for
   ping/version/server-list keepalive **and** does the DCC download + parse for
   search results / books, then calls your `Handlers` callbacks.
4. `client.Search(searchBot, query)` / `client.Download(bookLine)`

`core.Handlers` is the integration point (all callbacks optional):

| Callback | When |
|----------|------|
| `SearchResults(books, parseErrors, resultsFilePath)` | results file downloaded + parsed (you own the file — delete it if you want) |
| `BookDownloaded(filePath)` | a book file finished downloading |
| `NoResults()` / `BadServer()` | search returned nothing / server offline |
| `SearchAccepted()` / `MatchesFound(count)` | queue/status updates |
| `ServerList(servers)` | channel user list (re)parsed |
| `Message(line)` | every raw IRC line (use for logging) |
| `Erred(err)` | download/parse failure |
| `Progress(filename, size) io.Writer` | optional writer to report transfer progress |

The point: the download/parse logic lives once. Interfaces differ only in their
callbacks (print to stdout, push JSON over a websocket, reply in Discord).

## Interfaces

- **`cli/`** — one connection; callbacks print to the terminal and drive an
  interactive menu (`cli/interactive.go`). Search shows the results-file path.
- **`server/`** — one `IrcClient` **per browser/websocket connection**; callbacks
  marshal the same JSON responses (`server/messages.go`) and push them over the
  socket. Serves the embedded React app. This per-connection model is how each
  user's IRC responses stay isolated.
- **`discord/`** — **one shared** `IrcClient` for all Discord users. Because IRC
  replies carry no correlation id, a `Broker` (`discord/broker.go`) serializes
  requests and exposes a synchronous `Search`/`Download`. See
  [discord-bot.md](discord-bot.md).
- **`desktop/`** — starts the web server and opens it in a native webview.

> Historical note: `docs/docs/developers/architecture.md` describes a "Current"
> (per-user connection) vs "Future" (single shared connection) design. The
> Discord `Broker` is the first realization of that shared-connection model.

## Entry points & wiring

`cmd/openbooks/` (Cobra):

- Default command → desktop (webview + server).
- `server` subcommand → `server.Start`.
- `cli` subcommand → interactive / `search` / `download`.
- Global flags map to each mode's config in `cmd/openbooks/util.go`
  (`bindGlobalServerFlags`).

The **Discord bot runs alongside the web server**: `server.Start` calls
`server.startDiscordBot`, which launches `discord.Run` in a goroutine when
`--discord-token` (or `DISCORD_TOKEN`) and `--discord-guild` are set.

## Data flow: a search

```
user → SearchBook(@searchbot query)
     → IRC bot replies "DCC SEND ..._results_for_... <ip> <port> <size>"
     → reader classifies as SearchResult
     → IrcClient: DownloadExtractDCCString() → ParseSearchFile() → []BookDetail
     → Handlers.SearchResults(books, errs, path)
     → interface renders the list (menu / JSON / Discord select)
user picks one → DownloadBook(book.Full)
     → IRC bot replies "DCC SEND <file> ..."
     → reader classifies as BookResult
     → IrcClient: DownloadExtractDCCString() → Handlers.BookDownloaded(path)
```
