import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { renderAppShell } from './webview/layout.js';
import { renderModelSelector } from './webview/model-selector.js';
import { renderMarkdown } from './webview/markdown.js';
import { renderDiffPreview } from './webview/diff-preview.js';
import { initializeWebviewApp } from './webview/runtime.js';
import { ChatState } from './state/chat-state.js';
import { loadProviderSettings } from './config/provider-settings.js';
import type { ProviderSetting } from './config/provider-settings.js';
import { openMcpSettings } from './commands/open-mcp-settings.js';

let currentTerminal: vscode.Terminal | undefined = undefined;
let currentPanel: vscode.WebviewPanel | undefined = undefined;
let chatService: any | undefined = undefined;
let availableTools: any[] = [];
let toolExecutor: any | undefined = undefined;
const chatState = new ChatState();

export function activate(context: vscode.ExtensionContext) {
    console.log('Poe Code extension is now active');

    // Register the open in editor (new tab) command
    const openEditorCommand = vscode.commands.registerCommand('poe-code.editor.open', () => {
        openPoeInEditor(context);
    });

    // Register the open in sidebar command
    const openSidebarCommand = vscode.commands.registerCommand('poe-code.sidebar.open', () => {
        vscode.window.showInformationMessage('Sidebar view coming soon! Use "Open in New Tab" for now.');
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

async function loadChatService(apiKey: string, model: string): Promise<any> {
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

        const emitDiffPreview = async (details: {
            absolutePath: string;
            relativePath: string;
            previousContent: string | null;
            nextContent: string;
        }) => {
            if (!currentPanel) {
                return;
            }
            const diffHtml = renderDiffPreview({
                previous: details.previousContent ?? "",
                next: details.nextContent,
                filename: details.relativePath || path.basename(details.absolutePath),
                language: detectLanguage(details.absolutePath)
            });
            currentPanel.webview.postMessage({
                type: 'diffPreview',
                html: diffHtml
            });
        };

        // Create tool executor
        toolExecutor = new toolsModule.DefaultToolExecutor({
            fs: fileSystem,
            cwd: cwd,
            allowedPaths: [cwd],
            onWriteFile: emitDiffPreview
        });

        // Get available tools
        availableTools = toolsModule.getAvailableTools();
        console.log(`[Poe Code] Loaded ${availableTools.length} tools`);

        // Create tool callback to notify about tool usage
        const toolCallback = (event: any) => {
            if (currentPanel) {
                if (event.result) {
                    console.log(`[Poe Code] Tool executed: ${event.toolName}`);
                    // Tool execution completed successfully
                    currentPanel.webview.postMessage({
                        type: 'toolExecuted',
                        toolName: event.toolName,
                        args: event.args,
                        success: true
                    });
                } else if (event.error) {
                    console.error(`[Poe Code] Tool error: ${event.toolName} - ${event.error}`);
                    // Tool execution failed
                    currentPanel.webview.postMessage({
                        type: 'toolExecuted',
                        toolName: event.toolName,
                        args: event.args,
                        success: false,
                        error: event.error
                    });
                } else {
                    console.log(`[Poe Code] Tool starting: ${event.toolName}`);
                    // Tool execution starting
                    currentPanel.webview.postMessage({
                        type: 'toolStarting',
                        toolName: event.toolName,
                        args: event.args
                    });
                }
            }
        };

        // Create chat service with tool executor and callback
        const service = new chatModule.PoeChatService(apiKey, model, toolExecutor, toolCallback);

        return service;
    } catch (error) {
        throw new Error(`Failed to initialize chat service: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function openPoeInEditor(context: vscode.ExtensionContext) {
    // If panel already exists and is still open, show it
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.One);
        return;
    }

    const configuration = vscode.workspace.getConfiguration('poeCode');
    const defaultModel = configuration.get<string>('defaultModel') || 'Claude-Sonnet-4.5';

    // Check if poe-setup is configured
    let credentials = await getPoeCredentials();
    if (!credentials) {
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
                credentials = { apiKey };
            } else {
                return; // User cancelled
            }
        } else if (!action) {
            return; // User dismissed
        }
    }

    if (!credentials) {
        return;
    }

    try {
        chatService = await loadChatService(credentials.apiKey, defaultModel);
    } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
        return;
    }

    // Create and show a new webview panel
    const iconPath = vscode.Uri.joinPath(context.extensionUri, 'poe-logo.png');
    currentPanel = vscode.window.createWebviewPanel(
        'poeCodePanel',
        'Poe Code',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [context.extensionUri]
        }
    );

    // Set the icon for the tab
    currentPanel.iconPath = iconPath;

    // Set the webview's HTML content
    const logoUri = currentPanel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'poe-bw.svg')
    ).toString();

    const providerSettings = await loadProviderSettings(context.extensionUri.fsPath);
    const modelOptions = Array.from(
        new Set(
            [
                chatService?.getModel?.() ?? defaultModel,
                ...providerSettings.map((provider) => provider.label)
            ].filter(Boolean)
        )
    ) as string[];

    const appShellHtml = renderAppShell({
        logoUrl: logoUri,
        models: modelOptions,
        activeModel: chatService?.getModel?.() ?? defaultModel
    });
    const modelSelectorHtml = renderModelSelector({
        models: modelOptions,
        selected: chatService?.getModel?.() ?? defaultModel
    });

    currentPanel.webview.html = getWebviewContent(currentPanel.webview, {
        logoUri,
        appShellHtml,
        modelSelectorHtml,
        providerSettings,
        defaultModel: chatService?.getModel?.() ?? defaultModel
    });

    // Handle messages from the webview
    currentPanel.webview.onDidReceiveMessage(
        async (message) => {
            switch (message.type) {
                case 'sendMessage': {
                    if (!chatService || !currentPanel) {
                        currentPanel?.webview.postMessage({
                            type: 'error',
                            text: 'Chat service is not available. Please try reopening Poe Code.'
                        });
                        return;
                    }
                    const text = typeof message.text === 'string' ? message.text : '';
                    const messageId =
                        typeof message.id === 'string' && message.id.length > 0
                            ? message.id
                            : `m-${Date.now()}`;
                    chatState.append({
                        id: messageId,
                        role: 'user',
                        content: text
                    });
                    currentPanel.webview.postMessage({ type: 'thinking', value: true });
                    currentPanel.webview.postMessage({
                        type: 'message',
                        role: 'user',
                        id: messageId,
                        html: renderMarkdown(text),
                        model: chatService.getModel()
                    });
                    try {
                        const response = await chatService.sendMessage(text, availableTools);
                        const responseText =
                            response?.content ??
                            response?.choices?.[0]?.message?.content ??
                            'No response from model';
                        chatState.append({
                            id: response?.id ?? `assistant-${Date.now()}`,
                            role: 'assistant',
                            content: responseText
                        });
                        currentPanel.webview.postMessage({
                            type: 'message',
                            role: 'assistant',
                            id: response?.id ?? `assistant-${Date.now()}`,
                            html: renderMarkdown(responseText),
                            model: chatService.getModel(),
                            strategyInfo: chatService.isStrategyEnabled()
                                ? chatService.getStrategyInfo()
                                : null
                        });
                    } catch (error) {
                        currentPanel.webview.postMessage({
                            type: 'error',
                            text: error instanceof Error ? error.message : String(error)
                        });
                    } finally {
                        currentPanel.webview.postMessage({ type: 'thinking', value: false });
                    }
                    break;
                }
                case 'clearHistory': {
                    chatService?.clearHistory();
                    chatState.clear();
                    if (currentPanel) {
                        currentPanel.webview.postMessage({ type: 'historyCleared' });
                    }
                    break;
                }
                case 'getStrategyStatus': {
                    if (chatService && currentPanel) {
                        currentPanel.webview.postMessage({
                            type: 'strategyStatus',
                            enabled: chatService.isStrategyEnabled(),
                            info: chatService.isStrategyEnabled()
                                ? chatService.getStrategyInfo()
                                : 'Strategy disabled',
                            currentModel: chatService.getModel()
                        });
                    }
                    break;
                }
                case 'setStrategy': {
                    if (chatService && currentPanel) {
                        try {
                            chatService.setStrategy(message.config);
                            currentPanel.webview.postMessage({
                                type: 'strategyStatus',
                                enabled: chatService.isStrategyEnabled(),
                                info: chatService.getStrategyInfo(),
                                currentModel: chatService.getModel()
                            });
                            vscode.window.showInformationMessage('Strategy updated successfully!');
                        } catch (error) {
                            vscode.window.showErrorMessage(
                                `Failed to set strategy: ${error instanceof Error ? error.message : String(error)}`
                            );
                        }
                    }
                    break;
                }
                case 'toggleStrategy': {
                    if (chatService && currentPanel) {
                        if (message.enabled) {
                            chatService.enableStrategy();
                        } else {
                            chatService.disableStrategy();
                        }
                        currentPanel.webview.postMessage({
                            type: 'strategyStatus',
                            enabled: chatService.isStrategyEnabled(),
                            info: chatService.isStrategyEnabled()
                                ? chatService.getStrategyInfo()
                                : 'Strategy disabled',
                            currentModel: chatService.getModel()
                        });
                    }
                    break;
                }
                case 'openSettings': {
                    await vscode.commands.executeCommand('poe-code.settings.openMcp');
                    break;
                }
                case 'setModel': {
                    if (chatService && typeof message.model === 'string') {
                        const trimmed = message.model.trim();
                        if (trimmed.length > 0) {
                            chatService.setModel(trimmed);
                            if (currentPanel) {
                                currentPanel.webview.postMessage({
                                    type: 'modelChanged',
                                    model: chatService.getModel()
                                });
                            }
                        }
                    }
                    break;
                }
                case 'info':
                    vscode.window.showInformationMessage(message.text);
                    break;
                case 'error':
                    vscode.window.showErrorMessage(message.text);
                    break;
            }
        },
        undefined,
        context.subscriptions
    );

    // Handle panel disposal
    currentPanel.onDidDispose(
        () => {
            currentPanel = undefined;
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

async function showWelcomeMessage(context: vscode.ExtensionContext) {
    await context.globalState.update('poe-code.hasShownWelcome', true);
}
interface WebviewContentOptions {
    logoUri: string;
    appShellHtml: string;
    modelSelectorHtml: string;
    providerSettings: ProviderSetting[];
    defaultModel: string;
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
    const bootstrapSource = escapeTemplateLiteral(initializeWebviewApp.toString());

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
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
            display: grid;
            grid-template-columns: minmax(200px, 260px) 1fr;
            height: 100vh;
            overflow: hidden;
        }

        .sidebar-wrapper {
            background-color: var(--vscode-sideBar-background);
            border-right: 1px solid var(--vscode-panel-border);
            display: flex;
            flex-direction: column;
            overflow-y: auto;
        }

        .sidebar-wrapper .app-header {
            padding: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .sidebar-wrapper .app-header h1 {
            font-size: 16px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--vscode-foreground);
        }

        .sidebar-wrapper .app-header img {
            width: 24px;
            height: 24px;
        }

        .app-nav {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .app-nav button {
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid var(--vscode-button-border);
            background: transparent;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 13px;
            transition: background-color 0.2s ease;
            text-align: left;
        }

        .app-nav button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .model-list {
            list-style: none;
            margin: 16px 0;
            padding: 0 16px 16px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .model-item {
            padding: 8px 10px;
            border-radius: 6px;
            color: var(--vscode-foreground);
            cursor: pointer;
            transition: background-color 0.2s ease;
        }

        .model-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .model-item.active {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
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
            padding: 12px 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editor-background);
        }

        .status-left {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .model-badge {
            font-size: 12px;
            padding: 4px 10px;
            border-radius: 999px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }

        .strategy-badge {
            font-size: 12px;
            padding: 4px 10px;
            border-radius: 999px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            opacity: 0.8;
        }

        .chat-scroll {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
            scroll-behavior: smooth;
        }

        #messages {
            max-width: 900px;
            margin: 0 auto;
        }

        .message-wrapper {
            margin-bottom: 24px;
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
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .avatar {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background-color: var(--vscode-button-background);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--vscode-button-foreground);
            font-size: 12px;
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
            padding: 16px;
            border-radius: 10px;
            line-height: 1.65;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            overflow-x: auto;
        }

        .message-wrapper.assistant .message-content {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textBlockQuote-border);
        }

        .message-content pre {
            padding: 12px;
            background-color: var(--vscode-editor-background);
            border-radius: 8px;
            overflow: auto;
        }

        .message-content code {
            background-color: var(--vscode-editor-background);
            padding: 2px 4px;
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family, monospace);
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
            padding: 16px 20px;
            border-top: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editor-background);
            display: flex;
            align-items: flex-end;
            gap: 12px;
        }

        #message-input {
            flex: 1;
            min-height: 80px;
            max-height: 220px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 8px;
            padding: 14px;
            font-size: 14px;
            line-height: 1.6;
            resize: none;
            outline: none;
        }

        .composer-actions {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .composer-button {
            padding: 8px 14px;
            border-radius: 6px;
            border: 1px solid var(--vscode-button-border);
            background: transparent;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 13px;
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
            font-size: 16px;
        }

        .settings-section h4 {
            margin: 0 0 12px 0;
            font-size: 13px;
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
            font-size: 13px;
        }

        .provider-item span {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .provider-empty {
            font-size: 12px;
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
            text-align: center;
            padding: 32px;
            background-color: var(--vscode-editor-background);
            border: 1px dashed var(--vscode-panel-border);
            border-radius: 10px;
            margin-top: 32px;
        }

        .welcome-message h2 {
            margin-bottom: 8px;
            font-size: 20px;
        }

        .welcome-message p {
            margin: 0;
            color: var(--vscode-descriptionForeground);
        }

        .hidden {
            display: none !important;
        }
    </style>
</head>
<body>
    <div class="poe-layout">
        <aside class="sidebar-wrapper" data-slot="app-shell"></aside>
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
                        <h2>Welcome to Poe Code</h2>
                        <p>Start chatting with Poe models or explore tooling via the sidebar.</p>
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
            <div id="tool-notifications" class="tool-notifications"></div>
        </main>
    </div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const bootstrap = ${bootstrapSource};
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
}

export function deactivate() {
    if (currentTerminal) {
        currentTerminal.dispose();
    }
    if (currentPanel) {
        currentPanel.dispose();
    }
}
