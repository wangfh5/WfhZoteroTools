// .cursor/hooks/afterFileEdit-lint.mjs
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function safeParseJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const payloadRaw = await readStdin();
const payload = safeParseJson(payloadRaw) ?? {};

// Cursor 会给 workspace_roots；我们用它定位 repo 根目录
const workspaceRoot = payload.workspace_roots?.[0];
const filePath = payload.file_path || "";

// 如果拿不到 root，就直接退出（不阻塞 Agent）
if (!workspaceRoot) process.exit(0);

// 过滤：只对代码文件触发 lint，忽略 node_modules/dist 等
const normalized = filePath.replaceAll("\\", "/");
const isCodeFile =
  /\.(ts|tsx|js|jsx|mjs|cjs|xhtml|css)$/i.test(normalized) ||
  /CLAUDE\.md$/i.test(normalized) ||
  /AGENTS\.md$/i.test(normalized);
const isIgnored =
  normalized.includes("node_modules/") ||
  normalized.includes("dist/") ||
  normalized.includes("build/") ||
  normalized.includes(".scaffold/");

if (!isCodeFile || isIgnored) process.exit(0);

// 防抖状态文件 + 运行锁
const stateDir = path.join(workspaceRoot, ".cursor", ".hook-state");
fs.mkdirSync(stateDir, { recursive: true });

const pendingFile = path.join(stateDir, "lint.pending");
const lockFile = path.join(stateDir, "lint.lock");

// 触发一次 pending（更新 mtime）
fs.writeFileSync(pendingFile, String(Date.now()), "utf8");

// 如果 runner 已经在跑，就不再启动第二个
if (fs.existsSync(lockFile)) process.exit(0);

// 启动后台 runner（detached），脚本本身快速返回，不拖慢 Agent
const runnerPath = path.join(
  workspaceRoot,
  ".cursor",
  "hooks",
  "lint-runner.mjs",
);
const child = spawn(process.execPath, [runnerPath], {
  cwd: workspaceRoot,
  detached: true,
  stdio: "ignore",
});
child.unref();

process.exit(0);
