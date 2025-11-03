# VSCode @ File Selection with Fuzzy Search

## Architecture

- Hook `@` character in input field → trigger quick pick
- Use `vscode.workspace.findFiles()` for file discovery
- Leverage `vscode.window.createQuickPick()` for UI
- Filter results with fuzzy match library (fuse.js or custom)

## Implementation Steps

### 1. Input Detection
- Listen for `@` keypress in chat input
- Debounce to avoid premature triggers
- Show quick pick on detection

### 2. File Collection
```ts
const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
const items = files.map(uri => ({ label: workspace.asRelativePath(uri), uri }));
```

### 3. Fuzzy Search
```ts
quickPick.onDidChangeValue(query => {
  quickPick.items = fuzzyMatch(items, query);
});
```

### 4. Selection Handling
- On file select → insert path/read content into message
- Support multi-select for batch file operations
- Maintain @ prefix or replace with file reference

## Edge Cases

- Workspace with 10k+ files → lazy load/virtualize
- No workspace open → show error or recent files
- Binary files → preview text files only
- Gitignored files → respect .gitignore by default

## UX Enhancements

- Show file icons using `vscode.FileIcon`
- Display relative paths from workspace root
- Recently used files at top
- Keyboard shortcuts: Esc to cancel, Enter to select
