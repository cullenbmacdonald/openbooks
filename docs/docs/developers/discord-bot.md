# Discord bot

The Discord bot lets users search for and download eBooks from Discord via a
`/request-book` slash command. It runs **alongside the web server** rather than
as a separate binary.

## User flow

1. User runs `/request-book query:<title/author>`.
2. Bot defers the reply, searches IRC, and renders results as a **select menu**
   (Discord caps menus at 25 options; the bot shows the first 25 and notes the
   total).
3. User picks one. The bot downloads the book to the server's download directory
   **and uploads the file** into the Discord reply. If the upload is rejected
   (too large / missing "Attach Files" permission) it falls back to a message
   with the on-disk path.

Files requested via the **web UI** are never uploaded to Discord — the upload
code lives only in the Discord interaction handler, and the web server uses a
separate IRC connection (see "Isolation" below).

## Package layout

- **`discord/discord.go`** — `Run(ctx, Config)`: opens the Discord session,
  registers the `/request-book` command, dispatches interactions
  (`handleRequest`, `handleSelect`), and cleans up on `ctx` cancel. Holds a
  short-lived in-memory `session` map (keyed by a UUID embedded in the select
  menu's custom id) so a selection can be mapped back to its result set; reaped
  after `sessionTTL`.
- **`discord/broker.go`** — `Broker`: wraps `core.IrcClient` and turns the
  shared, asynchronous connection into a **serialized, synchronous** API
  (`Search` / `Download`) with timeouts, rate limiting, and progress logging.

## Why a Broker

One bot process serves many Discord users over **one** IRC connection. IRC
replies have no request id, so the broker:

- Holds `opMu` for the full duration of a search or download (serializing them).
- Routes the in-flight result to the waiting caller via "sink" channels.
- Enforces the search rate limit and applies search/download timeouts.

This is the single-shared-connection model; contrast with the web server's
one-connection-per-browser approach. See
[adding-an-interface.md](adding-an-interface.md#one-connection-vs-many).

## Isolation from the web server

`server.startDiscordBot` builds a `discord.Config` from the server config and
launches `discord.Run` in a goroutine bound to the server's context. The bot
connects with a **distinct IRC nick** (`<name>-bot`) so it doesn't collide with
the web server's per-browser connections. It shares the same download directory,
search rate limit, `--log`, and `--debug` settings.

## Configuration

Enabled when **both** a token and a guild id are present:

| Flag | Env | Notes |
|------|-----|-------|
| `--discord-token` | `DISCORD_TOKEN` | Bot token (Developer Portal → your app → Bot → Reset Token) |
| `--discord-guild` | — | Guild (server) id; registers the command instantly in that guild |

```bash
openbooks server --name yournick \
  --discord-token <token>   # or export DISCORD_TOKEN \
  --discord-guild <guild-id> \
  --dir /srv/books --persist
```

Both the default desktop mode and `server` mode honor these flags (they're
global; mapped in `cmd/openbooks/util.go`).

Notes:
- The bot only needs the **Guilds** gateway intent (slash commands + components).
  No privileged intents required.
- "Guild" is Discord's API name for a server. With a guild id the command
  appears instantly; registering globally (no guild) can take up to an hour —
  the bot currently registers to the configured guild.
- Discord's slash command names cannot contain spaces/uppercase — keep it
  `request-book`.

## Debugging downloads

Run with `--debug` for concise transfer progress on stdout (`Receiving …`,
percentage, `Transfer complete`). Use `--log` to write the full raw IRC stream to
`<dir>/logs/`. A download that stalls then fails with `i/o timeout` means the
source bot is flaky — not a bug in the bot. See
[irc-and-dcc.md](irc-and-dcc.md#dcc-transfer-dccdccgo).
