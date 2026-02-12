# WfhZoteroTools

[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)

WfhZoteroTools is a Zotero plugin that adds convenient file operations to both the PDF reader and library item context menus, allowing you to quickly locate files in Finder and copy them to clipboard for sharing.

> **⚠️ Platform Support**
>
> This plugin has been tested **exclusively on macOS**. While some features may work on Windows and Linux, full compatibility on these platforms is not guaranteed. Use on non-macOS systems at your own risk.

## Features

- **PDF Reader Context Menu**
  - **Show in Finder**: Right-click in the PDF content area to reveal the file in Finder
  - **Copy File**: Copy the current PDF to clipboard for pasting into chat apps

- **Library Item Context Menu**
  - **Copy Files**: Right-click selected items in the library to copy their PDF attachments to clipboard
  - Supports **multi-selection** — select multiple items and copy all their PDFs at once
  - Automatically finds PDF attachments from parent items
  - **Chat with PDF**: Right-click a single item to open an AI submenu:
    - **ChatGPT**: Upload the first PDF attachment, send preset prompt, and auto-rename chat
    - **Gemini**: Upload the first PDF attachment, send preset prompt, and auto-rename chat
    - **Both (Parallel)**: Run ChatGPT and Gemini simultaneously in parallel
    - Chat URLs are automatically saved as linked URL attachments on the Zotero item for easy access

- **General**
  - Works with both stored and linked file attachments
  - Success/error notifications for all operations
  - Bilingual support (English / Chinese)

## Installation

This plugin requires building from source. Installation is split into two tiers depending on which features you need:

### Tier 1: Basic Features (Show in Finder, Copy Files)

1. Clone the repository:

   ```bash
   git clone https://github.com/wangfh5/WfhZoteroTools.git
   cd WfhZoteroTools
   ```

2. Install dependencies and build:

   ```bash
   npm install
   npm run build
   ```

   The `.xpi` file will be generated at `.scaffold/build/wfh-zotero-tools.xpi`

3. Install in Zotero:
   - Go to **Tools → Plugins** (or **Zotero → Settings → Plugins** on macOS)
   - Click the gear icon in the top-right corner
   - Select **Install Plugin From File...**
   - Choose the generated `.xpi` file

4. Restart Zotero

### Tier 2: ChatPDF Feature (Additional Setup)

If you want to use the **Chat with PDF** feature, you need additional setup on top of Tier 1:

1. **Node.js**: Install Node.js >= 18 if not already installed

2. **Google Chrome**: Make sure you have Google Chrome installed on your system

3. **Playwright dependencies**: Navigate to the chatpdf automation folder and install:

   ```bash
   cd scripts/chatpdf-automation
   npm install
   ```

4. **Configure plugin preferences**:
   - Open Zotero → **Tools → Add-ons**
   - Find **WfhZoteroTools** and click **Preferences**
   - Set the following:
     - **ChatPDF Scripts Directory**: Enter the absolute path to `scripts/chatpdf-automation/` in your cloned repository
       - Example (macOS): `/Users/yourname/WfhZoteroTools/scripts/chatpdf-automation`
       - Example (Windows): `C:\Users\yourname\WfhZoteroTools\scripts\chatpdf-automation`
     - **Node.js Path** (optional): Enter the path to your `node` executable, or leave blank for auto-detection
       - If left blank, the plugin will auto-detect Node.js at common locations

5. **First-time login**: The first time you use ChatPDF, the plugin will launch a Chrome window. You'll need to manually log in to ChatGPT and/or Gemini once. The login session will be saved for future use.

## Usage

### PDF Reader — Show in Finder / Copy File

1. Open a PDF in Zotero's built-in reader
2. Right-click anywhere in the **PDF content area** (not the tab label)
3. Select **"Show in Finder"** or **"Copy File"**

### Library — Copy Files (single or multi-select)

1. In the library view, select one or more items
2. Right-click → **"Copy Files"**
3. Paste (Cmd+V) into Finder, chat apps, email, etc.

> **Note**: The actual PDF files are copied to the clipboard, not file paths. You can paste them directly as attachments.
>
> **Multi-file copy on macOS** uses `NSPasteboard` with `NSFilenamesPboardType` via AppleScript to support copying multiple files at once. On other platforms, the first file is copied.

### Library — Chat with PDF (single select)

**Prerequisites**: Complete [Tier 2 installation](#tier-2-chatpdf-feature-additional-setup) and configure the plugin preferences.

1. In the library view, select exactly one item (or one attachment)
2. Right-click → **"Chat with PDF"** → choose one of:
   - **"ChatGPT"**: Automate upload and prompt to ChatGPT
   - **"Gemini"**: Automate upload and prompt to Gemini
   - **"Both (Parallel)"**: Run both ChatGPT and Gemini simultaneously
3. The plugin will:
   - Find the first PDF path from the selected item
   - Extract the citation key (if available) and use it to name the chat (`@citekey`)
   - Launch the automation script using your configured Node.js and script directory
   - Upload the PDF and send a preset prompt
4. Wait for the browser automation to complete
5. The chat URL(s) will be automatically saved as linked URL attachments on your Zotero item

> **Notes**
>
> - Node.js path is configured in plugin preferences (or auto-detected if left blank)
> - Automation scripts are loaded from the directory you configured in preferences
> - Browser profile is shared for ChatGPT and Gemini at `~/Library/Caches/ms-playwright/daemon/chatpdf-shared-profile`
> - First-time use: you need to manually log in to ChatGPT/Gemini once when the browser window opens

## Development

### Prerequisites

- Node.js >= 18
- npm
- Zotero 7

### Setup

```bash
npm install

# Start development mode with hot reload
npm run start

# Build for production
npm run build

# Lint and format code
npm run lint:fix
```

### Project Structure

```
zotero-plugin-wfh/
├── src/
│   ├── modules/
│   │   └── wfhZoteroTools.ts  # Core functionality
│   ├── hooks.ts               # Plugin lifecycle hooks
│   └── utils/                 # Utility functions
├── addon/
│   ├── locale/                # Localization files (en-US, zh-CN)
│   └── content/               # Static assets (includes preferences.xhtml)
├── scripts/
│   └── chatpdf-automation/    # ChatPDF automation scripts (not included in XPI)
│       ├── chatgpt_chat_pdf.js
│       ├── gemini_chat_pdf.js
│       ├── both_chat_pdf.js
│       ├── browser_helper.js
│       └── package.json       # Playwright dependencies
├── package.json               # Plugin metadata
└── zotero-plugin.config.ts    # Build configuration
```

## How It Works

### PDF Reader Menu

Registers an event listener on `Zotero.Reader.registerEventListener("createViewContextMenu", ...)`. When the user right-clicks in the PDF content area, the handler appends "Show in Finder" and "Copy File" menu items.

### Library Item Menu

Registers menu items via `ztoolkit.Menu.register("item", ...)`. When clicked:

1. Gets selected items via `Zotero.getActiveZoteroPane().getSelectedItems()`
2. For each item, finds PDF attachments (handles both regular items and direct attachments)
3. Copies files to clipboard:
   - **Single file**: Uses `ztoolkit.Clipboard().addFile(path).copy()` (the toolkit has a built-in macOS fallback using `osascript` for the `POSIX file` approach)
   - **Multiple files (macOS)**: Uses `NSPasteboard` + `NSFilenamesPboardType` via AppleScript, which is the native macOS pasteboard type for multiple file references
   - **Multiple files (other OS)**: Falls back to copying the first file

### Chat with PDF Menu

Registers a submenu via `ztoolkit.Menu.register("item", { tag: "menu", children: [...] })`.
When clicked:

1. Validates exactly one selected item
2. Resolves PDF path + citation key from either parent item or attachment
3. Reads configuration from plugin preferences:
   - `chatpdfScriptsDir`: Required absolute path to `scripts/chatpdf-automation/`
   - `nodePath`: Optional Node.js executable path (if empty, auto-detects at common locations)
4. Auto-detection fallback paths for Node.js:
   - macOS: `/opt/homebrew/bin/node`, `/usr/local/bin/node`
   - Linux: `/usr/bin/node`, `/usr/local/bin/node`
   - Windows: `C:\Program Files\nodejs\node.exe`
5. Executes Node script with `Zotero.Utilities.Internal.exec(nodePath, [scriptPath, pdfPath, "--output=tempFile", "@citekey"])`
6. Script automates browser upload + prompt send for ChatGPT/Gemini using Playwright CDP connection
7. Parses JSON output and saves chat URLs as linked URL attachments via `Zotero.Attachments.linkFromURL()`

### Key APIs

- `Zotero.Reader.registerEventListener()` — PDF reader context menu
- `ztoolkit.Menu.register("item", ...)` — Library item context menu
- `Zotero.getActiveZoteroPane().getSelectedItems()` — Get selected library items
- `Zotero.Items.getAsync()` / `item.getAttachments()` — Traverse item → attachments
- `item.getFilePathAsync()` — Get file path on disk
- `ztoolkit.Clipboard().addFile().copy()` — Single-file clipboard copy
- `Zotero.Utilities.Internal.exec()` — Execute external commands (osascript)

## License

AGPL-3.0-or-later

## Acknowledgments

Built with [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template) by windingwind.

## Related Resources

- [Zotero Plugin Development Documentation](https://www.zotero.org/support/dev/zotero_7_for_developers)
- [Zotero Plugin Toolkit](https://github.com/windingwind/zotero-plugin-toolkit)
- [Zotero Type Definitions](https://github.com/windingwind/zotero-types)
