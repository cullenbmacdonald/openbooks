# Adding a new interface

A new way to drive OpenBooks (a TUI, a REST API, a Telegram bot, …) should be a
**thin wrapper over `core.IrcClient`**. Never reimplement IRC, DCC, or search
parsing — that logic is shared and lives in `core/`. The CLI, web server, and
Discord bot are all examples of this pattern.

## The recipe

```go
import "github.com/evan-buss/openbooks/core"

// 1. Construct. saveDir is where downloaded files land.
client := core.NewIrcClient(username, ircVersion, saveDir)

// 2. Connect + join #ebooks.
if err := client.Connect(server, enableTLS); err != nil {
    return err
}

// 3. Describe what to do with results.
handlers := core.Handlers{
    SearchResults: func(books []core.BookDetail, _ []core.ParseError, path string) {
        // render `books` however your UI wants; you own `path` (delete if done)
    },
    BookDownloaded: func(filePath string) {
        // the file is on disk at filePath; deliver/announce it
    },
    NoResults: func() { /* tell the user */ },
    BadServer: func() { /* tell the user */ },
    Erred:     func(err error) { /* log/report */ },
    // optional: SearchAccepted, MatchesFound, ServerList, Message, Progress
}

// 4. Start the reader (runs in a goroutine) and drive it.
client.StartReader(ctx, handlers)
client.Search(searchBot, query)   // results arrive via Handlers
// ...later, from a result:
client.Download(book.Full)         // book.Full is the verbatim download line
```

`client.Disconnect()` closes the connection. Cancel `ctx` to stop the reader.

## Decisions you must make

### One connection vs many

This is the key architectural choice and dictates how much glue you write.

- **One connection per user/session** (like `server/`): trivial correlation —
  each user's `IrcClient` only ever handles that user's replies. Set callbacks
  that route to that user. No serialization needed. Costs one IRC connection per
  active user.
- **One shared connection for everyone** (like `discord/`): you must correlate
  asynchronous IRC replies back to the requester yourself. IRC replies carry no
  request id, so the simplest correct approach is to **serialize**: hold a mutex
  for the duration of one search/download, route the next result to the waiting
  caller, release. See `discord/broker.go` for a working synchronous wrapper
  (`Search`/`Download` with timeouts + rate limiting).

If you share a connection **alongside the web server**, use a distinct IRC nick
(the Discord bot uses `<name>-bot`) so you don't collide.

### Save location

`saveDir` is exactly where files are written — no implicit subdirectory. The web
server and Discord bot pass `filepath.Join(downloadDir, "books")`; the CLI passes
its `--dir` directly. Pick whichever matches your UX.

### Logging & progress

- Set `Handlers.Message` to capture the raw IRC firehose. Convention: write it to
  a **file** (via `util.CreateLogFile`) only when a `--log`-style flag is set —
  do **not** dump it to stdout (it's the whole channel's chatter).
- Set `Handlers.Progress` to return an `io.Writer` for transfer progress (the CLI
  returns a `progressbar`; the Discord bot returns a throttled logger under
  `--debug`).

### Respect IRC etiquette

Rate-limit searches (≥10s) yourself and keep the `ircVersion` reply correct — see
[irc-and-dcc.md](irc-and-dcc.md#constraints-you-must-respect). These are enforced
by every existing interface for a reason.

## Wiring it into the binary

Add a Cobra command (or extend one) in `cmd/openbooks/`, map the global flags in
`cmd/openbooks/util.go`, and call your `Start`/`Run`. If your interface should run
**alongside** the web server (like Discord), launch it from `server.Start` in a
goroutine bound to the server's context rather than creating a separate binary —
that keeps a single launch path.
