const path = require("path");
const fs = require("fs");
const { getOrLaunchBrowser, disconnectAndExit } = require("./browser_helper");

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

/**
 * Snapshot Gemini page state to detect if response is still generating.
 * Similar to ChatGPT's getResponseSnapshot.
 */
async function getGeminiResponseSnapshot(page) {
  return page.evaluate(() => {
    const stopButtons = Array.from(
      document.querySelectorAll(
        'button[aria-label*="Stop"], button[aria-label*="停止"]',
      ),
    );
    const hasStop = stopButtons.some((el) => {
      const style = window.getComputedStyle(el);
      return (
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        el.getClientRects().length > 0
      );
    });

    // Gemini response: main content area text length (grows during generation)
    const main = document.querySelector("main");
    let textLength = 0;
    if (main) {
      textLength = (main.innerText || main.textContent || "").trim().length;
    }

    return { hasStop, textLength };
  });
}

/**
 * Wait for Gemini response to finish before proceeding (e.g. before rename).
 * Uses similar logic to ChatGPT: stop button disappears + text stable.
 */
async function waitForGeminiResponseFinished(
  page,
  timeoutMs = 300000,
  quietMs = 6000,
) {
  const deadline = Date.now() + timeoutMs;
  let stopSeen = false;
  let lastLength = 0;
  let lastChangeAt = Date.now();
  let stableRounds = 0;
  let lastProbeLogAt = 0;

  await page.waitForTimeout(2000);

  while (Date.now() < deadline) {
    const snapshot = await getGeminiResponseSnapshot(page);
    const { hasStop, textLength } = snapshot;

    if (hasStop) stopSeen = true;
    if (textLength !== lastLength) {
      console.log(`Gemini 回答长度变化: ${lastLength} -> ${textLength}`);
      lastLength = textLength;
      lastChangeAt = Date.now();
      stableRounds = 0;
    }

    const quietForMs = Date.now() - lastChangeAt;

    if (Date.now() - lastProbeLogAt >= 5000) {
      lastProbeLogAt = Date.now();
      console.log(
        `Gemini 回答检测: hasStop=${hasStop} stopSeen=${stopSeen} textLength=${textLength} quietForMs=${quietForMs}`,
      );
    }

    if (stopSeen && !hasStop && textLength > 0 && quietForMs >= 2000) {
      console.log("检测到 Stop 消失，Gemini 回答结束。");
      return;
    }

    if (textLength > 0 && !hasStop && quietForMs >= quietMs) {
      stableRounds += 1;
      if (stableRounds >= 2) {
        console.log("检测到 Gemini 回答文本稳定，判定回答完成。");
        return;
      }
    } else {
      stableRounds = 0;
    }

    await page.waitForTimeout(800);
  }

  throw new Error("Timed out waiting for Gemini response to finish.");
}

async function waitForGeminiSendButton(page, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  // 2026-02: Send button has aria-label="发送", class includes "send-button".
  // It is hidden until text is typed in the prompt input.
  const selectors = [
    "button.send-button",
    'button[aria-label*="发送"]',
    'button[aria-label*="Send"]',
    'button[aria-label*="Submit"]',
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
        const isDisabledProp = "disabled" in el ? el.disabled : false;
        const disabledAttr = el.getAttribute("disabled") !== null;
        const ariaDisabled = el.getAttribute("aria-disabled") === "true";
        return isDisabledProp || disabledAttr || ariaDisabled;
      });

      if (!disabled) {
        return btn;
      }
    }
    await page.waitForTimeout(500);
  }

  throw new Error(
    "Timed out waiting for Gemini send button to become enabled.",
  );
}

async function chatWithGemini(
  pdfPath,
  chatName,
  existingPage,
  outputFile = null,
  userDataDir = null,
) {
  if (!pdfPath) {
    console.error("Usage: node gemini_chat_pdf.js <path-to-pdf> [chat-name]");
    process.exit(1);
  }

  const absolutePdfPath = path.resolve(pdfPath);
  if (!fs.existsSync(absolutePdfPath)) {
    console.error(`File not found: ${absolutePdfPath}`);
    process.exit(1);
  }

  const promptFilePath = path.join(__dirname, "chatpdf_prompt.md");
  if (!fs.existsSync(promptFilePath)) {
    console.error(`Prompt file not found: ${promptFilePath}`);
    process.exit(1);
  }
  const promptText = fs.readFileSync(promptFilePath, "utf-8").trim();

  console.log("正在启动浏览器 (Gemini)...");
  const page = existingPage || (await getOrLaunchBrowser(userDataDir)).page;

  try {
    console.log("正在访问 Gemini...");
    await page.goto("https://gemini.google.com/app");

    // 1. 切换模式为 Pro，并将思考等级设为「扩展」
    // 2026-05: Model options' data-test-id changed from stable names
    // (bard-mode-option-pro) to hashed suffixes (bard-mode-option-<hash>), so the
    // old selector matches nothing and the script stalled here. The menu trigger
    // data-test-id="bard-mode-menu-button" is unchanged; match the option by the
    // stable prefix + its visible "Pro" text (only the Pro tier contains "Pro").
    console.log("正在检查并切换至 Pro 模式...");
    const modeSelector = page.locator('[data-test-id="bard-mode-menu-button"]');
    await modeSelector.waitFor({ state: "visible" });
    const currentMode = (await modeSelector.getAttribute("aria-label")) || "";
    if (currentMode.includes("Pro")) {
      console.log("当前已是 Pro 模式，跳过切换。");
    } else {
      await modeSelector.click();
      // Options only render in the DOM while the menu is open.
      const proOption = page
        .locator('[data-test-id^="bard-mode-option-"]', { hasText: "Pro" })
        .first();
      await proOption.waitFor({ state: "visible", timeout: 5000 });
      await proOption.click();
      await page.waitForTimeout(1000);
    }

    // 1b. 思考等级设为「扩展」(thinking level → Extended)
    // The mode menu's 「思考等级」row has no data-test-id; it expands a submenu on
    // hover, where 「扩展」applies and closes the menu. The row's own label shows the
    // current level, so when it already reads 扩展 we skip the reopen/hover. Selecting
    // Pro first ensures the thinking-level control is present.
    console.log("正在设置思考等级为「扩展」...");
    try {
      await modeSelector.click();
      const thinkingTrigger = page.getByRole("menuitem", { name: /思考等级/ });
      await thinkingTrigger.waitFor({ state: "visible", timeout: 5000 });
      const triggerText = (await thinkingTrigger.innerText()).replace(
        /\s+/g,
        " ",
      );
      if (triggerText.includes("扩展")) {
        console.log("思考等级已是「扩展」，跳过设置。");
        await page.keyboard.press("Escape");
      } else {
        await thinkingTrigger.hover();
        await page.waitForTimeout(600);
        // Scope to the hover-opened submenu (the last role=menu panel in the DOM)
        // so 「扩展」can only match the submenu's option, never the parent row —
        // this disambiguates structurally rather than relying on the text guard.
        const extendedOption = page
          .getByRole("menu")
          .last()
          .getByRole("menuitem", { name: /扩展/ });
        await extendedOption.waitFor({ state: "visible", timeout: 5000 });
        await extendedOption.click();
        await page.waitForTimeout(800);
      }
    } catch (e) {
      console.log("设置思考等级时出现异常，详情:", e.message);
      await page.keyboard.press("Escape").catch(() => {});
    }

    // Verify the menu landed on Pro + 扩展. The mode button's aria-label reflects
    // both (e.g. 当前模式为“Pro 扩展”; standard level shows just “Pro”). Selection
    // happens before the upload, so a mismatch means the UI changed again — fail
    // fast here rather than silently producing a conversation in the wrong mode.
    // (In both_chat_pdf.js this runs under Promise.allSettled, so a throw fails only
    // the Gemini branch and leaves ChatGPT untouched.)
    const finalMode = (await modeSelector.getAttribute("aria-label")) || "";
    if (!finalMode.includes("Pro") || !finalMode.includes("扩展")) {
      throw new Error(
        `模式校验失败：期望「Pro 扩展」，实际「${finalMode}」。` +
          `Gemini UI 可能再次变更，请按 BROWSER-AUTOMATION-WORKFLOW.md 重新探索选择器。`,
      );
    }
    console.log("✅ 已确认模式为「Pro 扩展」。");

    // 2. 上传文件
    // 2026-05: The "+" button's aria-label changed from "打开文件上传菜单" to
    // "上传和工具" (now labeled "上传和工具/New"); match either label for safety.
    // The submenu item data-test-id="local-images-files-uploader-button" is unchanged.
    console.log("正在上传文件...");
    const uploadTrigger = page
      .locator(
        'button[aria-label="上传和工具"], button[aria-label="打开文件上传菜单"]',
      )
      .first();
    await uploadTrigger.waitFor({ state: "visible", timeout: 10000 });
    await uploadTrigger.click();

    // Wait for the upload menu to render
    const uploadOption = page.locator(
      '[data-test-id="local-images-files-uploader-button"]',
    );
    await uploadOption.waitFor({ state: "visible", timeout: 5000 });

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 10000 }),
      uploadOption.click(),
    ]);
    await fileChooser.setFiles(absolutePdfPath);
    console.log("文件已选择，等待上传完成...");
    await page.waitForTimeout(1000);

    // 3. 输入 Prompt 并发送
    // 2026-02: Textbox is a contenteditable div with aria-label "为 Gemini 输入提示".
    // Placeholder shows "问问 Gemini 3". The role=textbox selector remains stable.
    console.log("正在输入提示词...");
    const textBox = page.getByRole("textbox", {
      name: /输入提示|Enter a prompt/,
    });
    await textBox.waitFor({ state: "visible" });
    await textBox.fill(promptText);
    await page.waitForTimeout(500);

    console.log("等待发送按钮可点击...");
    const sendBtn = await waitForGeminiSendButton(page, 300000); // 5 分钟超时
    console.log("发送按钮已就绪，执行发送...");

    try {
      await sendBtn.click({ timeout: 5000 });
    } catch {
      await sendBtn.evaluate((el) => el.click());
    }
    console.log("发送按钮已点击一次。");

    // 4. 等待回答完成后再重命名（类似 ChatGPT 的等待逻辑）
    console.log("等待 Gemini 回答生成完成...");
    await waitForGeminiResponseFinished(page, 300000);
    await page.waitForTimeout(1500);

    try {
      console.log("正在执行重命名逻辑...");

      // Step 1: Open conversation actions menu (top-right "..." button)
      const sessionMenu = page.locator(
        '[data-test-id="conversation-actions-menu-icon-button"]',
      );
      await sessionMenu.waitFor({ state: "visible", timeout: 10000 });
      await sessionMenu.click();

      await page.waitForTimeout(400);

      // Step 2: Click the "重命名/Rename" menu item
      // 2026-02: Rename now has a stable data-test-id="rename-button"
      const renameBtn = page.locator('[data-test-id="rename-button"]');
      await renameBtn.waitFor({ state: "visible", timeout: 5000 });
      try {
        await renameBtn.click({ timeout: 3000 });
      } catch {
        // Fallback: evaluate-based click bypasses actionability checks
        await page.evaluate(() => {
          const el = document.querySelector('[data-test-id="rename-button"]');
          if (el) el.click();
        });
      }

      await page.waitForTimeout(500);

      // Step 3: Wait for the rename dialog and fill in the new name
      const renameInput = page.locator('[data-test-id="edit-title-input"]');
      await renameInput.waitFor({ state: "visible", timeout: 5000 });

      const newName =
        chatName ||
        path.basename(absolutePdfPath, path.extname(absolutePdfPath));
      console.log(`写入新名称: ${newName}`);
      await renameInput.fill(newName);
      await page.waitForTimeout(200);

      // Step 4: Click the confirm button
      const confirmBtn = page.locator('[data-test-id="save-button"]');
      await confirmBtn.waitFor({ state: "visible", timeout: 5000 });
      await confirmBtn.click();

      console.log(`✅ Gemini 对话已重命名。`);
    } catch (e) {
      console.log("重命名操作未完全成功，详情:", e.message);
    }

    console.log("任务完成！");

    // Capture and output URL for plugin to capture
    const conversationUrl = page.url();
    const outputData = JSON.stringify({
      provider: "gemini",
      url: conversationUrl,
    });
    if (outputFile) {
      fs.writeFileSync(outputFile, outputData);
    } else {
      console.log(outputData);
    }
  } catch (error) {
    console.error("Gemini 脚本执行出错:", error);
    throw error;
  }
}

if (require.main === module) {
  const { args, outputFile, userDataDir } = parseArgs(process.argv.slice(2));
  const target = args[0];
  const chatName = args[1];
  chatWithGemini(target, chatName, null, outputFile, userDataDir)
    .then(() => disconnectAndExit(0))
    .catch(() => disconnectAndExit(1));
}

module.exports = { chatWithGemini };
