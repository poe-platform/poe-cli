# Poe Code VS Code Extension

Use Poe Code directly in VS Code with a single click!

## Overview

The Poe Code extension adds a terminal icon to your editor toolbar. Click it to instantly launch an interactive AI chat terminal powered by the Poe API, with full access to tool calling, MCP servers, and file mentions.

## Features

- **One-click launch**: Terminal icon in editor toolbar opens Poe Code instantly
- **Interactive AI chat**: Full-featured chat interface with Poe API models
- **Visual tool calling**: See tools being executed in real-time with `⏺ ToolName(args) ⎿ result`
- **File mentions**: Use `@` to select and reference files in your chat
- **MCP support**: Add external tools via Model Context Protocol servers
- **Model switching**: Change models on the fly with `/model`

## Requirements

- Node.js 18 or higher
- VS Code 1.80.0 or higher
- Poe API key (configure with `npx poe-code login`)

## Installation

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

5. Install in VS Code:
   - Open VS Code
   - Go to Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
   - Click the `...` menu at the top
   - Select "Install from VSIX..."
   - Choose the generated `.vsix` file

### Installing Directly from the Repository

You can also run the workspace version without packaging:

```bash
code --extensionDevelopmentPath=$(pwd)/vscode-extension
```

Alternatively, open the command palette (`Cmd/Ctrl+Shift+P`) and execute
`Developer: Install Extension from Location...`, then select the
`vscode-extension` folder.

## Usage

### Launching Poe Code

1. Open any file in VS Code
2. Click the terminal icon (📟) in the top-right editor toolbar
3. A new terminal opens running `npx poe-code interactive`
4. Start chatting with AI!

### First-time Setup

If you haven't configured your Poe API key yet:

```bash
npx poe-code login --api-key YOUR_KEY
```

### Key Features in the Terminal

- **Chat with AI**: Type naturally to interact with AI models
- **File mentions**: Type `@` to open a file picker and select files to reference
- **Tool calling**: The AI can automatically read files, run commands, and more
- **MCP tools**: Add external tools with `/mcp add <name> <command>`
- **Model switching**: Change models with `/model GPT-5` or `/model Claude-Sonnet-4.5`
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

> /mcp add filesystem npx -y @modelcontextprotocol/server-filesystem /Users/gjones/DEV
MCP server 'filesystem' added and connected.

> /tools
Available tools:
- ReadFile: Read a file from the filesystem
- WriteFile: Write content to a file
...
```

## Commands

The extension provides one command:

- **Poe Code: Open Terminal** - Opens a new terminal with Poe Code interactive mode

Access it via:
- Click the terminal icon in the editor toolbar
- Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → type "Poe Code"

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

### Poe API errors

Configure your API key if you haven't already:
```bash
npx poe-code login --api-key YOUR_KEY
```

Test your connection:
```bash
npx poe-code test
```

### MCP servers not working

See [MCP.md](./MCP.md) for detailed MCP troubleshooting.

## Development

To modify the extension:

1. Make changes to `vscode-extension/src/extension.ts`
2. Rebuild continuously: `npm run watch` (or from the repo root, `npm run watch:extension`)
3. Compile once when needed: `npm run compile`
4. Test in VS Code:
   - Press `F5` to open Extension Development Host
   - Test your changes
5. After editing, reload the Extension Development Host with `Developer: Reload Window`
6. Package when ready: `npm run package`

## See Also

- [README.md](./README.md) - Main poe-code documentation
- [MCP.md](./MCP.md) - Model Context Protocol integration guide
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Contributor setup and testing
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture overview
