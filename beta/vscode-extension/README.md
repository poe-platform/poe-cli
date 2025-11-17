# Poe Code VS Code Extension

Use Poe Code directly in VS Code with a single click!

## Overview

The Poe Code extension adds a terminal icon to your editor toolbar and a status bar item. Click either to instantly launch an interactive AI chat terminal powered by the Poe API, with full access to tool calling, MCP servers, and file mentions.

## Features

- **One-click launch**: Terminal icon in editor toolbar + status bar item opens Poe Code instantly
- **Setup wizard**: Automatically prompts for API key configuration on first use
- **Interactive AI chat**: Full-featured chat interface with Poe API models
- **Visual tool calling**: See tools being executed in real-time with `⏺ ToolName(args) ⎿ result`
- **File mentions**: Use `@` to select and reference files in your chat
- **MCP support**: Add external tools via Model Context Protocol servers
- **Model switching**: Change models on the fly with `/model`
- **Status bar integration**: Quick access from the status bar
- **Configuration options**: Customize default model and behavior

## Requirements

- Node.js 18 or higher
- VS Code 1.80.0 or higher
- Poe API key (get one from [poe.com](https://poe.com))

## Installation

### From VSIX (Recommended)

1. Download the `.vsix` file from the releases page or build it yourself (see below)
2. Open VS Code
3. Go to Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
4. Click the `...` menu at the top
5. Select "Install from VSIX..."
6. Choose the `.vsix` file

### Building from Source

1. Navigate to the extension directory:
   ```bash
   cd vscode-extension
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile the extension:
   ```bash
   npm run compile
   ```

4. Package the extension:
   ```bash
   npm run package
   ```
   This creates a `.vsix` file in the `vscode-extension` directory.

5. Install in VS Code (see "From VSIX" above)

## Usage

### First-time Setup

When you first click the Poe Code icon, the extension will check if you have configured your API key. If not, it will prompt you to enter it. You can also:

1. Use the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type "Poe Code: Check Setup"
3. Follow the prompts to enter your API key

Alternatively, configure manually via terminal:
```bash
npx poe-code login --api-key YOUR_KEY
```

### Launching Poe Code

Three ways to launch:

1. **Editor toolbar**: Click the terminal icon (📟) in the top-right of any editor
2. **Status bar**: Click the "Poe Code" item in the bottom-right status bar
3. **Command Palette**: `Ctrl+Shift+P` / `Cmd+Shift+P` → "Poe Code: Open Terminal"

A new terminal opens running `npx poe-code interactive` and you can start chatting immediately!

### Key Features in the Terminal

- **Chat with AI**: Type naturally to interact with AI models
- **File mentions**: Type `@` to open a file picker and select files to reference
- **Tool calling**: The AI can automatically read files, run commands, and more
- **MCP tools**: Add external tools with `/mcp add <name> <command>`
- **Model switching**: Change models with `/model GPT-5.1` or `/model Claude-Sonnet-4.5`
- **View tools**: See all available tools with `/tools`
- **Clear history**: Start fresh with `/clear`

### Example Workflow

```bash
# In the Poe Code terminal
> /model Claude-Sonnet-4.5
Switched to model: Claude-Sonnet-4.5

> @src/index.ts Can you explain what this file does?
⏺ ReadFile(src/index.ts) ⎿ Read 150 lines

Poe Code: This is the main entry point...

> /mcp add filesystem npx -y @modelcontextprotocol/server-filesystem /Users/you/project
MCP server 'filesystem' added and connected.

> /tools
Available tools:
- ReadFile: Read a file from the filesystem
- WriteFile: Write content to a file
...
```

## Configuration

Access settings via File → Preferences → Settings → Extensions → Poe Code:

- **Default Model**: Set your preferred AI model (default: `Claude-Sonnet-4.5`)
- **Auto Open Terminal**: Automatically open Poe Code terminal on VS Code startup (default: `false`)
- **Show Status Bar**: Show/hide the Poe Code status bar item (default: `true`)

Or edit `settings.json`:
```json
{
  "poeCode.defaultModel": "Claude-Sonnet-4.5",
  "poeCode.autoOpenTerminal": false,
  "poeCode.showStatusBar": true
}
```

## Commands

The extension provides these commands (access via Command Palette):

- **Poe Code: Open Terminal** - Opens a new terminal with Poe Code interactive mode
- **Poe Code: Check Setup** - Verify your API key configuration

## Troubleshooting

### Extension not appearing

After installing, you may need to reload VS Code:
- Press `Ctrl+Shift+P` / `Cmd+Shift+P`
- Type "Developer: Reload Window"

### Terminal not launching

Ensure Node.js is installed and accessible in your PATH:
```bash
node --version  # Should be 18 or higher
```

### API Key Issues

If you see API key errors:

1. Use the "Poe Code: Check Setup" command
2. Or manually configure:
   ```bash
  npx poe-code login --api-key YOUR_KEY
   ```
3. Test your connection:
   ```bash
  npx poe-code test
   ```

### MCP servers not working

See [MCP.md](../MCP.md) for detailed MCP troubleshooting.

### Status bar not showing

Check your settings:
```json
{
  "poeCode.showStatusBar": true
}
```

## Browser Preview

You can preview and test the webview UI **outside of VSCode** in any browser with full functionality!

### Quick Start

```bash
# From vscode-extension directory
npm run preview
```

This starts a local server at `http://localhost:3000` with:
- ✅ Full Poe API integration
- ✅ Real tool execution
- ✅ WebSocket for real-time updates
- ✅ Browser DevTools for debugging

See [`preview/README.md`](preview/README.md) for detailed documentation.

### Why Use Browser Preview?

- **Faster iteration** - No extension rebuild needed
- **Better debugging** - Use browser DevTools
- **Easy sharing** - Send URL to others for review
- **Cross-browser testing** - Test in Chrome, Firefox, Safari
- **No VSCode required** - Develop UI independently

## Development

To modify the extension:

1. Make changes to `vscode-extension/src/extension.ts`
2. Compile: `npm run compile`
3. Test in VS Code:
   - Press `F5` to open Extension Development Host
   - Test your changes
4. **Or test in browser**: `npm run preview` (faster!)
5. Package when ready: `npm run package`

### Project Structure

```
vscode-extension/
├── src/
│   └── extension.ts       # Main extension code
├── out/                   # Compiled JavaScript
├── package.json           # Extension manifest
├── tsconfig.json          # TypeScript config
├── poe-logo.png          # Extension icon
└── README.md             # This file
```

### Adding Features

The extension is intentionally simple - it launches a terminal running `npx poe-code interactive`. All chat functionality, tool calling, and MCP support is handled by the `poe-code` CLI itself.

To add new features:
- For terminal/UI improvements: Edit `extension.ts`
- For chat/AI features: Edit the main `poe-code` CLI in `../src/`

## See Also

- [Main README](../README.md) - poe-code CLI documentation
- [NICK.md](../NICK.md) - Beginner-friendly guide
- [MCP.md](../MCP.md) - Model Context Protocol integration
- [DEVELOPMENT.md](../DEVELOPMENT.md) - Contributing guide
- [ARCHITECTURE.md](../ARCHITECTURE.md) - System architecture

## License

MIT

---

**Enjoy chatting with AI directly in VS Code!** 🤖✨
