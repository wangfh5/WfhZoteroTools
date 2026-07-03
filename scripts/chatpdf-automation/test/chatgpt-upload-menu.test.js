const test = require("node:test");
const assert = require("node:assert/strict");

const { isChatGPTUploadFilesMenuText } = require("../chatgpt_chat_pdf");

test("matches the current ChatGPT upload menu row with its subtitle", () => {
  assert.equal(typeof isChatGPTUploadFilesMenuText, "function");
  assert.equal(
    isChatGPTUploadFilesMenuText(
      "Add photos & files Upload from computer",
    ),
    true,
  );
});

test("matches upload file rows without matching other composer tools", () => {
  assert.equal(isChatGPTUploadFilesMenuText("Add photos & files"), true);
  assert.equal(isChatGPTUploadFilesMenuText("Upload files"), true);
  assert.equal(
    isChatGPTUploadFilesMenuText("Create image Visualize anything"),
    false,
  );
  assert.equal(
    isChatGPTUploadFilesMenuText("Deep research Get a detailed report"),
    false,
  );
});
