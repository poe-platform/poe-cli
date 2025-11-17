import * as vscode from "vscode";
import path from "node:path";

interface OpenMcpSettingsOptions {
  homeDir: string;
  filename: string;
}

export async function openMcpSettings(
  options: OpenMcpSettingsOptions
): Promise<void> {
  const targetPath = path.join(options.homeDir, ".poe-code", options.filename);
  const documentUri = vscode.Uri.file(targetPath);
  const document = await vscode.workspace.openTextDocument(documentUri);
  await vscode.window.showTextDocument(document);
}
