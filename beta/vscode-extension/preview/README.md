# Browser Preview

Preview the VSCode extension webview in any browser with full functionality.

## Quick Start

```bash
# From project root
npm run preview:dev
```

Opens http://localhost:3000 with auto-reload.

## Architecture

```
Browser ←→ WebSocket ←→ Express Server ←→ Existing Services
                         (server.js)      (chat.js, tools.js)
```

- **Zero duplication** - Imports all existing code
- **Full functionality** - Real Poe API, tools, everything works
- **Auto-reload** - Server restarts on changes

## Files

- `server.js` - Backend (imports existing services)
- `index.html` - Frontend (imports existing webview code)
- `package.json` - Dependencies (express, ws)

## Development

Edit files, server auto-restarts, refresh browser.

That's it.