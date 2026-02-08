const { chromium } = require('playwright');

const CDP_PORT = 9222;
const CDP_URL = `http://localhost:${CDP_PORT}`;
const SHARED_PROFILE = '/Users/ssqc/Library/Caches/ms-playwright/daemon/chatpdf-shared-profile';

async function getOrLaunchBrowser() {
  try {
    // 尝试连接已运行的浏览器
    console.log('尝试连接已有浏览器...');
    const browser = await chromium.connectOverCDP(CDP_URL);
    const context = browser.contexts()[0];
    const page = await context.newPage();
    console.log('已连接到现有浏览器，打开新 Tab。');
    return { browser, context, page };
  } catch {
    // 无浏览器运行，启动新实例
    console.log('未找到已有浏览器，启动新实例...');
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
    const existingPages = context.pages();
    const page = existingPages.length > 0 ? existingPages[0] : await context.newPage();
    console.log('新浏览器已启动。');
    return { browser: null, context, page };
  }
}

module.exports = { getOrLaunchBrowser };
