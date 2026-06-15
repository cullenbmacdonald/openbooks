# To-Do

Forward-looking work. Status reflects the current implementation — keep it in
sync as things land.

## Architecture

- [ ] **Switch the web server to a single shared IRC connection.** It currently
  opens one IRC connection *per browser* (`server/` creates a `core.IrcClient`
  per websocket). The shared `core.IrcClient` and the Discord bot's `Broker`
  (serialized requests + reply correlation, `discord/broker.go`) are the pattern
  to build on. See [Architecture](./architecture.md#connection-models-current-and-future).
- [ ] **Handle IRC nick collisions** (e.g. retry with an alternate nick on
  collision). Today the bot only *avoids* colliding with the web server by using
  a `<name>-bot` nick — there's no general recovery if a nick is already in use.
- [ ] **Reconnect to the same IRC connection when a websocket drops.** Currently
  the IRC connection is torn down immediately on disconnect (`server/client.go`
  `readPump`). Consider keeping the `Client` alive for a grace period so a
  reloaded browser can resume.

## Web UI

- [ ] **Show raw IRC logs in the browser.** Today they're only written to a file
  via `--log` (`core.Handlers.Message`).
- [ ] **Send download progress updates to the browser**, like the CLI shows. The
  `core.Handlers.Progress` hook already exists (CLI and the Discord bot use it);
  the server just needs to wire it up and stream progress over the websocket.
- [ ] **Client-side search caching** so repeated queries don't always hit the IRC
  server.
- [ ] **Responsive layout.**

## Maintenance

- [x] **Update the React frontend and Node dependencies** (`server/app`). Plan:
  [Frontend & Node dependency upgrade](../../plans/frontend-deps-upgrade.md)
  (Mantine 5→9 is the load-bearing migration; includes a Chrome-driven
  verification loop against the mock servers). Gates 0-3 (types, lint, unit
  tests, headless E2E) are green on `deps/upgrade-fe`; the Gate 4 manual
  Chrome-extension pass and CI run are tracked separately before merge.
- [ ] **Update to the latest Go release and bump module dependencies**
  (`go.mod` currently targets `go 1.19`). Plan:
  [Go toolchain & module dependency upgrade](../../plans/golang-deps-upgrade.md)
  (`mholt/archiver/v3` → v4 `mholt/archives` is the load-bearing rewrite;
  includes a build/cross-compile/race/`govulncheck` + mock-driven verification
  loop).
