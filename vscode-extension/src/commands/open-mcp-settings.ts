import * as vscode from "vscode";
import path from "node:path";

interface OpenMcpSettingsOptions {
  homeDir: string;
  filename: string;
}

export async function openMcpSettings(
  options: OpenMcpSettingsOptions
): Promise<void> {
  const targetPath = path.join(options.homeDir, ".poe-setup", options.filename);
  const document = await vscode.workspace.openTextDocument(targetPath);
  await vscode.window.showTextDocument(document);
}

