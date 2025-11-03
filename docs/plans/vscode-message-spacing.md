# VSCode Message Spacing Plan

## Problem
Messages in the webview lack vertical spacing, creating poor visual hierarchy and making conversations hard to scan.

## Current State
- Messages use `gap-3` (12px) internal spacing
- No spacing between consecutive message wrappers
- All defined in `runtime.ts:132-178` (uiClasses)

## Solution

### 1. Add Vertical Spacing
```ts
// In messagesDiv container (runtime.ts)
messagesDiv.className = "flex flex-col gap-4"
```

### 2. Differentiate Message Types
```ts
// User messages: gap-4 (16px)
// Assistant messages: gap-5 (20px)
// Tool messages: gap-3 (12px, lighter weight)
```

### 3. Group Related Content
```ts
// Tool messages after user query: mt-2 (8px offset)
// Keep tools visually grouped with triggering user message
```

### 4. Breathing Room for Diff Previews
```ts
diffWrapper: "...existing... my-2"
```

### 5. Test & Adjust
- Verify in light/dark themes
- Check long conversations don't feel too spread out
- Ensure tool grouping is intuitive

## Files to Edit
- `vscode-extension/src/webview/runtime.ts` (primary)
- Possibly `vscode-extension/src/webview/preview/entry.ts` (container setup)
