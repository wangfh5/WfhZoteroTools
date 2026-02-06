import { config } from "../../package.json";

export class ShowInFinderFactory {
  /**
   * Register the "Show in Finder" context menu item for PDF reader
   */
  static registerContextMenu() {
    ztoolkit.log("ShowInFinder: Registering context menu");

    Zotero.Reader.registerEventListener(
      "createViewContextMenu",
      (event: any) => {
        ztoolkit.log("ShowInFinder: createViewContextMenu event triggered", event);
        const { reader, append } = event;

        // Only show menu item if we have a valid reader with an attachment
        if (!reader || !reader.itemID) {
          ztoolkit.log("ShowInFinder: No reader or itemID found");
          return;
        }

        ztoolkit.log("ShowInFinder: Adding menu item for itemID:", reader.itemID);
        append({
          label: "Show in Finder",
          onCommand: async () => {
            ztoolkit.log("ShowInFinder: Menu item clicked");
            await ShowInFinderFactory.showCurrentPDFInFinder(reader);
          },
        });

        // Add second menu item for copying file
        append({
          label: "Copy File",
          onCommand: async () => {
            ztoolkit.log("ShowInFinder: Copy File menu item clicked");
            await ShowInFinderFactory.copyCurrentPDFFile(reader);
          },
        });
      },
      config.addonID,
    );

    ztoolkit.log("ShowInFinder: Context menu registered successfully");
  }

  /**
   * Show the current PDF file in Finder
   */
  static async showCurrentPDFInFinder(reader: any) {
    try {
      // Get the attachment item from the reader
      const itemID = reader.itemID;
      if (!itemID) {
        ShowInFinderFactory.showNotification("No PDF file open", "error");
        return;
      }

      const item = await Zotero.Items.getAsync(itemID);
      if (!item || !item.isAttachment()) {
        ShowInFinderFactory.showNotification("Not a valid attachment", "error");
        return;
      }

      // Get the file path
      const filePath = await item.getFilePathAsync();
      if (!filePath) {
        ShowInFinderFactory.showNotification("File not found on disk", "error");
        return;
      }

      // Reveal the file in Finder using Zotero's built-in method
      const file = Zotero.File.pathToFile(filePath);
      file.reveal();

      ShowInFinderFactory.showNotification("Revealed in Finder", "success");
    } catch (error) {
      ztoolkit.log("Error showing file in Finder:", error);
      ShowInFinderFactory.showNotification("Error revealing file", "error");
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
        ShowInFinderFactory.showNotification("No PDF file open", "error");
        return;
      }

      // Get the attachment item
      const item = await Zotero.Items.getAsync(itemID);
      if (!item || !item.isAttachment()) {
        ShowInFinderFactory.showNotification("Not a valid attachment", "error");
        return;
      }

      // Get the file path
      const filePath = await item.getFilePathAsync();
      if (!filePath) {
        ShowInFinderFactory.showNotification("File not found on disk", "error");
        return;
      }

      // Copy file to clipboard using ztoolkit
      new ztoolkit.Clipboard()
        .addFile(filePath)
        .copy();

      ShowInFinderFactory.showNotification("File copied to clipboard", "success");
    } catch (error) {
      ztoolkit.log("Error copying file to clipboard:", error);
      ShowInFinderFactory.showNotification("Error copying file", "error");
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
