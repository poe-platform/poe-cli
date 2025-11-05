# VSCode Extension @ File Selection Feature

## Overview
Add @ file selection to chat input for quick file context inclusion.

---

## Architecture Review

### Current Implementation
- **Chat UI**: `vscode-extension/src/webview/runtime.ts:298-336`
- **Input handling**: Textarea with keydown/input listeners
- **Message flow**: Webview ↔️ Extension via `postMessage()`
- **File access**: Extension has `vscode.workspace.fs.*` APIs

### Existing Autocomplete Pattern
- Model selector uses HTML5 `<datalist>` (native autocomplete)
- Simple but limited styling/control
- Alternative: Custom popup with full control

---

## Implementation Plan

### 1. Detect @ Trigger
**File**: `runtime.ts`

```typescript
// Add to message input listener
if (input.includes('@')) {
  const cursorPos = getCursorPosition();
  showFileSuggestions(cursorPos);
}
```

### 2. File List Provider
**File**: `extension.ts` (new handler)

```typescript
// Add message handler
case 'getFiles':
  const files = await vscode.workspace.findFiles('**/*');
  webview.postMessage({ type: 'fileList', files });
```

### 3. Suggestion Popup UI
**File**: `runtime.ts` (new component)

```typescript
// Create popup element
const popup = createSuggestionPopup(files);
positionAt(cursorPos);
handleKeyNav(UP, DOWN, ENTER, ESC);
```

### 4. File Insertion
**File**: `runtime.ts`

```typescript
// On selection
insertText(`@${selectedFile.path}`);
closePopup();
```

### 5. Message Protocol
**Files**: `controller.ts`, `extension.ts`

- Add `getFiles` message type
- Add `fileList` response type
- Optional: Cache file list for performance

---

## Key Files to Modify

| File | Purpose | Changes |
|------|---------|---------|
| `runtime.ts:298-336` | Input handling | Add @ detection, popup logic |
| `extension.ts:~450` | Message handlers | Add file listing endpoint |
| `controller.ts:289-326` | Message routing | Route `getFiles` messages |
| `layout.ts` | HTML/CSS | Add popup styles |

---

## Implementation Steps

1. **Add @ detection** to input event listener
2. **Request file list** from extension via `postMessage()`
3. **Render popup** with file suggestions
4. **Keyboard navigation** (↑↓ select, Enter confirm, Esc close)
5. **Insert selection** at cursor position
6. **Test** with various file structures

---

## Technical Details

### Message Flow
```
User types @
  ↓
runtime.ts detects trigger
  ↓
postMessage({ type: 'getFiles' })
  ↓
extension.ts: vscode.workspace.findFiles()
  ↓
postMessage({ type: 'fileList', files })
  ↓
runtime.ts renders popup
  ↓
User selects → insert text
```

### VSCode APIs
- `vscode.workspace.findFiles(pattern)` - Get all workspace files
- `vscode.workspace.fs.readDirectory()` - List directory contents
- `vscode.workspace.workspaceFolders` - Get workspace roots

### Popup Styling
- Use existing Tailwind CSS + VSCode theme variables
- Position: Absolute, relative to textarea cursor
- Match VSCode suggestion UI patterns

---

## Enhancement Ideas

- **Fuzzy search** on file paths
- **Recent files** prioritization
- **Git-aware** filtering (ignore gitignored files)
- **File type icons** in suggestions
- **Multi-file selection** (@file1 @file2)
- **Smart context**: Auto-include related files

---

## Testing Checklist

- [ ] @ trigger detection works mid-sentence
- [ ] Popup shows all workspace files
- [ ] Keyboard navigation functional
- [ ] File path inserted correctly
- [ ] Works with multiple workspaces
- [ ] Performance with large codebases (1000+ files)
- [ ] Popup closes on Escape/blur
- [ ] Works in both sidebar and editor panel views
