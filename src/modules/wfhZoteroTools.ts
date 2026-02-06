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
}
