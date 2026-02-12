# ChatPDF Automation Scripts

自动化上传 PDF 到 ChatGPT/Gemini 并重命名对话的脚本集。

## 脚本说明

| 脚本                  | 用途                                             |
| --------------------- | ------------------------------------------------ |
| `chatgpt_chat_pdf.js` | ChatGPT 自动化                                   |
| `gemini_chat_pdf.js`  | Gemini 自动化                                    |
| `both_chat_pdf.js`    | 并行运行 ChatGPT + Gemini                        |
| `browser_helper.js`   | 浏览器管理辅助函数                               |
| `browser_daemon.js`   | 浏览器守护进程（保持浏览器在脚本退出后继续运行） |

## 使用方法

### 从命令行运行

```bash
# ChatGPT
node chatgpt_chat_pdf.js /path/to/paper.pdf "对话名称"

# Gemini
node gemini_chat_pdf.js /path/to/paper.pdf "对话名称"

# 两者并行
node both_chat_pdf.js /path/to/paper.pdf "对话名称"
```

### 从 Zotero 插件运行

在 Zotero 中右键点击库条目，选择"Chat with PDF"菜单。

## 浏览器生命周期

脚本使用**守护进程模式**管理浏览器：

- **首次运行**：自动启动 `browser_daemon.js` 守护进程和浏览器
- **脚本退出**：浏览器保持打开，可以继续查看聊天记录
- **后续运行**：复用已有浏览器实例
- **清理**：关闭浏览器窗口即可，守护进程自动退出

## URL 保存

脚本执行完成后，会将对话 URL 以 JSON 格式输出到临时文件：

```json
{"provider": "chatgpt", "url": "https://chatgpt.com/c/..."}
{"provider": "gemini", "url": "https://gemini.google.com/app/..."}
```

Zotero 插件模块会读取该文件, 并将 URL 保存为链接类型附件（LINK_MODE_LINKED_URL）。

## 开发方法论

基于Playwright-CLI的浏览器自动化脚本的开发方法论：[BROWSER-AUTOMATION-GUIDE.md](./BROWSER-AUTOMATION-GUIDE.md)

## 开发文档

- `doc/Browser-Daemon.md`: 浏览器守护进程的实现细节
