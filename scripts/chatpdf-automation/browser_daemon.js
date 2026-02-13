const { chromium } = require("playwright");
const path = require("path");
const os = require("os");

const CDP_PORT = 9222;

// Default isolated user data directory (original behavior)
const DEFAULT_ISOLATED_USER_DATA_DIR = path.join(
  os.homedir(),
  "Library",
  "Caches",
  "ms-playwright",
  "daemon",
  "chatpdf-shared-profile",
);

/**
 * Resolve user data directory from input string.
 * - empty/null → default isolated directory
 * - anything else → treated as absolute path
 */
function resolveUserDataDir(input) {
  if (!input) return DEFAULT_ISOLATED_USER_DATA_DIR;
  return input;
}

/**
 * Extract --user-data-dir= value from process.argv
 */
function getUserDataDirFromArgs() {
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--user-data-dir=")) {
      return arg.substring("--user-data-dir=".length);
    }
  }
  return null;
}

async function startDaemon() {
  const userDataDirInput = getUserDataDirFromArgs();
  const userDataDir = resolveUserDataDir(userDataDirInput);

  console.log("Starting browser daemon...");
  console.log(
    `User data dir input: ${userDataDirInput || "(empty → isolated)"}`,
  );
  console.log(`Resolved user data dir: ${userDataDir}`);

  try {
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: "chrome",
      args: [
        "--disable-blink-features=AutomationControlled",
        "--start-maximized",
        `--remote-debugging-port=${CDP_PORT}`,
      ],
      viewport: null,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
    });

    console.log(`Browser ready on port ${CDP_PORT}`);
    console.log("Browser will stay open until you close the window manually.");
    console.log(
      "To stop the daemon, close the browser window or press Ctrl+C.",
    );

    // Keep the process alive by listening to context close
    context.on("close", () => {
      console.log("Browser closed by user, daemon exiting...");
      process.exit(0);
    });

    // Prevent process from exiting
    setInterval(() => {
      // Keep alive - do nothing
    }, 60000);
  } catch (error) {
    console.error("Failed to start browser daemon:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, exiting...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, exiting...");
  process.exit(0);
});

if (require.main === module) {
  startDaemon();
}

module.exports = { startDaemon };
