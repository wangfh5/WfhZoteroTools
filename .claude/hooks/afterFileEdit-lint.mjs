// .claude/hooks/afterFileEdit-lint.mjs
// PostToolUse: 只做一件事 —— 给本回合打上 "dirty" 标记。
// 真正的 lint:fix 由 Stop hook 在回合结束时跑一次（见 stop-lint.mjs）。
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

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

const cwd = payload.cwd || process.cwd();
const sessionId = String(payload.session_id || "unknown").replace(
  /[^a-zA-Z0-9_-]/g,
  "_",
);
const filePath =
  payload.tool_input?.file_path || payload.tool_input?.notebook_path || "";

if (!filePath) process.exit(0);

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

const stateDir = path.join(cwd, ".claude", ".hook-state");
fs.mkdirSync(stateDir, { recursive: true });
fs.writeFileSync(
  path.join(stateDir, `dirty.${sessionId}`),
  String(Date.now()),
  "utf8",
);
process.exit(0);
