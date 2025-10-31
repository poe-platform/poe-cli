import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
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
        taskRegistry: any;
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

async function loadModules(): Promise<{
    chatModule: any;
    toolsModule: any;
    taskModule: any;
    baseDir: string;
}> {
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

    let chatModule, toolsModule, taskModule, foundBasePath;
    for (const basePath of possibleBasePaths) {
        try {
            const chatPath = path.join(basePath, 'services', 'chat.js');
            const toolsPath = path.join(basePath, 'services', 'tools.js');
            const taskPath = path.join(basePath, 'services', 'agent-task-registry.js');

            if (fs.existsSync(chatPath) && fs.existsSync(toolsPath) && fs.existsSync(taskPath)) {
                console.log(`[Poe Code] Found modules at: ${basePath}`);
                chatModule = await import(chatPath);
                toolsModule = await import(toolsPath);
                taskModule = await import(taskPath);
                foundBasePath = basePath;
                break;
            }
        } catch (e) {
            console.log(`[Poe Code] Failed to import from ${basePath}:`, e);
            continue;
        }
    }

    if (!chatModule || !toolsModule || !taskModule) {
        const buildInstructions = 'Please run "npm run build" in the poe-setup directory.';
        const pathsChecked = possibleBasePaths.map((p, i) => `\n  ${i + 1}. ${p}`).join('');
        throw new Error(
            `Could not load Poe modules.\n\n` +
            `Paths checked:${pathsChecked}\n\n` +
            buildInstructions
        );
    }

    console.log(`[Poe Code] Successfully loaded modules from ${foundBasePath}`);
    return { chatModule, toolsModule, taskModule, baseDir: foundBasePath || '' };
}

async function createChatRuntime(apiKey: string, model: string): Promise<{
    service: any;
    availableTools: any[];
    toolExecutor: any;
    taskRegistry: any;
}> {
    try {
        const { chatModule, toolsModule, taskModule } = await loadModules();

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

        const homeDir = os.homedir();
        const tasksDir = path.join(homeDir, '.poe-setup', 'tasks');
        const logsDir = path.join(homeDir, '.poe-setup', 'logs', 'tasks');
        const taskRegistry = new taskModule.AgentTaskRegistry({
            fs,
            tasksDir,
            logsDir,
            logger: (event: string, payload?: Record<string, unknown>) => {
                console.log(`[Poe Code] task:${event}`, payload ?? {});
            }
        });
        taskRegistry.onTaskProgress((taskId: string, update: any) => {
            broadcastToWebviews({
                type: 'taskProgress',
                taskId,
                update
            });
        });
        taskRegistry.onTaskComplete((task: any) => {
            broadcastToWebviews({
                type: 'taskComplete',
                task
            });
            const summary = task.result ?? task.error ?? 'Task finished.';
            const icon = task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : '⚠️';
            void vscode.window.showInformationMessage(
                `${icon} ${task.toolName ?? 'Task'}: ${summary}`
            );
        });

        // Create tool executor
        const toolExecutor = new toolsModule.DefaultToolExecutor({
            fs: fileSystem,
            cwd: cwd,
            allowedPaths: [cwd],
            onWriteFile: emitDiffPreview,
            taskRegistry,
            logger: (event: string, payload?: Record<string, unknown>) => {
                console.log(`[Poe Code] tool:${event}`, payload ?? {});
            }
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
        const service = new chatModule.PoeChatService(
            apiKey,
            model,
            toolExecutor,
            toolCallback,
            undefined,
            taskRegistry
        );

        return { service, availableTools, toolExecutor, taskRegistry };
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
<html lang="en" style="color-scheme: light dark;">
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
    <style id="poe-webview-styles"></style>
    ${headHtml}
</head>
<body class="m-0 bg-surface text-text antialiased">
    ${bodyStartHtml}
    <div class="flex h-screen flex-col bg-surface">
        <header data-slot="app-shell"></header>
        <main class="flex flex-1 flex-col">
            <div class="flex min-h-0 flex-1 overflow-hidden">
            <section id="chat-container" class="grid h-full min-h-0 flex-1 grid-rows-[1fr_auto] overflow-hidden">
                <div class="flex flex-1 min-h-0 flex-col overflow-y-auto">
                    <div id="thinking-indicator" class="hidden px-6 pb-4 text-sm text-text-muted">
                        <div class="flex items-center gap-2 rounded-xl border border-dashed border-border bg-surface-raised px-4 py-2 shadow-sm">
                            <span class="h-1.5 w-1.5 rounded-full bg-text-muted motion-safe:animate-pulse opacity-80"></span>
                            <span class="h-1.5 w-1.5 rounded-full bg-text-muted motion-safe:animate-pulse opacity-80" style="animation-delay: 0.2s;"></span>
                            <span class="h-1.5 w-1.5 rounded-full bg-text-muted motion-safe:animate-pulse opacity-80" style="animation-delay: 0.4s;"></span>
                            <span>Thinking...</span>
                        </div>
                    </div>
                    <div id="messages" class="flex flex-1 flex-col gap-4 px-6 pb-6 pt-6">
                        <div class="welcome-message flex flex-col gap-6 rounded-2xl border border-border bg-surface-raised p-6 shadow-panel">
                            <div class="space-y-2">
                                <h2 class="text-lg font-semibold text-text">Welcome to Poe Code</h2>
                                <p class="text-sm leading-6 text-text-muted">Configure your favorite Poe models, choose a strategy, and start shipping code faster.</p>
                            </div>
                            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <article class="welcome-card rounded-2xl border border-border bg-surface p-4 transition hover:bg-surface-raised" data-feature="strategies">
                                    <h3 class="text-sm font-semibold text-text">Strategies</h3>
                                    <p class="text-xs leading-5 text-text-muted">Enable smart, mixed, or fixed routing in settings. Switch context on the fly.</p>
                                </article>
                                <article class="welcome-card rounded-2xl border border-border bg-surface p-4 transition hover:bg-surface-raised" data-feature="models">
                                    <h3 class="text-sm font-semibold text-text">Model library</h3>
                                    <p class="text-xs leading-5 text-text-muted">Pin providers, set custom IDs, or let Poe recommend models for each request.</p>
                                </article>
                                <article class="welcome-card rounded-2xl border border-border bg-surface p-4 transition hover:bg-surface-raised" data-feature="tools">
                                    <h3 class="text-sm font-semibold text-text">Dev workflows</h3>
                                    <p class="text-xs leading-5 text-text-muted">Trigger tools, diff previews, and MCP actions without duplicating templates.</p>
                                </article>
                            </div>
                        </div>
                    </div>
                </div>
                <footer class="composer border-t border-border bg-surface/95 px-6 py-4 backdrop-blur">
                    <div class="flex w-full items-end gap-3">
                        <textarea
                            id="message-input"
                            data-test="message-input"
                            class="min-h-[3.5rem] max-h-[14rem] flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-3 text-sm leading-6 text-text placeholder:text-text-muted transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                            placeholder="Ask Poe..."
                            rows="1"
                        ></textarea>
                        <button
                            id="send-button"
                            type="button"
                            data-test="send-button"
                            class="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                            Send
                        </button>
                    </div>
                </footer>
            </section>
            <section id="chat-history" class="chat-history hidden flex min-h-0 flex-1 flex-col overflow-hidden border-l border-border bg-surface-raised shadow-xl" data-test="chat-history-panel">
                <div class="chat-history-header flex items-center justify-between border-b border-border px-5 py-4" data-test="chat-history-header">
                    <h3 class="text-sm font-semibold text-text">Chat history</h3>
                    <button
                        type="button"
                        data-action="history-close"
                        data-test="chat-history-close"
                        class="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition hover:border-border hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                        Close
                    </button>
                </div>
                <div class="chat-history-content flex-1 space-y-3 overflow-y-auto px-5 py-4" data-test="chat-history-content">
                    <div class="chat-history-empty rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-sm text-text-muted" data-test="chat-history-empty">
                        Start a conversation to see recent chats here.
                    </div>
                </div>
            </section>
            <section id="settings-view" class="hidden flex min-h-0 flex-1 overflow-hidden bg-surface" data-test="settings-view">
                <div class="flex flex-1 flex-col overflow-y-auto px-6 py-6">
                    <div class="mx-auto w-full max-w-3xl flex-1">
                        <poe-settings-panel id="settings-panel" data-test="settings-panel"></poe-settings-panel>
                    </div>
                </div>
            </section>
            </div>
        </main>
        <div id="tool-notifications" class="pointer-events-none fixed bottom-6 right-6 flex flex-col gap-3"></div>
    </div>
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
    if (chatRuntime?.taskRegistry) {
        chatRuntime.taskRegistry.dispose?.();
    }
    chatRuntime = null;
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
