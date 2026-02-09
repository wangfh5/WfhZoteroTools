const path = require('path');
const fs = require('fs');
const { getOrLaunchBrowser } = require('./browser_helper');

async function waitForGeminiSendButton(page, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  const selectors = [
    'button[type="submit"]',
    'button[aria-label*="Submit"]',
    'button[aria-label*="发送"]',
    'button[aria-label*="Send"]',
    'button:has(mat-icon:has-text("send"))',
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

  throw new Error('Timed out waiting for Gemini send button to become enabled.');
}

async function chatWithGemini(pdfPath, chatName, existingPage) {
  if (!pdfPath) {
    console.error('Usage: node gemini_chat_pdf.js <path-to-pdf> [chat-name]');
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

  console.log('正在启动浏览器 (Gemini)...');
  const page = existingPage || (await getOrLaunchBrowser()).page;

  try {
    console.log('正在访问 Gemini...');
    await page.goto('https://gemini.google.com/app');

    // 1. 切换模式为 Pro
    console.log('正在检查并切换至 Pro 模式...');
    const modeSelector = page.getByRole('button', { name: /快速|Fast|思考|Think|Pro/ });
    await modeSelector.waitFor({ state: 'visible' });
    await modeSelector.click();
    await page.getByRole('menuitemradio', { name: /Pro/ }).click();
    await page.waitForTimeout(1000);

    // 2. 上传文件
    console.log('正在上传文件...');
    await page.getByRole('button', { name: /打开文件上传菜单|Upload/ }).click();
    const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 10000 }),
        page.getByRole('button', { name: /上传文件|Upload files/ }).click(),
    ]);
    await fileChooser.setFiles(absolutePdfPath);
    console.log('文件已选择，等待上传完成...');
    await page.waitForTimeout(1000);

    // 3. 输入 Prompt 并发送
    console.log('正在输入提示词...');
    const textBox = page.getByRole('textbox', { name: /在此处输入提示|Enter a prompt/ });
    await textBox.waitFor({ state: 'visible' });

    // 使用 fill 确保内容完整进入
    await textBox.fill(promptText);

    // 给 UI 一个反应时间，确保发送按钮变为启用状态
    await page.waitForTimeout(500);

    console.log('等待发送按钮可点击...');
    const sendBtn = await waitForGeminiSendButton(page, 90000);
    console.log('发送按钮已就绪，执行发送...');

    try {
      await sendBtn.click({ timeout: 5000 });
    } catch {
      await sendBtn.evaluate((el) => el.click());
    }
    console.log('发送按钮已点击一次。');

    // 4. 重命名对话
    console.log('等待响应并准备重命名...');
    await page.waitForTimeout(15000); 

    try {
        console.log('正在执行重命名逻辑...');
        const sessionMenu = page.getByRole('button', { name: /打开对话操作菜单|Open chat actions menu/ });
        await sessionMenu.waitFor({ state: 'visible' });
        await sessionMenu.click();
        
        const renameBtn = page.getByRole('menuitem', { name: /重命名|Rename/ });
        await renameBtn.waitFor({ state: 'visible' });
        await renameBtn.click();
        
        // 定位重命名输入框
        const renameInput = page.locator('input[aria-label*="Rename"], input.rename-input, mat-dialog-container input').first();
        await renameInput.waitFor({ state: 'visible' });
        await renameInput.click();
        
        const newName = chatName || path.basename(absolutePdfPath, path.extname(absolutePdfPath));
        console.log(`写入新名称: ${newName}`);
        
        await page.keyboard.press('Meta+A');
        await page.keyboard.press('Backspace');
        await renameInput.fill(newName);
        await page.waitForTimeout(200);
        await page.keyboard.press('Enter');
        
        console.log(`✅ Gemini 对话已重命名。`);
    } catch (e) {
        console.log('重命名操作未完全成功，详情:', e.message);
    }

    console.log('任务完成！');

  } catch (error) {
    console.error('Gemini 脚本执行出错:', error);
  }
}

if (require.main === module) {
  const target = process.argv[2];
  const chatName = process.argv[3];
  chatWithGemini(target, chatName);
}

module.exports = { chatWithGemini };
