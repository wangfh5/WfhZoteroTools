const path = require('path');
const fs = require('fs');
const { getOrLaunchBrowser } = require('./browser_helper');

const ARTIFACT_DIR = path.join(__dirname, 'artifacts');
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}
const LOG_FILE = path.join(ARTIFACT_DIR, 'chatgpt_automation.log');
const PINNED_CHAT_COUNT_FALLBACK = Math.max(
  0,
  Number.parseInt(process.env.CHATGPT_PINNED_COUNT || '2', 10) || 0,
);

function writeLog(level, ...args) {
  const timestamp = new Date().toISOString();
  const formatted = args.map((v) => {
    if (v instanceof Error) {
      return `${v.name}: ${v.message}${v.stack ? `\n${v.stack}` : ''}`;
    }
    if (typeof v === 'string') return v;
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  });
  const safeLine = `[${timestamp}] [${level}] ${formatted.join(' ')}\n`;
  fs.appendFileSync(LOG_FILE, safeLine, 'utf8');
}

const rawConsoleLog = console.log.bind(console);
const rawConsoleError = console.error.bind(console);
console.log = (...args) => {
  writeLog('INFO', ...args);
  rawConsoleLog(...args);
};
console.error = (...args) => {
  writeLog('ERROR', ...args);
  rawConsoleError(...args);
};

async function waitForChatGPTSendButton(page, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  const selectors = [
    'button[data-testid="send-button"]',
    'button[data-testid$="send-button"]',
    'button[aria-label*="Send"]',
    'button[aria-label*="发送"]',
    'button[type="submit"]',
  ];

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const btn = page.locator(selector).last();
      if ((await btn.count()) === 0) {
        continue;
      }
      if (!(await btn.isVisible())) {
        continue;
      }

      const disabled = await btn.evaluate((el) => {
        const isDisabledProp = 'disabled' in el ? el.disabled : false;
        const disabledAttr = el.getAttribute('disabled') !== null;
        const ariaDisabled = el.getAttribute('aria-disabled') === 'true';
        return isDisabledProp || disabledAttr || ariaDisabled;
      });

      if (!disabled) {
        return btn;
      }
    }
    await page.waitForTimeout(500);
  }

  throw new Error('Timed out waiting for ChatGPT send button to become enabled.');
}

async function getResponseSnapshot(page) {
  return page.evaluate(() => {
    const stopButtons = Array.from(
      document.querySelectorAll('button[aria-label*="Stop"], button[aria-label*="停止"]'),
    );
    const hasStop = stopButtons.some((el) => {
      const style = window.getComputedStyle(el);
      return (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        el.getClientRects().length > 0
      );
    });

    const assistantMessages = Array.from(
      document.querySelectorAll('[data-message-author-role="assistant"]'),
    );
    const lastMessage = assistantMessages[assistantMessages.length - 1];
    const text = (lastMessage?.innerText || lastMessage?.textContent || '').trim();

    return {
      hasStop,
      assistantCount: assistantMessages.length,
      textLength: text.length,
    };
  });
}

async function waitForChatGPTResponseFinished(page, timeoutMs = 180000, quietMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  let stopSeen = false;
  let assistantSeen = false;
  let lastLength = 0;
  let lastChangeAt = Date.now();
  let stableRounds = 0;
  let lastProbeLogAt = 0;

  // 给模型一点时间进入“生成中”状态
  await page.waitForTimeout(1500);

  while (Date.now() < deadline) {
    const snapshot = await getResponseSnapshot(page);
    const { hasStop, assistantCount, textLength } = snapshot;

    if (hasStop) {
      stopSeen = true;
    }
    if (assistantCount > 0) {
      assistantSeen = true;
    }
    if (textLength !== lastLength) {
      console.log(`回答长度变化: ${lastLength} -> ${textLength}`);
      lastLength = textLength;
      lastChangeAt = Date.now();
      stableRounds = 0;
    }

    const quietForMs = Date.now() - lastChangeAt;

    if (Date.now() - lastProbeLogAt >= 5000) {
      lastProbeLogAt = Date.now();
      console.log(
        `回答检测: hasStop=${hasStop} stopSeen=${stopSeen} assistantCount=${assistantCount} textLength=${textLength} quietForMs=${quietForMs}`,
      );
    }

    // 常规路径：见过 Stop，且 Stop 消失，且消息文本稳定一段时间
    if (stopSeen && !hasStop && assistantSeen && textLength > 0 && quietForMs >= 2000) {
      console.log('检测到 Stop 消失且发送按钮恢复可用，回答结束。');
      return;
    }

    // 兜底路径：不依赖 Stop/发送按钮，仅依赖“assistant 已出现 + 文本稳定”
    if (assistantSeen && textLength > 0 && !hasStop && quietForMs >= quietMs) {
      stableRounds += 1;
      if (stableRounds >= 2) {
        console.log('检测到回答文本稳定，判定回答完成。');
        return;
      }
    } else {
      stableRounds = 0;
    }

    await page.waitForTimeout(800);
  }

  throw new Error('Timed out waiting for ChatGPT response to finish.');
}

async function isVisible(locator, timeout = 1000) {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

async function openRenameMenuForCurrentChat(page) {
  const startUrl = page.url();
  console.log(`重命名前 URL: ${startUrl}`);
  const currentChatIdMatch = startUrl.match(/\/c\/([a-z0-9-]+)/i);

  const openSidebarBtn = page.getByRole('button', { name: /Open sidebar|打开侧边栏/i }).first();
  if ((await openSidebarBtn.count()) > 0) {
    try {
      if (await openSidebarBtn.isVisible()) {
        await openSidebarBtn.click({ force: true, timeout: 2000 });
        await page.waitForTimeout(250);
        console.log('已展开侧边栏');
      }
    } catch {
      // ignore
    }
  }

  const allChatLinks = page.locator('nav a[href^="/c/"]');
  const totalChatCount = await allChatLinks.count();
  if (totalChatCount === 0) {
    throw new Error('侧边栏里找不到任何聊天链接');
  }
  console.log(`侧边栏聊天总数: ${totalChatCount}`);

  const firstChatLink = allChatLinks.first();
  await firstChatLink.scrollIntoViewIfNeeded();

  const scrollResult = await firstChatLink.evaluate((el) => {
    let parent = el.parentElement;
    while (parent) {
      const style = window.getComputedStyle(parent);
      const scrollable =
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        parent.scrollHeight > parent.clientHeight;
      if (scrollable) {
        parent.scrollTop += 140;
        return {
          found: true,
          top: parent.scrollTop,
        };
      }
      parent = parent.parentElement;
    }
    return { found: false, top: -1 };
  });
  console.log(`聊天列表滚动结果: ${JSON.stringify(scrollResult)}`);
  await page.waitForTimeout(250);

  if (currentChatIdMatch) {
    const currentChatId = currentChatIdMatch[1];
    const currentChatLink = page
      .locator(`nav a[href="/c/${currentChatId}"], nav a[href*="/c/${currentChatId}"]`)
      .first();
    if (await isVisible(currentChatLink, 2500)) {
      await currentChatLink.scrollIntoViewIfNeeded();
      await currentChatLink.hover();
      const optionsBtn = currentChatLink
        .locator('button[aria-label="Open conversation options"], button[aria-label="打开对话操作菜单"]')
        .first();
      if (await isVisible(optionsBtn, 2000)) {
        await optionsBtn.click({ force: true, timeout: 3000 });
        const renameMenu = page.getByRole('menuitem', { name: /Rename|重命名/i }).first();
        if (await isVisible(renameMenu, 2000)) {
          console.log(`已定位当前会话并打开 options: /c/${currentChatId}`);
          console.log(`打开菜单后 URL: ${page.url()}`);
          return;
        }
        await page.keyboard.press('Escape');
      }
    } else {
      console.log(`未在侧栏中定位到当前会话 /c/${currentChatId}，转入非置顶探测`);
    }
  }

  const maxProbe = Math.min(totalChatCount, 12);
  let foundNonPinned = false;
  for (let index = 0; index < maxProbe; index += 1) {
    const chatLink = allChatLinks.nth(index);
    await chatLink.scrollIntoViewIfNeeded();
    await chatLink.hover();

    const optionsBtn = chatLink
      .locator('button[aria-label="Open conversation options"], button[aria-label="打开对话操作菜单"]')
      .first();
    if (!(await isVisible(optionsBtn, 1500))) {
      console.log(`第 ${index + 1} 条聊天未出现 options 按钮，跳过`);
      continue;
    }

    await optionsBtn.click({ force: true, timeout: 3000 });

    const renameMenu = page.getByRole('menuitem', { name: /Rename|重命名/i }).first();
    if (!(await isVisible(renameMenu, 2000))) {
      console.log(`第 ${index + 1} 条聊天未打开会话菜单，尝试关闭并继续`);
      await page.keyboard.press('Escape');
      continue;
    }

    const unpinMenu = page.getByRole('menuitem', { name: /Unpin chat|取消置顶|取消固定|取消钉住/i }).first();
    const isPinned = await isVisible(unpinMenu, 400);
    console.log(`第 ${index + 1} 条聊天是否置顶: ${isPinned}`);

    if (isPinned) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(120);
      continue;
    }

    foundNonPinned = true;
    console.log(`选中第 ${index + 1} 条非置顶聊天，准备重命名`);
    console.log(`非置顶探测后 URL: ${page.url()}`);
    return;
  }

  if (PINNED_CHAT_COUNT_FALLBACK > 0 && totalChatCount > PINNED_CHAT_COUNT_FALLBACK) {
    const fallbackIndex = PINNED_CHAT_COUNT_FALLBACK;
    console.log(`动态探测失败，使用兜底置顶数 ${PINNED_CHAT_COUNT_FALLBACK}，目标第 ${fallbackIndex + 1} 条`);
    const targetLink = allChatLinks.nth(fallbackIndex);
    await targetLink.scrollIntoViewIfNeeded();
    await targetLink.hover();

    const optionsBtn = targetLink
      .locator('button[aria-label="Open conversation options"], button[aria-label="打开对话操作菜单"]')
      .first();
    await optionsBtn.waitFor({ state: 'visible', timeout: 5000 });
    await optionsBtn.click({ force: true, timeout: 3000 });
    const renameMenu = page.getByRole('menuitem', { name: /Rename|重命名/i }).first();
    await renameMenu.waitFor({ state: 'visible', timeout: 5000 });
    console.log(`已按兜底策略选中第 ${fallbackIndex + 1} 条聊天`);
    return;
  }

  if (!foundNonPinned) {
    throw new Error('未找到可重命名的非置顶聊天。可设置 CHATGPT_PINNED_COUNT 作为兜底。');
  }
}

async function chatWithChatGPT(pdfPath, chatName) {
  if (!pdfPath) {
    console.error('Usage: node chatgpt_chat_pdf.js <path-to-pdf> [chat-name]');
    process.exit(1);
  }

  const absolutePdfPath = path.resolve(pdfPath);
  if (!fs.existsSync(absolutePdfPath)) {
    console.error(`File not found: ${absolutePdfPath}`);
    process.exit(1);
  }

  const promptFilePath = path.join(__dirname, 'chatpdf_prompt.md');
  if (!fs.existsSync(promptFilePath)) {
    console.error(`Prompt file not found: ${promptFilePath}`);
    process.exit(1);
  }
  const promptText = fs.readFileSync(promptFilePath, 'utf-8').trim();

  console.log('正在启动浏览器...');
  const { page } = await getOrLaunchBrowser();

  try {
    console.log('正在访问 ChatGPT...');
    await page.goto('https://chatgpt.com/');

    // 1. 切换模式为 Thinking
    console.log('设置模型为 Thinking...');
    await page.waitForSelector('[data-testid="composer-plus-btn"]');
    const modelBtn = page.getByTestId('model-switcher-dropdown-button');
    if (!(await modelBtn.innerText()).includes('Thinking')) {
        await modelBtn.click();
        await page.getByRole('menuitem', { name: /Thinking/i }).click();
        await page.waitForTimeout(1000);
    }

    // 2. 上传文件
    console.log('正在上传文件...');
    await page.getByTestId('composer-plus-btn').click();
    const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('menuitem', { name: /Add photos & files/i }).click(),
    ]);
    await fileChooser.setFiles(absolutePdfPath);
    await page.waitForTimeout(3000);

    // 3. 输入 Prompt 并发送
    console.log('正在输入提示词...');
    const inputArea = page.locator('#prompt-textarea');
    await inputArea.click({ force: true });
    await inputArea.fill(promptText);
    await page.waitForTimeout(300);

    console.log('等待发送按钮可点击...');
    const sendBtn = await waitForChatGPTSendButton(page, 90000);
    console.log('发送按钮已就绪，执行发送...');
    try {
      await sendBtn.click({ timeout: 5000 });
    } catch {
      await sendBtn.evaluate((el) => el.click());
    }
    console.log('发送按钮已点击一次。');

    // 4. 等待首轮回答完成后，再重命名侧边栏第一项
    console.log('等待首轮回答生成完成...');
    await waitForChatGPTResponseFinished(page, 180000);
    await page.waitForTimeout(1200);
    const activeConversationUrl = page.url();
    console.log(`回答完成后的会话 URL: ${activeConversationUrl}`);

    try {
        console.log('准备重命名当前对话...');
        // await page.screenshot({
        //   path: path.join(ARTIFACT_DIR, `chatgpt_before_rename_${Date.now()}.png`),
        // });
        await openRenameMenuForCurrentChat(page);
        await page.waitForTimeout(400);

        const renameBtn = page.getByRole('menuitem', { name: /Rename|重命名/i }).first();
        await renameBtn.waitFor({ state: 'visible', timeout: 5000 });
        console.log(`点击 Rename 前 URL: ${page.url()}`);
        await renameBtn.click({ force: true });
        console.log(`点击 Rename 后 URL: ${page.url()}`);
        await page.waitForTimeout(300);

        const newName = chatName || path.basename(absolutePdfPath, path.extname(absolutePdfPath));
        console.log(`正在写入新名称: ${newName}`);

        const renameInput = page.locator(
          'input[aria-label*="Rename"], input[placeholder*="Rename"], [role="dialog"] input, nav input',
        ).first();
        console.log(`rename input count: ${await renameInput.count()}`);
        await renameInput.waitFor({ state: 'visible', timeout: 5000 });
        await renameInput.click({ force: true });
        await renameInput.fill('');
        await renameInput.fill(newName);
        await page.waitForTimeout(200);

        const confirmBtn = page
          .locator('[role="dialog"] button')
          .filter({ hasText: /保存|Save|重命名|Rename/i })
          .first();
        if ((await confirmBtn.count()) > 0) {
          await confirmBtn.click({ force: true });
        } else {
          await renameInput.press('Enter');
        }
        
        console.log(`✅ 重命名成功: ${newName}`);
    } catch (e) {
        console.log('重命名失败，可能需要手动调整。详情:', e.message);
        await page.screenshot({
          path: path.join(ARTIFACT_DIR, `chatgpt_rename_failed_${Date.now()}.png`),
        });
    }

    if (/\/c\//.test(activeConversationUrl) && page.url() !== activeConversationUrl) {
      console.log(`检测到页面跳转到 ${page.url()}，恢复到原会话 ${activeConversationUrl}`);
      await page.goto(activeConversationUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(400);
    }

    console.log('流程结束。');
    // await page.screenshot({
    //   path: path.join(ARTIFACT_DIR, `chatgpt_final_record_${Date.now()}.png`),
    // });

  } catch (error) {
    console.error('脚本出错:', error);
  }
}

const target = process.argv[2];
const chatName = process.argv[3];
chatWithChatGPT(target, chatName);
