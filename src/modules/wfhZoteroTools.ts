import { config } from "../../package.json";
import { getString } from "../utils/locale";

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
        WfhZoteroToolsFactory.showNotification("Not a valid attachment", "error");
        return;
      }

      // Get the file path
      const filePath = await item.getFilePathAsync();
      if (!filePath) {
        WfhZoteroToolsFactory.showNotification("File not found on disk", "error");
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
        WfhZoteroToolsFactory.showNotification("Not a valid attachment", "error");
        return;
      }

      // Get the file path
      const filePath = await item.getFilePathAsync();
      if (!filePath) {
        WfhZoteroToolsFactory.showNotification("File not found on disk", "error");
        return;
      }

      // Copy file to clipboard using ztoolkit
      new ztoolkit.Clipboard()
        .addFile(filePath)
        .copy();

      WfhZoteroToolsFactory.showNotification("File copied to clipboard", "success");
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
          if (att && att.isAttachment() && att.attachmentContentType === "application/pdf") {
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
        "-e", 'use framework "AppKit"',
        "-e", 'use framework "Foundation"',
        "-e", "set pb to current application's NSPasteboard's generalPasteboard()",
        "-e", "pb's clearContents()",
        "-e", `pb's declareTypes:{"NSFilenamesPboardType"} owner:(missing value)`,
        "-e", `set fileList to current application's NSArray's arrayWithArray:{${fileListStr}}`,
        "-e", `pb's setPropertyList:fileList forType:"NSFilenamesPboardType"`,
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

      const filePaths = await WfhZoteroToolsFactory.getFilePathsFromItems(items);
      if (filePaths.length === 0) {
        WfhZoteroToolsFactory.showNotification("No PDF files found", "error");
        return;
      }

      await WfhZoteroToolsFactory.copyFilesToClipboard(filePaths);

      const message = filePaths.length === 1
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
  static async runChatPDF(provider: "chatgpt" | "gemini") {
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

      const result = await WfhZoteroToolsFactory.getCitekeyAndPdfPath(
        items[0],
      );
      if (!result) {
        WfhZoteroToolsFactory.showNotification("No PDF file found", "error");
        return;
      }

      const { citekey, pdfPath } = result;
      const scriptName =
        provider === "chatgpt"
          ? "chatgpt_chat_pdf.js"
          : "gemini_chat_pdf.js";
      const scriptDir =
        "/Users/ssqc/AIGC_Projects/zotero-plugin-wfh/scripts/chatpdf-automation";
      const scriptPath = `${scriptDir}/${scriptName}`;

      const args = [scriptPath, pdfPath];
      if (citekey) {
        args.push(`@${citekey}`);
      }

      ztoolkit.log(
        `WfhZoteroTools: Running ${provider} with args:`,
        args,
      );

      WfhZoteroToolsFactory.showNotification(
        `Launching ${provider}...`,
        "success",
      );

      await Zotero.Utilities.Internal.exec("/opt/homebrew/bin/node", args);
    } catch (error) {
      ztoolkit.log("WfhZoteroTools: Error running ChatPDF:", error);
      WfhZoteroToolsFactory.showNotification(
        "Error launching ChatPDF",
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
      ],
    });

    ztoolkit.log("WfhZoteroTools: ChatPDF menu registered successfully");
  }
}
