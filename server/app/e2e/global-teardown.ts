import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const PID_FILE = path.join(os.tmpdir(), "openbooks-e2e-pids.json");

function killTree(pid: number) {
  try {
    // Negative pid signals the whole process group (procs were spawned
    // `detached: true`, making each its own group leader).
    process.kill(-pid, "SIGTERM");
  } catch {
    // already gone
  }
}

export default async function globalTeardown() {
  if (!fs.existsSync(PID_FILE)) return;

  const { mockPid, serverPid, buildDir, downloadDir } = JSON.parse(
    fs.readFileSync(PID_FILE, "utf-8")
  );

  if (typeof serverPid === "number") killTree(serverPid);
  if (typeof mockPid === "number") killTree(mockPid);

  for (const dir of [buildDir, downloadDir]) {
    if (typeof dir === "string") {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  fs.rmSync(PID_FILE, { force: true });
}
