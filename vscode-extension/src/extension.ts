import * as vscode from 'vscode';

let currentTerminal: vscode.Terminal | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Poe Code extension is now active');

    let disposable = vscode.commands.registerCommand('poe-code.openTerminal', () => {
        // If terminal already exists and is still open, show it
        if (currentTerminal) {
            currentTerminal.show(true);
            return;
        }

        // Get workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        // Create a new terminal
        currentTerminal = vscode.window.createTerminal({
            name: 'Poe Code',
            cwd: workspaceFolder?.uri.fsPath,
            iconPath: new vscode.ThemeIcon('comment-discussion'),
            env: {
                ...process.env,
                FORCE_COLOR: '1'
            }
        });

        // Show the terminal
        currentTerminal.show(true);

        // Send the command to start poe-code interactive mode
        setTimeout(() => {
            currentTerminal?.sendText('npm run dev interactive 2>&1');
        }, 200);

        // Handle terminal close
        vscode.window.onDidCloseTerminal((closedTerminal) => {
            if (closedTerminal === currentTerminal) {
                currentTerminal = undefined;
            }
        });
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {
    if (currentTerminal) {
        currentTerminal.dispose();
    }
}
