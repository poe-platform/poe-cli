#!/usr/bin/env node
/**
 * Preview Server for VSCode Extension Webview
 * 
 * This server provides a backend for testing the webview outside VSCode.
 * It reuses all existing services from the main project - NO DUPLICATION.
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs/promises';
import Module from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import existing services (NO DUPLICATION)
const projectRoot = path.resolve(__dirname, '..', '..');
const distPath = path.join(projectRoot, 'dist');

// Dynamic imports of existing services
let PoeChatService, DefaultToolExecutor, getAvailableTools;
let renderMarkdown, renderDiffPreview, renderAppShell, renderModelSelector;
let loadProviderSettings;
let getWebviewContent;

async function loadServices() {
    try {
        // Import chat and tools services
        const chatModule = await import(path.join(distPath, 'services', 'chat.js'));
        const toolsModule = await import(path.join(distPath, 'services', 'tools.js'));

        PoeChatService = chatModule.PoeChatService;
        DefaultToolExecutor = toolsModule.DefaultToolExecutor;
        getAvailableTools = toolsModule.getAvailableTools;

        // Import webview utilities (compiled from TypeScript)
        const markdownPath = path.join(__dirname, '..', 'out', 'webview', 'markdown.js');
        const diffPath = path.join(__dirname, '..', 'out', 'webview', 'diff-preview.js');
        const layoutPath = path.join(__dirname, '..', 'out', 'webview', 'layout.js');
        const selectorPath = path.join(__dirname, '..', 'out', 'webview', 'model-selector.js');
        const settingsPath = path.join(__dirname, '..', 'out', 'config', 'provider-settings.js');

        const markdownModule = await import(markdownPath);
        const diffModule = await import(diffPath);
        const layoutModule = await import(layoutPath);
        const selectorModule = await import(selectorPath);
        const settingsModule = await import(settingsPath);

        renderMarkdown = markdownModule.renderMarkdown;
        renderDiffPreview = diffModule.renderDiffPreview;
        renderAppShell = layoutModule.renderAppShell;
        renderModelSelector = selectorModule.renderModelSelector;
        loadProviderSettings = settingsModule.loadProviderSettings;

        const vscodeStubPath = path.join(__dirname, 'stubs', 'vscode.js');
        const ModuleCtor = Module.Module;
        const originalResolveFilename = ModuleCtor._resolveFilename;
        ModuleCtor._resolveFilename = function (request, parent, isMain, options) {
            if (request === 'vscode') {
                return vscodeStubPath;
            }
            return originalResolveFilename.call(this, request, parent, isMain, options);
        };
        try {
            const extensionModule = await import(pathToFileURL(path.join(__dirname, '..', 'out', 'extension.js')).href);
            getWebviewContent = extensionModule.getWebviewContent;
        } finally {
            ModuleCtor._resolveFilename = originalResolveFilename;
        }

        console.log('✅ All services loaded successfully');
    } catch (error) {
        console.error('❌ Failed to load services:', error.message);
        console.error('Make sure to run "npm run build" in the project root first');
        process.exit(1);
    }
}

// Load credentials
async function getCredentials() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const credentialsPath = path.join(homeDir, '.poe-setup', 'credentials.json');

    try {
        const content = await fs.readFile(credentialsPath, 'utf-8');
        const creds = JSON.parse(content);
        return creds.apiKey ? { apiKey: creds.apiKey } : null;
    } catch {
        return null;
    }
}

function createPreviewBridgeScript() {
    return `(function () {
  const STATUS_ID = "preview-connection-status";
  const STYLE_ID = "preview-connection-style";
  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = "\\n      .connection-status {\\n        position: fixed;\\n        top: 16px;\\n        right: 20px;\\n        padding: 8px 14px;\\n        border-radius: 6px;\\n        font-size: 12px;\\n        font-weight: 500;\\n        background-color: rgba(25, 29, 37, 0.9);\\n        color: #fff;\\n        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);\\n        z-index: 1000;\\n        transition: opacity 0.3s ease;\\n      }\\n      .connection-status--connected {\\n        background-color: rgba(17, 128, 67, 0.9);\\n      }\\n      .connection-status--reconnecting {\\n        background-color: rgba(124, 86, 36, 0.9);\\n      }\\n      .connection-status--error {\\n        background-color: rgba(168, 34, 34, 0.9);\\n      }\\n      .connection-status--hidden {\\n        opacity: 0;\\n        pointer-events: none;\\n      }\\n    ";
    document.head.appendChild(style);
  };
  ensureStyle();
  const statusEl = () => document.getElementById(STATUS_ID);
  function updateStatus(state, message) {
    const el = statusEl();
    if (!el) {
      return;
    }
    el.textContent = message;
    el.dataset.state = state;
    el.className = "connection-status connection-status--" + state;
    if (state === "connected") {
      setTimeout(() => {
        el.classList.add("connection-status--hidden");
      }, 1500);
    } else {
      el.classList.remove("connection-status--hidden");
    }
  }
  let retries = 0;
  let socket;
  const maxRetries = 5;
  const vscodeStateKey = "preview-vscode-state";
  const vscodeApi = {
    postMessage(message) {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    },
    setState(value) {
      try {
        sessionStorage.setItem(vscodeStateKey, JSON.stringify(value));
      } catch (error) {
        console.warn("Unable to persist preview state", error);
      }
    },
    getState() {
      const stored = sessionStorage.getItem(vscodeStateKey);
      if (!stored) {
        return undefined;
      }
      try {
        return JSON.parse(stored);
      } catch {
        return undefined;
      }
    }
  };
  window.acquireVsCodeApi = () => vscodeApi;
  function connect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(protocol + "//" + window.location.host);
    socket.addEventListener("open", () => {
      retries = 0;
      updateStatus("connected", "✓ Connected to server");
    });
    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data);
        window.dispatchEvent(new MessageEvent("message", { data: payload }));
      } catch (error) {
        console.error("Failed to parse message", error);
      }
    });
    socket.addEventListener("close", () => {
      if (retries >= maxRetries) {
        updateStatus("error", "✗ Unable to reconnect");
        return;
      }
      retries += 1;
      updateStatus("reconnecting", "Reconnecting to server…");
      const delay = Math.min(1000 * Math.pow(2, retries), 10000);
      setTimeout(connect, delay);
    });
    socket.addEventListener("error", () => {
      updateStatus("error", "✗ Connection error");
    });
  }
  updateStatus("connecting", "Connecting to server…");
  connect();
})();`;
}

async function renderPreviewPage() {
    const extensionRoot = path.join(__dirname, '..');
    const providerSettings = await loadProviderSettings(extensionRoot);
    const defaultModel = providerSettings[0]?.label || 'Claude-Sonnet-4.5';
    const modelOptions = Array.from(new Set(
        [defaultModel, ...providerSettings.map((provider) => provider.label)].filter(Boolean)
    ));
    const logoUri = '/poe-logo.png';
    const appShellHtml = renderAppShell({
        logoUrl: logoUri,
        models: modelOptions,
        activeModel: defaultModel
    });
    const modelSelectorHtml = renderModelSelector({
        models: modelOptions,
        selected: defaultModel
    });
    const html = getWebviewContent({
        cspSource: "'self'",
        asWebviewUri: (uri) => ({ toString: () => String(uri) })
    } as any, {
        logoUri,
        appShellHtml,
        modelSelectorHtml,
        providerSettings,
        defaultModel,
        bodyStartHtml: '<div id="preview-connection-status" class="connection-status connection-status--connecting">Connecting to server...</div>',
        additionalScripts: [createPreviewBridgeScript()],
        additionalCspDirectives: ['connect-src ws: wss:']
    });
    return html;
}

// Main server setup
async function startServer() {
    await loadServices();

    const credentials = await getCredentials();
    if (!credentials) {
        console.error('❌ Poe API key not configured');
        console.error('Run: npx poe-setup login --api-key YOUR_KEY');
        process.exit(1);
    }

    const app = express();
    const server = createServer(app);
   const wss = new WebSocketServer({ server });

    // Middleware
    app.use(express.json());

    app.get('/', async (_req, res) => {
        try {
            const html = await renderPreviewPage();
            res.status(200).type('html').send(html);
        } catch (error) {
            console.error('❌ Failed to render preview page', error);
            res.status(500).send('<h1>Failed to render preview</h1>');
        }
    });

    // Serve preview directory files (index.html)
    app.use(express.static(__dirname));

    // Serve extension directory files directly (out/, poe-bw.svg, etc.)
    app.use(express.static(path.join(__dirname, '..')));

    // Explicitly serve assets from extension root
    app.use('/assets', express.static(path.join(__dirname, '..')));

    // Chat runtime (initialized per WebSocket connection)
    const connections = new Map();

    // WebSocket connection handler
    wss.on('connection', async (ws) => {
        const connectionId = Math.random().toString(36).slice(2);
        console.log(`🔌 Client connected: ${connectionId}`);

        // Create chat service for this connection
        const cwd = process.cwd();
        const fileSystem = {
            readFile: (filePath, encoding) => fs.readFile(filePath, { encoding }),
            writeFile: (filePath, content, options) => fs.writeFile(filePath, content, options),
            readdir: (dirPath) => fs.readdir(dirPath),
        };

        const emitDiffPreview = (details) => {
            const diffHtml = renderDiffPreview({
                previous: details.previousContent ?? '',
                next: details.nextContent,
                filename: details.relativePath || path.basename(details.absolutePath),
                language: detectLanguage(details.absolutePath)
            });

            ws.send(JSON.stringify({
                type: 'diffPreview',
                html: diffHtml
            }));
        };

        const toolExecutor = new DefaultToolExecutor({
            fs: fileSystem,
            cwd,
            allowedPaths: [cwd],
            onWriteFile: emitDiffPreview
        });

        const toolCallback = (event) => {
            if (event.result) {
                ws.send(JSON.stringify({
                    type: 'toolExecuted',
                    toolName: event.toolName,
                    args: event.args,
                    success: true
                }));
            } else if (event.error) {
                ws.send(JSON.stringify({
                    type: 'toolExecuted',
                    toolName: event.toolName,
                    args: event.args,
                    success: false,
                    error: event.error
                }));
            } else {
                ws.send(JSON.stringify({
                    type: 'toolStarting',
                    toolName: event.toolName,
                    args: event.args
                }));
            }
        };

        const defaultModel = 'Claude-Sonnet-4.5';
        const chatService = new PoeChatService(
            credentials.apiKey,
            defaultModel,
            toolExecutor,
            toolCallback
        );

        const availableTools = getAvailableTools();

        connections.set(connectionId, {
            ws,
            chatService,
            toolExecutor,
            availableTools
        });

        // Send initial data
        ws.send(JSON.stringify({
            type: 'connected',
            connectionId,
            availableTools,
            defaultModel
        }));

        // Handle messages from client
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                await handleWebSocketMessage(connectionId, message);
            } catch (error) {
                console.error('Error handling message:', error);
                ws.send(JSON.stringify({
                    type: 'error',
                    text: error.message
                }));
            }
        });

        ws.on('close', () => {
            console.log(`🔌 Client disconnected: ${connectionId}`);
            connections.delete(connectionId);
        });
    });

    async function handleWebSocketMessage(connectionId, message) {
        const conn = connections.get(connectionId);
        if (!conn) return;

        const { ws, chatService, availableTools } = conn;

        switch (message.type) {
            case 'sendMessage': {
                ws.send(JSON.stringify({ type: 'thinking', value: true }));

                const userHtml = renderMarkdown(message.text);
                ws.send(JSON.stringify({
                    type: 'message',
                    role: 'user',
                    id: message.id,
                    html: userHtml,
                    model: chatService.getModel()
                }));

                try {
                    const response = await chatService.sendMessage(message.text, availableTools);
                    const content = response?.content ||
                        response?.choices?.[0]?.message?.content ||
                        'No response';

                    const assistantHtml = renderMarkdown(content);
                    ws.send(JSON.stringify({
                        type: 'message',
                        role: 'assistant',
                        id: response.id || `assistant-${Date.now()}`,
                        html: assistantHtml,
                        model: chatService.getModel(),
                        strategyInfo: chatService.isStrategyEnabled() ? chatService.getStrategyInfo() : null
                    }));
                } catch (error) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        text: error.message
                    }));
                } finally {
                    ws.send(JSON.stringify({ type: 'thinking', value: false }));
                }
                break;
            }

            case 'clearHistory': {
                chatService.clearHistory();
                ws.send(JSON.stringify({ type: 'historyCleared' }));
                break;
            }

            case 'getStrategyStatus': {
                ws.send(JSON.stringify({
                    type: 'strategyStatus',
                    enabled: chatService.isStrategyEnabled(),
                    info: chatService.isStrategyEnabled() ? chatService.getStrategyInfo() : 'Strategy disabled',
                    currentModel: chatService.getModel()
                }));
                break;
            }

            case 'setModel': {
                if (chatService.setModel && message.model) {
                    chatService.setModel(message.model);
                    ws.send(JSON.stringify({
                        type: 'modelChanged',
                        model: chatService.getModel()
                    }));
                }
                break;
            }
        }
    }

    // REST API endpoints (for non-WebSocket clients)
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', connections: connections.size });
    });

    app.get('/api/providers', async (req, res) => {
        try {
            const extensionPath = path.join(__dirname, '..');
            const providers = await loadProviderSettings(extensionPath);
            res.json(providers);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Serve webview modules as browser-compatible bundle
    app.get('/api/webview-bundle.js', async (req, res) => {
        try {
            const runtimePath = path.join(__dirname, '..', 'out', 'webview', 'runtime.js');
            const layoutPath = path.join(__dirname, '..', 'out', 'webview', 'layout.js');
            const selectorPath = path.join(__dirname, '..', 'out', 'webview', 'model-selector.js');

            const runtime = await fs.readFile(runtimePath, 'utf-8');
            const layout = await fs.readFile(layoutPath, 'utf-8');
            const selector = await fs.readFile(selectorPath, 'utf-8');

            // Create a browser-compatible bundle
            const bundle = `
// CommonJS shim for browser
(function() {
    const exports = {};
    const module = { exports };
    
    // Runtime module
    ${runtime}
    window.initializeWebviewApp = exports.initializeWebviewApp;
    
    // Layout module
    ${layout}
    window.renderAppShell = exports.renderAppShell;
    
    // Model selector module
    ${selector}
    window.renderModelSelector = exports.renderModelSelector;
})();
            `;

            res.setHeader('Content-Type', 'application/javascript');
            res.send(bundle);
        } catch (error) {
            res.status(500).send(`console.error('Failed to load webview bundle:', ${JSON.stringify(error.message)})`);
        }
    });

    // Start server
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║  🚀 Preview Server Running                                 ║
║                                                            ║
║  URL: http://localhost:${PORT}                                ║
║  WebSocket: ws://localhost:${PORT}                            ║
║                                                            ║
║  Open http://localhost:${PORT} in your browser              ║
╚════════════════════════════════════════════════════════════╝
    `);
    });
}

function detectLanguage(targetPath) {
    const ext = path.extname(targetPath).toLowerCase();
    const map = {
        '.ts': 'typescript', '.tsx': 'typescript',
        '.js': 'javascript', '.jsx': 'javascript',
        '.json': 'json', '.py': 'python',
        '.md': 'markdown', '.sh': 'bash',
        '.go': 'go', '.rs': 'rust',
        '.java': 'java', '.rb': 'ruby'
    };
    return map[ext] || '';
}

// Start the server
startServer().catch(console.error);
