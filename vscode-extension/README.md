# Poe Code VS Code Extension

Open an interactive AI chat terminal powered by the Poe API directly in VS Code.

## Features

- Click the terminal icon in the top-right editor toolbar to open Poe Code
- Interactive chat with AI models using the Poe API
- Visual tool calling display
- File selection with `@` mention
- MCP (Model Context Protocol) support

## Installation

### From Source

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

5. Install the generated `.vsix` file in VS Code:
   - Open VS Code
   - Go to Extensions view (Ctrl+Shift+X / Cmd+Shift+X)
   - Click the `...` menu at the top
   - Select "Install from VSIX..."
   - Choose the generated `.vsix` file

## Usage

1. Open any file in VS Code
2. Click the terminal icon (📟) in the top-right toolbar
3. A new terminal will open running `npx poe-setup interactive`
4. Start chatting with AI!

## Requirements

- Node.js 18 or higher
- VS Code 1.80.0 or higher
- Poe API key (configure with `npx poe-setup login`)

## Commands

- `Poe Code: Open Terminal` - Opens a new terminal with Poe Code interactive mode

## License

MIT
