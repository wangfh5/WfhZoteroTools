# WfhZoteroTools

[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)

WfhZoteroTools is a Zotero plugin that adds convenient file operations to both the PDF reader and library item context menus, allowing you to quickly locate files in Finder and copy them to clipboard for sharing.

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

- **General**
  - Works with both stored and linked file attachments
  - Success/error notifications for all operations
  - Bilingual support (English / Chinese)

## Installation

### From Release (Recommended)

1. Download the latest `.xpi` file from the [Releases](../../releases) page
2. In Zotero, go to **Tools → Plugins** (or **Zotero → Settings → Plugins** on macOS)
3. Click the gear icon in the top-right corner
4. Select **Install Plugin From File...**
5. Choose the downloaded `.xpi` file
6. Restart Zotero

### From Source

```bash
git clone <repository-url>
cd zotero-plugin-wfh

npm install

# Install ChatPDF automation dependencies
cd scripts/chatpdf-automation && npm install && cd ../..

npm run build

# The .xpi file will be in .scaffold/build/wfh-zotero-tools.xpi
```

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

1. In the library view, select exactly one item (or one attachment)
2. Right-click → **"Chat with PDF"** → choose **"ChatGPT"** or **"Gemini"**
3. The plugin will:
   - Find the first PDF path from the selected item
   - Extract citation key (if available) and pass it as chat name (`@citekey`)
   - Launch the corresponding automation script
4. Wait for browser automation to upload PDF and send the preset prompt

> **Notes**
>
> - ChatPDF currently executes Node from `/opt/homebrew/bin/node` (Apple Silicon macOS path).
> - Automation scripts are loaded from `scripts/chatpdf-automation/`.
> - Browser profile is shared for ChatGPT and Gemini at `~/Library/Caches/ms-playwright/daemon/chatpdf-shared-profile`.
> - First-time use with a fresh profile requires manual login once.

## Development

### Prerequisites

- Node.js (v16 or higher)
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
│   └── content/               # Static assets
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
3. Executes Node script with `Zotero.Utilities.Internal.exec("/opt/homebrew/bin/node", [scriptPath, pdfPath, chatName])`
4. Script automates browser upload + prompt send for ChatGPT/Gemini using Playwright CDP reuse

### Key APIs

- `Zotero.Reader.registerEventListener()` — PDF reader context menu
- `ztoolkit.Menu.register("item", ...)` — Library item context menu
- `Zotero.getActiveZoteroPane().getSelectedItems()` — Get selected library items
- `Zotero.Items.getAsync()` / `item.getAttachments()` — Traverse item → attachments
- `item.getFilePathAsync()` — Get file path on disk
- `ztoolkit.Clipboard().addFile().copy()` — Single-file clipboard copy
- `Zotero.Utilities.Internal.exec()` — Execute external commands (osascript)

## Troubleshooting

### Menu item doesn't appear

- **PDF reader**: Make sure you're right-clicking in the PDF content area, not on the tab label
- **Library**: Make sure items are selected before right-clicking
- Check that the plugin is enabled in **Tools → Plugins**
- Restart Zotero after installing the plugin

### "No PDF files found"

- The selected item(s) may not have PDF attachments
- For linked files, ensure the original file still exists at the linked location

### ChatPDF automation doesn't launch

- Confirm `scripts/chatpdf-automation/package.json` dependencies are installed
- Confirm Node exists at `/opt/homebrew/bin/node` (or update the path in `src/modules/wfhZoteroTools.ts`)
- Check script logs under `scripts/chatpdf-automation/artifacts/`

### Debug logging

1. Open **Tools → Developer → Error Console**
2. Look for messages starting with "WfhZoteroTools:"

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

AGPL-3.0-or-later

## Acknowledgments

Built with [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template) by windingwind.

## Related Resources

- [Zotero Plugin Development Documentation](https://www.zotero.org/support/dev/zotero_7_for_developers)
- [Zotero Plugin Toolkit](https://github.com/windingwind/zotero-plugin-toolkit)
- [Zotero Type Definitions](https://github.com/windingwind/zotero-types)
