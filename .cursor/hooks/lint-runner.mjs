// .cursor/hooks/lint-runner.mjs
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const workspaceRoot = process.cwd();
const stateDir = path.join(workspaceRoot, ".cursor", ".hook-state");
const pendingFile = path.join(stateDir, "lint.pending");
const lockFile = path.join(stateDir, "lint.lock");

// 防抖参数：可以通过环境变量调整
const DEBOUNCE_MS = Number(process.env.CURSOR_HOOK_LINT_DEBOUNCE_MS || 2500);
const MAX_WAIT_MS = Number(process.env.CURSOR_HOOK_LINT_MAX_WAIT_MS || 30000);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function mtimeMs(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

function runNpmLintFix() {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  return new Promise((resolve) => {
    const p = spawn(npmCmd, ["run", "lint:fix"], {
      cwd: workspaceRoot,
      stdio: "inherit",
    });
    p.on("close", (code) => resolve(code ?? 1));
  });
}

// 上锁，确保同一时间只有一个 runner
fs.mkdirSync(stateDir, { recursive: true });
fs.writeFileSync(lockFile, String(process.pid), "utf8");

try {
  const start = Date.now();

  // 等到"文件编辑事件安静下来"
  let last = mtimeMs(pendingFile);
  while (true) {
    await sleep(DEBOUNCE_MS);
    const now = mtimeMs(pendingFile);
    if (now === last) break; // 安静了
    last = now;

    if (Date.now() - start > MAX_WAIT_MS) break; // 最多等这么久
  }

  // 真正跑 lint:fix
  console.log("\n[Cursor Hook] Running npm run lint:fix...");
  const exitCode = await runNpmLintFix();
  if (exitCode === 0) {
    console.log("[Cursor Hook] ✅ lint:fix completed successfully");
  } else {
    console.log(`[Cursor Hook] ⚠️ lint:fix exited with code ${exitCode}`);
  }
} finally {
  // 解锁
  try {
    fs.unlinkSync(lockFile);
  } catch {
    // Ignore - lock file might already be removed
  }
}
