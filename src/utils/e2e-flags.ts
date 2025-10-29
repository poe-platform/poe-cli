const TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]); 

export function shouldRunVsCodeE2E(): boolean {
  const value = process.env.RUN_VSCODE_E2E;
  if (!value) {
    return false;
  }
  return TRUTHY_VALUES.has(value.toLowerCase());
}
