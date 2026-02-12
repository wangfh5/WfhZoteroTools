# Browser Daemon Implementation Summary

## 问题描述

在测试 Gemini ChatPDF 自动化时，发现脚本执行完成后浏览器会被关闭，URL 虽然成功保存到了 Zotero，但用户无法继续查看聊天内容。

## 根本原因

- Playwright 的 `launchPersistentContext` 启动的浏览器是 Node.js 的子进程
- 脚本调用 `process.exit()` 退出时，Playwright 会自动清理并关闭浏览器
- `connectOverCDP` 连接已有浏览器时，脚本退出不影响浏览器

## 解决方案：守护进程模式

通过引入独立的 `browser_daemon.js` 守护进程持有浏览器，脚本仅连接使用，退出时浏览器由守护进程继续持有。

### 架构设计

```
┌─────────────┐
│   脚本执行   │
│ (gemini_   │
│  chat_pdf) │
└──────┬──────┘
       │
       ├─ 1. 尝试连接 CDP (9222)
       │
       ├─ 2. 失败 → spawn daemon (detached)
       │
       ├─ 3. 等待 CDP 就绪 (轮询)
       │
       ├─ 4. connectOverCDP 成功
       │
       ├─ 5. 执行任务
       │
       ├─ 6. 写入 URL 到临时文件
       │
       └─ 7. process.exit()
              └─ 浏览器保持打开 ✓

┌─────────────┐
│ browser_    │ ← 守护进程持续运行
│  daemon.js  │
└──────┬──────┘
       │
       ├─ launchPersistentContext
       │
       ├─ 监听 context.on('close')
       │
       └─ 用户关闭窗口 → 自动退出
```

## 实现文件

### 1. browser_daemon.js (新建)

**职责**：

- 使用 `launchPersistentContext` 启动浏览器
- 在端口 9222 提供 CDP 服务
- 保持进程运行（`setInterval` + `context.on('close')`）
- 用户关闭浏览器窗口时自动退出

**关键代码**：

```javascript
const context = await chromium.launchPersistentContext(SHARED_PROFILE, {
  args: [`--remote-debugging-port=${CDP_PORT}`],
  // ... 其他配置
});

context.on("close", () => {
  process.exit(0);
});

setInterval(() => {}, 60000); // Keep alive
```

### 2. browser_helper.js (修改)

**新增功能**：

- `checkCDPAvailable()`: HTTP GET 检查 CDP 端口是否就绪
- `waitForCDP(maxWaitMs)`: 轮询等待 CDP 就绪（默认 30 秒）

**修改逻辑**：

```javascript
async function getOrLaunchBrowser() {
  try {
    // 1. 优先连接已有浏览器
    return await chromium.connectOverCDP(CDP_URL);
  } catch {
    // 2. 启动守护进程（detached + unref）
    const daemonProcess = spawn("node", [daemonScript], {
      detached: true,
      stdio: "ignore",
    });
    daemonProcess.unref();

    // 3. 等待 CDP 就绪
    await waitForCDP(30000);

    // 4. 连接守护进程的浏览器
    return await chromium.connectOverCDP(CDP_URL);
  }
}
```

**关键点**：

- `detached: true` - 守护进程独立于父进程运行
- `stdio: 'ignore'` - 不继承 stdio，避免父进程等待
- `unref()` - 允许父进程独立退出

### 3. 文档更新

- **BROWSER-AUTOMATION-GUIDE.md**: 新增「浏览器生命周期管理」章节
- **README.md**: 新建，说明所有脚本用途和守护进程模式
- **AGENTS.md**: 记录守护进程实现经验

## 功能验证

### 测试 1：首次启动（无浏览器）

```bash
$ node test_daemon.js
尝试连接已有浏览器...
未找到已有浏览器，启动守护进程...
守护进程已启动，等待浏览器就绪...
浏览器就绪，正在连接...
已连接到守护进程浏览器。
Exiting script now. Browser should stay open!
```

✅ **结果**：浏览器保持打开，守护进程持续运行（PID 50169）

### 测试 2：复用已有浏览器

```bash
$ node test_daemon.js
尝试连接已有浏览器...
已连接到现有浏览器，打开新 Tab。
Context has 3 pages
```

✅ **结果**：直接连接，无需启动新守护进程，tab 数量递增

### 测试 3：URL 保存机制

**验证点**：

- 脚本通过 `fs.writeFileSync` 写入临时文件 **在** `process.exit()` 之前
- 插件的 `await exec()` 等待脚本退出后才读取临时文件
- 守护进程模式不改变这个流程

✅ **结果**：URL 保存机制完全不受影响

## 用户体验改进

**之前**：

- ❌ 脚本完成后浏览器被关闭
- ❌ 无法继续查看聊天记录
- ❌ 每次运行都启动新浏览器

**现在**：

- ✅ 脚本完成后浏览器保持打开
- ✅ 可以继续查看和使用聊天记录
- ✅ 多次运行复用同一浏览器实例，启动更快
- ✅ URL 照常保存到 Zotero，不受影响
- ✅ 关闭浏览器窗口时，守护进程自动清理退出

## 技术亮点

1. **进程独立性**：`spawn({ detached: true })` + `unref()` 确保守护进程完全独立
2. **CDP 轮询**：HTTP GET 检查端口就绪，比 TCP socket 检查更可靠
3. **自动清理**：监听 `context.on('close')`，用户关闭窗口时守护进程自动退出
4. **零侵入**：URL 保存机制无需任何改动
5. **向后兼容**：若已有浏览器运行，直接连接，行为与之前一致

## 潜在问题与解决

**问题 1**：守护进程一直运行，占用资源？

- **解决**：监听 `context.on('close')`，用户关闭窗口即退出
- **补充**：可通过 `ps aux | grep browser_daemon` 查看，`pkill -f browser_daemon` 强制清理

**问题 2**：多个脚本同时运行？

- **解决**：所有脚本都先尝试连接 9222，只有第一个脚本会启动守护进程
- **结果**：多个脚本共享同一浏览器实例（不同 tab）

**问题 3**：CDP 端口被占用？

- **现象**：`waitForCDP` 会超时失败
- **解决**：检查是否有其他 Chrome 使用 9222 端口，手动清理

## 后续优化（可选）

1. **日志文件**：守护进程输出重定向到日志文件便于调试
2. **健康检查**：定期检查浏览器是否响应，崩溃时自动重启
3. **配置文件**：允许自定义 CDP 端口、profile 路径等
4. **systemd/launchd**：提供守护进程服务配置，支持开机自启

---

**实现时间**：2026-02-11
**测试状态**：✅ 全部通过
**影响范围**：仅脚本层，插件无需改动
