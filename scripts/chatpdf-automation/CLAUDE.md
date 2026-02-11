# ChatPDF 自动化脚本开发知识库

本目录下的 ChatPDF 自动化脚本（Playwright + Node.js）开发经验与快速参考。

---

## 项目文档结构

- [README.md](./README.md) — ChatPDF自动化脚本的使用方法
- [BROWSER-AUTOMATION-GUIDE.md](./BROWSER-AUTOMATION-GUIDE.md) — 从 CLI 探索到脚本合成的完整开发流程. 如果不确定如何进行网页自动化, 或者发现测试一直不顺利, 请参考这个文档进行第一性探索. 
- `doc` 文件夹: 放置重要新特性的开发文档
  - [Browser-Daemon.md](./doc/Browser-Daemon.md) — 浏览器守护进程的实现细节

---

## 浏览器生命周期管理

### 问题

Playwright 的 `launchPersistentContext` 启动的浏览器是 Node.js 的子进程，脚本调用 `process.exit()` 时浏览器会被关闭。

### 解决方案：守护进程模式

- 创建独立的 `browser_daemon.js` 守护进程持有浏览器
- 脚本通过 `child_process.spawn({ detached: true })` + `unref()` 启动守护进程
- 脚本通过 `connectOverCDP` 连接守护进程的浏览器（端口 9222）
- 脚本退出时只断开 CDP 连接，浏览器由守护进程继续持有
- 用户关闭浏览器窗口时，守护进程监听 `context.on('close')` 自动退出

### 实现细节

```javascript
// 启动守护进程
const daemonProcess = spawn('node', [daemonScript], {
  detached: true,   // 独立于父进程运行
  stdio: 'ignore',  // 不继承 stdio
});
daemonProcess.unref();  // 允许父进程独立退出

// 轮询等待 CDP 就绪
async function waitForCDP(maxWaitMs) {
  // HTTP GET http://localhost:9222/json/version
  // 每 500ms 检查一次，最多等待 30 秒
}

// 连接浏览器
const browser = await chromium.connectOverCDP(CDP_URL);
```

### 优势

- URL 保存机制不受影响（脚本仍通过临时文件输出 JSON）
- 用户可以在脚本完成后继续查看浏览器内容
- 多次运行复用同一浏览器实例，启动更快
- 自动清理：关闭浏览器窗口即可

### 参考文件

- `browser_daemon.js` — 守护进程
- `browser_helper.js` — 连接逻辑与 CDP 轮询

---

**最后更新**: 2026-02-11