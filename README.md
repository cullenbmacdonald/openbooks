# openbooks (cbm fork)

> **This is a fork of [evan-buss/openbooks](https://github.com/evan-buss/openbooks).**
> It tracks upstream but adds a Discord bot, a modernized frontend, and an
> upgraded toolchain. See [What's different in this fork](#whats-different-in-this-fork)
> below. Releases for this fork are published on the
> [fork's releases page](https://github.com/cullenbmacdonald/openbooks/releases),
> not upstream's.

> NOTE: Going forward only the latest release will be supported. If you encounter any issues, be sure you are using the latest version.

Openbooks allows you to download ebooks from irc.irchighway.net quickly and easily.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./.github/home_v3_dark.png">
  <img alt="openbooks screenshot" src="./.github/home_v3.png">
</picture>


## What's different in this fork

This fork builds on upstream `openbooks` with the following changes (see the
[v5.0.0-cbm release notes](https://github.com/cullenbmacdonald/openbooks/releases/tag/v5.0.0-cbm)
for the full changelog):

- **Discord bot interface** — request and download books from a Discord server.
  All users are serialized through one shared IRC connection via a `Broker`, and
  the bot connects with a distinct `<name>-bot` nick to avoid colliding with the
  web server.
- **Reworked core IRC client** — the shared `core.IrcClient` now exposes a
  `Handlers` callback model so every interface (CLI, web, desktop, Discord) is a
  thin wrapper over one implementation. DCC transfers gained a dial timeout and a
  per-read idle deadline so stalled senders fail instead of hanging.
- **Modernized frontend** — React 19, Redux Toolkit 2, Mantine 9, Vite 8, and
  framer-motion 12, with an ESLint + Vitest/RTL + Playwright test harness.
- **Upgraded backend toolchain** — Go 1.26, migrated `mholt/archiver/v3` →
  `mholt/archives` (v4), and refreshed Go/npm dependencies.
- **Docs for coding agents** — `CLAUDE.md` plus an engineering docs section.

> Docker images are published by upstream (`evanbuss/openbooks`) and do **not**
> include these fork changes. To run this fork, use a
> [fork release binary](https://github.com/cullenbmacdonald/openbooks/releases)
> or build from source (see [Development](#development)).

## Getting Started

### Binary

1. Download the latest release for your platform from this fork's [releases page](https://github.com/cullenbmacdonald/openbooks/releases).
2. Run the binary
   - Linux users may have to run `chmod +x [binary name]` to make it executable
3. `./openbooks --help`
   - This will display all possible configuration values and introduce the two modes; CLI or Server.

### Docker

- Basic config
  - `docker run -p 8080:80 evanbuss/openbooks`
- Config to persist all eBook files to disk
  - `docker run -p 8080:80 -v /home/evan/Downloads/openbooks:/books evanbuss/openbooks --persist`

### Setting the Base Path

OpenBooks server doesn't have to be hosted at the root of your webserver. The basepath value allows you to host it behind a reverse proxy. The base path value must have opening and closing forward slashes (default "/").

- Docker
  - `docker run -p 8080:80 -e BASE_PATH=/openbooks/ evanbuss/openbooks`
- Binary
  - `./openbooks server --basepath /openbooks/`

## Usage

For a complete list of features use the `--help` flags on all subcommands.
For example `openbooks cli --help or openbooks cli download --help`. There are
two modes; Server or CLI. In CLI mode you interact and download books through
a terminal interface. In server mode the application runs as a web application
that you can visit in your browser.

Double clicking the executable will open the UI in your browser. In the future it may use [webviews](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) to provide a "native-like" desktop application. 

## Development

### Install the dependencies

- `go get`
- `cd server/app && npm install`
- `cd ../..`
- `go run main.go`

### Build the React SPA and compile binaries for multiple platforms.

- Run `./build.sh`
- This will install npm packages, build the React app, and compile the executable.

### Build the go binary (if you haven't changed the frontend)

- `go build`

### Mock Development Server

- The mock server allows you to debug responses and requests to simplified IRC / DCC
  servers that mimic the responses received from IRC Highway.
- ```bash
  cd cmd/mock_server
  go run .
  # Another Terminal
  cd cmd/openbooks
  go run . server --server localhost --log
  ```

### Desktop App
Compile OpenBooks with experimental webview support:

``` shell
cd cmd/openbooks
go build -tags webview
```


## Why / How

- I wrote this as an easier way to search and download books from irchighway.net. It handles all the extraction and data processing for you. You just have to click the book you want. Hopefully you find it much easier than the IRC interface.
- It was also interesting to learn how the [IRC](https://en.wikipedia.org/wiki/Internet_Relay_Chat) and [DCC](https://en.wikipedia.org/wiki/Direct_Client-to-Client) protocols work and write custom implementations.

## Technology

- Backend
  - Golang (1.26)
  - Chi
  - gorilla/websocket
  - mholt/archives (extract files from various archive formats)
  - discordgo (Discord bot interface)
- Frontend
  - React 19
  - TypeScript
  - Redux / Redux Toolkit 2
  - Mantine 9 UI
  - Framer Motion
  - Vite 8 (build) · Vitest / RTL · Playwright (tests)
