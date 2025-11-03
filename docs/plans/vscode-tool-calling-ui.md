# VSCode Tool Calling UI Improvements

## Format Arguments Better
- Parse JSON args into readable key-value display
- Syntax highlight values by type (strings, numbers, bools)
- Truncate long strings with expand option
- Special formatting for file paths (relative, clickable)

## Show Tool Response
- Add collapsible response section below args
- Format based on content type (JSON, plain text, errors)
- Diff view for file edits (old/new side-by-side)
- Clickable file paths in output

## Minimal & Collapsible Blocks
- Collapsed by default, show: tool name + 1-line summary
- Summary examples:
  - `Read: src/index.ts`
  - `Bash: npm install (2.3s)`
  - `Edit: 3 changes in config.json`
- Expand on click to show args + response
- Persist expand state per tool call ID

## Implementation Notes

### Decoration Rendering
```ts
// In decoration provider
if (collapsed) return oneLineSummary(tool);
return [argsSection(), responseSection()];
```

### Summary Generation
```ts
// Extract key params for display
const summary = {
  Read: args.file_path,
  Bash: `${args.command} (${duration})`,
  Edit: `${changeCount} changes in ${basename(args.file_path)}`
}
```

### State Management
```ts
// Track collapse state
Map<toolCallId, boolean> collapseState
// Toggle on decoration click
```

### Response Formatting
```ts
// Diff for edits, syntax highlight for code
if (tool === 'Edit') return diffView(old, new);
return syntaxHighlight(response, detectLang());
```

## Files to Modify
- Extension decoration provider (where tool calls render)
- Tool call summary formatter (new utility)
- Response formatter (new utility)
- CSS/theme for visual styling
