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
    "Timed out waiting for ChatGPT send button to become enabled.",
  );
}

async function getResponseSnapshot(page) {
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

    const assistantMessages = Array.from(
      document.querySelectorAll('[data-message-author-role="assistant"]'),
    );
    const lastMessage = assistantMessages[assistantMessages.length - 1];
    const text = (
      lastMessage?.innerText ||
      lastMessage?.textContent ||
      ""
    ).trim();

    return {
      hasStop,
      assistantCount: assistantMessages.length,
      textLength: text.length,
    };
  });
}

async function waitForChatGPTResponseFinished(
  page,
  timeoutMs = 180000,
  quietMs = 6000,
) {
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
    if (
      stopSeen &&
      !hasStop &&
      assistantSeen &&
      textLength > 0 &&
      quietForMs >= 2000
    ) {
      console.log("检测到 Stop 消失且发送按钮恢复可用，回答结束。");
      return;
    }

    // 兜底路径：不依赖 Stop/发送按钮，仅依赖“assistant 已出现 + 文本稳定”
    if (assistantSeen && textLength > 0 && !hasStop && quietForMs >= quietMs) {
      stableRounds += 1;
      if (stableRounds >= 2) {
        console.log("检测到回答文本稳定，判定回答完成。");
        return;
      }
    } else {
      stableRounds = 0;
    }

    await page.waitForTimeout(800);
  }

  throw new Error("Timed out waiting for ChatGPT response to finish.");
}

async function isVisible(locator, timeout = 1000) {
  try {
    await locator.waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

function normalizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

async function getVisibleComposerPillText(page) {
  const pill = await page.evaluate(() => {
    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      return (
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        el.getClientRects().length > 0
      );
    };

    const normalize = (text) => (text || "").replace(/\s+/g, " ").trim();
    const buttons = Array.from(
      document.querySelectorAll("button.__composer-pill"),
    ).filter(isVisible);

    const preferred = buttons.find((button) =>
      /^(Instant|Medium|High|Extra High|Pro|GPT-5\.5|Thinking|Model)$/i.test(
        normalize(button.innerText || button.textContent),
      ),
    );
    const button = preferred || buttons[0];
    if (!button) return null;

    const text = normalize(button.innerText || button.textContent);
    return { text };
  });
  return pill?.text || null;
}

async function clickVisibleComposerPill(page) {
  const preferred = page
    .locator("button.__composer-pill")
    .filter({
      hasText: /Instant|Medium|High|Extra High|Pro|GPT-5\.5|Thinking|Model/i,
    })
    .first();
  const pill =
    (await preferred.count()) > 0
      ? preferred
      : page.locator("button.__composer-pill").first();

  await pill.waitFor({ state: "visible", timeout: 5000 });
  const text = normalizeText(await pill.innerText());
  await pill.click({ force: true, timeout: 5000 });
  return text;
}

async function waitForVisibleComposerPill(page, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const text = await getVisibleComposerPillText(page);
    if (text !== null) return text;
    await page.waitForTimeout(200);
  }
  throw new Error(
    "Timed out waiting for ChatGPT composer model/intelligence pill.",
  );
}

async function clickVisibleChoice(
  page,
  {
    exactText = null,
    pattern = null,
    roles = ["menuitemradio"],
    rootSelector = null,
    timeout = 3000,
  },
) {
  const deadline = Date.now() + timeout;
  const reSource = pattern?.source || null;
  const reFlags = pattern?.flags || "";

  while (Date.now() < deadline) {
    const clicked = await page.evaluate(
      ({ exactText, reSource, reFlags, roles, rootSelector }) => {
        const isVisible = (el) => {
          const style = window.getComputedStyle(el);
          return (
            style.visibility !== "hidden" &&
            style.display !== "none" &&
            el.getClientRects().length > 0
          );
        };

        const normalize = (text) => (text || "").replace(/\s+/g, " ").trim();
        const roleSelector = roles.map((role) => `[role="${role}"]`).join(",");
        const roots = rootSelector
          ? Array.from(document.querySelectorAll(rootSelector)).filter(
              isVisible,
            )
          : [document];
        const re = reSource ? new RegExp(reSource, reFlags) : null;

        for (const root of roots) {
          const items = Array.from(root.querySelectorAll(roleSelector));
          for (const item of items) {
            if (!isVisible(item)) continue;
            const text = normalize(item.innerText || item.textContent);
            const label = normalize(item.getAttribute("aria-label") || "");
            const matches = exactText
              ? text === exactText || label === exactText
              : re && (re.test(text) || re.test(label));
            if (matches) {
              item.click();
              return { text, label };
            }
          }
        }
        return null;
      },
      { exactText, reSource, reFlags, roles, rootSelector },
    );

    if (clicked) return clicked;
    await page.waitForTimeout(200);
  }

  return null;
}

async function clickChatGPTUploadFilesMenuItem(page, timeout = 5000) {
  const deadline = Date.now() + timeout;
  const uploadPattern =
    /^(Add photos? (&|and) files|Upload files?|上传.*文件|添加.*文件)$/i;

  while (Date.now() < deadline) {
    const clicked = await page.evaluate((reSource) => {
      const re = new RegExp(reSource, "i");
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        return (
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          el.getClientRects().length > 0
        );
      };
      const normalize = (text) => (text || "").replace(/\s+/g, " ").trim();
      const candidates = document.querySelectorAll(
        '[role="menuitem"], .__menu-item, [tabindex="0"]',
      );

      for (const item of candidates) {
        if (!isVisible(item)) continue;
        const text = normalize(item.innerText || item.textContent);
        if (re.test(text)) {
          item.click();
          return text;
        }
      }
      return null;
    }, uploadPattern.source);

    if (clicked) return clicked;
    await page.waitForTimeout(200);
  }

  return null;
}

async function maybeSelectLegacyThinkingEffortHigh(page) {
  const effortTrigger = page
    .locator(
      'button[aria-label="Open thinking effort menu"], button.__composer-pill-trigger',
    )
    .first();

  if ((await effortTrigger.count()) === 0) return false;
  if (!(await isVisible(effortTrigger, 1000))) return false;

  await effortTrigger.click({ force: true, timeout: 5000 });
  const picked = await clickVisibleChoice(page, {
    exactText: "High",
    roles: ["menuitemradio", "menuitem"],
    timeout: 3000,
  });
  return Boolean(picked);
}

async function ensureChatGPTHighIntelligence(page) {
  const target = "High";
  const initialText = await waitForVisibleComposerPill(page, 10000);
  console.log(`当前 ChatGPT 模型/智能等级: ${initialText}`);

  if (normalizeText(initialText) === target) {
    console.log(`ChatGPT 智能等级已是 ${target}，跳过设置。`);
    return;
  }

  const openedText = await clickVisibleComposerPill(page);
  if (!openedText) {
    throw new Error("未找到 ChatGPT 模型/智能等级按钮。");
  }

  // 2026-06: ChatGPT merged the old Thinking model/effort controls into a
  // single Intelligence dropdown in the composer.
  const newUiPicked = await clickVisibleChoice(page, {
    exactText: target,
    roles: ["menuitemradio"],
    rootSelector: '[data-testid="composer-intelligence-picker-content"]',
    timeout: 5000,
  });

  if (newUiPicked) {
    await page.waitForTimeout(600);
    const finalText = await waitForVisibleComposerPill(page, 5000);
    if (normalizeText(finalText) !== target) {
      throw new Error(
        `ChatGPT 智能等级校验失败：期望 ${target}，实际 ${finalText}`,
      );
    }
    console.log(`✅ 已设置 ChatGPT 智能等级为 ${target}。`);
    return;
  }

  // Legacy fallback (2026-04 UI): choose Thinking, then use the old effort
  // trigger if it is present.
  const legacyPicked = await clickVisibleChoice(page, {
    pattern: /Thinking/i,
    roles: ["menuitemradio", "menuitem"],
    timeout: 3000,
  });
  if (legacyPicked) {
    await page.waitForTimeout(800);
    const effortPicked = await maybeSelectLegacyThinkingEffortHigh(page);
    console.log(
      effortPicked
        ? "✅ 已设置旧版 ChatGPT Thinking + High effort。"
        : "✅ 已设置旧版 ChatGPT Thinking；未发现单独的 High effort 菜单。",
    );
    return;
  }

  throw new Error(
    "未能在 ChatGPT 菜单中找到新版 High 智能等级或旧版 Thinking 选项。",
  );
}

/**
 * Check if a visible menuitem matching the regex exists in the DOM.
 * Uses evaluate() because Radix portal menuitems may not be visible to
 * Playwright's getByRole() when connected via CDP.
 */
async function hasVisibleMenuItem(page, pattern, timeout = 2000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = await page.evaluate((reSource) => {
      const re = new RegExp(reSource);
      const items = document.querySelectorAll('[role="menuitem"]');
      for (const item of items) {
        const text = item.textContent?.trim() || "";
        const label = item.getAttribute("aria-label") || "";
        if (
          re.test(text) ||
          re.test(label) ||
          re.test(text.replace(/\s+/g, " "))
        ) {
          return true;
        }
      }
      return false;
    }, pattern.source);
    if (found) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

/**
 * Click a menuitem matching the regex using evaluate() — bypasses the
 * Playwright role locator which may miss Radix portal items over CDP.
 */
async function clickMenuItem(page, pattern) {
  return page.evaluate((reSource) => {
    const re = new RegExp(reSource);
    const items = document.querySelectorAll('[role="menuitem"]');
    for (const item of items) {
      const text = item.textContent?.trim() || "";
      const label = item.getAttribute("aria-label") || "";
      if (
        re.test(text) ||
        re.test(label) ||
        re.test(text.replace(/\s+/g, " "))
      ) {
        item.click();
        return true;
      }
    }
    return false;
  }, pattern.source);
}

async function openRenameMenuForCurrentChat(page) {
  const startUrl = page.url();
  console.log(`重命名前 URL: ${startUrl}`);
  const currentChatIdMatch = startUrl.match(/\/c\/([a-z0-9-]+)/i);
  if (!currentChatIdMatch) {
    throw new Error(
      `当前 URL 不含会话 ID（${startUrl}），无法安全重命名。终止以避免改错老会话。`,
    );
  }
  const currentChatId = currentChatIdMatch[1];

  const openSidebarBtn = page
    .getByRole("button", { name: /Open sidebar|打开侧边栏/i })
    .first();
  if ((await openSidebarBtn.count()) > 0) {
    try {
      if (await openSidebarBtn.isVisible()) {
        await openSidebarBtn.click({ force: true, timeout: 2000 });
        await page.waitForTimeout(250);
        console.log("已展开侧边栏");
      }
    } catch {
      // ignore
    }
  }

  // 侧栏在首轮回答完成后还会异步刷新一段时间。轮询直到当前会话链接出现，
  // 最多等待 30s。绝不退回到"按位序选择"——会改错其他老会话。
  const currentChatLink = page
    .locator(`nav a[href*="/c/${currentChatId}"]`)
    .first();
  const POLL_DEADLINE = Date.now() + 30000;
  let linkSeen = false;
  while (Date.now() < POLL_DEADLINE) {
    if (await isVisible(currentChatLink, 1000)) {
      linkSeen = true;
      break;
    }
    // 滚回侧栏顶部 — 新会话出现在 Recents 顶部
    await page
      .evaluate(() => {
        const link = document.querySelector('nav a[href^="/c/"]');
        let p = link?.parentElement;
        while (p) {
          const s = window.getComputedStyle(p);
          if (
            (s.overflowY === "auto" || s.overflowY === "scroll") &&
            p.scrollHeight > p.clientHeight
          ) {
            p.scrollTop = 0;
            return;
          }
          p = p.parentElement;
        }
      })
      .catch(() => {});
    await page.waitForTimeout(800);
  }
  if (!linkSeen) {
    throw new Error(
      `30s 内未在侧栏中定位到当前会话 /c/${currentChatId}，已停止。请检查侧栏渲染或登录态。`,
    );
  }

  await currentChatLink.scrollIntoViewIfNeeded();
  await currentChatLink.hover();

  // 用 data-conversation-options-trigger 属性直接选 options 按钮, 绕过 <a> 包裹层 ——
  // Playwright .click(force:true) 在 <a> 内部按钮上仍可能触发链接导航并超时;
  // 直接 DOM click 既不冒泡导航, 也不卡 actionability.
  const clicked = await page.evaluate((chatId) => {
    const selectors = [
      `button[data-conversation-options-trigger="${chatId}"]`,
      `[data-testid$="-options"][aria-label*="${chatId}"]`,
    ];
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn) {
        btn.click();
        return sel;
      }
    }
    return null;
  }, currentChatId);
  if (!clicked) {
    throw new Error(
      `未能在 DOM 中找到当前会话 /c/${currentChatId} 的 options 按钮`,
    );
  }
  console.log(`已 DOM-click options 按钮: ${clicked}`);

  const hasRename = await hasVisibleMenuItem(page, /Rename|重命名/, 5000);
  if (!hasRename) {
    throw new Error("点击会话 options 后未出现 Rename 菜单项");
  }
  console.log(`已定位当前会话并打开 options: /c/${currentChatId}`);
}

async function chatWithChatGPT(
  pdfPath,
  chatName,
  existingPage,
  outputFile = null,
  userDataDir = null,
) {
  if (!pdfPath) {
    console.error("Usage: node chatgpt_chat_pdf.js <path-to-pdf> [chat-name]");
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

  console.log("正在启动浏览器...");
  const page = existingPage || (await getOrLaunchBrowser(userDataDir)).page;

  try {
    console.log("正在访问 ChatGPT...");
    await page.goto("https://chatgpt.com/");

    // 1. 设置 ChatGPT 智能等级为 High
    await page.waitForSelector('[data-testid="composer-plus-btn"]');
    // 等首页"Create an image / Write or edit / Look something up"建议块完成水合,
    // 否则 composer 区域仍在 layout shift, button.click 的 stable 检查会超时.
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
    await ensureChatGPTHighIntelligence(page);

    // 2. 上传文件
    console.log("正在上传文件...");
    await page
      .getByTestId("composer-plus-btn")
      .click({ force: true, timeout: 5000 });
    const fileChooserPromise = page.waitForEvent("filechooser", {
      timeout: 10000,
    });
    const uploadMenuItem = await clickChatGPTUploadFilesMenuItem(page, 5000);
    if (!uploadMenuItem) {
      await fileChooserPromise.catch(() => {});
      throw new Error("未找到 ChatGPT 上传菜单项 Add photos & files。");
    }
    console.log(`已点击上传菜单项: ${uploadMenuItem}`);
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(absolutePdfPath);
    await page.waitForTimeout(3000);

    // 3. 输入 Prompt 并发送
    console.log("正在输入提示词...");
    const inputArea = page.locator("#prompt-textarea");
    await inputArea.click({ force: true });
    await inputArea.fill(promptText);
    await page.waitForTimeout(300);

    console.log("等待发送按钮可点击...");
    const sendBtn = await waitForChatGPTSendButton(page, 300000); // 5 分钟超时
    console.log("发送按钮已就绪，执行发送...");
    try {
      await sendBtn.click({ timeout: 5000 });
    } catch {
      await sendBtn.evaluate((el) => el.click());
    }
    console.log("发送按钮已点击一次。");

    // 4. 等待首轮回答完成后，再重命名侧边栏第一项
    console.log("等待首轮回答生成完成...");
    await waitForChatGPTResponseFinished(page, 600000); // 10 分钟超时
    await page.waitForTimeout(1200);
    const activeConversationUrl = page.url();
    console.log(`回答完成后的会话 URL: ${activeConversationUrl}`);

    try {
      console.log("准备重命名当前对话...");
      await openRenameMenuForCurrentChat(page);
      await page.waitForTimeout(400);

      console.log(`点击 Rename 前 URL: ${page.url()}`);
      const renameClicked = await clickMenuItem(page, /^Rename$|^重命名$/);
      if (!renameClicked) {
        throw new Error("未找到 Rename 菜单项");
      }
      console.log(`点击 Rename 后 URL: ${page.url()}`);
      await page.waitForTimeout(500);

      const newName =
        chatName ||
        path.basename(absolutePdfPath, path.extname(absolutePdfPath));
      console.log(`正在写入新名称: ${newName}`);

      // ChatGPT 2026-04: inline rename uses input[name="title-editor"] (no dialog)
      const renameInput = page
        .locator('input[name="title-editor"], nav input[type="text"]')
        .first();
      console.log(`rename input count: ${await renameInput.count()}`);
      await renameInput.waitFor({ state: "visible", timeout: 5000 });
      await renameInput.click({ force: true });
      await renameInput.fill("");
      await renameInput.fill(newName);
      await page.waitForTimeout(200);
      await renameInput.press("Enter");

      console.log(`✅ 重命名成功: ${newName}`);
    } catch (e) {
      console.log("重命名失败，可能需要手动调整。详情:", e.message);
    }

    if (
      /\/c\//.test(activeConversationUrl) &&
      page.url() !== activeConversationUrl
    ) {
      console.log(
        `检测到页面跳转到 ${page.url()}，恢复到原会话 ${activeConversationUrl}`,
      );
      await page.goto(activeConversationUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(400);
    }

    console.log("流程结束。");

    // Output URL for plugin to capture
    const outputData = JSON.stringify({
      provider: "chatgpt",
      url: activeConversationUrl,
    });
    if (outputFile) {
      fs.writeFileSync(outputFile, outputData);
    } else {
      console.log(outputData);
    }
  } catch (error) {
    console.error("脚本出错:", error);
    throw error;
  }
}

if (require.main === module) {
  const { args, outputFile, userDataDir } = parseArgs(process.argv.slice(2));
  const target = args[0];
  const chatName = args[1];
  chatWithChatGPT(target, chatName, null, outputFile, userDataDir)
    .then(() => disconnectAndExit(0))
    .catch(() => disconnectAndExit(1));
}

module.exports = { chatWithChatGPT };
