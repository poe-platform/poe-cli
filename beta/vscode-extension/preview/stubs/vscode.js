export const window = {
  createStatusBarItem: () => ({
    show() {},
    text: "",
    command: "",
    tooltip: "",
  }),
  registerWebviewViewProvider: () => ({ dispose() {} }),
  createTerminal: () => ({
    show() {},
    sendText() {},
  }),
  showInformationMessage: () => {},
  showWarningMessage: async () => undefined,
  showInputBox: async () => undefined,
  showErrorMessage: () => {},
};

export const commands = {
  registerCommand: () => ({ dispose() {} }),
  executeCommand: () => {},
};

export const StatusBarAlignment = {
  Right: 1,
};

export const Uri = {
  joinPath: (base, ...parts) => {
    const tokens = [
      typeof base === "string" ? base : base?.fsPath ?? "",
      ...parts,
    ].map((token) => (typeof token === "string" ? token : token?.fsPath ?? ""));
    const fsPath = tokens.filter(Boolean).join("/");
    return {
      fsPath,
      toString: () => fsPath,
    };
  },
  file: (target) => ({
    fsPath: target,
    toString: () => target,
  }),
};

export const workspace = {
  getConfiguration: () => ({ get: () => undefined }),
  workspaceFolders: [],
};

export const ViewColumn = {
  One: 1,
};

export const env = {};

export default {
  window,
  commands,
  StatusBarAlignment,
  Uri,
  workspace,
  ViewColumn,
  env,
};
