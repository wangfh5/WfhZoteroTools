# CLAUDE.md - Zotero Plugin Development Knowledge Base

快速参考指南，记录 Zotero 插件开发的核心知识和本地资源。

---

## 本地资源

### GitHub 知识库 (`/Users/ssqc/github/`)

本地已克隆的 Zotero 相关仓库：

```bash
/Users/ssqc/github/
├── zotero/                      # Zotero 官方源码
├── zotero-plugin-template/      # 插件模板（原版）
├── zotero-plugin-toolkit/       # 插件工具包
├── zotero-mcp/                  # Zotero MCP 服务器
└── zotero-mcp-cookjohn/         # Zotero 内置 MCP 插件
```

**使用方法**：
- 使用 `github-kb` skill 查询本地仓库
- 直接搜索源码：`grep -r "API名称" /Users/ssqc/github/zotero/`
- 查看示例：`grep -r "registerEventListener" /Users/ssqc/github/zotero-plugin-toolkit/`

### 当前项目

```
/Users/ssqc/AIGC_Projects/zotero-plugin-wfh/
```

---

## 查找 API 的方法

### 1. 优先级顺序

1. **Zotero 开发者论坛** - 最快找到实际案例
   - 搜索：`site:groups.google.com/g/zotero-dev [关键词]`
   - 或使用 WebSearch 工具

2. **本地源码** - 最权威的文档
   ```bash
   # 在本地 Zotero 源码中搜索
   grep -r "createViewContextMenu" /Users/ssqc/github/zotero/
   ```

3. **已有插件** - 学习实际用法
   - 查看 `/Users/ssqc/github/zotero-plugin-toolkit/` 的示例
   - 搜索 GitHub 上的热门插件

4. **官方文档** - 系统性学习
   - [Zotero 7 开发文档](https://www.zotero.org/support/dev/zotero_7_for_developers)
   - 使用 WebFetch 工具获取最新文档

### 2. 常用搜索模式

```bash
# 在 Zotero 源码中搜索 API
cd /Users/ssqc/github/zotero
grep -r "Reader.registerEventListener" .
grep -r "Items.getAsync" .

# 在插件工具包中搜索示例
cd /Users/ssqc/github/zotero-plugin-toolkit
grep -r "ProgressWindow" .
```

---

## 核心 API 速查

### PDF 阅读器上下文菜单

```typescript
// 在 PDF 内容区域添加右键菜单
Zotero.Reader.registerEventListener(
  "createViewContextMenu",
  (event: any) => {
    const { reader, append } = event;
    if (!reader?.itemID) return;

    append({
      label: "菜单项名称",
      onCommand: async () => {
        // 处理点击
      },
    });
  },
  config.addonID,
);
```

### 库条目右键菜单

```typescript
// 在库条目列表添加右键菜单
ztoolkit.Menu.register("item", {
  tag: "menuitem",
  id: "unique-menu-id",
  label: getString("locale-key"),
  commandListener: async () => {
    // 处理点击
  },
});
```

### 获取选中的库条目

```typescript
// ⚠️ 必须通过 Zotero.getActiveZoteroPane()，不能直接用 ZoteroPane
// ZoteroPane 是窗口作用域的全局变量，在插件模块代码中不可访问
const zp = Zotero.getActiveZoteroPane();
const items = zp.getSelectedItems();       // 返回 Zotero.Item[]
const itemIDs = zp.getSelectedItems(true); // 返回 number[]
```

### 附件操作

```typescript
// 获取附件
const item = await Zotero.Items.getAsync(itemID);

// 检查是否为附件
if (item.isAttachment()) {
  // 获取文件路径
  const filePath = await item.getFilePathAsync();

  // 在文件管理器中显示
  const file = Zotero.File.pathToFile(filePath);
  file.reveal();
}

// 从父条目获取 PDF 附件
if (item.isRegularItem()) {
  const attachmentIDs = item.getAttachments();
  for (const attID of attachmentIDs) {
    const att = await Zotero.Items.getAsync(attID);
    if (att.isAttachment() && att.attachmentContentType === "application/pdf") {
      const filePath = await att.getFilePathAsync();
    }
  }
}
```

### 剪贴板操作

```typescript
// 单文件复制（toolkit 内置 macOS osascript fallback）
new ztoolkit.Clipboard().addFile(filePath).copy();

// 多文件复制（macOS）— 必须使用 NSPasteboard + NSFilenamesPboardType
// ⚠️ AppleScript 的 `set the clipboard to {POSIX file ...}` 不能用于多文件！
//    它只写入 AppleScript list 对象，Finder 无法识别为文件列表
// ⚠️ NSPasteboard writeObjects 对 AppleScript list 也只写入第一个文件
// ✅ 正确做法：用 NSFilenamesPboardType + setPropertyList
if (Zotero.isMac) {
  const fileListStr = filePaths.map((p) => `"${p}"`).join(", ");
  const args = [
    "-e", 'use framework "AppKit"',
    "-e", 'use framework "Foundation"',
    "-e", "set pb to current application's NSPasteboard's generalPasteboard()",
    "-e", "pb's clearContents()",
    "-e", `pb's declareTypes:{"NSFilenamesPboardType"} owner:(missing value)`,
    "-e", `set fileList to current application's NSArray's arrayWithArray:{${fileListStr}}`,
    "-e", `pb's setPropertyList:fileList forType:"NSFilenamesPboardType"`,
  ];
  await Zotero.Utilities.Internal.exec("/usr/bin/osascript", args);
}
```

### 通知

```typescript
new ztoolkit.ProgressWindow(config.addonName)
  .createLine({
    text: "消息内容",
    type: "success",  // "success" | "error" | "default"
    progress: 100,
  })
  .show(2000);
```

### 日志

```typescript
ztoolkit.log("调试信息", data);
// 在 Tools → Developer → Error Console 查看
```

---

## 开发工作流

### 快速开始

```bash
cd /Users/ssqc/AIGC_Projects/zotero-plugin-wfh

# 开发模式（热重载）
npm run start

# 生产构建
npm run build
# 输出：.scaffold/build/show-in-finder.xpi
```

### 调试技巧

1. **添加日志**
   ```typescript
   ztoolkit.log("功能名: 步骤描述", data);
   ```

2. **查看日志**
   - Zotero → Tools → Developer → Error Console

3. **热重载**
   - `npm run start` 后修改代码自动重新加载
   - 无需重启 Zotero

4. **TypeScript 检查**
   ```bash
   npm run build  # 包含类型检查
   ```

---

## 项目结构

```
zotero-plugin-wfh/
├── package.json              # 插件元数据（name, addonID, version）
├── src/
│   ├── hooks.ts             # 生命周期钩子（onStartup, onShutdown）
│   ├── modules/
│   │   └── wfhZoteroTools.ts  # 功能模块
│   └── utils/
│       ├── locale.ts        # 国际化
│       └── ztoolkit.ts      # 工具包初始化
├── addon/
│   ├── locale/              # 翻译文件 (.ftl)
│   └── content/             # 静态资源
└── .scaffold/build/         # 构建输出
    └── *.xpi
```

### 关键配置

**package.json**:
```json
{
  "config": {
    "addonName": "显示名称",
    "addonID": "uniqueid@example.com",  // 必须唯一
    "addonRef": "refname",              // 用于文件名
    "addonInstance": "InstanceName"     // 全局变量名
  }
}
```

**hooks.ts**:
```typescript
async function onStartup() {
  // 注册功能
  YourFactory.registerFeature();
}
```

---

## 常见问题

### npm 权限错误

```bash
# 使用临时缓存
npm install --cache=/tmp/npm-cache
npm run build --cache=/tmp/npm-cache
```

### 菜单不显示

1. 确认在 PDF **内容区域**右键（不是 tab 标签）
2. 检查 Error Console 是否有错误
3. 确认插件已启用：Tools → Plugins
4. 添加调试日志确认代码执行

### 热重载不工作

1. 确认运行的是 `npm run start`（不是 `npm run build`）
2. 重启开发服务器
3. 检查终端是否有错误

---

## 利用 AI 工具

### 使用 github-kb skill

```
查询 Zotero Reader API
在 zotero-plugin-toolkit 中搜索 ProgressWindow 示例
```

### 使用 WebSearch

```
搜索 Zotero 7 plugin context menu 2026
```

### 使用 WebFetch

```
获取 https://www.zotero.org/support/dev/zotero_7_for_developers
```

### 使用 context7 MCP

- 查询最新的 Zotero API 文档
- 搜索相关技术问题

---

## 快速参考

### 常用命令

```bash
npm install              # 安装依赖
npm run start           # 开发模式
npm run build           # 生产构建
npm run lint:fix        # 格式化代码
```

### 常用 API

```typescript
// 获取项目
Zotero.Items.getAsync(id)

// 获取选中条目（必须用 getActiveZoteroPane，不能直接用 ZoteroPane）
Zotero.getActiveZoteroPane().getSelectedItems()

// 文件操作
Zotero.File.pathToFile(path)
file.reveal()

// 通知
new ztoolkit.ProgressWindow(name).createLine({...}).show(ms)

// 日志
ztoolkit.log(message, data)

// 注册事件
Zotero.Reader.registerEventListener(event, handler, id)

// 库条目右键菜单
ztoolkit.Menu.register("item", { tag, id, label, commandListener })

// 执行外部命令
Zotero.Utilities.Internal.exec(cmd, args)  // 返回 Promise<true | Error>

// 剪贴板
new ztoolkit.Clipboard().addFile(path).copy()
```

### 重要链接

- [Zotero 开发者论坛](https://groups.google.com/g/zotero-dev)
- [Zotero 7 开发文档](https://www.zotero.org/support/dev/zotero_7_for_developers)
- [插件模板](https://github.com/windingwind/zotero-plugin-template)
- [插件工具包](https://github.com/windingwind/zotero-plugin-toolkit)

---

## 开发经验

### 踩坑记录

#### ZoteroPane 作用域问题
- `ZoteroPane` 是窗口作用域的全局变量，在插件模块 `.ts` 文件中**不可直接访问**
- TypeScript 编译可能通过（如果在 `global.d.ts` 中声明了），但运行时会报错
- **正确做法**：使用 `Zotero.getActiveZoteroPane()` 或 `ztoolkit.getGlobal("ZoteroPane")`
- 源码参考：`zotero/chrome/content/zotero/xpcom/zotero.js` 中 `getActiveZoteroPane` 实现

#### macOS 多文件剪贴板
- `ztoolkit.Clipboard().addFile()` 只支持单文件（`filePath` 是单个字符串）
- AppleScript `set the clipboard to {POSIX file "...", POSIX file "..."}` **不能用于多文件**！写入的是 AppleScript list 对象，Finder 无法识别
- `NSPasteboard writeObjects:{url1, url2}` 在 AppleScript 中也只写入第一个文件
- **正确做法**：使用 `NSFilenamesPboardType` + `setPropertyList:forType:`，传入文件路径字符串数组
- 可通过 `Zotero.Utilities.Internal.exec("/usr/bin/osascript", ["-e", ...])` 调用，多个 `-e` 参数分行传递

#### 热重载菜单重复
- `npm run start` 热重载时，`ztoolkit.Menu.register("item", ...)` 注册的菜单项可能重复
- 因为 `onStartup` 重新执行但旧菜单项未清理
- 这是开发时的正常现象，重启 Zotero 后恢复正常
- 同一 `id` 的菜单项在生产环境不会重复

### 有效的做法

- 从模板开始，不要从零搭建
- 先搜索论坛，再看源码
- 早期添加调试日志
- 使用热重载加速开发
- 保持代码简单，避免过度设计
- 阅读 `zotero-plugin-toolkit/src/` 源码了解 API 实际行为（如 Clipboard fallback 机制）
- 用 `typings/global.d.ts` 声明全局变量以通过 TypeScript 检查

### 避免的做法

- 猜测 API 名称
- 跳过错误处理
- 忘记重启 Zotero（首次安装后）
- 编辑生成的文件（编辑 `src/` 中的源码）
- 提交 `node_modules/`
- 直接使用 `ZoteroPane` 全局变量（用 `Zotero.getActiveZoteroPane()` 代替）
- 假设 AppleScript 剪贴板操作与 Cocoa API 行为一致

---

**最后更新**: 2026-02-07
**项目**: zotero-plugin-wfh v1.0.0
**Zotero**: 7.x
