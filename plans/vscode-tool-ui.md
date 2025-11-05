# VSCode Extension: Tool Calling UI Improvements

## Current State
- Tool args shown as raw `JSON.stringify(args, null, 2)` in `<pre>` tag
- No tool response/output displayed (only success/error status)
- Always expanded, not collapsible
- Located: `vscode-extension/src/webview/runtime.ts:533-650`

## Plan

### 1. Format Arguments Nicer
**Goal:** Replace JSON dump with human-readable key-value pairs

**Approach:**
- Create `formatToolArgs(args)` helper function
- Render as definition list or compact table
- Handle primitives, arrays, objects gracefully

```ts
// Example pseudo-code
formatToolArgs(args) {
  return Object.entries(args).map(([k, v]) =>
    `<dt>${k}</dt><dd>${formatValue(v)}</dd>`
  ).join('')
}
```

**Files:** `runtime.ts:568-580` (replace JSON.stringify block)

### 2. Show Tool Response
**Goal:** Display tool output/results in the UI

**Approach:**
- Extend `toolExecuted` message to include `result` field
- Add `<details>` element for response in `completeToolMessage()`
- Format response similar to args (not raw JSON)

```ts
// In completeToolMessage()
if (details.result) {
  content += `<details><summary>Response</summary>${formatResponse(details.result)}</details>`
}
```

**Files:**
- `extension.ts:298-324` (add result to message)
- `runtime.ts:609-650` (render result)

### 3. Make Collapsible & Collapsed by Default
**Goal:** Minimal UI, expand on demand

**Approach:**
- Wrap args + response in `<details>` with `open={false}`
- Keep header visible (icon, tool name, status)
- Click to expand/collapse

```html
<div class="tool-wrapper">
  <header>🔧 Tool · Read | ✓ Success</header>
  <details>
    <summary>Details</summary>
    <div>args + response</div>
  </details>
</div>
```

**Files:** `runtime.ts:541-607` (restructure DOM)

## Implementation Order
1. Add collapsible `<details>` wrapper (minimal first)
2. Improve args formatting (replace JSON.stringify)
3. Pipe through tool response and display it

## CSS Notes
- Keep existing classes: `toolWrapper`, `toolArgs`
- Add `toolResponse` class for styling
- Use `<details>` native styling + custom arrow icon
