const path = require('path');
const fs = require('fs');
const { getOrLaunchBrowser } = require('./browser_helper');
const { chatWithChatGPT } = require('./chatgpt_chat_pdf');
const { chatWithGemini } = require('./gemini_chat_pdf');

async function chatWithBoth(pdfPath, chatName) {
  if (!pdfPath) {
    console.error('Usage: node both_chat_pdf.js <path-to-pdf> [chat-name]');
    process.exit(1);
  }

  const absolutePdfPath = path.resolve(pdfPath);
  if (!fs.existsSync(absolutePdfPath)) {
    console.error(`File not found: ${absolutePdfPath}`);
    process.exit(1);
  }

  console.log('正在启动浏览器 (Both)...');
  const { context, page: defaultPage } = await getOrLaunchBrowser();

  // Close the default page and create two fresh pages
  const chatgptPage = await context.newPage();
  const geminiPage = await context.newPage();
  await defaultPage.close();

  console.log('开始并行执行 ChatGPT + Gemini...');
  const results = await Promise.allSettled([
    chatWithChatGPT(absolutePdfPath, chatName, chatgptPage),
    chatWithGemini(absolutePdfPath, chatName, geminiPage),
  ]);

  for (const [i, result] of results.entries()) {
    const provider = i === 0 ? 'ChatGPT' : 'Gemini';
    if (result.status === 'fulfilled') {
      console.log(`✅ ${provider} 完成。`);
    } else {
      console.error(`❌ ${provider} 失败:`, result.reason);
    }
  }

  console.log('并行任务全部结束。');
}

if (require.main === module) {
  const target = process.argv[2];
  const chatName = process.argv[3];
  chatWithBoth(target, chatName);
}

module.exports = { chatWithBoth };
