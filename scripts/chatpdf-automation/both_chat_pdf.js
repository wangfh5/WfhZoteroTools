const path = require("path");
const fs = require("fs");
const { getOrLaunchBrowser, disconnectAndExit } = require("./browser_helper");
const { chatWithChatGPT } = require("./chatgpt_chat_pdf");
const { chatWithGemini } = require("./gemini_chat_pdf");

// Parse command line arguments
function parseArgs(argv) {
  const args = [];
  let outputFile = null;
  let userDataDir = null;
  for (const arg of argv) {
    if (arg.startsWith("--output=")) {
      outputFile = arg.substring("--output=".length);
    } else if (arg.startsWith("--user-data-dir=")) {
      userDataDir = arg.substring("--user-data-dir=".length);
    } else {
      args.push(arg);
    }
  }
  return { args, outputFile, userDataDir };
}

async function chatWithBoth(
  pdfPath,
  chatName,
  outputFile = null,
  userDataDir = null,
) {
  if (!pdfPath) {
    console.error("Usage: node both_chat_pdf.js <path-to-pdf> [chat-name]");
    process.exit(1);
  }

  const absolutePdfPath = path.resolve(pdfPath);
  if (!fs.existsSync(absolutePdfPath)) {
    console.error(`File not found: ${absolutePdfPath}`);
    process.exit(1);
  }

  console.log("正在启动浏览器 (Both)...");
  const { context, page: defaultPage } = await getOrLaunchBrowser(userDataDir);

  // Close the default page and create two fresh pages
  const chatgptPage = await context.newPage();
  const geminiPage = await context.newPage();
  await defaultPage.close();

  console.log("开始并行执行 ChatGPT + Gemini...");

  // Hijack console.log to capture JSON output from each function
  const capturedUrls = [];
  const originalLog = console.log;
  console.log = (...args) => {
    const logStr = args.join(" ");
    capturedUrls.push(logStr);
    originalLog.apply(console, args);
  };

  const results = await Promise.allSettled([
    chatWithChatGPT(absolutePdfPath, chatName, chatgptPage, null),
    chatWithGemini(absolutePdfPath, chatName, geminiPage, null),
  ]);

  // Restore original console.log
  console.log = originalLog;

  // Write captured output to file if needed
  if (outputFile) {
    const outputLines = capturedUrls.filter((line) => line.startsWith("{"));
    if (outputLines.length > 0) {
      fs.writeFileSync(outputFile, outputLines.join("\n"));
    }
  }

  for (const [i, result] of results.entries()) {
    const provider = i === 0 ? "ChatGPT" : "Gemini";
    if (result.status === "fulfilled") {
      console.log(`✅ ${provider} 完成。`);
    } else {
      console.error(`❌ ${provider} 失败:`, result.reason);
    }
  }

  console.log("并行任务全部结束。");
  await disconnectAndExit(0);
}

if (require.main === module) {
  const { args, outputFile, userDataDir } = parseArgs(process.argv.slice(2));
  const target = args[0];
  const chatName = args[1];
  chatWithBoth(target, chatName, outputFile, userDataDir);
}

module.exports = { chatWithBoth };
