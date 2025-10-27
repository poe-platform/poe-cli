import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

let currentTerminal: vscode.Terminal | undefined = undefined;
let currentPanel: vscode.WebviewPanel | undefined = undefined;
let chatService: any | undefined = undefined;
let availableTools: any[] = [];
let toolExecutor: any | undefined = undefined;

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

        // Create tool executor
        toolExecutor = new toolsModule.DefaultToolExecutor({
            fs: fileSystem,
            cwd: cwd,
            allowedPaths: [cwd]
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

    // Check if poe-setup is configured
    const credentials = await getPoeCredentials();
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
                // Initialize chat service
                const config = vscode.workspace.getConfiguration('poeCode');
                const defaultModel = config.get<string>('defaultModel') || 'Claude-Sonnet-4.5';
                try {
                    chatService = await loadChatService(apiKey, defaultModel);
                } catch (error) {
                    vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
                    return;
                }
            } else {
                return; // User cancelled
            }
        } else if (!action) {
            return; // User dismissed
        }
    } else {
        // Initialize chat service with existing credentials
        const config = vscode.workspace.getConfiguration('poeCode');
        const defaultModel = config.get<string>('defaultModel') || 'Claude-Sonnet-4.5';
        try {
            chatService = await loadChatService(credentials.apiKey, defaultModel);
        } catch (error) {
            vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
            return;
        }
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
        vscode.Uri.joinPath(context.extensionUri, 'poe-logo.png')
    );
    currentPanel.webview.html = getWebviewContent(currentPanel.webview, context, logoUri.toString());

    // Handle messages from the webview
    currentPanel.webview.onDidReceiveMessage(
        async (message) => {
            switch (message.type) {
                case 'sendMessage':
                    if (chatService && currentPanel) {
                        try {
                            // Send thinking state
                            currentPanel.webview.postMessage({ type: 'thinking', value: true });

                            // Send message to Poe with tools
                            const response = await chatService.sendMessage(message.text, availableTools);

                            // Send response back to webview with strategy info
                            currentPanel.webview.postMessage({
                                type: 'response',
                                text: response.content,
                                model: chatService.getModel(),
                                strategyInfo: chatService.isStrategyEnabled() ? chatService.getStrategyInfo() : null
                            });
                        } catch (error) {
                            currentPanel.webview.postMessage({
                                type: 'error',
                                text: error instanceof Error ? error.message : String(error)
                            });
                        } finally {
                            currentPanel.webview.postMessage({ type: 'thinking', value: false });
                        }
                    }
                    break;
                case 'clearHistory':
                    if (chatService) {
                        chatService.clearHistory();
                    }
                    break;
                case 'getStrategyStatus':
                    if (chatService && currentPanel) {
                        currentPanel.webview.postMessage({
                            type: 'strategyStatus',
                            enabled: chatService.isStrategyEnabled(),
                            info: chatService.isStrategyEnabled() ? chatService.getStrategyInfo() : 'Strategy disabled',
                            currentModel: chatService.getModel()
                        });
                    }
                    break;
                case 'setStrategy':
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
                case 'toggleStrategy':
                    if (chatService && currentPanel) {
                        if (message.enabled) {
                            chatService.enableStrategy();
                        } else {
                            chatService.disableStrategy();
                        }
                        currentPanel.webview.postMessage({
                            type: 'strategyStatus',
                            enabled: chatService.isStrategyEnabled(),
                            info: chatService.isStrategyEnabled() ? chatService.getStrategyInfo() : 'Strategy disabled',
                            currentModel: chatService.getModel()
                        });
                    }
                    break;
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
    const action = await vscode.window.showInformationMessage(
        'Welcome to Poe Code! Click the status bar or terminal icon to start chatting with AI.',
        'Open Now',
        'Check Setup',
        'Don\'t Show Again'
    );

    if (action === 'Open Now') {
        vscode.commands.executeCommand('poe-code.editor.open');
    } else if (action === 'Check Setup') {
        vscode.commands.executeCommand('poe-code.checkSetup');
    }

    if (action === 'Don\'t Show Again') {
        await context.globalState.update('poe-code.hasShownWelcome', true);
    }
}

function getWebviewContent(webview: vscode.Webview, context: vscode.ExtensionContext, logoUri: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Poe Code</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        #header {
            padding: 16px 24px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-sideBar-background);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        #header h1 {
            font-size: 16px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .model-badge {
            font-size: 11px;
            padding: 3px 8px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 12px;
            font-weight: 500;
        }

        .strategy-badge {
            font-size: 10px;
            padding: 2px 6px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border-radius: 10px;
            font-weight: 500;
            cursor: pointer;
            transition: opacity 0.2s;
        }

        .strategy-badge:hover {
            opacity: 0.8;
        }

        .header-buttons {
            display: flex;
            gap: 8px;
        }

        .header-button {
            padding: 6px 12px;
            background-color: transparent;
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-button-border);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: background-color 0.2s;
        }

        .header-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }

        .modal.show {
            display: flex;
        }

        .modal-content {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 24px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }

        .modal-header h2 {
            font-size: 18px;
            font-weight: 600;
        }

        .close-button {
            background: none;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 20px;
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .close-button:hover {
            opacity: 0.7;
        }

        .strategy-option {
            padding: 12px;
            margin-bottom: 8px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .strategy-option:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .strategy-option.active {
            background-color: var(--vscode-list-activeSelectionBackground);
            border-color: var(--vscode-focusBorder);
        }

        .strategy-option h3 {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .strategy-option p {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin: 0;
        }

        .toggle-container {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px;
            background-color: var(--vscode-input-background);
            border-radius: 6px;
            margin-bottom: 16px;
        }

        .toggle-label {
            font-size: 14px;
            font-weight: 500;
        }

        .toggle-switch {
            position: relative;
            width: 44px;
            height: 24px;
            background-color: var(--vscode-input-border);
            border-radius: 12px;
            cursor: pointer;
            transition: background-color 0.2s;
        }

        .toggle-switch.active {
            background-color: var(--vscode-button-background);
        }

        .toggle-slider {
            position: absolute;
            top: 2px;
            left: 2px;
            width: 20px;
            height: 20px;
            background-color: white;
            border-radius: 50%;
            transition: transform 0.2s;
        }

        .toggle-switch.active .toggle-slider {
            transform: translateX(20px);
        }

        #chat-container {
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
            animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(10px);
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
            gap: 6px;
        }

        .avatar {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 600;
            overflow: hidden;
        }

        .avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .avatar.user {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .avatar.assistant {
            background-color: transparent;
            color: var(--vscode-button-secondaryForeground);
        }

        .message-content {
            padding: 14px 16px;
            border-radius: 8px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .message-wrapper.user .message-content {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
        }

        .message-wrapper.assistant .message-content {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textBlockQuote-border);
        }

        .thinking {
            display: inline-flex;
            gap: 4px;
            align-items: center;
        }

        .thinking-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background-color: var(--vscode-foreground);
            opacity: 0.6;
            animation: pulse 1.4s infinite;
        }

        .thinking-dot:nth-child(2) {
            animation-delay: 0.2s;
        }

        .thinking-dot:nth-child(3) {
            animation-delay: 0.4s;
        }

        @keyframes pulse {
            0%, 60%, 100% {
                opacity: 0.6;
            }
            30% {
                opacity: 1;
            }
        }

        #input-container {
            padding: 16px 24px;
            background-color: var(--vscode-sideBar-background);
            border-top: 1px solid var(--vscode-panel-border);
        }

        #input-wrapper {
            max-width: 900px;
            margin: 0 auto;
            display: flex;
            gap: 12px;
            align-items: flex-end;
        }

        #message-input {
            flex: 1;
            padding: 12px 16px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 8px;
            font-family: inherit;
            font-size: 14px;
            resize: none;
            min-height: 44px;
            max-height: 200px;
            overflow-y: auto;
            line-height: 1.5;
        }

        #message-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        #message-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }

        #send-button {
            padding: 12px 24px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
            white-space: nowrap;
        }

        #send-button:hover:not(:disabled) {
            background-color: var(--vscode-button-hoverBackground);
        }

        #send-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .welcome-message {
            text-align: center;
            padding: 40px 20px;
            color: var(--vscode-descriptionForeground);
        }

        .welcome-message h2 {
            font-size: 24px;
            margin-bottom: 12px;
            color: var(--vscode-foreground);
        }

        .welcome-message p {
            font-size: 14px;
            line-height: 1.6;
            max-width: 500px;
            margin: 0 auto;
        }

        .error-message {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-errorForeground);
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 16px;
        }

        .tool-notification {
            position: fixed;
            bottom: 80px;
            right: 24px;
            background-color: var(--vscode-notifications-background);
            border: 1px solid var(--vscode-notifications-border);
            color: var(--vscode-notifications-foreground);
            padding: 12px 16px;
            border-radius: 6px;
            font-size: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            max-width: 300px;
            animation: slideInRight 0.3s ease-out;
            z-index: 100;
        }

        @keyframes slideInRight {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        .tool-notification.success {
            border-left: 3px solid var(--vscode-testing-iconPassed);
        }

        .tool-notification.error {
            border-left: 3px solid var(--vscode-testing-iconFailed);
        }

        .tool-notification.running {
            border-left: 3px solid var(--vscode-testing-runAction);
        }
    </style>
</head>
<body>
    <div id="header">
        <h1>
            <img src="${logoUri}" alt="Poe" style="width: 20px; height: 20px; border-radius: 50%; margin-right: 4px;" />
            Poe Code
            <span class="model-badge" id="model-badge">Claude-Sonnet-4.5</span>
            <span class="strategy-badge" id="strategy-badge" title="Click to configure strategy">No Strategy</span>
        </h1>
        <div class="header-buttons">
            <button class="header-button" id="strategy-button">⚙️ Strategy</button>
            <button class="header-button" id="clear-button">Clear History</button>
        </div>
    </div>

    <!-- Strategy Settings Modal -->
    <div id="strategy-modal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Model Selection Strategy</h2>
                <button class="close-button" id="close-modal">×</button>
            </div>

            <div class="toggle-container">
                <span class="toggle-label">Enable Strategy</span>
                <div class="toggle-switch" id="strategy-toggle">
                    <div class="toggle-slider"></div>
                </div>
            </div>

            <div id="strategy-options">
                <div class="strategy-option" data-strategy="smart">
                    <h3>🧠 Smart Strategy</h3>
                    <p>Intelligently selects model based on task type (code, chat, reasoning) and complexity</p>
                </div>

                <div class="strategy-option" data-strategy="mixed">
                    <h3>🔄 Mixed Strategy</h3>
                    <p>Alternates between GPT-5 and Claude-Sonnet-4.5 on each message</p>
                </div>

                <div class="strategy-option" data-strategy="round-robin">
                    <h3>🔁 Round Robin</h3>
                    <p>Cycles through all available models in sequence</p>
                </div>

                <div class="strategy-option" data-strategy="fixed">
                    <h3>📌 Fixed Model</h3>
                    <p>Always uses Claude-Sonnet-4.5 (current default)</p>
                </div>
            </div>
        </div>
    </div>

    <div id="chat-container">
        <div id="messages">
            <div class="welcome-message">
                <img src="${logoUri}" alt="Poe" style="width: 48px; height: 48px; border-radius: 50%; margin-bottom: 16px;" />
                <h2>👋 Welcome to Poe Code</h2>
                <p>
                    I'm your AI assistant powered by Poe. I can help you with coding questions,
                    debugging, code reviews, and general programming tasks. Start a conversation below!
                </p>
            </div>
        </div>
    </div>

    <div id="input-container">
        <div id="input-wrapper">
            <textarea
                id="message-input"
                placeholder="Ask me anything..."
                rows="1"
                autofocus
            ></textarea>
            <button id="send-button">Send</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const messagesDiv = document.getElementById('messages');
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');
        const clearButton = document.getElementById('clear-button');
        const modelBadge = document.getElementById('model-badge');
        const strategyBadge = document.getElementById('strategy-badge');
        const strategyButton = document.getElementById('strategy-button');
        const strategyModal = document.getElementById('strategy-modal');
        const closeModal = document.getElementById('close-modal');
        const strategyToggle = document.getElementById('strategy-toggle');
        const strategyOptions = document.querySelectorAll('.strategy-option');

        const POE_LOGO = '${logoUri}';

        let isThinking = false;
        let strategyEnabled = false;
        let currentStrategy = 'fixed';

        // Auto-resize textarea
        messageInput.addEventListener('input', () => {
            messageInput.style.height = 'auto';
            messageInput.style.height = messageInput.scrollHeight + 'px';
        });

        sendButton.addEventListener('click', sendMessage);

        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        clearButton.addEventListener('click', () => {
            if (confirm('Clear all conversation history?')) {
                messagesDiv.innerHTML = \`<div class="welcome-message">
                    <img src="\${POE_LOGO}" alt="Poe" style="width: 48px; height: 48px; border-radius: 50%; margin-bottom: 16px;" />
                    <h2>👋 Welcome to Poe Code</h2>
                    <p>I'm your AI assistant powered by Poe. I can help you with coding questions, debugging, code reviews, and general programming tasks. Start a conversation below!</p>
                </div>\`;
                vscode.postMessage({ type: 'clearHistory' });
            }
        });

        // Strategy modal controls
        strategyButton.addEventListener('click', () => {
            strategyModal.classList.add('show');
            vscode.postMessage({ type: 'getStrategyStatus' });
        });

        strategyBadge.addEventListener('click', () => {
            strategyModal.classList.add('show');
            vscode.postMessage({ type: 'getStrategyStatus' });
        });

        closeModal.addEventListener('click', () => {
            strategyModal.classList.remove('show');
        });

        strategyModal.addEventListener('click', (e) => {
            if (e.target === strategyModal) {
                strategyModal.classList.remove('show');
            }
        });

        // Strategy toggle
        strategyToggle.addEventListener('click', () => {
            strategyEnabled = !strategyEnabled;
            strategyToggle.classList.toggle('active', strategyEnabled);
            vscode.postMessage({
                type: 'toggleStrategy',
                enabled: strategyEnabled
            });
            updateStrategyUI();
        });

        // Strategy options
        strategyOptions.forEach(option => {
            option.addEventListener('click', () => {
                const strategyType = option.dataset.strategy;
                currentStrategy = strategyType;

                // Update UI
                strategyOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');

                // Send to extension
                const config = { type: strategyType };
                if (strategyType === 'fixed') {
                    config.fixedModel = 'Claude-Sonnet-4.5';
                }
                vscode.postMessage({
                    type: 'setStrategy',
                    config: config
                });
            });
        });

        // Initialize - request strategy status
        setTimeout(() => {
            vscode.postMessage({ type: 'getStrategyStatus' });
        }, 500);

        function sendMessage() {
            const message = messageInput.value.trim();
            if (message && !isThinking) {
                addMessage(message, 'user');
                vscode.postMessage({ type: 'sendMessage', text: message });
                messageInput.value = '';
                messageInput.style.height = 'auto';
            }
        }

        // Handle messages from the extension
        window.addEventListener('message', (event) => {
            const message = event.data;

            switch (message.type) {
                case 'thinking':
                    if (message.value) {
                        showThinking();
                    } else {
                        hideThinking();
                    }
                    break;
                case 'response':
                    hideThinking();
                    addMessage(message.text, 'assistant');
                    if (message.model) {
                        modelBadge.textContent = message.model;
                    }
                    if (message.strategyInfo) {
                        updateStrategyBadge(message.strategyInfo);
                    }
                    break;
                case 'error':
                    hideThinking();
                    addError(message.text);
                    break;
                case 'strategyStatus':
                    strategyEnabled = message.enabled;
                    strategyToggle.classList.toggle('active', strategyEnabled);
                    updateStrategyBadge(message.info);
                    if (message.currentModel) {
                        modelBadge.textContent = message.currentModel;
                    }
                    // Update active strategy option
                    const strategyType = extractStrategyType(message.info);
                    if (strategyType) {
                        currentStrategy = strategyType;
                        strategyOptions.forEach(opt => {
                            opt.classList.toggle('active', opt.dataset.strategy === strategyType);
                        });
                    }
                    break;
                case 'toolStarting':
                    showToolNotification(\`🔧 \${message.toolName}\`, 'running');
                    break;
                case 'toolExecuted':
                    if (message.success) {
                        showToolNotification(\`✓ \${message.toolName} completed\`, 'success');
                    } else {
                        showToolNotification(\`✗ \${message.toolName} failed\`, 'error');
                    }
                    break;
            }
        });

        function extractStrategyType(info) {
            if (!info || info === 'Strategy disabled') return 'fixed';
            if (info.includes('smart')) return 'smart';
            if (info.includes('mixed')) return 'mixed';
            if (info.includes('round-robin')) return 'round-robin';
            return 'fixed';
        }

        function updateStrategyBadge(info) {
            if (!strategyEnabled || !info || info === 'Strategy disabled') {
                strategyBadge.textContent = 'No Strategy';
                strategyBadge.style.opacity = '0.6';
            } else {
                const badges = {
                    'smart': '🧠 Smart',
                    'mixed': '🔄 Mixed',
                    'round-robin': '🔁 Round Robin',
                    'fixed': '📌 Fixed'
                };
                const type = extractStrategyType(info);
                strategyBadge.textContent = badges[type] || info.split(':')[0];
                strategyBadge.style.opacity = '1';
            }
        }

        function updateStrategyUI() {
            if (strategyEnabled) {
                strategyBadge.style.opacity = '1';
            } else {
                strategyBadge.textContent = 'No Strategy';
                strategyBadge.style.opacity = '0.6';
            }
        }

        function addMessage(text, sender) {
            // Remove welcome message if present
            const welcome = messagesDiv.querySelector('.welcome-message');
            if (welcome) {
                welcome.remove();
            }

            const wrapper = document.createElement('div');
            wrapper.className = \`message-wrapper \${sender}\`;

            const header = document.createElement('div');
            header.className = 'message-header';

            const avatar = document.createElement('div');
            avatar.className = \`avatar \${sender}\`;

            if (sender === 'assistant') {
                const img = document.createElement('img');
                img.src = POE_LOGO;
                img.alt = 'Poe';
                avatar.appendChild(img);
            } else {
                avatar.textContent = 'U';
            }

            const senderName = document.createElement('span');
            senderName.textContent = sender === 'user' ? 'You' : 'Poe Assistant';

            header.appendChild(avatar);
            header.appendChild(senderName);

            const content = document.createElement('div');
            content.className = 'message-content';
            content.textContent = text;

            wrapper.appendChild(header);
            wrapper.appendChild(content);
            messagesDiv.appendChild(wrapper);

            scrollToBottom();
        }

        function addError(text) {
            const error = document.createElement('div');
            error.className = 'error-message';
            error.textContent = '❌ Error: ' + text;
            messagesDiv.appendChild(error);
            scrollToBottom();
        }

        function showThinking() {
            isThinking = true;
            sendButton.disabled = true;
            messageInput.disabled = true;

            const wrapper = document.createElement('div');
            wrapper.className = 'message-wrapper assistant';
            wrapper.id = 'thinking-message';

            const header = document.createElement('div');
            header.className = 'message-header';

            const avatar = document.createElement('div');
            avatar.className = 'avatar assistant';

            const img = document.createElement('img');
            img.src = POE_LOGO;
            img.alt = 'Poe';
            avatar.appendChild(img);

            const senderName = document.createElement('span');
            senderName.textContent = 'Poe Assistant';

            header.appendChild(avatar);
            header.appendChild(senderName);

            const content = document.createElement('div');
            content.className = 'message-content';

            const thinking = document.createElement('div');
            thinking.className = 'thinking';
            thinking.innerHTML = '<div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div>';

            content.appendChild(thinking);
            wrapper.appendChild(header);
            wrapper.appendChild(content);
            messagesDiv.appendChild(wrapper);

            scrollToBottom();
        }

        function hideThinking() {
            isThinking = false;
            sendButton.disabled = false;
            messageInput.disabled = false;

            const thinkingMessage = document.getElementById('thinking-message');
            if (thinkingMessage) {
                thinkingMessage.remove();
            }
        }

        function scrollToBottom() {
            const container = document.getElementById('chat-container');
            container.scrollTop = container.scrollHeight;
        }

        function showToolNotification(text, type = 'running') {
            const notification = document.createElement('div');
            notification.className = \`tool-notification \${type}\`;
            notification.textContent = text;
            document.body.appendChild(notification);

            // Auto-remove after 3 seconds
            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(400px)';
                setTimeout(() => {
                    notification.remove();
                }, 300);
            }, 3000);
        }
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
