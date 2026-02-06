# WfhZoteroTools

[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)

WfhZoteroTools is a Zotero plugin that adds convenient file operations to the PDF reader's context menu, allowing you to quickly locate files in Finder and copy them to clipboard for sharing.

## Features

- 🎯 **Simple Context Menu**: Right-click anywhere in the PDF reader to access file operations
- 📂 **Show in Finder**: Instantly opens Finder with the current PDF file highlighted
- 📋 **Copy File**: Copy the PDF file to clipboard for pasting into chat apps (WeChat, Slack, Discord)
- ✅ **Works with All Attachments**: Supports both stored attachments and linked files
- 🔔 **User Feedback**: Shows success/error notifications for all operations
- 🌍 **Cross-Platform Ready**: Works on macOS, Windows, and Linux

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
# Clone the repository
git clone <repository-url>
cd zotero-plugin-wfh

# Install dependencies
npm install

# Build the plugin
npm run build

# The .xpi file will be in .scaffold/build/wfh-zotero-tools.xpi
```

## Usage

### Show in Finder

1. Open a PDF in Zotero's built-in reader
2. Right-click anywhere in the **PDF content area** (on text, images, or blank space)
3. Select **"Show in Finder"** from the context menu
4. Finder will open with the PDF file highlighted

### Copy File

1. Open a PDF in Zotero's built-in reader
2. Right-click anywhere in the **PDF content area**
3. Select **"Copy File"** from the context menu
4. A success notification will appear
5. Paste (Cmd+V / Ctrl+V) into any application:
   - Chat apps (WeChat, Slack, Discord)
   - Email clients
   - Any application that accepts file attachments

> **Note**: The actual PDF file is copied, not just the file path. This allows you to paste it directly as an attachment.
>
> **Tip**: Right-click in the PDF content area, not on the tab label at the top.

## Development

### Prerequisites

- Node.js (v16 or higher)
- npm
- Zotero 7

### Setup

```bash
# Install dependencies
npm install

# Start development mode with hot reload
npm run start

# Build for production
npm run build

# Run tests
npm run test

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
│   ├── locale/                # Localization files
│   └── content/               # Static assets
├── package.json               # Plugin metadata
└── zotero-plugin.config.ts    # Build configuration
```

## How It Works

The plugin uses Zotero's Reader API to register a context menu item:

1. **Registration**: On startup, registers an event listener for `createViewContextMenu`
2. **Menu Creation**: When user right-clicks in PDF reader, adds "Show in Finder" menu item
3. **File Reveal**: When clicked, retrieves the attachment item and uses `file.reveal()` to show it in Finder

Key APIs used:
- `Zotero.Reader.registerEventListener()` - Register context menu items
- `Zotero.Items.getAsync()` - Get attachment item
- `item.getFilePathAsync()` - Get file path
- `Zotero.File.pathToFile()` - Convert path to file object
- `file.reveal()` - Reveal file in system file manager
- `ztoolkit.Clipboard().addFile().copy()` - Copy file to clipboard

## Troubleshooting

### Menu item doesn't appear

- Make sure you're right-clicking in the PDF content area, not on the tab label
- Check that the plugin is enabled in **Tools → Plugins**
- Restart Zotero after installing the plugin

### "File not found" error

- The PDF file may have been moved or deleted from disk
- For linked files, ensure the original file still exists at the linked location

### Debug logging

To see debug output:
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
