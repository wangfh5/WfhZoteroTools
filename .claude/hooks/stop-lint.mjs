// .claude/hooks/stop-lint.mjs
// Stop hook: 一回合结束时，如果当前 session 编辑过代码就跑一次 lint:fix。
// dirty 标记按 session_id 命名，避免多会话互相覆盖。
// 全局 lock 串行化 lint:fix，避免并发 prettier --write 数据竞争。
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

const raw = await readStdin();
let payload = {};
try {
  payload = JSON.parse(raw);
} catch {
  // ignore
}

if (payload.stop_hook_active) process.exit(0);

const cwd = payload.cwd || process.cwd();
const sessionId = String(payload.session_id || "unknown").replace(
  /[^a-zA-Z0-9_-]/g,
  "_",
);
const stateDir = path.join(cwd, ".claude", ".hook-state");
const dirtyPath = path.join(stateDir, `dirty.${sessionId}`);

if (!fs.existsSync(dirtyPath)) process.exit(0);

try {
  fs.unlinkSync(dirtyPath);
} catch {
  // ignore
}

// 全局 lock：跨会话串行化 lint:fix。
const lockPath = path.join(stateDir, "lint.lock");
const LOCK_WAIT_MS = 60_000;
const STALE_LOCK_MS = 5 * 60_000;

function tryAcquireLock() {
  try {
    fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    return true;
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    return false;
  }
}

function lockIsStale() {
  try {
    const stat = fs.statSync(lockPath);
    if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) return true;
    const pidStr = fs.readFileSync(lockPath, "utf8").trim();
    const pid = Number(pidStr);
    if (!pid) return true;
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      return true;
    }
  } catch {
    return true;
  }
}

const waitStart = Date.now();
while (!tryAcquireLock()) {
  if (lockIsStale()) {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // ignore
    }
    continue;
  }
  if (Date.now() - waitStart > LOCK_WAIT_MS) {
    process.stderr.write("[Claude Hook] lint lock held too long, skipping\n");
    process.exit(0);
  }
  await sleep(500);
}

try {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const exitCode = await new Promise((resolve) => {
    const p = spawn(npmCmd, ["run", "lint:fix"], { cwd, stdio: "inherit" });
    p.on("close", (code) => resolve(code ?? 1));
  });
  process.stdout.write(
    exitCode === 0
      ? "[Claude Hook] lint:fix completed\n"
      : `[Claude Hook] lint:fix exited with ${exitCode}\n`,
  );
} finally {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // ignore
  }
}
process.exit(0);
