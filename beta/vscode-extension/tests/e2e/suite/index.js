const vscode = require("vscode");

async function run() {
  const extension = vscode.extensions.getExtension("poe.poe-code-vscode");
  if (!extension) {
    throw new Error("Extension poe.poe-code-vscode not found.");
  }

  if (!extension.isActive) {
    await extension.activate();
  }

  if (!extension.isActive) {
    throw new Error("Extension poe.poe-code-vscode failed to activate.");
  }
}

module.exports = { run };
