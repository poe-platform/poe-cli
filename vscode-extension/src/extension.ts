import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { renderAppShell } from './webview/layout.js';
import { renderModelSelector } from './webview/model-selector.js';
import { renderMarkdown } from './webview/markdown.js';
import { renderDiffPreview } from './webview/diff-preview.js';
import { initializeWebviewApp } from './webview/runtime.js';
import { createWebviewController, type WebviewController } from './webview/controller.js';
import { ChatState } from './state/chat-state.js';
import { loadProviderSettings } from './config/provider-settings.js';
import type { ProviderSetting } from './config/provider-settings.js';
import { openMcpSettings } from './commands/open-mcp-settings.js';

interface ActiveWebview {
    kind: 'panel' | 'sidebar';
    webview: vscode.Webview;
    controller: WebviewController;
}

const activeWebviews = new Set<ActiveWebview>();

let currentTerminal: vscode.Terminal | undefined = undefined;
let currentPanel: vscode.WebviewPanel | undefined = undefined;
let chatRuntime:
    | {
        service: any;
        availableTools: any[];
        toolExecutor: any;
    }
    | null = null;
let cachedCredentials: { apiKey: string } | null = null;
const chatState = new ChatState();

function broadcastToWebviews(message: unknown): void {
    for (const target of activeWebviews) {
        target.controller.post(message);
    }
}

function updateControllersTools(tools: any[]): void {
    for (const target of activeWebviews) {
        target.controller.setAvailableTools(tools);
    }
}

function registerActiveWebview(entry: ActiveWebview): void {
    activeWebviews.add(entry);
}

function removeActiveWebview(webview: vscode.Webview): void {
    for (const entry of Array.from(activeWebviews)) {
        if (entry.webview === webview) {
            activeWebviews.delete(entry);
        }
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Poe Code extension is now active');

    const sidebarProvider = new PoeSidebarProvider(context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('poeCodeSidebar', sidebarProvider)
    );

    // Register the open in editor (new tab) command
    const openEditorCommand = vscode.commands.registerCommand('poe-code.editor.open', () => {
        openPoeInEditor(context);
    });

    // Register the open in sidebar command
    const openSidebarCommand = vscode.commands.registerCommand('poe-code.sidebar.open', () => {
        sidebarProvider.reveal();
    });

    // Register the open terminal command
    const openTerminalCommand = vscode.commands.registerCommand('poe-code.terminal.open', () => {
        openPoeTerminal();
    });

    const openMcpSettingsCommand = vscode.commands.registerCommand('poe-code.settings.openMcp', async () => {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        await openMcpSettings({
            homeDir,
            filename: 'mcp.json'
        });
    });

    // Register a command to check if poe-setup is configured
    const checkSetupCommand = vscode.commands.registerCommand('poe-code.checkSetup', async () => {
        const isConfigured = await isPoeSetupConfigured();
        if (!isConfigured) {
            const action = await vscode.window.showWarningMessage(
                'Poe API key not configured. Would you like to configure it now?',
                'Configure',
                'Cancel'
            );
            if (action === 'Configure') {
                const apiKey = await vscode.window.showInputBox({
                    prompt: 'Enter your Poe API key',
                    password: true,
                    placeHolder: 'Your Poe API key from poe.com'
                });
                if (apiKey) {
                    await configurePoeSetup(apiKey);
                }
            }
        } else {
            vscode.window.showInformationMessage('Poe Code is configured and ready to use!');
        }
    });

    // Register a status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = '$(comment-discussion) Poe Code';
    statusBarItem.tooltip = 'Click to open Poe Code';
    statusBarItem.command = 'poe-code.editor.open';
    statusBarItem.show();

    context.subscriptions.push(
        openEditorCommand,
        openSidebarCommand,
        openTerminalCommand,
        checkSetupCommand,
        openMcpSettingsCommand,
        statusBarItem
    );

    // Show welcome message on first activation
    const hasShownWelcome = context.globalState.get('poe-code.hasShownWelcome', false);
    if (!hasShownWelcome) {
        showWelcomeMessage(context);
    }
}

async function loadModules(): Promise<{ chatModule: any; toolsModule: any; baseDir: string }> {
    // Get the extension's directory
    const extensionPath = __dirname;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const workspacePath = workspaceFolder?.uri.fsPath || process.cwd();

    // Try different possible base paths
    const possibleBasePaths = [
        // From extension directory to parent project
        path.resolve(extensionPath, '..', '..', 'dist'),
        // From workspace to parent
        path.join(workspacePath, '..', 'dist'),
        // From workspace root
        path.join(workspacePath, 'dist'),
        // Absolute path based on home directory
        path.join(process.env.HOME || process.env.USERPROFILE || '', 'DEV', 'poe-setup', 'dist')
    ];

    console.log('[Poe Code] Searching for modules in paths:');
    possibleBasePaths.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));

    let chatModule, toolsModule, foundBasePath;
    for (const basePath of possibleBasePaths) {
        try {
            const chatPath = path.join(basePath, 'services', 'chat.js');
            const toolsPath = path.join(basePath, 'services', 'tools.js');

            if (fs.existsSync(chatPath) && fs.existsSync(toolsPath)) {
                console.log(`[Poe Code] Found modules at: ${basePath}`);
                chatModule = await import(chatPath);
                toolsModule = await import(toolsPath);
                foundBasePath = basePath;
                break;
            }
        } catch (e) {
            console.log(`[Poe Code] Failed to import from ${basePath}:`, e);
            continue;
        }
    }

    if (!chatModule || !toolsModule) {
        const buildInstructions = 'Please run "npm run build" in the poe-setup directory.';
        const pathsChecked = possibleBasePaths.map((p, i) => `\n  ${i + 1}. ${p}`).join('');
        throw new Error(
            `Could not load Poe modules.\n\n` +
            `Paths checked:${pathsChecked}\n\n` +
            buildInstructions
        );
    }

    console.log(`[Poe Code] Successfully loaded modules from ${foundBasePath}`);
    return { chatModule, toolsModule, baseDir: foundBasePath || '' };
}

async function createChatRuntime(apiKey: string, model: string): Promise<{
    service: any;
    availableTools: any[];
    toolExecutor: any;
}> {
    try {
        const { chatModule, toolsModule } = await loadModules();

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const cwd = workspaceFolder?.uri.fsPath || process.cwd();

        // Create VSCode-compatible file system adapter
        const fileSystem = {
            readFile: (filePath: string, encoding: string) => fs.promises.readFile(filePath, { encoding: encoding as BufferEncoding }),
            writeFile: (filePath: string, content: string, options: any) => fs.promises.writeFile(filePath, content, options),
            readdir: (dirPath: string) => fs.promises.readdir(dirPath),
        };

        const emitDiffPreview = (details: {
            absolutePath: string;
            relativePath: string;
            previousContent: string | null;
            nextContent: string;
        }) => {
            const diffHtml = renderDiffPreview({
                previous: details.previousContent ?? "",
                next: details.nextContent,
                filename: details.relativePath || path.basename(details.absolutePath),
                language: detectLanguage(details.absolutePath)
            });
            broadcastToWebviews({
                type: 'diffPreview',
                html: diffHtml
            });
        };

        // Create tool executor
        const toolExecutor = new toolsModule.DefaultToolExecutor({
            fs: fileSystem,
            cwd: cwd,
            allowedPaths: [cwd],
            onWriteFile: emitDiffPreview
        });

        // Get available tools
        const availableTools = toolsModule.getAvailableTools();
        console.log(`[Poe Code] Loaded ${availableTools.length} tools`);

        // Create tool callback to notify about tool usage
        const toolCallback = (event: any) => {
            if (event.result) {
                console.log(`[Poe Code] Tool executed: ${event.toolName}`);
                broadcastToWebviews({
                    type: 'toolExecuted',
                    toolName: event.toolName,
                    args: event.args,
                    success: true
                });
            } else if (event.error) {
                console.error(`[Poe Code] Tool error: ${event.toolName} - ${event.error}`);
                broadcastToWebviews({
                    type: 'toolExecuted',
                    toolName: event.toolName,
                    args: event.args,
                    success: false,
                    error: event.error
                });
            } else {
                console.log(`[Poe Code] Tool starting: ${event.toolName}`);
                broadcastToWebviews({
                    type: 'toolStarting',
                    toolName: event.toolName,
                    args: event.args
                });
            }
        };

        // Create chat service with tool executor and callback
        const service = new chatModule.PoeChatService(apiKey, model, toolExecutor, toolCallback);

        return { service, availableTools, toolExecutor };
    } catch (error) {
        throw new Error(`Failed to initialize chat service: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function ensureChatRuntime(apiKey: string, model: string) {
    if (!chatRuntime) {
        chatRuntime = await createChatRuntime(apiKey, model);
        updateControllersTools(chatRuntime.availableTools);
    }
    return chatRuntime;
}

async function attachPoeWebview(
    kind: 'panel' | 'sidebar',
    context: vscode.ExtensionContext,
    webview: vscode.Webview
): Promise<vscode.Disposable | null> {
    const configuration = vscode.workspace.getConfiguration('poeCode');
    const defaultModel = configuration.get<string>('defaultModel') || 'Claude-Sonnet-4.5';
    const credentials = await ensurePoeCredentials();

    if (!credentials) {
        webview.html = getMissingCredentialsContent();
        return null;
    }

    const runtime = await ensureChatRuntime(credentials.apiKey, defaultModel);

    const providerSettings = await loadProviderSettings(context.extensionUri.fsPath);
    const currentModel = runtime.service?.getModel?.() ?? defaultModel;
    const modelOptions = Array.from(
        new Set(
            [
                currentModel,
                ...providerSettings.map((provider) => provider.label)
            ].filter(Boolean)
        )
    ) as string[];

    const logoUri = webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'poe-logo.png')
    ).toString();

    const appShellHtml = renderAppShell({
        logoUrl: logoUri,
        models: modelOptions,
        activeModel: currentModel
    });
    const modelSelectorHtml = renderModelSelector({
        models: modelOptions,
        selected: currentModel
    });

    webview.html = getWebviewContent(webview, {
        logoUri,
        appShellHtml,
        modelSelectorHtml,
        providerSettings,
        defaultModel: currentModel
    });

    const controller = createWebviewController({
        chatService: runtime.service,
        webview,
        renderMarkdown,
        availableTools: runtime.availableTools,
        openSettings: async () => {
            await vscode.commands.executeCommand('poe-code.settings.openMcp');
        },
        ui: {
            info: (message) => vscode.window.showInformationMessage(message),
            error: (message) => vscode.window.showErrorMessage(message)
        },
        onUserMessage: ({ id, text }) => {
            chatState.append({
                id,
                role: 'user',
                content: text
            });
        },
        onAssistantMessage: ({ id, text }) => {
            chatState.append({
                id,
                role: 'assistant',
                content: text
            });
        },
        onClearHistory: () => {
            chatState.clear();
        }
    });

    const subscription = webview.onDidReceiveMessage(async (message) => {
        await controller.handleWebviewMessage(message);
    });

    registerActiveWebview({
        kind,
        webview,
        controller
    });

    return subscription;
}

async function openPoeInEditor(context: vscode.ExtensionContext) {
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.One);
        return;
    }

    const iconPath = vscode.Uri.joinPath(context.extensionUri, 'poe-logo.png');
    const panel = vscode.window.createWebviewPanel(
        'poeCodePanel',
        'Poe Code',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [context.extensionUri]
        }
    );
    panel.iconPath = iconPath;

    const subscription = await attachPoeWebview('panel', context, panel.webview);
    currentPanel = panel;

    panel.onDidDispose(
        () => {
            subscription?.dispose();
            if (currentPanel === panel) {
                currentPanel = undefined;
            }
            removeActiveWebview(panel.webview);
        },
        undefined,
        context.subscriptions
    );
}

async function openPoeTerminal() {
    // If terminal already exists and is still open, show it
    if (currentTerminal) {
        currentTerminal.show(true);
        return;
    }

    // Get workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const cwd = workspaceFolder?.uri.fsPath || process.cwd();

    // Check if poe-setup is configured
    const isConfigured = await isPoeSetupConfigured();
    if (!isConfigured) {
        const action = await vscode.window.showWarningMessage(
            'Poe API key not configured. Configure now?',
            'Configure',
            'Continue Anyway'
        );
        if (action === 'Configure') {
            const apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your Poe API key',
                password: true,
                placeHolder: 'Get your API key from poe.com'
            });
            if (apiKey) {
                await configurePoeSetup(apiKey);
            } else {
                return; // User cancelled
            }
        } else if (!action) {
            return; // User dismissed
        }
    }

    // Try to find local poe-setup dist/index.js
    let command = 'npx poe-setup interactive';

    // Check if we're in the poe-setup directory
    const localDist = path.join(cwd, 'dist', 'index.js');
    if (fs.existsSync(localDist)) {
        command = 'node dist/index.js interactive';
    } else {
        // Check if we're in a subdirectory (like vscode-extension)
        const parentDist = path.join(cwd, '..', 'dist', 'index.js');
        if (fs.existsSync(parentDist)) {
            command = 'node ../dist/index.js interactive';
        }
    }

    // Create a new terminal
    currentTerminal = vscode.window.createTerminal({
        name: 'Poe Code',
        cwd: cwd,
        iconPath: new vscode.ThemeIcon('comment-discussion'),
        env: {
            ...process.env,
            FORCE_COLOR: '1',
            // Set larger terminal size for better display
            COLUMNS: '120',
            LINES: '30'
        }
    });

    // Show the terminal
    currentTerminal.show(true);

    // Send the command to start poe-code interactive mode
    setTimeout(() => {
        currentTerminal?.sendText(command);
    }, 200);

    // Handle terminal close
    vscode.window.onDidCloseTerminal((closedTerminal) => {
        if (closedTerminal === currentTerminal) {
            currentTerminal = undefined;
        }
    });
}

async function getPoeCredentials(): Promise<{ apiKey: string } | null> {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const credentialsPath = path.join(homeDir, '.poe-setup', 'credentials.json');

    try {
        await fs.promises.access(credentialsPath, fs.constants.F_OK);
        const content = await fs.promises.readFile(credentialsPath, 'utf-8');
        const creds = JSON.parse(content);
        return creds.apiKey ? { apiKey: creds.apiKey } : null;
    } catch {
        return null;
    }
}

async function isPoeSetupConfigured(): Promise<boolean> {
    const creds = await getPoeCredentials();
    return !!creds;
}

async function configurePoeSetup(apiKey: string): Promise<void> {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const poeSetupDir = path.join(homeDir, '.poe-setup');
    const credentialsPath = path.join(poeSetupDir, 'credentials.json');

    try {
        // Create directory if it doesn't exist
        await fs.promises.mkdir(poeSetupDir, { recursive: true });

        // Write credentials
        await fs.promises.writeFile(
            credentialsPath,
            JSON.stringify({ apiKey }, null, 2),
            'utf-8'
        );

        vscode.window.showInformationMessage('Poe API key configured successfully!');
    } catch (error) {
        vscode.window.showErrorMessage(
            `Failed to configure Poe API key: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

async function ensurePoeCredentials(): Promise<{ apiKey: string } | null> {
    if (cachedCredentials) {
        return cachedCredentials;
    }
    const existing = await getPoeCredentials();
    if (existing) {
        cachedCredentials = existing;
        return existing;
    }
    const action = await vscode.window.showWarningMessage(
        'Poe API key not configured. Configure now?',
        'Configure',
        'Cancel'
    );
    if (action !== 'Configure') {
        return null;
    }
    const apiKey = await vscode.window.showInputBox({
        prompt: 'Enter your Poe API key',
        password: true,
        placeHolder: 'Get your API key from poe.com'
    });
    if (!apiKey) {
        return null;
    }
    await configurePoeSetup(apiKey);
    cachedCredentials = { apiKey };
    return cachedCredentials;
}

async function showWelcomeMessage(context: vscode.ExtensionContext) {
    await context.globalState.update('poe-code.hasShownWelcome', true);
}

function getMissingCredentialsContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: transparent; padding: 16px; }
        h2 { margin-bottom: 8px; }
        p { line-height: 1.5; }
        code { background: var(--vscode-editor-inactiveSelectionBackground); padding: 2px 4px; border-radius: 4px; }
    </style>
</head>
<body>
    <h2>Poe API key required</h2>
    <p>Configure Poe Code by running the command <code>Poe Code: Check Setup</code> or setting your API key through the command palette.</p>
</body>
</html>`;
}
interface WebviewContentOptions {
    logoUri: string;
    appShellHtml: string;
    modelSelectorHtml: string;
    providerSettings: ProviderSetting[];
    defaultModel: string;
    bodyStartHtml?: string;
    additionalScripts?: string[];
    additionalCspDirectives?: string[];
}

function escapeTemplateLiteral(value: string): string {
    let result = "";
    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        const next = value[index + 1];
        if (char === "\\") {
            result += "\\\\";
            continue;
        }
        if (char === "`") {
            result += "\\`";
            continue;
        }
        if (char === "$" && next === "{") {
            result += "\\${";
            index += 1;
            continue;
        }
        result += char;
    }
    return result;
}

function createNonce(): string {
    return Math.random().toString(36).slice(2, 15);
}

function detectLanguage(targetPath: string): string {
    const ext = path.extname(targetPath).toLowerCase();
    switch (ext) {
        case ".ts":
        case ".tsx":
            return "ts";
        case ".js":
        case ".jsx":
            return "javascript";
        case ".json":
            return "json";
        case ".py":
            return "python";
        case ".md":
            return "markdown";
        case ".sh":
            return "bash";
        case ".go":
            return "go";
        case ".rs":
            return "rust";
        case ".java":
            return "java";
        case ".rb":
            return "ruby";
        default:
            return "";
    }
}

export function getWebviewContent(webview: vscode.Webview, options: WebviewContentOptions): string {
    const providerJson = JSON.stringify(options.providerSettings);
    const escapedAppShell = escapeTemplateLiteral(options.appShellHtml);
    const escapedModelSelector = escapeTemplateLiteral(options.modelSelectorHtml);
    const nonce = createNonce();
    const cspSource = webview.cspSource;
    const bodyStartHtml = options.bodyStartHtml ?? "";
    const extraScripts = (options.additionalScripts ?? [])
        .map((code) => `<script nonce="${nonce}">
${code}
</script>`)
        .join("\n");
    const cspDirectives = [
        `default-src 'none'`,
        `img-src ${cspSource} https: data:`,
        `style-src ${cspSource} 'unsafe-inline'`,
        `script-src 'nonce-${nonce}'`,
        ...(options.additionalCspDirectives ?? []),
    ];
    const contentSecurityPolicy = cspDirectives.join("; ");
    const bootstrapPlaceholder = "__POE_BOOTSTRAP__";
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Poe Code</title>
    <style>
        :root {
            --sidebar-width: 240px;
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }

        .poe-layout {
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow: hidden;
        }

        .app-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editor-background);
        }

        .app-header .brand {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .app-header img {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            object-fit: cover;
        }

        .app-nav {
            display: flex;
            align-items: center;
            gap: 8px;
            justify-content: flex-end;
        }

        .app-nav button {
            padding: 6px 10px;
            border-radius: 4px;
            border: 1px solid var(--vscode-button-border);
            background: transparent;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 10px;
            transition: background-color 0.2s ease;
        }

        .app-nav button:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .app-nav button.primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .app-nav button.primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .model-list {
            display: none;
        }

        .model-item {
            display: none;
        }

        .main-pane {
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow: hidden;
            position: relative;
        }

        .status-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editor-background);
        }

        .status-left {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .model-badge {
            font-size: 10px;
            padding: 3px 8px;
            border-radius: 999px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }

        .strategy-badge {
            font-size: 10px;
            padding: 3px 8px;
            border-radius: 999px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            opacity: 0.6;
            cursor: pointer;
            transition: opacity 0.2s ease;
        }

        .strategy-badge:hover {
            opacity: 1;
        }

        .strategy-badge[data-state="enabled"] {
            opacity: 1;
        }

        .strategy-modal {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: flex-start;
            justify-content: center;
            padding: 48px 24px;
            background-color: rgba(0, 0, 0, 0.35);
            backdrop-filter: blur(2px);
            z-index: 240;
        }

        .strategy-surface {
            width: min(520px, 100%);
            background-color: var(--vscode-editorWidget-background);
            border-radius: 12px;
            border: 1px solid var(--vscode-panel-border);
            display: flex;
            flex-direction: column;
            gap: 20px;
            padding: 24px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
            animation: slideUp 0.2s ease;
        }

        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .strategy-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
        }

        .strategy-header h3 {
            margin: 0;
            font-size: 16px;
        }

        .strategy-header p {
            margin: 4px 0 0;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .strategy-close {
            align-self: center;
        }

        .strategy-toggle-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            border-radius: 10px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
        }

        .strategy-toggle-label {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .strategy-toggle-label span:first-child {
            font-size: 12px;
            font-weight: 600;
        }

        .strategy-toggle-label span:last-child {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
        }

        #strategy-toggle {
            width: 46px;
            height: 24px;
            border-radius: 12px;
            border: none;
            background-color: var(--vscode-input-border);
            position: relative;
            cursor: pointer;
            transition: background-color 0.2s ease;
        }

        #strategy-toggle .strategy-thumb {
            position: absolute;
            top: 3px;
            left: 3px;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background-color: var(--vscode-editor-background);
            transition: transform 0.2s ease;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
        }

        #strategy-toggle.active {
            background-color: var(--vscode-button-background);
        }

        #strategy-toggle.active .strategy-thumb {
            transform: translateX(22px);
        }

        .strategy-options {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 14px;
        }

        .strategy-option {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 6px;
            border-radius: 10px;
            border: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editor-background);
            padding: 14px;
            cursor: pointer;
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
            text-align: left;
        }

        .strategy-option:hover {
            border-color: var(--vscode-focusBorder);
        }

        .strategy-option.active {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }

        .strategy-option strong {
            font-size: 12px;
        }

        .strategy-option span {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
        }

        .chat-scroll {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            scroll-behavior: smooth;
        }

        #messages {
            max-width: 900px;
            margin: 0 auto;
        }

        .message-wrapper {
            margin-bottom: 16px;
            animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(6px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .message-header {
            font-size: 10px;
            font-weight: 600;
            margin-bottom: 6px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .avatar {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background-color: var(--vscode-button-background);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--vscode-button-foreground);
            font-size: 10px;
            font-weight: 600;
            overflow: hidden;
        }

        .avatar.assistant {
            background: transparent;
        }

        .avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .message-content {
            padding: 12px;
            border-radius: 8px;
            line-height: 1.5;
            font-size: 11px;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            overflow-x: auto;
        }

        .message-wrapper.assistant .message-content {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textBlockQuote-border);
        }

        .message-wrapper.tool .message-content {
            border-style: dashed;
            background-color: var(--vscode-editor-background);
        }

        .message-wrapper.tool.running .message-content {
            border-color: var(--vscode-descriptionForeground);
        }

        .message-wrapper.tool.success .message-content {
            border-color: var(--vscode-gitDecoration-addedResourceForeground);
        }

        .message-wrapper.tool.error .message-content {
            border-color: var(--vscode-errorForeground);
        }

        .message-content pre {
            padding: 10px;
            background-color: var(--vscode-editor-background);
            border-radius: 6px;
            overflow: auto;
            font-size: 11px;
        }

        .tool-icon {
            font-size: 11px;
        }

        .tool-title {
            font-weight: 600;
        }

        .message-tool-status {
            margin-bottom: 6px;
            font-size: 11px;
            font-weight: 600;
        }

        .message-tool-args {
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 10px;
            margin: 0;
        }

        .message-tool-error {
            margin-top: 6px;
            font-size: 10px;
            color: var(--vscode-errorForeground);
        }

        .message-content code {
            background-color: var(--vscode-editor-background);
            padding: 2px 4px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 11px;
        }

        .thinking {
            display: flex;
            align-items: center;
            gap: 6px;
            color: var(--vscode-descriptionForeground);
            margin-top: 16px;
        }

        .thinking.hidden {
            display: none;
        }

        .thinking-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background-color: var(--vscode-descriptionForeground);
            animation: thinking 1s ease-in-out infinite;
        }

        .thinking-dot:nth-child(2) {
            animation-delay: 0.2s;
        }

        .thinking-dot:nth-child(3) {
            animation-delay: 0.4s;
        }

        @keyframes thinking {
            0%, 80%, 100% {
                opacity: 0.2;
            }
            40% {
                opacity: 1;
            }
        }

        .composer {
            padding: 12px 16px;
            border-top: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editor-background);
            display: flex;
            align-items: flex-end;
            gap: 8px;
        }

        #message-input {
            flex: 1;
            min-height: 60px;
            max-height: 180px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 6px;
            padding: 10px;
            font-size: 11px;
            line-height: 1.5;
            resize: none;
            outline: none;
        }

        .composer-actions {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .composer-button {
            padding: 6px 10px;
            border-radius: 4px;
            border: 1px solid var(--vscode-button-border);
            background: transparent;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 11px;
        }

        .composer-button.primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .composer-button.primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .settings-panel {
            position: absolute;
            inset: 0;
            display: flex;
            justify-content: flex-end;
            background-color: rgba(0, 0, 0, 0.35);
            backdrop-filter: blur(2px);
            padding: 24px;
            z-index: 200;
        }

        .settings-content {
            width: 320px;
            max-width: 100%;
            background-color: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 18px;
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        }

        .settings-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .settings-header h3 {
            margin: 0;
            font-size: 13px;
        }

        .settings-section h4 {
            margin: 0 0 10px 0;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--vscode-descriptionForeground);
        }

        .provider-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .provider-item {
            padding: 10px 12px;
            border-radius: 6px;
            border: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editor-background);
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .provider-item.active {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }

        .provider-item strong {
            font-size: 11px;
        }

        .provider-item span {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
        }

        .provider-empty {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
        }

        .settings-actions {
            display: flex;
            justify-content: flex-end;
        }

        .message-wrapper.diff {
            background-color: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
        }

        .message-wrapper.diff .message-content {
            background-color: transparent;
            border: none;
            padding: 0;
        }

        .diff-preview {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .diff-preview .diff-header {
            font-weight: 600;
            font-size: 13px;
            color: var(--vscode-foreground);
        }

        .diff-preview .diff-body {
            display: flex;
            flex-direction: column;
            gap: 4px;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 13px;
        }

        .diff-row {
            display: block;
        }

        .diff-row code {
            display: block;
            padding: 4px 6px;
            border-radius: 4px;
            background-color: transparent;
            white-space: pre-wrap;
        }

        .diff-added {
            background-color: rgba(46, 204, 113, 0.16);
            color: var(--vscode-foreground);
        }

        .diff-removed {
            background-color: rgba(231, 76, 60, 0.16);
            color: var(--vscode-foreground);
        }

        .diff-context {
            color: var(--vscode-descriptionForeground);
        }

        .tool-notifications {
            position: fixed;
            right: 24px;
            bottom: 24px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            z-index: 100;
        }

        .tool-notification {
            padding: 10px 14px;
            border-radius: 6px;
            background-color: var(--vscode-editorHoverWidget-background);
            color: var(--vscode-editorHoverWidget-foreground);
            box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
            border-left: 3px solid transparent;
            opacity: 0.95;
            transition: opacity 0.3s ease, transform 0.3s ease;
        }

        .tool-notification.running {
            border-left-color: #0984e3;
        }

        .tool-notification.success {
            border-left-color: #2ecc71;
        }

        .tool-notification.error {
            border-left-color: #d63031;
        }

        .tool-notification.fade {
            opacity: 0;
            transform: translateY(10px);
        }

        .welcome-message {
            display: grid;
            gap: 24px;
            padding: 32px;
            margin-top: 32px;
            border-radius: 12px;
            background-color: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-panel-border);
        }

        .welcome-hero {
            display: flex;
            flex-direction: column;
            gap: 12px;
            text-align: left;
        }

        .welcome-hero h2 {
            margin: 0;
            font-size: 18px;
        }

        .welcome-hero p {
            margin: 0;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            max-width: 540px;
        }

        .welcome-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
        }

        .welcome-action {
            padding: 10px 18px;
            border-radius: 8px;
            border: 1px solid var(--vscode-button-border);
            background-color: transparent;
            cursor: pointer;
            color: var(--vscode-foreground);
            font-size: 11px;
            transition: background-color 0.2s ease, border-color 0.2s ease;
        }

        .welcome-action:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .welcome-action.primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .welcome-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
            gap: 18px;
        }

        .welcome-card {
            border-radius: 10px;
            padding: 16px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            text-align: left;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .welcome-card h3 {
            margin: 0;
            font-size: 13px;
        }

        .welcome-card p {
            margin: 0;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.5;
        }

        .chat-history {
            display: flex;
            flex-direction: column;
            flex: 1;
            background-color: var(--vscode-editor-background);
        }

        .chat-history-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .chat-history-header h3 {
            margin: 0;
            font-size: 13px;
            font-weight: 600;
        }

        .chat-history-content {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
        }

        .chat-history-item {
            padding: 10px 12px;
            margin-bottom: 8px;
            border-radius: 6px;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            cursor: pointer;
            transition: background-color 0.2s ease;
        }

        .chat-history-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .chat-history-item-title {
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .chat-history-item-preview {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .chat-history-empty {
            text-align: center;
            padding: 32px;
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
        }

        .hidden {
            display: none !important;
        }
    </style>
</head>
<body>
    ${bodyStartHtml}
    <div class="poe-layout">
        <header class="app-header" data-slot="app-shell">
            <!-- Will be populated by renderAppShell -->
        </header>
        <main class="main-pane">
            <header class="status-bar">
                <div class="status-left">
                    <span id="model-badge" class="model-badge">${options.defaultModel}</span>
                    <span id="strategy-badge" class="strategy-badge">No Strategy</span>
                </div>
                <div id="model-selector" data-slot="model-selector"></div>
            </header>
            <section id="chat-container" class="chat-scroll">
                <div id="messages">
                    <div class="welcome-message">
                        <div class="welcome-hero">
                            <h2>Welcome to Poe Code</h2>
                            <p>
                                Orchestrate Poe models, strategies, and developer tools without leaving VS Code.
                                Configure your agent once and reuse it across every session.
                            </p>
                            <div class="welcome-actions">
                                <button type="button" class="welcome-action primary" data-action="strategy-open">
                                    Configure strategy
                                </button>
                                <button type="button" class="welcome-action" data-action="open-settings">
                                    Manage providers
                                </button>
                            </div>
                        </div>
                        <div class="welcome-grid">
                            <article class="welcome-card" data-feature="strategies">
                                <h3>Adaptive orchestration</h3>
                                <p>Blend Claude, GPT, or custom bots with smart, mixed, or fixed rotation patterns.</p>
                            </article>
                            <article class="welcome-card" data-feature="models">
                                <h3>Fast model switching</h3>
                                <p>Pin your favorite IDs, search any Poe model, or follow strategy recommendations.</p>
                            </article>
                            <article class="welcome-card" data-feature="tools">
                                <h3>Tools that ship code</h3>
                                <p>Trigger worktree, MCP, and repo utilities directly from the conversation.</p>
                            </article>
                        </div>
                    </div>
                </div>
                <div id="thinking-indicator" class="thinking hidden">
                    <span class="thinking-dot"></span>
                    <span class="thinking-dot"></span>
                    <span class="thinking-dot"></span>
                    <span>Thinking...</span>
                </div>
            </section>
            <footer class="composer">
                <textarea id="message-input" placeholder="Ask Poe…" rows="1"></textarea>
                <div class="composer-actions">
                    <button id="clear-button" type="button" class="composer-button">Clear</button>
                    <button id="send-button" type="button" class="composer-button primary">Send</button>
                </div>
            </footer>
            <section id="strategy-modal" class="strategy-modal hidden" aria-hidden="true">
                <div class="strategy-surface" role="dialog" aria-modal="true" aria-labelledby="strategy-modal-title">
                    <header class="strategy-header">
                        <div>
                            <h3 id="strategy-modal-title">Model strategies</h3>
                            <p>Choose how Poe routes each request across your configured models.</p>
                        </div>
                        <button type="button" class="composer-button strategy-close" data-action="strategy-close">
                            Close
                        </button>
                    </header>
                    <div class="strategy-toggle-row">
                        <div class="strategy-toggle-label">
                            <span>Enable orchestration</span>
                            <span>Let Poe swap models automatically</span>
                        </div>
                        <button type="button" id="strategy-toggle" role="switch" aria-checked="false">
                            <span class="strategy-thumb"></span>
                        </button>
                    </div>
                    <div class="strategy-options">
                        <button type="button" class="strategy-option" data-strategy="smart" aria-pressed="false">
                            <strong>🧠 Smart director</strong>
                            <span>Evaluates the prompt and picks reasoning or coding heavy models on demand.</span>
                        </button>
                        <button type="button" class="strategy-option" data-strategy="mixed" aria-pressed="false">
                            <strong>🔄 Mixed relay</strong>
                            <span>Alternates between two top models for balanced creativity and accuracy.</span>
                        </button>
                        <button type="button" class="strategy-option" data-strategy="round-robin" aria-pressed="false">
                            <strong>🔁 Round robin</strong>
                            <span>Visits every configured model in order, great for multi-perspective runs.</span>
                        </button>
                        <button type="button" class="strategy-option" data-strategy="fixed" aria-pressed="false">
                            <strong>📌 Fixed model</strong>
                            <span>Stay on the currently selected model for consistent, predictable replies.</span>
                        </button>
                    </div>
                </div>
            </section>
            <section id="settings-panel" class="settings-panel hidden">
                <div class="settings-content">
                    <header class="settings-header">
                        <h3>Settings</h3>
                        <button type="button" class="composer-button" data-action="settings-close">Close</button>
                    </header>
                    <div class="settings-section">
                        <h4>Providers</h4>
                        <div id="provider-settings" class="provider-list"></div>
                    </div>
                    <div class="settings-actions">
                        <button type="button" class="composer-button" data-action="settings-open-mcp">
                            Open MCP Configuration
                        </button>
                    </div>
                </div>
            </section>
            <section id="chat-history" class="chat-history hidden">
                <div class="chat-history-header">
                    <h3>Chat History</h3>
                    <button type="button" class="composer-button" data-action="history-close">Close</button>
                </div>
                <div class="chat-history-content">
                    <div class="chat-history-empty">No chat history available yet.</div>
                </div>
            </section>
            <div id="tool-notifications" class="tool-notifications"></div>
        </main>
    </div>
    ${extraScripts}
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const bootstrap = ${bootstrapPlaceholder};
        const app = bootstrap({
            document,
            appShellHtml: \`${escapedAppShell}\`,
            modelSelectorHtml: \`${escapedModelSelector}\`,
            providerSettings: ${providerJson},
            defaultModel: ${JSON.stringify(options.defaultModel)},
            logoUrl: ${JSON.stringify(options.logoUri)},
            postMessage: (message) => vscode.postMessage(message)
        });

        window.addEventListener('message', (event) => {
            app.handleMessage(event.data);
        });

        vscode.postMessage({ type: 'getStrategyStatus' });
    </script>
</body>
</html>`;

    return html.replace(bootstrapPlaceholder, initializeWebviewApp.toString());
}

export function deactivate() {
    if (currentTerminal) {
        currentTerminal.dispose();
    }
    if (currentPanel) {
        currentPanel.dispose();
    }
}
class PoeSidebarProvider implements vscode.WebviewViewProvider {
    private view: vscode.WebviewView | undefined;
    private messageSubscription: vscode.Disposable | undefined;

    constructor(private readonly context: vscode.ExtensionContext) { }

    async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };
        webviewView.description = 'Chat with Poe models';
        removeActiveWebview(webviewView.webview);
        this.messageSubscription?.dispose();
        this.messageSubscription = await attachPoeWebview('sidebar', this.context, webviewView.webview) ?? undefined;
        webviewView.onDidDispose(() => {
            if (this.view === webviewView) {
                this.view = undefined;
            }
            this.messageSubscription?.dispose();
            this.messageSubscription = undefined;
            removeActiveWebview(webviewView.webview);
        });
    }

    async reveal(): Promise<void> {
        if (this.view) {
            this.view.show?.(true);
            return;
        }
        await vscode.commands.executeCommand('workbench.view.extension.poe-sidebar');
    }
}
