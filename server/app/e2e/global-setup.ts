import { ChildProcess, spawn } from "child_process";
import * as fs from "fs";
import * as net from "net";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Repo root is three levels up from server/app/e2e.
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const APP_DIR = path.resolve(__dirname, "..");

const MOCK_IRC_PORT = 6667;
const SERVER_PORT = 5229;

const PID_FILE = path.join(os.tmpdir(), "openbooks-e2e-pids.json");

function waitForPort(port: number, host = "127.0.0.1", timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise<void>((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ port, host });

      socket.once("connect", () => {
        socket.end();
        resolve();
      });

      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Timed out waiting for port ${port}`));
        } else {
          setTimeout(tryConnect, 250);
        }
      });
    };

    tryConnect();
  });
}

async function waitForHttp(url: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not ready yet
    }

    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${url}`);
    }

    await new Promise((r) => setTimeout(r, 250));
  }
}

function logPrefixed(name: string, proc: ChildProcess) {
  proc.stdout?.on("data", (chunk) =>
    process.stdout.write(`[${name}] ${chunk}`)
  );
  proc.stderr?.on("data", (chunk) =>
    process.stderr.write(`[${name}] ${chunk}`)
  );
}

export default async function globalSetup() {
  const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "openbooks-e2e-"));
  const serverBin = path.join(buildDir, "openbooks-server");
  const mockBin = path.join(buildDir, "mock_server");

  // Build the openbooks server binary (embeds server/app/dist, which must
  // already exist from `npm run build`) and the mock IRC/DCC server binary.
  const buildServer = spawn(
    "go",
    ["build", "-o", serverBin, "./cmd/openbooks"],
    { cwd: REPO_ROOT, stdio: "inherit" }
  );
  await new Promise<void>((resolve, reject) => {
    buildServer.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`go build ./cmd/openbooks exited ${code}`))
    );
  });

  const buildMock = spawn("go", ["build", "-o", mockBin, "./cmd/mock_server"], {
    cwd: REPO_ROOT,
    stdio: "inherit"
  });
  await new Promise<void>((resolve, reject) => {
    buildMock.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`go build ./cmd/mock_server exited ${code}`))
    );
  });

  // The mock server expects its data files (great-gatsby.epub, search
  // results zip) relative to its working directory.
  const mockProc = spawn(mockBin, [], {
    cwd: path.join(REPO_ROOT, "cmd", "mock_server"),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  logPrefixed("mock", mockProc);

  await waitForPort(MOCK_IRC_PORT);

  const downloadDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "openbooks-e2e-downloads-")
  );

  const serverProc = spawn(
    serverBin,
    [
      "server",
      "--tls=false",
      "--server",
      `localhost:${MOCK_IRC_PORT}`,
      "--port",
      String(SERVER_PORT),
      "--name",
      "e2e_bot",
      "--dir",
      downloadDir,
      "--persist"
    ],
    {
      cwd: APP_DIR,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  logPrefixed("server", serverProc);

  await waitForHttp(`http://localhost:${SERVER_PORT}/`);

  fs.writeFileSync(
    PID_FILE,
    JSON.stringify({
      mockPid: mockProc.pid,
      serverPid: serverProc.pid,
      buildDir,
      downloadDir
    })
  );
}
