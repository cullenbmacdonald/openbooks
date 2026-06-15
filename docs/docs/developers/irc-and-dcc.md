# IRC + DCC

How search and download actually work under the hood. See also the
[IRC Notes](../irc-notes.md) for user-facing etiquette and the constraints IRC
Highway places on clients.

OpenBooks is essentially a purpose-built IRC client for IRC Highway's `#ebooks`
channel. Everything funnels through two protocols: IRC (control) and DCC (file
transfer).

## Connection lifecycle

`core.Join` (`core/irchighway.go`):

1. `irc.Conn.Connect` dials the server (TLS by default), sends `USER` + `NICK`.
2. Waits ~2s (the server often sends a private message first).
3. Joins `#ebooks`.

`core.IrcClient.StartReader` then runs `core.StartReader`, which scans the socket
line by line and classifies each line into an `event`.

## Events (`core/reader.go`)

The reader does **string matching** on raw lines to produce events:

| Event | Detected by | Meaning |
|-------|-------------|---------|
| `SearchResult` | `DCC SEND` + `_results_for` | the search results file is being sent |
| `BookResult` | `DCC SEND` (without `_results_for`) | a book file is being sent |
| `NoResults` | `NOTICE` + `Sorry` | search found nothing |
| `BadServer` | `NOTICE` + `try another server` | target eBook server offline |
| `SearchAccepted` | `NOTICE` + `has been accepted` | search queued |
| `MatchesFound` | `NOTICE` + `matches` | N matches found |
| `ServerList` | `353`/`366` (NAMES) | channel user list |
| `Ping` | `PING` | keepalive — must `PONG` |
| `Version` | `\x01VERSION\x01` | CTCP version query — must reply |

`core.IrcClient` registers handlers for all of these; UIs only see the
higher-level `core.Handlers` callbacks.

## Search → results file

1. `SearchBook(irc, searchBot, query)` sends `@<searchbot> <query>` to the channel
   (default search bot is `search`; `searchook` is a fallback).
2. The search bot DMs back a `DCC SEND` for a zip named `..._results_for_...`.
3. `DownloadExtractDCCString` downloads + unzips it to a `.txt`.
4. `ParseSearchFile` → `[]BookDetail`.

`BookDetail` (`core/search_parser.go`):

```go
type BookDetail struct {
    Server string // the !bot that hosts the file
    Author string
    Title  string
    Format string // epub, mobi, pdf, ...
    Size   string
    Full   string // the exact line to send back to download this book
}
```

`Full` is the important field — it is the verbatim string you send to download
the book (it begins with `!`).

## Download → book file

`DownloadBook(irc, book.Full)` posts the `!server ... title.ext` line to the
channel. The hosting bot replies with a `DCC SEND` for the file, which the reader
classifies as `BookResult` and `DownloadExtractDCCString` saves to disk.

## DCC transfer (`dcc/dcc.go`)

A `DCC SEND "<name>" <ip-as-int> <port> <size>` string is parsed by
`dcc.ParseString` (the IP is a 32-bit integer). `Download` then:

- `net.DialTimeout` (30s) to the sender.
- Reads in 4 KB chunks until `size` bytes received (the senders often never send
  EOF, so we count bytes rather than relying on `io.Copy`).
- Resets a **per-read idle deadline** (60s) before each read, so a stalled
  sender fails with an i/o timeout instead of hanging forever.

`DownloadExtractDCCString` (`core/file.go`) writes to `<name>.temp`, then either
renames it (non-archive) or extracts a single-file archive. A failed transfer
leaves a `.temp`; `core.IrcClient` removes it on error.

> If a download hangs as `.temp`, it's almost always a flaky/offline source bot.
> Run with `--debug` (or wire `Handlers.Progress`) to watch bytes flow; pick a
> different result/server if it stalls.

## Constraints you must respect

IRC Highway tolerates OpenBooks on good behavior. Two mechanisms enforce this:

1. **Search rate limiting** — at most ~1 search per 10s per instance. The server
   (`SearchTimeout`), CLI, and Discord broker (`RateLimit`) all enforce this. Do
   not remove or shorten it casually.
2. **Version allow-listing** — IRC Highway sends CTCP `VERSION`; the reply
   (`ircVersion` in `cmd/openbooks/main.go`, e.g. `OpenBooks 4.3.0`) must be on
   their allow-list or the connection is blocked. Only bump `ircVersion` when the
   admins require it. (`version` is the GitHub release version and is separate.)

Abusing either has gotten automated tools blocked before. Treat them as
load-bearing.
