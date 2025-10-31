import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { renderAppShell } from './webview/layout.js';
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

    webview.html = getWebviewContent(webview, {
        logoUri,
        appShellHtml,
        modelOptions,
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
    const tailwindCss = loadTailwindCss();
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
    <style>${tailwindCss}</style>
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
    providerSettings: ProviderSetting[];
    modelOptions: string[];
    defaultModel: string;
    bodyStartHtml?: string;
    additionalScripts?: string[];
    additionalCspDirectives?: string[];
    headHtml?: string;
    useGlobalBootstrap?: boolean;
    allowScriptFromSelf?: boolean;
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

let cachedTailwindCss: string | null = null;
function loadTailwindCss(): string {
    if (cachedTailwindCss !== null) {
        return cachedTailwindCss;
    }
    const cssPath = path.join(__dirname, "webview", "styles", "tailwind.css");
    try {
        cachedTailwindCss = fs.readFileSync(cssPath, "utf8");
    } catch {
        cachedTailwindCss = "";
    }
    return cachedTailwindCss;
}

export function getWebviewContent(webview: vscode.Webview, options: WebviewContentOptions): string {
    const providerJson = JSON.stringify(options.providerSettings);
    const modelOptionsJson = JSON.stringify(options.modelOptions);
    const escapedAppShell = escapeTemplateLiteral(options.appShellHtml);
    const tailwindCss = escapeTemplateLiteral(loadTailwindCss());
    const nonce = createNonce();
    const cspSource = webview.cspSource;
    const bodyStartHtml = options.bodyStartHtml ?? "";
    const headHtml = options.headHtml ?? "";
    const extraScripts = (options.additionalScripts ?? [])
        .map((code) => `<script nonce="${nonce}">
${code}
</script>`)
        .join("\n");
    const scriptSources = [`'nonce-${nonce}'`];
    if (options.allowScriptFromSelf) {
        scriptSources.push("'self'");
    }
    const cspDirectives = [
        `default-src 'none'`,
        `img-src ${cspSource} https: data:`,
        `style-src ${cspSource} 'unsafe-inline'`,
        `script-src ${scriptSources.join(" ")}`,
        ...(options.additionalCspDirectives ?? []),
    ];
    const contentSecurityPolicy = cspDirectives.join("; ");
    const bootstrapSource = options.useGlobalBootstrap
        ? "window.initializeWebviewApp"
        : initializeWebviewApp.toString();
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Poe Code</title>
    <style id="poe-tailwind">
${tailwindCss}
    </style>
    <style id="poe-webview-styles">
        :root {
            color-scheme: light dark;
        }

        body {
            margin: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }

        #messages {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .welcome-message {
            display: grid;
            gap: 24px;
            border-radius: 16px;
            border: 1px dashed var(--vscode-panel-border);
            background-color: var(--vscode-editorWidget-background);
            padding: 32px;
        }

        .welcome-hero h2 {
            margin: 0;
            font-size: 20px;
        }

        .welcome-hero p {
            margin: 8px 0 0;
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.6;
        }

        .welcome-grid {
            display: grid;
            gap: 16px;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        }

        .welcome-card {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 12px;
            padding: 16px;
            background-color: var(--vscode-editor-background);
        }

        .welcome-card h3 {
            margin: 0 0 6px 0;
            font-size: 14px;
        }

        .welcome-card p {
            margin: 0;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.6;
        }

        .message-wrapper {
            border-radius: 16px;
            border: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editorWidget-background);
            padding: 18px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
        }

        .message-wrapper.user {
            background-color: var(--vscode-editor-background);
        }

        .message-header {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 12px;
            font-weight: 600;
            color: var(--vscode-editor-foreground);
        }

        .message-header .message-model {
            margin-left: auto;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .avatar {
            width: 32px;
            height: 32px;
            border-radius: 9999px;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            overflow: hidden;
            font-size: 12px;
            font-weight: 600;
        }

        .avatar.assistant img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .message-content {
            font-size: 13px;
            line-height: 1.6;
        }

        .message-content pre {
            border-radius: 8px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 12px;
            overflow: auto;
        }

        .message-wrapper.diff {
            background-color: var(--vscode-editorWidget-background);
        }

        .message-wrapper.diff .message-content {
            border: none;
            padding: 0;
        }

        .message-wrapper.tool {
            border-style: dashed;
        }

        .message-wrapper.tool.success {
            border-color: var(--vscode-gitDecoration-addedResourceForeground);
        }

        .message-wrapper.tool.error {
            border-color: var(--vscode-errorForeground);
        }

        .message-tool-status {
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .message-tool-args {
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 11px;
            margin: 0;
        }

        .message-tool-error {
            margin-top: 8px;
            font-size: 11px;
            color: var(--vscode-errorForeground);
        }

        .tool-notifications {
            position: fixed;
            bottom: 24px;
            right: 24px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            pointer-events: none;
            z-index: 200;
        }

        .tool-notification {
            border-radius: 10px;
            padding: 10px 14px;
            font-size: 12px;
            font-weight: 500;
            background-color: var(--vscode-editorWidget-background);
            border: 1px solid transparent;
            color: var(--vscode-editor-foreground);
            box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
            opacity: 0.95;
            transition: opacity 0.3s ease;
        }

        .tool-notification.running {
            border-color: var(--vscode-panel-border);
        }

        .tool-notification.success {
            border-color: var(--vscode-gitDecoration-addedResourceForeground);
        }

        .tool-notification.error {
            border-color: var(--vscode-errorForeground);
        }

        .tool-notification.fade {
            opacity: 0;
        }

        .chat-history {
            width: 320px;
            border-left: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editorWidget-background);
            display: flex;
            flex-direction: column;
        }

        .chat-history-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .chat-history-content {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .chat-history-item {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 10px;
            padding: 12px;
            background-color: var(--vscode-editor-background);
            cursor: pointer;
            transition: border-color 0.2s ease, background-color 0.2s ease;
        }

        .chat-history-item:hover {
            border-color: var(--vscode-focusBorder);
            background-color: var(--vscode-editorWidget-background);
        }

        .chat-history-item-title {
            margin: 0 0 4px 0;
            font-size: 12px;
            font-weight: 600;
        }

        .chat-history-item-preview {
            margin: 0;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .chat-history-empty {
            text-align: center;
            padding: 32px 16px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .thinking-dot {
            width: 6px;
            height: 6px;
            border-radius: 9999px;
            background-color: var(--vscode-descriptionForeground);
            animation: thinking-bounce 1s infinite ease-in-out;
        }

        .thinking-dot:nth-child(2) {
            animation-delay: 0.2s;
        }

        .thinking-dot:nth-child(3) {
            animation-delay: 0.4s;
        }

        @keyframes thinking-bounce {
            0%, 80%, 100% {
                opacity: 0.3;
                transform: translateY(0);
            }
            40% {
                opacity: 1;
                transform: translateY(-3px);
            }
        }
    </style>
    ${headHtml}
</head>
<body class="bg-surface text-text font-sans antialiased">
    ${bodyStartHtml}
    <div class="flex h-screen flex-col overflow-hidden">
        <header class="flex items-center justify-between border-b border-outline bg-surface px-5 py-4" data-slot="app-shell"></header>
        <main class="relative flex flex-1 overflow-hidden bg-surface">
            <section id="chat-container" class="flex flex-1 flex-col overflow-hidden">
                <div id="messages" class="flex-1 overflow-y-auto px-6 py-6">
                    <div class="welcome-message">
                        <div class="welcome-hero">
                            <h2>Welcome to Poe Code</h2>
                            <p>Configure your favorite Poe models, choose a strategy, and start shipping code faster.</p>
                        </div>
                        <div class="welcome-grid">
                            <article class="welcome-card" data-feature="strategies">
                                <h3>Strategies</h3>
                                <p>Enable smart, mixed, or fixed routing in settings. Switch context on the fly.</p>
                            </article>
                            <article class="welcome-card" data-feature="models">
                                <h3>Model library</h3>
                                <p>Pin providers, set custom IDs, or let Poe recommend models for each request.</p>
                            </article>
                            <article class="welcome-card" data-feature="tools">
                                <h3>Dev workflows</h3>
                                <p>Trigger tools, diff previews, and MCP actions without duplicating templates.</p>
                            </article>
                        </div>
                    </div>
                </div>
                <div id="thinking-indicator" class="hidden px-6 pb-6 text-sm text-subtle">
                    <div class="flex items-center gap-2 rounded-lg border border-dashed border-outline bg-surface-muted px-3 py-2">
                        <span class="thinking-dot"></span>
                        <span class="thinking-dot"></span>
                        <span class="thinking-dot"></span>
                        <span>Thinking...</span>
                    </div>
                </div>
                <footer class="composer border-t border-outline bg-surface px-6 py-4">
                    <div class="flex w-full items-end gap-3">
                        <textarea
                            id="message-input"
                            data-test="message-input"
                            class="min-h-[3.5rem] max-h-[14rem] flex-1 resize-none rounded-lg border border-outline bg-surface-muted px-3 py-3 text-sm leading-6 text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                            placeholder="Ask Poe..."
                            rows="1"
                        ></textarea>
                        <div class="flex items-center gap-2">
                            <button
                                id="clear-button"
                                type="button"
                                data-test="clear-button"
                                class="rounded-md border border-outline px-3 py-2 text-xs font-medium text-subtle transition hover:bg-surface-muted hover:text-text focus:outline-none focus:ring-2 focus:ring-accent"
                            >
                                Clear
                            </button>
                            <button
                                id="send-button"
                                type="button"
                                data-test="send-button"
                                class="rounded-md bg-button px-4 py-2 text-xs font-semibold text-button-foreground shadow focus:outline-none focus:ring-2 focus:ring-accent"
                            >
                                Send
                            </button>
                        </div>
                    </div>
                </footer>
            </section>
            <section id="chat-history" class="chat-history hidden" data-test="chat-history-panel">
                <div class="chat-history-header" data-test="chat-history-header">
                    <h3 class="text-sm font-semibold">Chat history</h3>
                    <button
                        type="button"
                        data-action="history-close"
                        data-test="chat-history-close"
                        class="rounded-md border border-outline px-3 py-1 text-xs text-subtle hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                        Close
                    </button>
                </div>
                <div class="chat-history-content" data-test="chat-history-content">
                    <div class="chat-history-empty" data-test="chat-history-empty">
                        Start a conversation to see recent chats here.
                    </div>
                </div>
            </section>
            <div id="tool-notifications" class="tool-notifications"></div>
        </main>
    </div>
    <poe-settings-panel id="settings-panel" data-test="settings-panel"></poe-settings-panel>
    ${extraScripts}
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const bootstrap = ${bootstrapSource};
        const app = bootstrap({
            document,
            appShellHtml: \`${escapedAppShell}\`,
            providerSettings: ${providerJson},
            modelOptions: ${modelOptionsJson},
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


    return html;
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
