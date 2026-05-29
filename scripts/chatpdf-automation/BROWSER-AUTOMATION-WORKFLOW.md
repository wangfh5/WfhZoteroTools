# 浏览器自动化开发指南：从 CLI 探索到脚本生成

Coding Agent 与人类协作，基于 Playwright 及其命令行工具（CLI）进行高效、稳健浏览器自动化的开发经验手册。

## For AI Agent

- 阅读本文档，以理念为指导开展实践。
- 找到并调用 skill `playwright-cli`，里面有更仔细的使用该命令行工具的指引。如果没有，提醒用户安装。
- 在实践过程中, 遇到弄不清楚的情况, 可以使用有头模式打开浏览器, 让人类协助一下.
- 在实践之后， 请根据最新经验更新本文档中过时的内容。

---

## 核心理念：先"探路"，再"修路"

在面对复杂的单页应用（SPA）如 Gemini 或 ChatGPT 时，直接编写自动化脚本往往会因为复杂的 DOM 结构、动态加载和风控检测而频繁失败。核心原则：**先让 Agent 使用命令行工具（CLI）跑通全流程，验证逻辑，再将其总结为生产级的 JavaScript 脚本。**

---

## 阶段一：探索与验证 (The Exploration Phase)

人类是"指挥官"，Agent 是"先遣兵"。

### 1. 使用 `playwright-cli` 作为"导盲杖"

- **直观性**：Agent 通过 `playwright-cli open` 打开浏览器，每一步命令的结果人类都能实时观察。
- **YAML 快照与 Ref 定位**：CLI 将繁杂的 CSS 选择器浓缩为 YAML 文件，并分配简短的 `ref`（如 `e1`, `e35`）。
  - **对人类**：`ref` 极其直观，避开了长达数行的 CSS 路径。
  - **对 AI**：极大地节省了 Token，让 Agent 能在有限的上下文中处理极长的页面结构。

### 2. 复用已有登录态

使用 `--profile=<path>` 参数复用脚本中 `launchPersistentContext` 所用的同一个用户数据目录，免去手动登录（注意：旧版文档写的 `--user-data-dir=` 已不再被识别）：

```bash
playwright-cli -s=gemini open https://gemini.google.com/app \
  --headed \
  --profile=/Users/ssqc/Library/Caches/ms-playwright/daemon/chatpdf-shared-profile \
  --browser=chrome
```

如果端口 9222 上已有守护进程占用同一 user-data-dir，启动会失败 —— 先释放：

```bash
lsof -i :9222 | tail -n +2 | awk '{print $2}' | xargs -r kill
```

### 3. 原子化验证

通过 `click e15`、`fill e8 "text"` 等原子化命令，一步步验证交互逻辑。

**价值**：人类可以确认"这一步确实点到了我想点的地方"，排除逻辑盲点。

---

## 阶段二：深层解析与脚本合成 (The Synthesis Phase)

当 CLI 流程跑通后，Agent 开始从"经验"中提炼代码。

### 1. 从 Ref 到稳定选择器

Agent 在读取 YAML 文件时，不仅看到了 `ref`，还读取到了背后真正的 `aria-label`、`data-test-id`、`Role` 或 `CSS Selector`。

**选择器优先级**（从高到低）：

1. **`data-test-id` / `data-testid`** — 最稳定，专为测试设计，不会随 UI 文案变化
2. **ARIA Role + Name** — 语义化强，但文案可能随语言/版本变化
3. **CSS 选择器** — 最脆弱，DOM 结构变化即失效

**实战教训**：2026-02 Gemini 更新中，上传菜单项的 role 从 `button` 变为 `menuitem`，文案也改了，但 `data-test-id="local-images-files-uploader-button"` 始终不变。

### 2. 最佳实践

- **User Data Dir 复用**：通过 `launchPersistentContext` 共享 CLI 阶段的登录状态，实现免密登录。
- **输入策略选择**：
  - `fill()`：用于快速、原子化的输入。
  - `pressSequentially()` / `type()`：用于模拟真实按键，触发某些对输入极其敏感的 UI 监听器。
- **显式点击方案**：在处理带有"立即回答/停止"动态切换按钮的复杂页面（如 Gemini）时，**显式点击按钮**通常比不可控的 `Enter` 键更稳健。
- **等待菜单渲染**：点击打开菜单后，必须 `waitFor({ state: 'visible' })` 等待子菜单项出现，不能立即操作（菜单有动画延迟）。

---

## 阶段三：容错与迭代 (The Refinement Phase)

### 1. 截图驱动的调试

利用 `playwright-cli screenshot` 捕获失败瞬间。Agent 能够通过截图识别出"输入截断"、"按钮被遮挡"或"侧边栏折叠"等视觉层面的问题。

### 2. 动态判据的确立

对于侧边栏重命名这种难题，简单的"第一项"往往不够。

**进阶技巧**：通过检查菜单项的文本（如是否有 "Pin" 还是 "Unpin"）作为动态真值判据，实现比硬编码位置更强大的鲁棒性。

### 3. UI 变更的应对策略

SPA 网站（尤其是 Gemini、ChatGPT）会频繁更新 UI。当脚本失败时：

1. **不要猜测**：直接用 `playwright-cli snapshot` 查看当前 DOM 结构
2. **逐步验证**：用原子化命令确认每个步骤
3. **优先使用 `data-test-id`**：它们是最抗变化的选择器
4. **保留 fallback**：对关键操作（如发送按钮），用多个选择器做降级方案

---

## 实战参考：Gemini 稳定选择器 (2026-05-29)

通过探索脚本确认的选择器（Gemini 3 时代）：

| 操作           | 选择器                                                                    | 备注                                                                             |
| -------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 模式选择器     | `[data-test-id="bard-mode-menu-button"]`                                  | aria-label 含当前模式，如"打开模式选择器，当前模式为“Pro”"；在输入区域内         |
| Pro 模式选项   | `page.locator('[data-test-id^="bard-mode-option-"]', { hasText: 'Pro' })` | **option 的 data-test-id 后缀已改为哈希**，只有 Pro 档文本含"Pro"；role=menuitem |
| 思考等级子菜单 | `getByRole('menuitem', { name: /思考等级/ })`                             | 模式菜单内一行，**无 data-test-id**；hover 展开子菜单，其 label 含当前等级       |
| 思考"扩展"选项 | `getByRole('menu').last().getByRole('menuitem', { name: /扩展/ })`        | hover 父行后子菜单是 DOM 中最后一个 `role=menu` 面板；限定在它内部避免撞父行     |
| 上传菜单触发   | `button[aria-label="上传和工具"]`                                         | "+" 按钮，在输入区域左下角，旁有"New"角标                                        |
| 上传文件菜单项 | `[data-test-id="local-images-files-uploader-button"]`                     | role=menuitem，文本"上传文件. 文档、数据、代码文件"                              |
| 提示输入框     | `getByRole('textbox', { name: /输入提示\|Enter a prompt/ })`              | contenteditable div，aria-label="为 Gemini 输入提示"                             |
| 发送按钮       | `button[aria-label="发送"]` 或 `button.send-button`                       | **文本输入后才可见**，无 data-test-id                                            |
| 对话操作菜单   | `[data-test-id="conversation-actions-menu-icon-button"]`                  | 仅在对话页面出现                                                                 |
| 重命名菜单项   | `[data-test-id="rename-button"]`                                          | data-test-id，不需要文本匹配                                                     |
| 重命名输入框   | `[data-test-id="edit-title-input"]`                                       | aria-label="重命名此对话"                                                        |
| 重命名确认     | `[data-test-id="save-button"]`                                            | 文本未改时按钮为 disabled                                                        |
| 停止按钮       | `button[aria-label*="停止"]` / `button[aria-label*="Stop"]`               | 生成回答时出现                                                                   |

### 已知变化（对比 2026-02-12）

- **模式选项 data-test-id 改为哈希**：旧 `[data-test-id="bard-mode-option-pro"]` 已失效，新值形如 `bard-mode-option-e6fa609c3fa255c0`（每档一个哈希后缀，不稳定）。改用 **稳定前缀 `bard-mode-option-` + 文本 `hasText:'Pro'`** 定位（三档 Flash-Lite / Flash / Pro 中只有 Pro 档文本含"Pro"）。option 的 role 也从 `menuitemradio` 变为 `menuitem`。
- **新增「思考等级」子菜单**：模式菜单内多出一行"思考等级"（标准/扩展），**与模型档位是相互独立的设置**，两者各自持久化。无 data-test-id。hover 父行展开子菜单，子菜单是 DOM 中**最后一个 `role=menu` 面板**（嵌在主菜单里），点"扩展"即应用并关闭菜单。父行 label 也会反映当前等级（如"思考等级 扩展"），所以 `/扩展/` 若按页面全局匹配会同时命中父行和子项触发 strict-mode 冲突——**限定在 `getByRole('menu').last()` 子菜单内**可从结构上消除歧义（不再依赖父行文本判断）。设为 Pro 后该控件才稳定可用，所以**先选 Pro 再设思考等级**。最后用模式按钮 aria-label 校验结果：选中 Pro+扩展后变为"当前模式为“Pro 扩展”"（标准等级时仅为"Pro"）。校验发生在上传之前，缺少任一 token 即说明某步失败/UI 再次变更——此时**直接 throw 中止**（不浪费上传与生成；`both_chat_pdf.js` 用 `Promise.allSettled`，只失败 Gemini 分支，不影响 ChatGPT），而非沿用错误模式静默继续。
- **上传触发按钮 aria-label 改名**：旧 `button[aria-label="打开文件上传菜单"]` → 新 `button[aria-label="上传和工具"]`（旁带"New"角标）。子菜单项 `data-test-id="local-images-files-uploader-button"` **保持不变**。

### 历史变化（对比 2026-02-07）

- **模式选择器**：旧选择器 `getByRole('button', { name: /快速|Pro/ })` 会匹配到页面顶部一个 disabled 的 "PRO" 徽章按钮，导致超时。新选择器使用 `data-test-id`，不会误匹配。
- **模式选项**：新增 `data-test-id="bard-mode-option-*"`（快速/思考/pro），比 `getByRole('menuitemradio', { name: /Pro/ })` 更稳定。
- **重命名按钮**：新增 `data-test-id="rename-button"`，不再需要通过文本内容匹配。
- **上传菜单**：增加了"导入代码" (`code-import-button`)、"NotebookLM" (`notebooks-import-button`) 等新选项。
- **发送按钮**：不再使用 `type="submit"` 属性，改为 CSS class `send-button`。输入文本前按钮隐藏。

---

## 实战参考：ChatGPT 稳定选择器 (2026-04-27)

通过探索脚本确认的选择器：

| 操作           | 选择器                                                                                                                                                     | 备注                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 模型选择器     | `button.__composer-pill`（首个）                                                                                                                           | **无 data-testid / aria-label**；按钮文本就是当前模型名（Thinking/Instant/Model）                                                     |
| 模型菜单项     | `getByRole('menuitemradio', { name: /Thinking/i })`                                                                                                        | role 由 `menuitem` 改为 `menuitemradio`，name 形如 "Thinking For complex questions"                                                   |
| 思考强度子菜单 | `button[aria-label="Open thinking effort menu"]`                                                                                                           | 仅当模型已是 Thinking 时出现，CSS 类 `__composer-pill-trigger`                                                                        |
| 上传菜单触发   | `[data-testid="composer-plus-btn"]`                                                                                                                        | aria-label="Add files and more"，CSS 类 `composer-btn`                                                                                |
| 上传文件菜单项 | `getByRole('menuitem', { name: /Add photos & files/i })`                                                                                                   | name 含快捷键 "Command U"，子串正则仍可匹配                                                                                           |
| 提示输入框     | `#prompt-textarea` (contenteditable div, ProseMirror)                                                                                                      | aria-label="Chat with ChatGPT"                                                                                                        |
| 发送按钮       | `[data-testid="send-button"]`                                                                                                                              | aria-label 改为 "Send prompt"，type=submit；输入文本前 unmount                                                                        |
| 侧栏会话操作   | `button[data-conversation-options-trigger="<chatId>"]`（**最稳**）/ `[data-testid="history-item-{N}-options"]` / `aria-label*="Open conversation options"` | `data-conversation-options-trigger` 直接绑会话 ID, 是定位"当前会话"options 按钮的金标准；位序 testid 在置顶项上为 `undefined-options` |
| Rename 菜单项  | text="Rename" / "重命名"                                                                                                                                   | **无 data-testid**，只能文本匹配；同菜单 Share/Delete 才有 testid                                                                     |
| 重命名输入框   | `input[name="title-editor"]`                                                                                                                               | 内联编辑，不弹 dialog；`Enter` 保存、`Escape` 取消                                                                                    |
| 停止按钮       | `button[aria-label*="Stop"]` / `[aria-label*="停止"]`                                                                                                      | 生成中可见；用于检测回答状态                                                                                                          |

### 已知变化（对比 2026-04-01）

- **模型按钮**：旧 `data-testid="model-switcher-dropdown-button"` 已**完全消失**，且新按钮无 testid 也无 aria-label。锚点只剩 CSS 类 `__composer-pill`（注意 `__composer-pill-trigger` 是相邻的"思考强度"按钮，不要选错）。
- **模型菜单项 role 变化**：`menuitem` → `menuitemradio`，旧的 `getByRole('menuitem', { name: /Thinking/ })` 在 strict role 匹配下不一定命中，必须用 `menuitemradio`。
- **侧栏 options 按钮**：新增 `data-testid="history-item-{N}-options"`，比 aria-label 子串更稳定；但置顶项 testid 异常（`undefined-options`），按位序检索时仍要靠菜单中是否含 "Unpin chat" 来识别置顶。
- **冷启动模型按钮文字**：首次访问 `https://chatgpt.com/` 时，按钮文字可能是占位文本 "Model"（即便上次保存为 Thinking）。逻辑判定 "已是 Thinking" 时不能假设 profile 一定保留状态。
- **页面布局抖动**：首页"Create an image / Write or edit / Look something up"建议块异步水合，造成 composer 区域 layout shift。Playwright `click()` 默认的 stable 检查会超时——对 composer 内按钮统一使用 `click({ force: true, timeout: 5000 })`。
- **侧栏会话链接是 `<a>` 包裹按钮**：直接对 `nav a button[data-testid$="-options"]` 调用 Playwright `click()` 容易触发 `<a>` 导航并超时。最稳做法是**拿到会话 ID 后用 `page.evaluate(() => document.querySelector("button[data-conversation-options-trigger='<id>']").click())`**，绕过 Playwright 的 actionability + 不会冒泡到链接。
- **重命名兜底逻辑被移除**：旧版在 URL 匹配失败时按"第 N 条非置顶聊天"位序兜底，会**改错老会话标题**。新版严格按当前 URL 中的会话 ID 在侧栏轮询匹配（最长 30s），找不到就抛错。

---

## 总结：开发步骤

启动一个新的自动化任务时，遵循以下步骤：

1. **唤醒 Agent 的 Playwright CLI 技能**
2. **命令行导航**：让 Agent `goto` 目标网站并 `snapshot`
3. **Ref 交互**：通过 `ref` 进行点击、输入，确保每一步符合预期
4. **读取深层元数据**：让 Agent `read_file` YAML 快照，提取稳定选择器（优先 `data-test-id`）
5. **合成脚本**：将命令序列转化为包含错误处理（try-catch）和显式等待（waitFor）的 JS 脚本
6. **闭环测试**：运行脚本，通过截图反馈进行微调

---

**最后更新**: 2026-05-29
