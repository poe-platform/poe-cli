import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

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
        const cwd = workspaceFolder?.uri.fsPath || process.cwd();

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
                FORCE_COLOR: '1'
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
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {
    if (currentTerminal) {
        currentTerminal.dispose();
    }
}
