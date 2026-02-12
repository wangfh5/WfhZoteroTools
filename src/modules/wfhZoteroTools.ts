import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { getPref } from "../utils/prefs";

export class WfhZoteroToolsFactory {
  /**
   * Register the "Show in Finder" context menu item for PDF reader
   */
  static registerContextMenu() {
    ztoolkit.log("WfhZoteroTools: Registering context menu");

    Zotero.Reader.registerEventListener(
      "createViewContextMenu",
      (event: any) => {
        ztoolkit.log(
          "WfhZoteroTools: createViewContextMenu event triggered",
          event,
        );
        const { reader, append } = event;

        // Only show menu item if we have a valid reader with an attachment
        if (!reader || !reader.itemID) {
          ztoolkit.log("WfhZoteroTools: No reader or itemID found");
          return;
        }

        ztoolkit.log(
          "WfhZoteroTools: Adding menu item for itemID:",
          reader.itemID,
        );
        append(
          {
            label: getString("menu-show-in-finder"),
            onCommand: async () => {
              ztoolkit.log("WfhZoteroTools: Menu item clicked");
              await WfhZoteroToolsFactory.showCurrentPDFInFinder(reader);
            },
          },
          {
            label: getString("menu-copy-file"),
            onCommand: async () => {
              ztoolkit.log("WfhZoteroTools: Copy File menu item clicked");
              await WfhZoteroToolsFactory.copyCurrentPDFFile(reader);
            },
          },
        );
      },
      config.addonID,
    );

    ztoolkit.log("WfhZoteroTools: Context menu registered successfully");
  }

  /**
   * Show the current PDF file in Finder
   */
  static async showCurrentPDFInFinder(reader: any) {
    try {
      // Get the attachment item from the reader
      const itemID = reader.itemID;
      if (!itemID) {
        WfhZoteroToolsFactory.showNotification("No PDF file open", "error");
        return;
      }

      const item = await Zotero.Items.getAsync(itemID);
      if (!item || !item.isAttachment()) {
        WfhZoteroToolsFactory.showNotification(
          "Not a valid attachment",
          "error",
        );
        return;
      }

      // Get the file path
      const filePath = await item.getFilePathAsync();
      if (!filePath) {
        WfhZoteroToolsFactory.showNotification(
          "File not found on disk",
          "error",
        );
        return;
      }

      // Reveal the file in Finder using Zotero's built-in method
      const file = Zotero.File.pathToFile(filePath);
      file.reveal();

      WfhZoteroToolsFactory.showNotification("Revealed in Finder", "success");
    } catch (error) {
      ztoolkit.log("Error showing file in Finder:", error);
      WfhZoteroToolsFactory.showNotification("Error revealing file", "error");
    }
  }

  /**
   * Copy the current PDF file to clipboard
   */
  static async copyCurrentPDFFile(reader: any) {
    try {
      // Validate reader and get item ID
      const itemID = reader.itemID;
      if (!itemID) {
        WfhZoteroToolsFactory.showNotification("No PDF file open", "error");
        return;
      }

      // Get the attachment item
      const item = await Zotero.Items.getAsync(itemID);
      if (!item || !item.isAttachment()) {
        WfhZoteroToolsFactory.showNotification(
          "Not a valid attachment",
          "error",
        );
        return;
      }

      // Get the file path
      const filePath = await item.getFilePathAsync();
      if (!filePath) {
        WfhZoteroToolsFactory.showNotification(
          "File not found on disk",
          "error",
        );
        return;
      }

      // Copy file to clipboard using ztoolkit
      new ztoolkit.Clipboard().addFile(filePath).copy();

      WfhZoteroToolsFactory.showNotification(
        "File copied to clipboard",
        "success",
      );
    } catch (error) {
      ztoolkit.log("Error copying file to clipboard:", error);
      WfhZoteroToolsFactory.showNotification("Error copying file", "error");
    }
  }

  /**
   * Show a notification to the user
   */
  static showNotification(message: string, type: "success" | "error") {
    new ztoolkit.ProgressWindow(config.addonName)
      .createLine({
        text: message,
        type: type,
        progress: 100,
      })
      .show(2000);
  }

  /**
   * Get the chatpdf-automation scripts directory from Zotero preferences.
   * Users must set this preference to the absolute path of their
   * chatpdf-automation scripts directory (e.g., after cloning the repo).
   */
  static getChatPDFScriptsDir(): string {
    const dir = getPref("chatpdfScriptsDir");
    if (!dir) {
      throw new Error(
        "ChatPDF scripts directory not configured.\n" +
          "Please set extensions.zotero.wfhZoteroTools.chatpdfScriptsDir " +
          "in about:config to the absolute path of your " +
          "chatpdf-automation scripts directory.\n" +
          "e.g., /path/to/zotero-plugin-wfh/scripts/chatpdf-automation",
      );
    }
    return dir;
  }

  /**
   * Find Node.js executable path.
   * Checks the nodePath preference first, then tries common OS-specific locations.
   */
  static findNodePath(): string {
    // 1. Check user preference first
    const customPath = getPref("nodePath");
    if (customPath) return customPath;

    // 2. Try common well-known paths by platform
    const candidates: string[] = Zotero.isMac
      ? ["/opt/homebrew/bin/node", "/usr/local/bin/node"]
      : Zotero.isLinux
        ? ["/usr/bin/node", "/usr/local/bin/node"]
        : ["C:\\Program Files\\nodejs\\node.exe"];

    for (const p of candidates) {
      try {
        const file = Zotero.File.pathToFile(p);
        if (file.exists()) return p;
      } catch {
        // skip inaccessible paths
      }
    }

    throw new Error(
      "Node.js not found.\n" +
        "Install Node.js, or set extensions.zotero.wfhZoteroTools.nodePath " +
        "in about:config to the absolute path of your node executable.",
    );
  }

  /**
   * Get file paths from selected items (supports both regular items and attachments)
   */
  static async getFilePathsFromItems(items: Zotero.Item[]): Promise<string[]> {
    const filePaths: string[] = [];
    for (const item of items) {
      if (item.isAttachment()) {
        // Item is an attachment itself — get its file path directly
        const filePath = await item.getFilePathAsync();
        if (filePath) filePaths.push(filePath);
      } else if (item.isRegularItem()) {
        // Item is a parent item — find its PDF attachments
        const attachmentIDs = item.getAttachments();
        for (const attID of attachmentIDs) {
          const att = await Zotero.Items.getAsync(attID);
          if (
            att &&
            att.isAttachment() &&
            att.attachmentContentType === "application/pdf"
          ) {
            const filePath = await att.getFilePathAsync();
            if (filePath) filePaths.push(filePath);
          }
        }
      }
    }
    return filePaths;
  }

  /**
   * Copy multiple files to clipboard
   */
  static async copyFilesToClipboard(filePaths: string[]) {
    if (filePaths.length === 0) return;

    if (filePaths.length === 1) {
      new ztoolkit.Clipboard().addFile(filePaths[0]).copy();
      return;
    }

    // Multiple files — use NSPasteboard via AppleScript on macOS
    if (Zotero.isMac) {
      const fileListStr = filePaths.map((p) => `"${p}"`).join(", ");
      const args = [
        "-e",
        'use framework "AppKit"',
        "-e",
        'use framework "Foundation"',
        "-e",
        "set pb to current application's NSPasteboard's generalPasteboard()",
        "-e",
        "pb's clearContents()",
        "-e",
        `pb's declareTypes:{"NSFilenamesPboardType"} owner:(missing value)`,
        "-e",
        `set fileList to current application's NSArray's arrayWithArray:{${fileListStr}}`,
        "-e",
        `pb's setPropertyList:fileList forType:"NSFilenamesPboardType"`,
      ];
      await Zotero.Utilities.Internal.exec("/usr/bin/osascript", args);
    } else {
      // Fallback: copy first file only (nsITransferable doesn't support multiple files)
      new ztoolkit.Clipboard().addFile(filePaths[0]).copy();
    }
  }

  /**
   * Copy selected item files to clipboard
   */
  static async copySelectedItemFiles() {
    try {
      const zp = Zotero.getActiveZoteroPane();
      const items = zp.getSelectedItems();
      if (!items || items.length === 0) {
        WfhZoteroToolsFactory.showNotification("No items selected", "error");
        return;
      }

      const filePaths =
        await WfhZoteroToolsFactory.getFilePathsFromItems(items);
      if (filePaths.length === 0) {
        WfhZoteroToolsFactory.showNotification("No PDF files found", "error");
        return;
      }

      await WfhZoteroToolsFactory.copyFilesToClipboard(filePaths);

      const message =
        filePaths.length === 1
          ? "File copied to clipboard"
          : `Copied ${filePaths.length} files to clipboard`;
      WfhZoteroToolsFactory.showNotification(message, "success");
    } catch (error) {
      ztoolkit.log("Error copying files to clipboard:", error);
      WfhZoteroToolsFactory.showNotification("Error copying files", "error");
    }
  }

  /**
   * Register item context menu for library items
   */
  static registerItemContextMenu() {
    ztoolkit.log("WfhZoteroTools: Registering item context menu");

    ztoolkit.Menu.register("item", {
      tag: "menuitem",
      id: "zotero-itemmenu-wfh-copy-files",
      label: getString("menu-item-copy-files"),
      commandListener: async () => {
        await WfhZoteroToolsFactory.copySelectedItemFiles();
      },
    });

    ztoolkit.log("WfhZoteroTools: Item context menu registered successfully");
  }

  /**
   * Get citekey and PDF path from a single Zotero item
   */
  static async getCitekeyAndPdfPath(
    item: Zotero.Item,
  ): Promise<{ citekey: string; pdfPath: string } | null> {
    let citekey = "";
    let pdfPath = "";

    if (item.isRegularItem()) {
      // Get citekey from the parent item
      try {
        citekey = (item.getField("citationKey") as string) || "";
      } catch {
        citekey = "";
      }
      // Find first PDF attachment
      const attachmentIDs = item.getAttachments();
      for (const attID of attachmentIDs) {
        const att = await Zotero.Items.getAsync(attID);
        if (
          att &&
          att.isAttachment() &&
          att.attachmentContentType === "application/pdf"
        ) {
          const filePath = await att.getFilePathAsync();
          if (filePath) {
            pdfPath = filePath;
            break;
          }
        }
      }
    } else if (item.isAttachment()) {
      // Item is an attachment — get path directly
      const filePath = await item.getFilePathAsync();
      if (filePath) pdfPath = filePath;
      // Get citekey from parent item
      const parentID = item.parentItemID;
      if (parentID) {
        const parent = await Zotero.Items.getAsync(parentID);
        if (parent) {
          try {
            citekey = (parent.getField("citationKey") as string) || "";
          } catch {
            citekey = "";
          }
        }
      }
    }

    if (!pdfPath) return null;
    return { citekey, pdfPath };
  }

  /**
   * Launch chatpdf-automation script for the selected item
   */
  static async runChatPDF(provider: "chatgpt" | "gemini" | "both") {
    try {
      const zp = Zotero.getActiveZoteroPane();
      const items = zp.getSelectedItems();
      if (!items || items.length !== 1) {
        WfhZoteroToolsFactory.showNotification(
          "Please select exactly one item",
          "error",
        );
        return;
      }

      const result = await WfhZoteroToolsFactory.getCitekeyAndPdfPath(items[0]);
      if (!result) {
        WfhZoteroToolsFactory.showNotification("No PDF file found", "error");
        return;
      }

      const { citekey, pdfPath } = result;
      const scriptNames: Record<string, string> = {
        chatgpt: "chatgpt_chat_pdf.js",
        gemini: "gemini_chat_pdf.js",
        both: "both_chat_pdf.js",
      };
      const scriptName = scriptNames[provider];

      // Resolve paths from preferences / auto-detection
      let scriptDir: string;
      let nodePath: string;
      try {
        scriptDir = WfhZoteroToolsFactory.getChatPDFScriptsDir();
      } catch (e) {
        ztoolkit.log("WfhZoteroTools: Scripts dir not configured:", e);
        WfhZoteroToolsFactory.showNotification(
          getString("error-chatpdf-scripts-not-configured"),
          "error",
        );
        return;
      }
      try {
        nodePath = WfhZoteroToolsFactory.findNodePath();
      } catch (e) {
        ztoolkit.log("WfhZoteroTools: Node.js not found:", e);
        WfhZoteroToolsFactory.showNotification(
          getString("error-node-not-found"),
          "error",
        );
        return;
      }
      const scriptPath = `${scriptDir}/${scriptName}`;

      // Generate temp file path for output
      const tempOutputPath = `${Zotero.getTempDirectory().path}/chatpdf_output_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.json`;

      const args = [scriptPath, pdfPath, `--output=${tempOutputPath}`];
      if (citekey) {
        args.push(`@${citekey}`);
      }

      ztoolkit.log(`WfhZoteroTools: Running ${provider} with args:`, args);

      const notifyMsg =
        provider === "both"
          ? "Launching ChatGPT + Gemini..."
          : `Launching ${provider}...`;
      WfhZoteroToolsFactory.showNotification(notifyMsg, "success");

      await Zotero.Utilities.Internal.exec(nodePath, args);

      ztoolkit.log(
        "WfhZoteroTools: Script execution completed, reading temp file:",
        tempOutputPath,
      );

      // Read and parse output
      let outputContent = "";
      try {
        const tempFile = Zotero.File.pathToFile(tempOutputPath);
        // Check if file exists
        if (tempFile.exists()) {
          ztoolkit.log("WfhZoteroTools: Temp file exists, reading contents...");
          const content = await Zotero.File.getContentsAsync(tempOutputPath);
          ztoolkit.log("WfhZoteroTools: File content type:", typeof content);
          if (typeof content === "string") {
            outputContent = content;
            ztoolkit.log("WfhZoteroTools: Output content:", outputContent);
          }
          tempFile.remove(false); // Clean up
        } else {
          ztoolkit.log("Temp output file not found:", tempOutputPath);
        }
      } catch (e) {
        ztoolkit.log("Error reading temp output file:", e);
      }

      ztoolkit.log(
        "WfhZoteroTools: Parsed outputContent length:",
        outputContent.length,
      );

      // Parse JSON lines and save attachments
      if (outputContent) {
        const lines = outputContent.trim().split("\n");
        ztoolkit.log("WfhZoteroTools: Number of lines:", lines.length);
        for (const line of lines) {
          try {
            ztoolkit.log("WfhZoteroTools: Parsing line:", line);
            const data = JSON.parse(line);
            if (data.url) {
              ztoolkit.log(
                "WfhZoteroTools: Saving attachment for",
                data.provider,
                data.url,
              );
              await WfhZoteroToolsFactory.saveChatPDFAttachment(
                items[0],
                data.provider,
                data.url,
              );
            }
          } catch (e) {
            ztoolkit.log("Failed to parse JSON line:", line, e);
          }
        }
      } else {
        ztoolkit.log("WfhZoteroTools: No output content found!");
      }
    } catch (error) {
      ztoolkit.log("WfhZoteroTools: Error running ChatPDF:", error);
      WfhZoteroToolsFactory.showNotification(
        "Error launching ChatPDF",
        "error",
      );
    }
  }

  /**
   * Save ChatPDF conversation URL as a linked attachment
   */
  static async saveChatPDFAttachment(
    parentItem: Zotero.Item,
    provider: string,
    url: string,
  ) {
    ztoolkit.log("WfhZoteroTools: saveChatPDFAttachment called", {
      parentItemID: parentItem.id,
      provider,
      url,
    });
    try {
      const title =
        provider === "chatgpt" ? "Chat with ChatGPT" : "Chat with Gemini";
      ztoolkit.log("WfhZoteroTools: Calling linkFromURL with:", {
        url,
        parentItemID: parentItem.id,
        title,
      });
      await Zotero.Attachments.linkFromURL({
        url: url,
        parentItemID: parentItem.id,
        title: title,
      });
      ztoolkit.log("WfhZoteroTools: linkFromURL completed successfully");
      WfhZoteroToolsFactory.showNotification(`Saved ${title} link`, "success");
    } catch (error) {
      ztoolkit.log("Error saving ChatPDF attachment:", error);
      WfhZoteroToolsFactory.showNotification(
        "Failed to save chat link",
        "error",
      );
    }
  }

  /**
   * Register "Chat with PDF" submenu in library item context menu
   */
  static registerChatPDFMenu() {
    ztoolkit.log("WfhZoteroTools: Registering ChatPDF menu");

    ztoolkit.Menu.register("item", {
      tag: "menu",
      id: "zotero-itemmenu-wfh-chatpdf",
      label: getString("menu-chatpdf"),
      children: [
        {
          tag: "menuitem",
          id: "zotero-itemmenu-wfh-chatpdf-chatgpt",
          label: getString("menu-chatpdf-chatgpt"),
          commandListener: async () => {
            await WfhZoteroToolsFactory.runChatPDF("chatgpt");
          },
        },
        {
          tag: "menuitem",
          id: "zotero-itemmenu-wfh-chatpdf-gemini",
          label: getString("menu-chatpdf-gemini"),
          commandListener: async () => {
            await WfhZoteroToolsFactory.runChatPDF("gemini");
          },
        },
        {
          tag: "menuitem",
          id: "zotero-itemmenu-wfh-chatpdf-both",
          label: getString("menu-chatpdf-both"),
          commandListener: async () => {
            await WfhZoteroToolsFactory.runChatPDF("both");
          },
        },
      ],
    });

    ztoolkit.log("WfhZoteroTools: ChatPDF menu registered successfully");
  }
}
