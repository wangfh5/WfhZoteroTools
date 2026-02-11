const { chromium } = require('playwright');

const CDP_PORT = 9222;
const SHARED_PROFILE = '/Users/ssqc/Library/Caches/ms-playwright/daemon/chatpdf-shared-profile';

async function startDaemon() {
  console.log('Starting browser daemon...');
  
  try {
    const context = await chromium.launchPersistentContext(SHARED_PROFILE, {
      headless: false,
      channel: 'chrome',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
        `--remote-debugging-port=${CDP_PORT}`,
      ],
      viewport: null,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
    });

    console.log(`Browser ready on port ${CDP_PORT}`);
    console.log('Browser will stay open until you close the window manually.');
    console.log('To stop the daemon, close the browser window or press Ctrl+C.');

    // Keep the process alive by listening to context close
    context.on('close', () => {
      console.log('Browser closed by user, daemon exiting...');
      process.exit(0);
    });

    // Prevent process from exiting
    setInterval(() => {
      // Keep alive - do nothing
    }, 60000);

  } catch (error) {
    console.error('Failed to start browser daemon:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, exiting...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, exiting...');
  process.exit(0);
});

if (require.main === module) {
  startDaemon();
}

module.exports = { startDaemon };
