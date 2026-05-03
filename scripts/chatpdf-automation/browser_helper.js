const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const CDP_PORT = 9222;
const CDP_URL = `http://localhost:${CDP_PORT}`;

/**
 * Check if CDP endpoint is available by making a simple HTTP request
 */
function checkCDPAvailable() {
  return new Promise((resolve) => {
    const req = http.get(`${CDP_URL}/json/version`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => {
      resolve(false);
    });
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Wait for CDP endpoint to become available
 * @param {number} maxWaitMs - Maximum time to wait in milliseconds
 * @returns {Promise<boolean>} - True if CDP becomes available, false if timeout
 */
async function waitForCDP(maxWaitMs = 30000) {
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < maxWaitMs) {
    if (await checkCDPAvailable()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return false;
}

/**
 * Get an existing about:blank page or create a new one.
 * This avoids leaving unused blank tabs when the daemon starts.
 * @param {import('playwright').BrowserContext} context
 * @returns {Promise<import('playwright').Page>}
 */
async function getOrCreatePage(context) {
  const existingPages = context.pages();
  const blankPage = existingPages.find((p) => p.url() === "about:blank");
  return blankPage || (await context.newPage());
}

async function getOrLaunchBrowser(userDataDir = null) {
  try {
    // 尝试连接已运行的浏览器
    console.log("尝试连接已有浏览器...");
    const browser = await chromium.connectOverCDP(CDP_URL);
    const context = browser.contexts()[0];
    const page = await getOrCreatePage(context);
    if (userDataDir) {
      console.warn(
        `⚠️  已连接到正在运行的浏览器，--user-data-dir=${userDataDir} 被忽略。\n` +
          `   如需切换用户数据目录，请先关闭浏览器窗口再重新触发。`,
      );
    } else {
      console.log("已连接到现有浏览器，打开新 Tab。");
    }
    return { browser, context, page };
  } catch {
    // 无浏览器运行，启动守护进程
    console.log("未找到已有浏览器，启动守护进程...");

    const daemonScript = path.join(__dirname, "browser_daemon.js");
    const daemonArgs = [daemonScript];
    if (userDataDir) {
      daemonArgs.push(`--user-data-dir=${userDataDir}`);
    }
    // Use process.execPath (absolute path to current node binary) instead of
    // bare 'node', because Zotero's exec environment has a minimal PATH that
    // typically doesn't include /opt/homebrew/bin or /usr/local/bin.
    const daemonProcess = spawn(process.execPath, daemonArgs, {
      detached: true,
      stdio: "ignore",
    });

    // Unref to allow parent process to exit independently
    daemonProcess.unref();

    console.log("守护进程已启动，等待浏览器就绪...");

    // Wait for CDP to become available
    const isReady = await waitForCDP(30000);
    if (!isReady) {
      throw new Error("Timeout waiting for browser daemon to start");
    }

    console.log("浏览器就绪，正在连接...");

    // Connect to the browser launched by daemon
    const browser = await chromium.connectOverCDP(CDP_URL);
    const context = browser.contexts()[0];
    const page = await getOrCreatePage(context);

    console.log("已连接到守护进程浏览器。");

    return { browser, context, page };
  }
}

/**
 * Disconnect from the browser without closing it, then exit the process.
 * process.exit() terminates Node.js immediately; the browser stays running
 * because we never send a close command to it.
 */
function disconnectAndExit(exitCode = 0) {
  process.exit(exitCode);
}

module.exports = { getOrLaunchBrowser, disconnectAndExit };
