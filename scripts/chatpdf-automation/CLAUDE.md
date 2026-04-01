# ChatPDF 自动化脚本开发知识库

本目录下的 ChatPDF 自动化脚本（Playwright + Node.js）开发经验与快速参考。

## 项目目标

项目目标是开发一个自动化脚本，能够自动上传 PDF 到 ChatGPT/Gemini 并重命名对话。
完整的工作流: 打开网页-选择思考模型-上传PDF-输入提示词-发送-等待对话生成完毕-重命名对话-保存网址的JSON

由于网页变化较快, 所以时常需要重新更新脚本, 此时需要参考[BROWSER-AUTOMATION-GUIDE.md](./BROWSER-AUTOMATION-GUIDE.md)的流程, 来开展新的step-by-step的探索, 找到旧脚本失败的原因, 并将新的经验总结成新的脚本.

---

## 项目文档结构

- [README.md](./README.md) — ChatPDF自动化脚本的使用方法
- [BROWSER-AUTOMATION-GUIDE.md](./BROWSER-AUTOMATION-GUIDE.md) — 从 CLI 探索到脚本合成的完整开发流程. 如果不确定如何进行网页自动化, 或者发现测试一直不顺利, 请参考这个文档进行第一性探索.
- `doc` 文件夹: 放置重要新特性的开发文档
  - [Browser-Daemon.md](./doc/Browser-Daemon.md) — 浏览器守护进程的实现细节

---

**最后更新**: 2026-02-12
